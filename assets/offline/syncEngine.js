/**
 * ==============================================================================
 *   CNG DEAL DESK ALPHA V2 — OFFLINE SYNCHRONIZATION ENGINE
 *   Module: assets/offline/syncEngine.js
 *   Purpose: Manages network connectivity states, offline-to-cloud sync queue,
 *            idempotent Supabase persistence, retry backoff, and event listeners.
 * ==============================================================================
 */

import { supabase } from "../supabaseClient.js";
import {
  getPendingSyncTransactions,
  markTransactionSynced,
  markTransactionSyncFailed,
  getOfflineStats,
  getAllOfflineTransactions,
} from "./offlineStore.js";

class SyncEngine {
  constructor() {
    this.isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.lastError = null;
    this.listeners = new Set();
    this.pollIntervalId = null;

    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.handleNetworkChange(true));
      window.addEventListener("offline", () => this.handleNetworkChange(false));
      // Auto sync poll every 30 seconds
      this.pollIntervalId = setInterval(() => {
        if (this.isOnline && !this.isSyncing) {
          this.syncPendingTransactions().catch(() => {});
        }
      }, 30000);
    }
  }

  handleNetworkChange(online) {
    this.isOnline = online;
    this.notify();
    if (online) {
      console.log("CNG Deal Desk: Connectivity restored. Triggering auto-sync...");
      this.syncPendingTransactions().catch((err) => {
        console.warn("Auto-sync error on reconnect:", err);
      });
    } else {
      console.log("CNG Deal Desk: Running in OFFLINE mode. Transactions will be saved locally.");
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  notify() {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error("Sync listener error:", err);
      }
    }
  }

  getState() {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError,
    };
  }

  /**
   * Main synchronization routine: iterates through pending offline transactions
   * and idempotently upserts them to Supabase PostgreSQL.
   */
  async syncPendingTransactions() {
    if (this.isSyncing) {
      return { skipped: true, reason: "Sync already in progress" };
    }

    if (!this.isOnline) {
      return { skipped: true, reason: "Device is offline" };
    }

    this.isSyncing = true;
    this.lastError = null;
    this.notify();

    let processedCount = 0;
    let failedCount = 0;

    try {
      const pendingList = await getPendingSyncTransactions();

      if (pendingList.length === 0) {
        this.isSyncing = false;
        this.lastSyncTime = new Date().toISOString();
        this.notify();
        return { success: true, processed: 0, failed: 0 };
      }

      console.log(`CNG Deal Desk: Syncing ${pendingList.length} pending transaction(s)...`);

      for (const record of pendingList) {
        try {
          // Prepare clean payload for Supabase
          const payload = {
            client_id: record.client_id,
            reference: record.reference,
            created_by: record.created_by,
            created_by_name: record.created_by_name,
            status: record.status,
            buyer_id: record.buyer_id,
            supplier_id: record.supplier_id,
            commodity: record.commodity,
            buyer_requirements: record.buyer_requirements,
            supplier_verification: record.supplier_verification,
            transport_collection: record.transport_collection,
            payment_terms: record.payment_terms,
            fee_margin: record.fee_margin,
            decision_matrix: record.decision_matrix,
            approval: record.approval,
            notes: record.notes,
            sync_version: record.sync_version || 1,
            created_at: record.created_at,
            updated_at: new Date().toISOString(),
          };

          // Perform idempotent upsert on client_id
          const { data, error } = await supabase
            .from("transactions")
            .upsert(payload, { onConflict: "client_id" })
            .select()
            .single();

          if (error) {
            // Check if error is schema cache notice or network failure
            console.warn(`Sync failed for ${record.reference}:`, error.message);
            await markTransactionSyncFailed(record.client_id, error.message);
            failedCount++;
          } else {
            await markTransactionSynced(record.client_id, data || payload);
            processedCount++;
          }
        } catch (itemErr) {
          console.warn(`Sync exception for ${record.reference}:`, itemErr);
          await markTransactionSyncFailed(record.client_id, itemErr.message);
          failedCount++;
        }
      }

      this.lastSyncTime = new Date().toISOString();
      if (failedCount > 0) {
        this.lastError = `${failedCount} record(s) could not be synchronized. Check connection or permissions.`;
      }
    } catch (globalErr) {
      console.error("Global sync engine failure:", globalErr);
      this.lastError = globalErr.message;
    } finally {
      this.isSyncing = false;
      this.notify();
    }

    return { success: failedCount === 0, processed: processedCount, failed: failedCount };
  }

  /**
   * Fetch all transactions from cloud (if online) and merge with local offline store
   */
  async fetchCloudAndMerge() {
    if (!this.isOnline) {
      return getAllOfflineTransactions();
    }

    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Could not fetch remote transactions:", error.message);
        return getAllOfflineTransactions();
      }

      if (Array.isArray(data)) {
        for (const remoteRecord of data) {
          if (remoteRecord.client_id) {
            await markTransactionSynced(remoteRecord.client_id, remoteRecord);
          }
        }
      }
    } catch (err) {
      console.warn("Cloud merge notice:", err.message);
    }

    return getAllOfflineTransactions();
  }
}

// Export singleton instance
export const syncEngine = new SyncEngine();
