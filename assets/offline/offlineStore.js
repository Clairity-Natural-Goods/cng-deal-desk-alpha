/**
 * ==============================================================================
 *   CNG DEAL DESK ALPHA V2 — OFFLINE-FIRST MULTI-LAYERED PERSISTENCE STORE
 *   Module: assets/offline/offlineStore.js
 *   Purpose: Durable local persistence for MVTR transactions, field captures,
 *            audit events, Decision Matrix records, and counterparty caching.
 *            Survives hard refresh via synchronous LocalStorage mirroring and
 *            IndexedDB caching with auto-reconciliation.
 * ==============================================================================
 */

const DB_NAME = "CNG_DEAL_DESK_OFFLINE_DB";
const DB_VERSION = 1;

// Storage keys for synchronous LocalStorage mirror (guarantees survival on hard refresh)
export const STORAGE_KEYS = {
  TRANSACTIONS: "CNG_OFFLINE_TRANSACTIONS_V2",
  EVENTS: "CNG_OFFLINE_EVENTS_V2",
  PARTIES: "CNG_OFFLINE_PARTIES_V2",
  METADATA: "CNG_OFFLINE_METADATA_V2",
};

/**
 * Standard RFC4122 v4 UUID generator (guarantees Postgres UUID type compliance)
 */
export function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch (_) {}
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Check if a string is a valid RFC4122 UUID
 */
export function isValidUUID(str) {
  if (typeof str !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Synchronous LocalStorage helper routines
 */
function loadFromLocalStorage(key, defaultVal = []) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed;
      }
    }
  } catch (err) {
    console.warn(`LocalStorage read warning for ${key}:`, err);
  }
  return defaultVal;
}

function saveToLocalStorage(key, val) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(val));
    }
  } catch (err) {
    console.warn(`LocalStorage write warning for ${key}:`, err);
  }
}

// In-memory fallback and fast-path cache
const memoryStore = {
  transactions: new Map(),
  events: new Map(),
  parties: new Map(),
  metadata: new Map(),
};

// Immediate hydration on module evaluation: loads mirrored records so no data is lost on hard refresh
try {
  const cachedTxs = loadFromLocalStorage(STORAGE_KEYS.TRANSACTIONS, []);
  if (Array.isArray(cachedTxs)) {
    for (const tx of cachedTxs) {
      if (tx && tx.client_id) {
        memoryStore.transactions.set(tx.client_id, tx);
      }
    }
  }
  const cachedParties = loadFromLocalStorage(STORAGE_KEYS.PARTIES, []);
  if (Array.isArray(cachedParties)) {
    for (const p of cachedParties) {
      if (p && p.id) {
        memoryStore.parties.set(p.id, p);
      }
    }
  }
} catch (e) {
  console.warn("Offline store hydration warning:", e);
}

/**
 * Check if IndexedDB is available
 */
function hasIndexedDB() {
  return typeof window !== "undefined" && Boolean(window.indexedDB);
}

// Cached IndexedDB connection to prevent lock contention
let cachedDbPromise = null;

/**
 * Open (or create) the IndexedDB database
 */
export function openOfflineDb() {
  if (!hasIndexedDB()) {
    return Promise.resolve(null);
  }

  if (cachedDbPromise) {
    return cachedDbPromise;
  }

  cachedDbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Transactions Object Store
        if (!db.objectStoreNames.contains("transactions")) {
          const txStore = db.createObjectStore("transactions", { keyPath: "client_id" });
          txStore.createIndex("reference", "reference", { unique: false });
          txStore.createIndex("status", "status", { unique: false });
          txStore.createIndex("sync_status", "sync_status", { unique: false });
          txStore.createIndex("commodity", "commodity", { unique: false });
          txStore.createIndex("created_at", "created_at", { unique: false });
          txStore.createIndex("updated_at", "updated_at", { unique: false });
        }

        // 2. Transaction Events Object Store (Audit Log)
        if (!db.objectStoreNames.contains("transaction_events")) {
          const evStore = db.createObjectStore("transaction_events", { keyPath: "id" });
          evStore.createIndex("client_id", "client_id", { unique: false });
          evStore.createIndex("transaction_id", "transaction_id", { unique: false });
          evStore.createIndex("created_at", "created_at", { unique: false });
        }

        // 3. Counterparty Cache (for offline field selection)
        if (!db.objectStoreNames.contains("cached_parties")) {
          const pStore = db.createObjectStore("cached_parties", { keyPath: "id" });
          pStore.createIndex("role", "role", { unique: false });
          pStore.createIndex("district", "district", { unique: false });
        }

        // 4. Sync Metadata
        if (!db.objectStoreNames.contains("sync_metadata")) {
          db.createObjectStore("sync_metadata", { keyPath: "key" });
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        db.onversionchange = () => {
          try { db.close(); } catch (_) {}
          cachedDbPromise = null;
        };
        db.onclose = () => {
          cachedDbPromise = null;
        };
        resolve(db);
      };

      request.onerror = (event) => {
        console.warn("Failed to open IndexedDB, falling back to LocalStorage/memory:", event.target?.error);
        cachedDbPromise = null;
        resolve(null);
      };
    } catch (err) {
      console.warn("IndexedDB open exception:", err);
      cachedDbPromise = null;
      resolve(null);
    }
  });

  return cachedDbPromise;
}

/**
 * Generate human-readable transaction reference: TXN-YYYYMMDD-XXXX
 */
export function generateTransactionReference() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TXN-${yyyy}${mm}${dd}-${rand}`;
}

/**
 * Generate human-readable matrix record reference: MAT-YYYYMMDD-XXXX
 */
export function generateMatrixReference() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `MAT-${yyyy}${mm}${dd}-${rand}`;
}

/**
 * Ensure standard 7 Deal Pack sections with defaults
 */
export function normalizeTransactionRecord(data = {}, currentUser = null) {
  const now = new Date().toISOString();
  const clientId = data.client_id || generateUUID();

  const reference = data.reference || (data.is_matrix_record ? generateMatrixReference() : generateTransactionReference());
  const createdByName = data.created_by_name || currentUser?.user_metadata?.name || currentUser?.name || currentUser?.email || "Field Officer";
  const createdBy = isValidUUID(data.created_by) ? data.created_by : (isValidUUID(currentUser?.id) ? currentUser.id : null);

  return {
    id: data.id || null,
    client_id: clientId,
    reference: reference,
    created_by: createdBy,
    created_by_name: createdByName,
    status: data.status || "Draft",
    sync_status: data.sync_status || "pending_sync",
    sync_error: data.sync_error || null,
    last_sync_attempt: data.last_sync_attempt || null,
    buyer_id: data.buyer_id && data.buyer_id !== "none" ? data.buyer_id : null,
    supplier_id: data.supplier_id && data.supplier_id !== "none" ? data.supplier_id : null,
    commodity: data.commodity || "Maize",

    // 01. Buyer Requirements
    buyer_requirements: {
      buyer_name: data.buyer_requirements?.buyer_name || data.buyer_name || "",
      product_specification: data.buyer_requirements?.product_specification || "",
      required_tonnes: Number(data.buyer_requirements?.required_tonnes ?? data.volume) || 0,
      moisture_limit_pct: Number(data.buyer_requirements?.moisture_limit_pct) || 14.0,
      quality_spec: data.buyer_requirements?.quality_spec || "Grade 1 - Clean, dry, free of pests",
      delivery_location: data.buyer_requirements?.delivery_location || "",
      delivery_district: data.buyer_requirements?.delivery_district || data.district || "Gulu",
      required_delivery_date: data.buyer_requirements?.required_delivery_date || "",
      purchasing_conditions: data.buyer_requirements?.purchasing_conditions || "",
    },

    // 02. Supplier Verification
    supplier_verification: {
      supplier_name: data.supplier_verification?.supplier_name || data.supplier_name || "",
      contact_person: data.supplier_verification?.contact_person || "",
      phone: data.supplier_verification?.phone || "",
      district: data.supplier_verification?.district || data.district || "Amuru",
      location_details: data.supplier_verification?.location_details || "",
      verification_status: data.supplier_verification?.verification_status || "REPORTED",
      claimed_tonnes: Number(data.supplier_verification?.claimed_tonnes ?? data.volume) || 0,
      confirmed_tonnes: Number(data.supplier_verification?.confirmed_tonnes ?? data.volume) || 0,
      moisture_reading_pct: Number(data.supplier_verification?.moisture_reading_pct) || 0,
      verification_date: data.supplier_verification?.verification_date || now.slice(0, 10),
      verifying_officer: data.supplier_verification?.verifying_officer || createdByName,
      evidence_notes: data.supplier_verification?.evidence_notes || "",
    },

    // 03. Transport / Collection
    transport_collection: {
      arrangement: data.transport_collection?.arrangement || "Company-arranged",
      collection_point: data.transport_collection?.collection_point || "",
      destination: data.transport_collection?.destination || "",
      transporter_name: data.transport_collection?.transporter_name || "",
      transporter_contact: data.transport_collection?.transporter_contact || "",
      estimated_tonnes: Number(data.transport_collection?.estimated_tonnes ?? data.volume) || 0,
      transport_rate_per_tonne: Number(data.transport_collection?.transport_rate_per_tonne) || 0,
      total_transport_cost: Number(data.transport_collection?.total_transport_cost ?? data.transport_cost) || 0,
      collection_status: data.transport_collection?.collection_status || "Planned",
      waybill_ref: data.transport_collection?.waybill_ref || "",
      notes: data.transport_collection?.notes || "",
    },

    // 04. Payment Terms
    payment_terms: {
      agreed_price_per_kg: Number(data.payment_terms?.agreed_price_per_kg ?? data.base_price) || 0,
      currency: data.payment_terms?.currency || "UGX",
      payment_method: data.payment_terms?.payment_method || "Bank transfer",
      payment_schedule: data.payment_terms?.payment_schedule || "On delivery and inspection",
      deposit_required: Boolean(data.payment_terms?.deposit_required),
      deposit_amount: Number(data.payment_terms?.deposit_amount) || 0,
      outstanding_balance: Number(data.payment_terms?.outstanding_balance) || 0,
      payment_status: data.payment_terms?.payment_status || "Agreed",
      payment_conditions: data.payment_terms?.payment_conditions || "",
    },

    // 05. CNG Fee / Margin
    fee_margin: {
      cng_fee_per_tonne: Number(data.fee_margin?.cng_fee_per_tonne) || 30000,
      minimum_fee: Number(data.fee_margin?.minimum_fee) || 25000,
      calculation_basis: data.fee_margin?.calculation_basis || "Per tonne accepted",
      expected_gross_fee: Number(data.fee_margin?.expected_gross_fee) || 0,
      cost_field: Number(data.fee_margin?.cost_field) || 0,
      cost_testing: Number(data.fee_margin?.cost_testing) || 0,
      cost_transport: Number(data.fee_margin?.cost_transport) || 0,
      cost_other: Number(data.fee_margin?.cost_other) || 0,
      staff_hours: Number(data.fee_margin?.staff_hours) || 0,
      staff_rate_per_hour: Number(data.fee_margin?.staff_rate_per_hour) || 6000,
      total_direct_costs: Number(data.fee_margin?.total_direct_costs) || 0,
      overhead_pct: Number(data.fee_margin?.overhead_pct) || 15,
      overhead_amount: Number(data.fee_margin?.overhead_amount) || 0,
      projected_net_margin: Number(data.fee_margin?.projected_net_margin ?? data.net_margin) || 0,
      notes: data.fee_margin?.notes || "",
    },

    // 06. Decision Matrix Score
    decision_matrix: {
      counterparty_reliability_score: Number(data.decision_matrix?.counterparty_reliability_score) || 0,
      quality_compliance_score: Number(data.decision_matrix?.quality_compliance_score) || 0,
      margin_feasibility_score: Number(data.decision_matrix?.margin_feasibility_score) || 0,
      logistics_certainty_score: Number(data.decision_matrix?.logistics_certainty_score) || 0,
      payment_security_score: Number(data.decision_matrix?.payment_security_score) || 0,
      total_score: Number(data.decision_matrix?.total_score) || 0,
      max_score: 100,
      recommendation: data.decision_matrix?.recommendation || "Pending Evaluation",
      explanation: data.decision_matrix?.explanation || "",
      evaluator_name: data.decision_matrix?.evaluator_name || createdByName,
      evaluation_date: data.decision_matrix?.evaluation_date || now.slice(0, 10),
    },

    // 07. Clarence Approval Status
    approval: {
      status: data.approval?.status || "Pending",
      approver_id: data.approval?.approver_id || null,
      approver_name: data.approval?.approver_name || "",
      decision_date: data.approval?.decision_date || null,
      comments: data.approval?.comments || "",
      approval_evidence: data.approval?.approval_evidence || "",
      rejection_reason: data.approval?.rejection_reason || "",
    },

    notes: data.notes || "",
    sync_version: Number(data.sync_version) || 1,
    created_at: data.created_at || now,
    updated_at: now,

    // Matrix v1 specific properties
    is_matrix_record: Boolean(data.is_matrix_record),
    volume: data.volume !== undefined ? Number(data.volume) : (Number(data.buyer_requirements?.required_tonnes) || 0),
    volume_unit: data.volume_unit || "MT",
    base_price: data.base_price !== undefined ? Number(data.base_price) : (Number(data.payment_terms?.agreed_price_per_kg) || 0),
    price_unit: data.price_unit || "UGX/KG",
    transport_cost: data.transport_cost !== undefined ? Number(data.transport_cost) : (Number(data.transport_collection?.total_transport_cost) || 0),
    handling_cogs: data.handling_cogs !== undefined ? Number(data.handling_cogs) : 0,
    handling_basis: data.handling_basis || "TOTAL",
    gross_revenue: data.gross_revenue !== undefined ? data.gross_revenue : null,
    total_costs: data.total_costs !== undefined ? data.total_costs : null,
    net_margin: data.net_margin !== undefined ? data.net_margin : null,
    margin_percentage: data.margin_percentage !== undefined ? data.margin_percentage : null,
    district: data.district || data.supplier_verification?.district || data.buyer_requirements?.delivery_district || "Amuru",
    buyer_name: data.buyer_name || data.buyer_requirements?.buyer_name || "",
    supplier_name: data.supplier_name || data.supplier_verification?.supplier_name || "",
  };
}

/**
 * Synchronize local memory map to LocalStorage mirror
 */
function persistMemoryToLocalStorage() {
  const allTxs = Array.from(memoryStore.transactions.values());
  saveToLocalStorage(STORAGE_KEYS.TRANSACTIONS, allTxs);
}

/**
 * Save transaction to offline store (synchronous LocalStorage + asynchronous IndexedDB)
 */
export async function saveOfflineTransaction(recordData, currentUser = null) {
  const normalized = normalizeTransactionRecord(recordData, currentUser);

  // 1. Immediately store in memory and LocalStorage mirror (survives hard refresh)
  memoryStore.transactions.set(normalized.client_id, normalized);
  persistMemoryToLocalStorage();

  // 2. Persist to IndexedDB
  const db = await openOfflineDb();
  if (!db) {
    return normalized;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(["transactions", "transaction_events"], "readwrite");
      const txStore = tx.objectStore("transactions");
      const evStore = tx.objectStore("transaction_events");

      txStore.put(normalized);

      // Record audit event
      const auditEvent = {
        id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        client_id: normalized.client_id,
        transaction_id: normalized.id || null,
        event_type: normalized.status === "Approved" ? "APPROVED" : normalized.status === "SubmittedForReview" ? "SUBMITTED" : "FIELD_CAPTURED",
        details: {
          reference: normalized.reference,
          status: normalized.status,
          sync_status: normalized.sync_status,
        },
        actor_id: currentUser?.id || null,
        actor_name: currentUser?.user_metadata?.name || currentUser?.name || normalized.created_by_name || "Field Officer",
        created_at: new Date().toISOString(),
      };

      evStore.put(auditEvent);

      tx.oncomplete = () => resolve(normalized);
      tx.onerror = (e) => {
        console.warn("IndexedDB transaction save error:", e.target?.error);
        resolve(normalized);
      };
    } catch (err) {
      console.warn("IndexedDB transaction save exception:", err);
      resolve(normalized);
    }
  });
}

/**
 * Get offline transaction by client_id, id, or reference
 */
export async function getOfflineTransaction(identifier) {
  if (!identifier) return null;

  // 1. Fast check in memory / LocalStorage
  if (memoryStore.transactions.has(identifier)) {
    return memoryStore.transactions.get(identifier);
  }

  // Search by reference or id in memoryStore
  for (const record of memoryStore.transactions.values()) {
    if (record.id === identifier || record.reference === identifier || record.client_id === identifier) {
      return record;
    }
  }

  // 2. Query IndexedDB
  const db = await openOfflineDb();
  if (!db) {
    return null;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("transactions", "readonly");
      const store = tx.objectStore("transactions");
      const request = store.get(identifier);

      request.onsuccess = () => {
        if (request.result) {
          memoryStore.transactions.set(request.result.client_id, request.result);
          persistMemoryToLocalStorage();
          resolve(request.result);
        } else {
          // If not found by primary key, search all
          const allReq = store.getAll();
          allReq.onsuccess = () => {
            const list = allReq.result || [];
            const match = list.find(
              (r) => r.client_id === identifier || r.id === identifier || r.reference === identifier
            );
            if (match) {
              memoryStore.transactions.set(match.client_id, match);
              persistMemoryToLocalStorage();
              resolve(match);
            } else {
              resolve(null);
            }
          };
          allReq.onerror = () => resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    } catch (err) {
      console.warn("getOfflineTransaction exception:", err);
      resolve(null);
    }
  });
}

/**
 * Get all offline transactions sorted by created_at descending
 * Combines IndexedDB, LocalStorage, and memory
 */
export async function getAllOfflineTransactions() {
  const db = await openOfflineDb();

  if (db) {
    try {
      const idbRecords = await new Promise((resolve) => {
        const tx = db.transaction("transactions", "readonly");
        const store = tx.objectStore("transactions");
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });

      // Merge IndexedDB records into memoryStore and LocalStorage
      for (const rec of idbRecords) {
        if (rec && rec.client_id) {
          memoryStore.transactions.set(rec.client_id, rec);
        }
      }
      persistMemoryToLocalStorage();
    } catch (err) {
      console.warn("getAllOfflineTransactions IndexedDB merge warning:", err);
    }
  }

  const all = Array.from(memoryStore.transactions.values());
  all.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return all;
}

/**
 * Get transactions currently pending synchronization
 */
export async function getPendingSyncTransactions() {
  const all = await getAllOfflineTransactions();
  return all.filter((tx) => tx.sync_status === "pending_sync" || tx.sync_status === "sync_failed");
}

/**
 * Mark a transaction as synced.
 * CRITICAL FIX: If the record did not exist locally (e.g. cloud-fetched on hard refresh),
 * it is instantiated, normalized, and securely persisted locally.
 */
export async function markTransactionSynced(clientId, serverRecord = {}) {
  const existing = await getOfflineTransaction(clientId);
  const base = existing || normalizeTransactionRecord({ client_id: clientId, ...serverRecord });

  const updated = {
    ...base,
    ...serverRecord,
    client_id: clientId,
    id: serverRecord.id || base.id,
    status: serverRecord.status || base.status || "Draft",
    sync_status: serverRecord.sync_status || "synced",
    sync_error: null,
    last_sync_attempt: new Date().toISOString(),
    sync_version: (base.sync_version || 1) + 1,
  };

  // 1. Immediately store in memory and LocalStorage mirror
  memoryStore.transactions.set(clientId, updated);
  persistMemoryToLocalStorage();

  // 2. Persist to IndexedDB
  const db = await openOfflineDb();
  if (!db) {
    return updated;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("transactions", "readwrite");
      tx.objectStore("transactions").put(updated);
      tx.oncomplete = () => resolve(updated);
      tx.onerror = () => resolve(updated);
    } catch {
      resolve(updated);
    }
  });
}

/**
 * Mark a transaction as failed to sync
 */
export async function markTransactionSyncFailed(clientId, errorMessage) {
  const existing = await getOfflineTransaction(clientId);
  if (!existing) return null;

  const updated = {
    ...existing,
    sync_status: "sync_failed",
    sync_error: String(errorMessage || "Network timeout or server error"),
    last_sync_attempt: new Date().toISOString(),
  };

  memoryStore.transactions.set(clientId, updated);
  persistMemoryToLocalStorage();

  const db = await openOfflineDb();
  if (!db) {
    return updated;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("transactions", "readwrite");
      tx.objectStore("transactions").put(updated);
      tx.oncomplete = () => resolve(updated);
      tx.onerror = () => resolve(updated);
    } catch {
      resolve(updated);
    }
  });
}

/**
 * Delete a transaction from the offline store
 */
export async function deleteOfflineTransaction(clientId) {
  memoryStore.transactions.delete(clientId);
  persistMemoryToLocalStorage();

  const db = await openOfflineDb();
  if (!db) {
    return true;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("transactions", "readwrite");
      tx.objectStore("transactions").delete(clientId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Cache counterparties locally so field officers can select buyers/suppliers offline
 */
export async function cacheCounterparties(partiesList) {
  if (!Array.isArray(partiesList)) return;

  partiesList.forEach((p) => {
    if (p && p.id) {
      memoryStore.parties.set(p.id, p);
    }
  });
  saveToLocalStorage(STORAGE_KEYS.PARTIES, Array.from(memoryStore.parties.values()));

  const db = await openOfflineDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction("cached_parties", "readwrite");
      const store = tx.objectStore("cached_parties");
      partiesList.forEach((p) => store.put(p));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Retrieve cached counterparties
 */
export async function getCachedParties() {
  const db = await openOfflineDb();
  if (db) {
    try {
      const idbParties = await new Promise((resolve) => {
        const tx = db.transaction("cached_parties", "readonly");
        const store = tx.objectStore("cached_parties");
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      if (Array.isArray(idbParties) && idbParties.length > 0) {
        idbParties.forEach((p) => memoryStore.parties.set(p.id, p));
        saveToLocalStorage(STORAGE_KEYS.PARTIES, Array.from(memoryStore.parties.values()));
      }
    } catch (err) {
      console.warn("getCachedParties IndexedDB warning:", err);
    }
  }

  return Array.from(memoryStore.parties.values());
}

/**
 * Get counts of transactions by status
 */
export async function getOfflineStats() {
  const all = await getAllOfflineTransactions();
  return {
    total: all.length,
    pending_sync: all.filter((t) => t.sync_status === "pending_sync" || (t.status === "Draft" && t.sync_status !== "synced")).length,
    sync_failed: all.filter((t) => t.sync_status === "sync_failed").length,
    synced: all.filter((t) => t.sync_status === "synced" && t.status !== "Draft").length,
    drafts: all.filter((t) => t.status === "Draft" || t.status === "FieldCaptured").length,
    approved: all.filter((t) => t.status === "Approved").length,
  };
}

/**
 * ==============================================================================
 *   DEAL DECISION MATRIX v1 — STORAGE UTILITIES
 * ==============================================================================
 */

export const BENCHMARK_MATRIX_SEEDS = [
  {
    client_id: "00000000-0000-4000-8000-000000000001",
    reference: "MAT-20261111-001",
    is_matrix_record: true,
    commodity: "Maize",
    volume: 30,
    volume_unit: "MT",
    base_price: 1150,
    price_unit: "UGX/KG",
    transport_cost: 750000,
    handling_cogs: 150000,
    handling_basis: "TOTAL",
    gross_revenue: 34500000,
    total_costs: 900000,
    net_margin: 33600000,
    margin_percentage: 97.39,
    status: "Approved",
    buyer_name: "Gulu Grain Millers Ltd",
    supplier_name: "Amuru Farmers Co-op",
    district: "Amuru",
    created_by_name: "Clarence (MD)",
    notes: "Commercial benchmark deal in Amuru-Gulu corridor.",
    created_at: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-10T10:00:00Z",
  },
  {
    client_id: "00000000-0000-4000-8000-000000000002",
    reference: "MAT-20261111-002",
    is_matrix_record: true,
    commodity: "Soybeans",
    volume: 15,
    volume_unit: "MT",
    base_price: 2400,
    price_unit: "UGX/KG",
    transport_cost: 450000,
    handling_cogs: 25000,
    handling_basis: "PER_MT",
    gross_revenue: 36000000,
    total_costs: 825000,
    net_margin: 35175000,
    margin_percentage: 97.71,
    status: "SubmittedForReview",
    buyer_name: "Lira Oil Extractors",
    supplier_name: "Nwoya Producers Association",
    district: "Nwoya",
    created_by_name: "Deal Desk Analyst",
    notes: "High-protein soybean batch with per-MT handling basis.",
    created_at: "2026-11-10T14:30:00Z",
    updated_at: "2026-11-10T14:30:00Z",
  },
];

/**
 * Save Deal Decision Matrix record
 */
export async function saveMatrixRecord(recordData, currentUser = null) {
  const now = new Date().toISOString();
  let clientId = recordData.client_id;
  if (!isValidUUID(clientId)) {
    clientId = generateUUID();
  }
  const reference = recordData.reference || generateMatrixReference();
  const createdByName = recordData.created_by_name || currentUser?.name || currentUser?.email || "Deal Desk Analyst";

  const matrixEntry = {
    ...recordData,
    client_id: clientId,
    reference: reference,
    is_matrix_record: true,
    created_by_name: createdByName,
    created_by: isValidUUID(recordData.created_by) ? recordData.created_by : (isValidUUID(currentUser?.id) ? currentUser.id : null),
    status: recordData.status || "Draft",
    commodity: recordData.commodity || "Maize",
    volume: Number(recordData.volume) || 0,
    volume_unit: recordData.volume_unit || "MT",
    base_price: Number(recordData.base_price) || 0,
    price_unit: recordData.price_unit || "UGX/KG",
    transport_cost: Number(recordData.transport_cost) || 0,
    handling_cogs: Number(recordData.handling_cogs) || 0,
    handling_basis: recordData.handling_basis || "TOTAL",
    gross_revenue: recordData.gross_revenue !== undefined ? recordData.gross_revenue : null,
    total_costs: recordData.total_costs !== undefined ? recordData.total_costs : null,
    net_margin: recordData.net_margin !== undefined ? recordData.net_margin : null,
    margin_percentage: recordData.margin_percentage !== undefined ? recordData.margin_percentage : null,
    buyer_name: recordData.buyer_name || "",
    supplier_name: recordData.supplier_name || "",
    district: recordData.district || "Amuru",
    notes: recordData.notes || "",
    sync_status: recordData.sync_status || "pending_sync",
    created_at: recordData.created_at || now,
    updated_at: now,
  };

  return saveOfflineTransaction(matrixEntry, currentUser);
}

/**
 * Retrieve all Deal Decision Matrix records
 */
export async function getAllMatrixRecords() {
  const all = await getAllOfflineTransactions();
  let matrixList = all.filter((r) => r.is_matrix_record || (r.reference && r.reference.startsWith("MAT-")));

  // Ensure standard benchmark records are seeded into the store
  for (const seed of BENCHMARK_MATRIX_SEEDS) {
    if (!matrixList.some((r) => r.client_id === seed.client_id || r.reference === seed.reference)) {
      await saveOfflineTransaction(seed);
      matrixList.push(seed);
    }
  }

  return matrixList;
}

/**
 * Get Matrix Summary Statistics
 */
export async function getMatrixStats() {
  const records = await getAllMatrixRecords();
  return {
    total: records.length,
    drafts: records.filter((r) => r.status === "Draft").length,
    awaitingReview: records.filter((r) => r.status === "Awaiting Review" || r.status === "SubmittedForReview").length,
    positiveMargin: records.filter((r) => r.net_margin !== null && r.net_margin > 0).length,
    negativeMargin: records.filter((r) => r.net_margin !== null && r.net_margin < 0).length,
    incomplete: records.filter((r) => r.gross_revenue === null || r.net_margin === null).length,
    ready: records.filter((r) => r.ready_status === "READY" || r.status === "Approved" || r.status === "Ready").length,
  };
}
