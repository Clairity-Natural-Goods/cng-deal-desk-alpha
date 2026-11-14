/**
 * ==============================================================================
 *   CNG DEAL DESK ALPHA V2 — MINIMUM VIABLE TRANSACTION RECORD (MVTR)
 *   Module: assets/transactions/TransactionModule.js
 *   Purpose: Full-featured, offline-first 7-element Deal Pack transaction
 *            capture, decision matrix scoring, Clarence approval workflow,
 *            and live sync queue management.
 * ==============================================================================
 */

import { i as reactExport, l as toESM, r as jsxRuntime, t as cn } from "../utils-fF95r_SJ.js";
import { syncEngine, saveTransactionToSupabase } from "../offline/syncEngine.js";
import { supabase } from "../supabaseClient.js";
import {
  saveOfflineTransaction,
  getOfflineTransaction,
  getAllOfflineTransactions,
  markTransactionSynced,
  getOfflineStats,
  deleteOfflineTransaction,
} from "../offline/offlineStore.js";
import { normalizeCounterpartyName, normalizeDistrict } from "../supabaseRepository.js";

const React = toESM(reactExport(), 1);
const { useState, useEffect, useMemo, useCallback } = React;
const { jsx, jsxs } = jsxRuntime();

// Master Commodities & Districts
const COMMODITIES = ["Maize", "Beans", "Soybeans", "Sorghum", "Rice", "Cassava", "Sunflower"];
const DISTRICTS = ["Amuru", "Gulu", "Lira", "Nwoya", "Oyam", "Kitgum", "Apac", "Dokolo", "Kole", "Pader"];

// Minimum fee floor and overhead rule
const MINIMUM_FEE_FLOOR = 25000;
const DEFAULT_PER_TONNE_FEE = 30000;
const OVERHEAD_PCT = 15;
const STAFF_HOURLY_RATE = 6000;

export default function TransactionModule() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [parties, setParties] = useState([]);
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'pending', 'draft', 'submitted', 'approved'
  const [selectedTx, setSelectedTx] = useState(null); // When editing / viewing
  const [searchQuery, setSearchQuery] = useState("");
  const [syncState, setSyncState] = useState(syncEngine.getState());
  const [stats, setStats] = useState({ total: 0, pending_sync: 0, sync_failed: 0, synced: 0, drafts: 0, approved: 0 });
  const [toastMessage, setToastMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState(1); // 1..7 for Deal Pack accordion

  // Show temporary toast feedback
  const showToast = useCallback((msg, type = "success") => {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 4500);
  }, []);

  // Subscribe to sync engine status
  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((state) => {
      setSyncState(state);
      refreshData();
    });
    return () => unsubscribe();
  }, []);

  // Load current user and initial data
  const refreshData = useCallback(async () => {
    try {
      const db = globalThis.__B44_DB__;
      if (db?.auth?.me) {
        const user = await db.auth.me();
        setCurrentUser(user);
        setIsAdmin(user?.role === "admin" || user?.email?.toLowerCase().includes("clarence") || user?.username?.toLowerCase().includes("clarence"));
      }

      // 1. Fetch transactions directly from Supabase PostgreSQL database
      let dbTransactions = [];
      try {
        const { data, error } = await supabase
          .from("transactions")
          .select("*")
          .order("created_at", { ascending: false });

        if (!error && Array.isArray(data)) {
          dbTransactions = data;
        }
      } catch (cloudErr) {
        console.warn("Direct cloud fetch notice:", cloudErr);
      }

      // 2. Fetch all offline transactions from local store (IndexedDB / LocalStorage)
      const localTransactions = await getAllOfflineTransactions();

      // 3. Reconcile & Merge remote and local transactions
      const mergedMap = new Map();

      // Remote records take precedence for confirmed server data
      for (const remote of dbTransactions) {
        const key = remote.client_id || remote.id;
        if (key) {
          const item = {
            ...remote,
            status: remote.status || "Draft",
            sync_status: remote.sync_status || (remote.status === "Draft" ? "pending_sync" : "synced"),
          };
          mergedMap.set(key, item);
          await markTransactionSynced(key, item);
        }
      }

      // Local records add un-synced drafts or retain pending_sync status
      for (const local of localTransactions) {
        const key = local.client_id || local.id;
        if (key) {
          if (!mergedMap.has(key)) {
            mergedMap.set(key, local);
          } else {
            const existing = mergedMap.get(key);
            // If local copy has pending_sync or Draft, retain pending_sync
            if (local.sync_status === "pending_sync" || local.status === "Draft") {
              mergedMap.set(key, { ...existing, ...local, sync_status: local.sync_status || "pending_sync" });
            }
          }
        }
      }

      const mergedList = Array.from(mergedMap.values());
      mergedList.sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0));

      setTransactions(mergedList);

      // 4. Compute authoritative dashboard stats directly from the merged dataset
      const calculatedStats = {
        total: mergedList.length,
        pending_sync: mergedList.filter((t) => t.sync_status === "pending_sync" || (t.status === "Draft" && t.sync_status !== "synced")).length,
        sync_failed: mergedList.filter((t) => t.sync_status === "sync_failed").length,
        synced: mergedList.filter((t) => t.sync_status === "synced" && t.status !== "Draft").length,
        drafts: mergedList.filter((t) => t.status === "Draft" || t.status === "FieldCaptured").length,
        approved: mergedList.filter((t) => t.status === "Approved").length,
      };

      setStats(calculatedStats);

      // Load parties
      if (db?.entities?.Party) {
        try {
          const partyList = await db.entities.Party.filter({}, { limit: 300 });
          setParties(partyList || []);
        } catch (e) {
          console.warn("Could not fetch parties:", e);
        }
      }
    } catch (err) {
      console.warn("Data refresh notice:", err);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Filtered transactions for list view
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Tab filter
      if (activeTab === "pending" && tx.sync_status !== "pending_sync" && tx.sync_status !== "sync_failed") return false;
      if (activeTab === "draft" && tx.status !== "Draft" && tx.status !== "FieldCaptured") return false;
      if (activeTab === "submitted" && tx.status !== "SubmittedForReview" && tx.status !== "PendingApproval") return false;
      if (activeTab === "approved" && tx.status !== "Approved") return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const refMatch = tx.reference?.toLowerCase().includes(q);
        const buyerMatch = (tx.buyer_requirements?.buyer_name || "").toLowerCase().includes(q);
        const supplierMatch = (tx.supplier_verification?.supplier_name || "").toLowerCase().includes(q);
        const commMatch = (tx.commodity || "").toLowerCase().includes(q);
        const officerMatch = (tx.created_by_name || "").toLowerCase().includes(q);
        return refMatch || buyerMatch || supplierMatch || commMatch || officerMatch;
      }
      return true;
    });
  }, [transactions, activeTab, searchQuery]);

  // Create brand new transaction
  const handleCreateNew = () => {
    const today = new Date().toISOString().slice(0, 10);
    const newTx = {
      client_id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `cid_${Date.now()}`,
      reference: `TXN-${today.replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`,
      created_by_name: currentUser?.name || currentUser?.email || "Field Officer",
      status: "Draft",
      sync_status: "pending_sync",
      commodity: "Maize",
      buyer_requirements: {
        buyer_name: "",
        product_specification: "White Maize, Grain Grade 1",
        required_tonnes: 30,
        moisture_limit_pct: 13.5,
        quality_spec: "Grade 1 - moisture <13.5%, broken grains <2%",
        delivery_location: "",
        delivery_district: "Gulu",
        required_delivery_date: today,
        purchasing_conditions: "Payment within 48h of weighbridge ticket clearance",
      },
      supplier_verification: {
        supplier_name: "",
        contact_person: "",
        phone: "",
        district: "Amuru",
        location_details: "",
        verification_status: "REPORTED",
        claimed_tonnes: 30,
        confirmed_tonnes: 30,
        moisture_reading_pct: 13.0,
        verification_date: today,
        verifying_officer: currentUser?.name || "Field Officer",
        evidence_notes: "Visual inspection and field moisture probe completed.",
      },
      transport_collection: {
        arrangement: "Company-arranged",
        collection_point: "",
        destination: "",
        transporter_name: "",
        transporter_contact: "",
        estimated_tonnes: 30,
        transport_rate_per_tonne: 25000,
        total_transport_cost: 750000,
        collection_status: "Planned",
        waybill_ref: "",
        notes: "",
      },
      payment_terms: {
        agreed_price_per_kg: 1100,
        currency: "UGX",
        payment_method: "Bank transfer",
        payment_schedule: "50% on loading, 50% on destination weighbridge",
        deposit_required: true,
        deposit_amount: 16500000,
        outstanding_balance: 16500000,
        payment_status: "Agreed",
        payment_conditions: "Inspection required prior to final payment release",
      },
      fee_margin: {
        cng_fee_per_tonne: DEFAULT_PER_TONNE_FEE,
        minimum_fee: MINIMUM_FEE_FLOOR,
        calculation_basis: "30 t @ UGX 30,000/t",
        expected_gross_fee: 900000,
        cost_field: 60000,
        cost_testing: 25000,
        cost_transport: 0,
        cost_other: 15000,
        staff_hours: 6,
        staff_rate_per_hour: STAFF_HOURLY_RATE,
        total_direct_costs: 136000,
        overhead_pct: OVERHEAD_PCT,
        overhead_amount: 135000,
        projected_net_margin: 629000,
        notes: "Healthy net margin after direct field operations and 15% desk overhead.",
      },
      decision_matrix: {
        counterparty_reliability_score: 18,
        quality_compliance_score: 18,
        margin_feasibility_score: 18,
        logistics_certainty_score: 16,
        payment_security_score: 17,
        total_score: 87,
        max_score: 100,
        recommendation: "Proceed",
        explanation: "Verified cooperative with compliant moisture and established buyer terms.",
        evaluator_name: currentUser?.name || "Field Officer",
        evaluation_date: today,
      },
      approval: {
        status: "Pending",
        approver_id: null,
        approver_name: "",
        decision_date: null,
        comments: "",
        approval_evidence: "",
        rejection_reason: "",
      },
      notes: "Field capture initiated.",
    };

    setSelectedTx(newTx);
    setActiveSection(1);
    // Persist new draft immediately to offline store and attempt background Supabase save
    saveOfflineTransaction(newTx, currentUser).then(() => {
      saveTransactionToSupabase(newTx, currentUser).catch(() => {});
      refreshData();
    });
  };

  // Recalculate economics dynamically when tonnes or fees change
  const recalculateFeeAndMargin = (tx) => {
    const tonnes = Number(tx.supplier_verification?.confirmed_tonnes) || Number(tx.buyer_requirements?.required_tonnes) || 0;
    const perTonne = Number(tx.fee_margin?.cng_fee_per_tonne) || DEFAULT_PER_TONNE_FEE;
    const minFee = Number(tx.fee_margin?.minimum_fee) || MINIMUM_FEE_FLOOR;

    let grossFee = 0;
    let basis = "No tonnes accepted";
    if (tonnes > 0) {
      const raw = tonnes * perTonne;
      if (raw >= minFee) {
        grossFee = raw;
        basis = `${tonnes} t @ UGX ${perTonne.toLocaleString()}/t`;
      } else {
        grossFee = minFee;
        basis = `Minimum fee of UGX ${minFee.toLocaleString()} applied`;
      }
    }

    const fieldCost = Number(tx.fee_margin?.cost_field) || 0;
    const testCost = Number(tx.fee_margin?.cost_testing) || 0;
    const transCost = Number(tx.fee_margin?.cost_transport) || 0;
    const otherCost = Number(tx.fee_margin?.cost_other) || 0;
    const staffHours = Number(tx.fee_margin?.staff_hours) || 0;
    const staffRate = Number(tx.fee_margin?.staff_rate_per_hour) || STAFF_HOURLY_RATE;
    const staffTotal = staffHours * staffRate;

    const directCosts = fieldCost + testCost + transCost + otherCost + staffTotal;
    const overhead = Math.round((grossFee * OVERHEAD_PCT) / 100);
    const netMargin = grossFee - directCosts - overhead;

    return {
      ...tx.fee_margin,
      calculation_basis: basis,
      expected_gross_fee: grossFee,
      total_direct_costs: directCosts,
      overhead_amount: overhead,
      projected_net_margin: netMargin,
    };
  };

  // Recalculate decision matrix score dynamically
  const recalculateDecisionMatrix = (dm) => {
    const s1 = Math.min(20, Math.max(0, Number(dm.counterparty_reliability_score) || 0));
    const s2 = Math.min(20, Math.max(0, Number(dm.quality_compliance_score) || 0));
    const s3 = Math.min(20, Math.max(0, Number(dm.margin_feasibility_score) || 0));
    const s4 = Math.min(20, Math.max(0, Number(dm.logistics_certainty_score) || 0));
    const s5 = Math.min(20, Math.max(0, Number(dm.payment_security_score) || 0));
    const total = s1 + s2 + s3 + s4 + s5;

    let recommendation = "Pending Evaluation";
    if (total >= 75) {
      recommendation = "Proceed";
    } else if (total >= 50) {
      recommendation = "Conditional Proceed";
    } else {
      recommendation = "Do Not Proceed";
    }

    return {
      ...dm,
      counterparty_reliability_score: s1,
      quality_compliance_score: s2,
      margin_feasibility_score: s3,
      logistics_certainty_score: s4,
      payment_security_score: s5,
      total_score: total,
      recommendation,
    };
  };

  // Save current record directly to Supabase database (with offline resilience)
  const handleSaveDraft = async () => {
    if (!selectedTx) return;
    setIsSubmitting(true);
    try {
      const updatedFeeMargin = recalculateFeeAndMargin(selectedTx);
      const updatedMatrix = recalculateDecisionMatrix(selectedTx.decision_matrix);
      const recordToSave = {
        ...selectedTx,
        fee_margin: updatedFeeMargin,
        decision_matrix: updatedMatrix,
        status: selectedTx.status === "Approved" ? "Approved" : "Draft",
        sync_status: "pending_sync",
      };

      try {
        // Direct write to Supabase database
        const savedServer = await saveTransactionToSupabase(recordToSave, currentUser);
        setSelectedTx(savedServer);
        showToast("Draft saved directly to Supabase PostgreSQL database.", "success");
      } catch (dbErr) {
        console.warn("Direct database write failed, saving to local offline store:", dbErr);
        await saveOfflineTransaction(recordToSave, currentUser);
        setSelectedTx(recordToSave);
        showToast(`Saved offline (${dbErr.message}). Will sync when connected.`, "warning");
      }

      await refreshData();
    } catch (err) {
      showToast(`Error saving draft: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Deal Pack for Clarence Review
  const handleSubmitForReview = async () => {
    if (!selectedTx) return;

    // Validate 7 sections
    const missing = [];
    if (!selectedTx.buyer_requirements?.buyer_name) missing.push("Section 1: Buyer Name");
    if (!selectedTx.supplier_verification?.supplier_name) missing.push("Section 2: Supplier Name");
    if (Number(selectedTx.supplier_verification?.moisture_reading_pct) <= 0) missing.push("Section 2: Moisture reading");
    if (!selectedTx.transport_collection?.transporter_name) missing.push("Section 3: Transporter");
    if (Number(selectedTx.payment_terms?.agreed_price_per_kg) <= 0) missing.push("Section 4: Agreed price");
    if (Number(selectedTx.fee_margin?.expected_gross_fee) <= 0) missing.push("Section 5: CNG Fee");

    if (missing.length > 0) {
      showToast(`Cannot submit: Please complete required elements:\n${missing.join(", ")}`, "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedFeeMargin = recalculateFeeAndMargin(selectedTx);
      const updatedMatrix = recalculateDecisionMatrix(selectedTx.decision_matrix);
      const recordToSave = {
        ...selectedTx,
        fee_margin: updatedFeeMargin,
        decision_matrix: updatedMatrix,
        status: "SubmittedForReview",
        sync_status: "pending_sync",
      };

      try {
        const savedServer = await saveTransactionToSupabase(recordToSave, currentUser);
        setSelectedTx(savedServer);
        showToast("Deal Pack submitted and saved to Supabase database.", "success");
      } catch (dbErr) {
        console.warn("Direct DB submit notice, falling back to local queue:", dbErr);
        await saveOfflineTransaction(recordToSave, currentUser);
        setSelectedTx(recordToSave);
        showToast("Deal Pack queued locally for Clarence review.", "success");
      }

      await refreshData();
    } catch (err) {
      showToast(`Submission error: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clarence Approval Action (Restricted to Admin / Clarence)
  const handleApprovalAction = async (decision) => {
    if (!isAdmin) {
      showToast("PERMISSION DENIED: Only Clarence or an authorized administrator can approve or reject records.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const recordToSave = {
        ...selectedTx,
        status: decision,
        approval: {
          ...selectedTx.approval,
          status: decision,
          approver_id: currentUser?.id || "clarence_admin",
          approver_name: currentUser?.name || "Clarence (Managing Director)",
          decision_date: now,
        },
        sync_status: "pending_sync",
      };

      try {
        const savedServer = await saveTransactionToSupabase(recordToSave, currentUser);
        setSelectedTx(savedServer);
        showToast(`Transaction ${decision.toUpperCase()} directly in Supabase database.`, "success");
      } catch (dbErr) {
        console.warn("Direct DB approval notice, falling back to local store:", dbErr);
        await saveOfflineTransaction(recordToSave, currentUser);
        setSelectedTx(recordToSave);
        showToast(`Transaction ${decision.toUpperCase()} saved locally.`, "success");
      }

      await refreshData();
    } catch (err) {
      showToast(`Approval error: ${err.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manual Trigger for Sync Engine
  const handleManualSync = async () => {
    if (!syncState.isOnline) {
      showToast("Cannot sync: Device is offline. Reconnect to sync.", "error");
      return;
    }
    showToast("Starting cloud synchronization...", "info");
    const result = await syncEngine.syncPendingTransactions();
    if (result.success) {
      showToast(`Synchronization complete! ${result.processed} record(s) synced.`, "success");
    } else {
      showToast(`Sync notice: ${syncEngine.lastError || "Some records could not be synced"}`, "error");
    }
    await refreshData();
  };

  // Calculate completeness score (0 to 7)
  const getCompletenessCount = (tx) => {
    if (!tx) return 0;
    let count = 0;
    if (tx.buyer_requirements?.buyer_name && tx.buyer_requirements?.required_tonnes > 0) count++;
    if (tx.supplier_verification?.supplier_name && tx.supplier_verification?.moisture_reading_pct > 0) count++;
    if (tx.transport_collection?.transporter_name || tx.transport_collection?.collection_point) count++;
    if (tx.payment_terms?.agreed_price_per_kg > 0) count++;
    if (tx.fee_margin?.expected_gross_fee > 0) count++;
    if (tx.decision_matrix?.total_score > 0) count++;
    if (tx.approval?.status === "Approved") count++;
    return count;
  };

  // Render Status Badge
  const renderStatusBadge = (status) => {
    const map = {
      Draft: "bg-slate-100 text-slate-800 border-slate-300",
      FieldCaptured: "bg-blue-50 text-blue-800 border-blue-300",
      DealPackIncomplete: "bg-amber-50 text-amber-800 border-amber-300",
      DealPackComplete: "bg-teal-50 text-teal-800 border-teal-300",
      SubmittedForReview: "bg-purple-50 text-purple-800 border-purple-300",
      Approved: "bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold",
      Rejected: "bg-rose-50 text-rose-800 border-rose-300",
    };
    return jsx("span", {
      className: cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border tracking-wide", map[status] || map.Draft),
      children: status,
    });
  };

  // Render Sync Badge
  const renderSyncBadge = (syncStatus, errorMsg) => {
    if (syncStatus === "synced") {
      return jsxs("span", {
        className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-700 font-medium",
        title: "Synchronized with Supabase",
        children: [
          jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-600" }),
          "Synced",
        ],
      });
    }
    if (syncStatus === "sync_failed") {
      return jsxs("span", {
        className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-rose-50 text-rose-700 font-medium cursor-pointer",
        title: errorMsg || "Sync failed. Click to retry.",
        onClick: handleManualSync,
        children: [
          jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" }),
          "Sync Failed",
        ],
      });
    }
    return jsxs("span", {
      className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-amber-50 text-amber-700 font-medium",
      title: "Pending synchronization",
      children: [
        jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-amber-600" }),
        "Pending Sync",
      ],
    });
  };

  return jsxs("div", {
    className: "p-4 md:p-6 max-w-7xl mx-auto space-y-6 font-sans text-slate-900 dark:text-slate-100",
    children: [
      // Toast notification banner
      toastMessage &&
        jsx("div", {
          className: cn(
            "fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl border text-sm max-w-md transition-all",
            toastMessage.type === "error" ? "bg-red-50 text-red-900 border-red-300" : "bg-emerald-50 text-emerald-900 border-emerald-300"
          ),
          children: toastMessage.text,
        }),

      // Header with Live Offline/Online Status Pill
      jsxs("header", {
        className: "flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800",
        children: [
          jsxs("div", {
            children: [
              jsx("div", {
                className: "text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400",
                children: "CNG Deal Desk • Minimum Viable Transaction Record",
              }),
              jsx("h1", {
                className: "text-2xl md:text-3xl font-extrabold tracking-tight mt-1",
                children: "Field Transaction Desk & Deal Pack",
              }),
              jsx("p", {
                className: "text-sm text-slate-500 dark:text-slate-400 mt-1",
                children: "Durable offline field capture, 7 mandatory Deal Pack elements, and server-verified Clarence approval.",
              }),
            ],
          }),

          // Connectivity & Sync Control Box
          jsxs("div", {
            className: "flex flex-wrap items-center gap-3",
            children: [
              // Online / Offline Indicator
              jsxs("div", {
                className: cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border",
                  syncState.isOnline
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300"
                ),
                children: [
                  jsx("span", {
                    className: cn("w-2 h-2 rounded-full", syncState.isOnline ? "bg-emerald-500" : "bg-amber-500 animate-pulse"),
                  }),
                  syncState.isOnline ? "Online" : "Offline Mode (IndexedDB)",
                ],
              }),

              // Pending Sync Counter Pill
              jsxs("div", {
                className: "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300",
                children: [
                  stats.pending_sync > 0
                    ? jsxs("span", {
                        className: "text-amber-600 font-bold",
                        children: [stats.pending_sync, " pending sync"],
                      })
                    : jsx("span", {
                        className: "text-emerald-600 font-medium",
                        children: "Queue empty",
                      }),
                ],
              }),

              // Retry Sync Button
              jsx("button", {
                type: "button",
                onClick: handleManualSync,
                disabled: syncState.isSyncing,
                className: "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900",
                children: syncState.isSyncing ? "Syncing..." : "Sync Cloud Now",
              }),
            ],
          }),
        ],
      }),

      // MAIN CONTENT: LIST VIEW OR DETAIL FORM VIEW
      !selectedTx
        ? jsxs("main", {
            className: "space-y-6",
            children: [
              // Quick Summary Metric Cards
              jsxs("div", {
                className: "grid grid-cols-2 md:grid-cols-5 gap-3",
                children: [
                  jsxs("div", {
                    className: "p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
                    children: [
                      jsx("div", { className: "text-xs font-semibold text-slate-500 uppercase", children: "Total Records" }),
                      jsx("div", { className: "text-2xl font-bold mt-1", children: stats.total }),
                    ],
                  }),
                  jsxs("div", {
                    className: "p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
                    children: [
                      jsx("div", { className: "text-xs font-semibold text-amber-600 uppercase", children: "Pending Sync" }),
                      jsx("div", { className: "text-2xl font-bold text-amber-600 mt-1", children: stats.pending_sync }),
                    ],
                  }),
                  jsxs("div", {
                    className: "p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
                    children: [
                      jsx("div", { className: "text-xs font-semibold text-blue-600 uppercase", children: "Drafts / Field" }),
                      jsx("div", { className: "text-2xl font-bold text-blue-600 mt-1", children: stats.drafts }),
                    ],
                  }),
                  jsxs("div", {
                    className: "p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
                    children: [
                      jsx("div", { className: "text-xs font-semibold text-emerald-600 uppercase", children: "Approved" }),
                      jsx("div", { className: "text-2xl font-bold text-emerald-600 mt-1", children: stats.approved }),
                    ],
                  }),
                  jsxs("div", {
                    className: "col-span-2 md:col-span-1 flex items-center justify-center p-2",
                    children: [
                      jsx("button", {
                        type: "button",
                        onClick: handleCreateNew,
                        className: "w-full h-full min-h-[56px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2",
                        children: "+ New Transaction Record",
                      }),
                    ],
                  }),
                ],
              }),

              // Filter Tabs & Search Bar
              jsxs("div", {
                className: "flex flex-col sm:flex-row items-center justify-between gap-3 pt-2",
                children: [
                  jsxs("div", {
                    className: "flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 w-full sm:w-auto",
                    children: [
                      [
                        { id: "all", label: "All Transactions" },
                        { id: "pending", label: `Pending Sync (${stats.pending_sync})` },
                        { id: "draft", label: "Drafts" },
                        { id: "submitted", label: "Review Queue" },
                        { id: "approved", label: "Approved" },
                      ].map((tab) =>
                        jsx(
                          "button",
                          {
                            key: tab.id,
                            type: "button",
                            onClick: () => setActiveTab(tab.id),
                            className: cn(
                              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                              activeTab === tab.id ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                            ),
                            children: tab.label,
                          },
                          tab.id
                        )
                      ),
                    ],
                  }),

                  // Search Input
                  jsx("input", {
                    type: "text",
                    placeholder: "Search reference, buyer, supplier, officer...",
                    value: searchQuery,
                    onChange: (e) => setSearchQuery(e.target.value),
                    className: "w-full sm:w-72 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-emerald-600",
                  }),
                ],
              }),

              // Transactions Card Listing
              filteredTransactions.length === 0
                ? jsxs("div", {
                    className: "text-center py-16 px-4 border border-dashed rounded-2xl border-slate-300 dark:border-slate-800",
                    children: [
                      jsx("p", { className: "text-sm text-slate-500", children: "No transaction records found matching this view." }),
                      jsx("button", {
                        type: "button",
                        onClick: handleCreateNew,
                        className: "mt-4 px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100",
                        children: "Capture First Field Transaction",
                      }),
                    ],
                  })
                : jsx("div", {
                    className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
                    children: filteredTransactions.map((tx) => {
                      const completedCount = getCompletenessCount(tx);
                      return jsxs(
                        "div",
                        {
                          key: tx.client_id,
                          className: "p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4",
                          children: [
                            jsxs("div", {
                              className: "space-y-3",
                              children: [
                                // Top row: Reference & Badges
                                jsxs("div", {
                                  className: "flex items-start justify-between gap-2",
                                  children: [
                                    jsxs("div", {
                                      children: [
                                        jsx("span", {
                                          className: "font-mono font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100",
                                          children: tx.reference,
                                        }),
                                        jsx("div", {
                                          className: "text-[11px] text-slate-500",
                                          children: tx.created_at ? new Date(tx.created_at).toLocaleDateString() : "Just now",
                                        }),
                                      ],
                                    }),
                                    jsxs("div", {
                                      className: "flex flex-col items-end gap-1",
                                      children: [
                                        renderStatusBadge(tx.status),
                                        renderSyncBadge(tx.sync_status, tx.sync_error),
                                      ],
                                    }),
                                  ],
                                }),

                                // Buyer & Supplier summary
                                jsxs("div", {
                                  className: "p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1 text-xs",
                                  children: [
                                    jsxs("div", {
                                      className: "flex justify-between",
                                      children: [
                                        jsx("span", { className: "text-slate-500", children: "Buyer:" }),
                                        jsx("span", { className: "font-semibold truncate max-w-[160px]", children: tx.buyer_requirements?.buyer_name || "Pending" }),
                                      ],
                                    }),
                                    jsxs("div", {
                                      className: "flex justify-between",
                                      children: [
                                        jsx("span", { className: "text-slate-500", children: "Supplier:" }),
                                        jsx("span", { className: "font-semibold truncate max-w-[160px]", children: tx.supplier_verification?.supplier_name || "Pending" }),
                                      ],
                                    }),
                                    jsxs("div", {
                                      className: "flex justify-between",
                                      children: [
                                        jsx("span", { className: "text-slate-500", children: "Commodity:" }),
                                        jsxs("span", { className: "font-medium text-emerald-700 dark:text-emerald-400", children: [tx.commodity, " • ", tx.supplier_verification?.confirmed_tonnes || tx.buyer_requirements?.required_tonnes || 0, " t"] }),
                                      ],
                                    }),
                                    jsxs("div", {
                                      className: "flex justify-between",
                                      children: [
                                        jsx("span", { className: "text-slate-500", children: "Moisture:" }),
                                        jsx("span", { className: "font-medium", children: tx.supplier_verification?.moisture_reading_pct ? `${tx.supplier_verification.moisture_reading_pct}%` : "Not tested" }),
                                      ],
                                    }),
                                  ],
                                }),

                                // Progress bar for 7 Deal Pack elements
                                jsxs("div", {
                                  className: "space-y-1",
                                  children: [
                                    jsxs("div", {
                                      className: "flex justify-between text-[11px] text-slate-500",
                                      children: [
                                        jsx("span", { children: "Deal Pack Elements" }),
                                        jsxs("span", { className: "font-semibold", children: [completedCount, " / 7 Complete"] }),
                                      ],
                                    }),
                                    jsx("div", {
                                      className: "w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden",
                                      children: jsx("div", {
                                        className: cn(
                                          "h-full rounded-full transition-all",
                                          completedCount === 7 ? "bg-emerald-600" : completedCount >= 4 ? "bg-amber-500" : "bg-blue-600"
                                        ),
                                        style: { width: `${(completedCount / 7) * 100}%` },
                                      }),
                                    }),
                                  ],
                                }),
                              ],
                            }),

                            // Bottom actions
                            jsxs("div", {
                              className: "flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs",
                              children: [
                                jsx("span", {
                                  className: "text-[11px] text-slate-500 truncate max-w-[140px]",
                                  children: `By: ${tx.created_by_name || "Field Officer"}`,
                                }),
                                jsx("button", {
                                  type: "button",
                                  onClick: () => {
                                    setSelectedTx(tx);
                                    setActiveSection(1);
                                  },
                                  className: "px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold transition-all",
                                  children: "Open Deal Pack →",
                                }),
                              ],
                            }),
                          ],
                        },
                        tx.client_id
                      );
                    }),
                  }),
            ],
          })
        : // TRANSACTION DETAIL / 7-ELEMENT DEAL PACK FORM VIEW
          jsxs("main", {
            className: "space-y-6",
            children: [
              // Top Back button and Header
              jsxs("div", {
                className: "flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm",
                children: [
                  jsxs("div", {
                    className: "flex items-center gap-3",
                    children: [
                      jsx("button", {
                        type: "button",
                        onClick: () => setSelectedTx(null),
                        className: "px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700",
                        children: "← Back to Transactions",
                      }),
                      jsxs("div", {
                        children: [
                          jsxs("div", {
                            className: "flex items-center gap-2",
                            children: [
                              jsx("span", { className: "font-mono font-bold text-lg", children: selectedTx.reference }),
                              renderStatusBadge(selectedTx.status),
                              renderSyncBadge(selectedTx.sync_status, selectedTx.sync_error),
                            ],
                          }),
                          jsxs("div", {
                            className: "text-xs text-slate-500",
                            children: [
                              "Officer: ",
                              selectedTx.created_by_name,
                              " • Created: ",
                              new Date(selectedTx.created_at).toLocaleString(),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),

                  // Action buttons
                  jsxs("div", {
                    className: "flex flex-wrap items-center gap-2",
                    children: [
                      jsx("button", {
                        type: "button",
                        onClick: handleSaveDraft,
                        disabled: isSubmitting,
                        className: "px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700",
                        children: isSubmitting ? "Saving..." : "Save Local Draft (Offline)",
                      }),
                      jsx("button", {
                        type: "button",
                        onClick: handleSubmitForReview,
                        disabled: isSubmitting || selectedTx.status === "Approved",
                        className: "px-4 py-2 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition-all",
                        children: "Submit Deal Pack for Review",
                      }),
                    ],
                  }),
                ],
              }),

              // 7 Section Stepper / Selector
              jsx("div", {
                className: "grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2",
                children: [
                  { num: 1, title: "01 Buyer Req." },
                  { num: 2, title: "02 Supplier Verif." },
                  { num: 3, title: "03 Transport" },
                  { num: 4, title: "04 Payment" },
                  { num: 5, title: "05 CNG Margin" },
                  { num: 6, title: "06 Matrix Score" },
                  { num: 7, title: "07 Clarence Approval" },
                ].map((sec) =>
                  jsxs(
                    "button",
                    {
                      key: sec.num,
                      type: "button",
                      onClick: () => setActiveSection(sec.num),
                      className: cn(
                        "p-3 rounded-xl border text-left text-xs font-semibold transition-all flex flex-col justify-between min-h-[58px]",
                        activeSection === sec.num
                          ? "border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/60 dark:border-emerald-500 dark:text-emerald-100 shadow-sm"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 dark:text-slate-400"
                      ),
                      children: [
                        jsx("span", { className: "text-[10px] uppercase tracking-wider text-slate-400", children: `Element ${sec.num}` }),
                        jsx("span", { className: "font-bold truncate mt-0.5", children: sec.title }),
                      ],
                    },
                    sec.num
                  )
                ),
              }),

              // SECTION CONTENT CONTAINER
              jsx("div", {
                className: "p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm",
                children: (() => {
                  switch (activeSection) {
                    // SECTION 01: BUYER REQUIREMENTS
                    case 1:
                      return jsxs("div", {
                        className: "space-y-5",
                        children: [
                          jsxs("div", {
                            className: "border-b border-slate-100 dark:border-slate-800 pb-3",
                            children: [
                              jsx("h3", { className: "text-base font-bold text-slate-900 dark:text-slate-100", children: "Element 01 — Buyer Requirements" }),
                              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Capture buyer identity, specification, required tonnage, moisture tolerance, and purchasing conditions." }),
                            ],
                          }),
                          jsxs("div", {
                            className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-xs",
                            children: [
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Buyer Name / Institution *" }),
                                  jsx("input", {
                                    type: "text",
                                    value: selectedTx.buyer_requirements.buyer_name,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        buyer_requirements: { ...selectedTx.buyer_requirements, buyer_name: e.target.value },
                                      }),
                                    placeholder: "e.g. Gulu Grain Millers Ltd",
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Commodity Specification *" }),
                                  jsx("select", {
                                    value: selectedTx.commodity,
                                    onChange: (e) => setSelectedTx({ ...selectedTx, commodity: e.target.value }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                    children: COMMODITIES.map((c) => jsx("option", { value: c, children: c }, c)),
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Required Quantity (Tonnes) *" }),
                                  jsx("input", {
                                    type: "number",
                                    step: "0.1",
                                    value: selectedTx.buyer_requirements.required_tonnes,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        buyer_requirements: { ...selectedTx.buyer_requirements, required_tonnes: Number(e.target.value) },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Maximum Moisture Tolerance (%) *" }),
                                  jsx("input", {
                                    type: "number",
                                    step: "0.1",
                                    value: selectedTx.buyer_requirements.moisture_limit_pct,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        buyer_requirements: { ...selectedTx.buyer_requirements, moisture_limit_pct: Number(e.target.value) },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Delivery District" }),
                                  jsx("select", {
                                    value: selectedTx.buyer_requirements.delivery_district,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        buyer_requirements: { ...selectedTx.buyer_requirements, delivery_district: e.target.value },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                    children: DISTRICTS.map((d) => jsx("option", { value: d, children: d }, d)),
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Specific Delivery Location" }),
                                  jsx("input", {
                                    type: "text",
                                    value: selectedTx.buyer_requirements.delivery_location,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        buyer_requirements: { ...selectedTx.buyer_requirements, delivery_location: e.target.value },
                                      }),
                                    placeholder: "e.g. Layibi Industrial Park Warehouse #3",
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "md:col-span-2 space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Purchasing Conditions & Quality Spec" }),
                                  jsx("textarea", {
                                    rows: 2,
                                    value: selectedTx.buyer_requirements.purchasing_conditions,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        buyer_requirements: { ...selectedTx.buyer_requirements, purchasing_conditions: e.target.value },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      });


                    // SECTION 02: SUPPLIER VERIFICATION
                    case 2:
                      return jsxs("div", {
                        className: "space-y-5",
                        children: [
                          jsxs("div", {
                            className: "border-b border-slate-100 dark:border-slate-800 pb-3",
                            children: [
                              jsx("h3", { className: "text-base font-bold text-slate-900 dark:text-slate-100", children: "Element 02 — Supplier Verification" }),
                              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Capture supplier identity, calibrated field moisture readings, confirmed volumes, and physical verification." }),
                            ],
                          }),
                          jsxs("div", {
                            className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-xs",
                            children: [
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Supplier / Farmer Cooperative Name *" }),
                                  jsx("input", {
                                    type: "text",
                                    value: selectedTx.supplier_verification.supplier_name,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        supplier_verification: { ...selectedTx.supplier_verification, supplier_name: e.target.value },
                                      }),
                                    placeholder: "e.g. Amuru United Farmers Co-op",
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Verification Status (Strict Gate) *" }),
                                  jsx("select", {
                                    value: selectedTx.supplier_verification.verification_status,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        supplier_verification: { ...selectedTx.supplier_verification, verification_status: e.target.value },
                                      }),
                                    className: cn(
                                      "w-full p-2.5 rounded-lg border font-bold",
                                      selectedTx.supplier_verification.verification_status === "VERIFIED"
                                        ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                                        : "bg-amber-50 text-amber-900 border-amber-300"
                                    ),
                                    children: [
                                      jsx("option", { value: "REPORTED", children: "REPORTED (Self-reported by supplier)" }),
                                      jsx("option", { value: "VERIFIED", children: "VERIFIED (Physically verified by officer)" }),
                                    ],
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Confirmed Volume (Tonnes) *" }),
                                  jsx("input", {
                                    type: "number",
                                    step: "0.1",
                                    value: selectedTx.supplier_verification.confirmed_tonnes,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        supplier_verification: { ...selectedTx.supplier_verification, confirmed_tonnes: Number(e.target.value) },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Field Moisture Tester Reading (%) *" }),
                                  jsx("input", {
                                    type: "number",
                                    step: "0.1",
                                    value: selectedTx.supplier_verification.moisture_reading_pct,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        supplier_verification: { ...selectedTx.supplier_verification, moisture_reading_pct: Number(e.target.value) },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Supplier District" }),
                                  jsx("select", {
                                    value: selectedTx.supplier_verification.district,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        supplier_verification: { ...selectedTx.supplier_verification, district: e.target.value },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                    children: DISTRICTS.map((d) => jsx("option", { value: d, children: d }, d)),
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Contact Person & Phone" }),
                                  jsx("input", {
                                    type: "text",
                                    value: selectedTx.supplier_verification.contact_person,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        supplier_verification: { ...selectedTx.supplier_verification, contact_person: e.target.value },
                                      }),
                                    placeholder: "e.g. David Okello (+256 772 100 200)",
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "md:col-span-2 space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Field Verification Evidence & Sampling Notes" }),
                                  jsx("textarea", {
                                    rows: 2,
                                    value: selectedTx.supplier_verification.evidence_notes,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        supplier_verification: { ...selectedTx.supplier_verification, evidence_notes: e.target.value },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      });


                    // SECTION 03: TRANSPORT / COLLECTION
                    case 3:
                      return jsxs("div", {
                        className: "space-y-5",
                        children: [
                          jsxs("div", {
                            className: "border-b border-slate-100 dark:border-slate-800 pb-3",
                            children: [
                              jsx("h3", { className: "text-base font-bold text-slate-900 dark:text-slate-100", children: "Element 03 — Transport & Collection" }),
                              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Capture collection arrangement, transporter identity, collection point, destination, and costs." }),
                            ],
                          }),
                          jsxs("div", {
                            className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-xs",
                            children: [
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Transport Arrangement *" }),
                                  jsx("select", {
                                    value: selectedTx.transport_collection.arrangement,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        transport_collection: { ...selectedTx.transport_collection, arrangement: e.target.value },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                    children: [
                                      jsx("option", { value: "Company-arranged", children: "Company-arranged (Deal Desk coordinates transport)" }),
                                      jsx("option", { value: "Self-collection", children: "Self-collection (Buyer collects from bulking point)" }),
                                      jsx("option", { value: "Supplier-delivered", children: "Supplier-delivered (Delivered direct to buyer)" }),
                                    ],
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Responsible Transporter *" }),
                                  jsx("input", {
                                    type: "text",
                                    value: selectedTx.transport_collection.transporter_name,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        transport_collection: { ...selectedTx.transport_collection, transporter_name: e.target.value },
                                      }),
                                    placeholder: "e.g. Northern Hauliers Uganda",
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Collection Point" }),
                                  jsx("input", {
                                    type: "text",
                                    value: selectedTx.transport_collection.collection_point,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        transport_collection: { ...selectedTx.transport_collection, collection_point: e.target.value },
                                      }),
                                    placeholder: "e.g. Amuru Central Bulking Facility",
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Destination" }),
                                  jsx("input", {
                                    type: "text",
                                    value: selectedTx.transport_collection.destination,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        transport_collection: { ...selectedTx.transport_collection, destination: e.target.value },
                                      }),
                                    placeholder: "e.g. Gulu Grain Millers Silo #2",
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Total Transport Cost (UGX)" }),
                                  jsx("input", {
                                    type: "number",
                                    value: selectedTx.transport_collection.total_transport_cost,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        transport_collection: { ...selectedTx.transport_collection, total_transport_cost: Number(e.target.value) },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Collection Status" }),
                                  jsx("select", {
                                    value: selectedTx.transport_collection.collection_status,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        transport_collection: { ...selectedTx.transport_collection, collection_status: e.target.value },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                    children: [
                                      jsx("option", { value: "Planned", children: "Planned" }),
                                      jsx("option", { value: "In transit", children: "In transit" }),
                                      jsx("option", { value: "Delivered", children: "Delivered" }),
                                      jsx("option", { value: "Weighed at destination", children: "Weighed at destination" }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      });


                    // SECTION 04: PAYMENT TERMS
                    case 4:
                      return jsxs("div", {
                        className: "space-y-5",
                        children: [
                          jsxs("div", {
                            className: "border-b border-slate-100 dark:border-slate-800 pb-3",
                            children: [
                              jsx("h3", { className: "text-base font-bold text-slate-900 dark:text-slate-100", children: "Element 04 — Payment Terms" }),
                              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Agreed pricing, currency (UGX), payment schedule, deposit requirement, and strict payment verification status." }),
                            ],
                          }),
                          jsxs("div", {
                            className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-xs",
                            children: [
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Agreed Price Per Kg (UGX) *" }),
                                  jsx("input", {
                                    type: "number",
                                    value: selectedTx.payment_terms.agreed_price_per_kg,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        payment_terms: { ...selectedTx.payment_terms, agreed_price_per_kg: Number(e.target.value) },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Payment Method" }),
                                  jsx("select", {
                                    value: selectedTx.payment_terms.payment_method,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        payment_terms: { ...selectedTx.payment_terms, payment_method: e.target.value },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                    children: [
                                      jsx("option", { value: "Bank transfer", children: "Bank transfer" }),
                                      jsx("option", { value: "Mobile money", children: "Mobile money" }),
                                      jsx("option", { value: "Cash against weighbridge ticket", children: "Cash against weighbridge ticket" }),
                                      jsx("option", { value: "Escrow release", children: "Escrow release" }),
                                    ],
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Payment Schedule" }),
                                  jsx("input", {
                                    type: "text",
                                    value: selectedTx.payment_terms.payment_schedule,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        payment_terms: { ...selectedTx.payment_terms, payment_schedule: e.target.value },
                                      }),
                                    placeholder: "e.g. 50% on loading, 50% on mill delivery",
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Payment Status (Business Gate) *" }),
                                  jsx("select", {
                                    value: selectedTx.payment_terms.payment_status,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        payment_terms: { ...selectedTx.payment_terms, payment_status: e.target.value },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-semibold",
                                    children: [
                                      jsx("option", { value: "Agreed", children: "Agreed (Terms settled)" }),
                                      jsx("option", { value: "Reported paid", children: "Reported paid (Party claimed transfer sent)" }),
                                      jsx("option", { value: "Verified paid", children: "Verified paid (Bank statement / slip confirmed)" }),
                                    ],
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Deposit Amount (UGX)" }),
                                  jsx("input", {
                                    type: "number",
                                    value: selectedTx.payment_terms.deposit_amount,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        payment_terms: { ...selectedTx.payment_terms, deposit_amount: Number(e.target.value) },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Outstanding Balance (UGX)" }),
                                  jsx("input", {
                                    type: "number",
                                    value: selectedTx.payment_terms.outstanding_balance,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        payment_terms: { ...selectedTx.payment_terms, outstanding_balance: Number(e.target.value) },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      });


                    // SECTION 05: CNG FEE / MARGIN CALCULATOR
                    case 5: {
                      const econ = recalculateFeeAndMargin(selectedTx);
                      return jsxs("div", {
                        className: "space-y-5",
                        children: [
                          jsxs("div", {
                            className: "border-b border-slate-100 dark:border-slate-800 pb-3",
                            children: [
                              jsx("h3", { className: "text-base font-bold text-slate-900 dark:text-slate-100", children: "Element 05 — CNG Fee & Margin Calculator" }),
                              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Explicit commercial calculation: minimum UGX 25,000 floor rule, operational costs, and 15% overhead." }),
                            ],
                          }),

                          // Commercial Breakdown Dashboard Cards
                          jsxs("div", {
                            className: "grid grid-cols-2 md:grid-cols-4 gap-3",
                            children: [
                              jsxs("div", {
                                className: "p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700",
                                children: [
                                  jsx("div", { className: "text-[11px] font-semibold text-slate-500 uppercase", children: "Gross CNG Fee" }),
                                  jsx("div", { className: "text-lg font-bold text-emerald-700 dark:text-emerald-400 mt-0.5", children: `UGX ${econ.expected_gross_fee.toLocaleString()}` }),
                                  jsx("div", { className: "text-[10px] text-slate-400 mt-0.5", children: econ.calculation_basis }),
                                ],
                              }),
                              jsxs("div", {
                                className: "p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700",
                                children: [
                                  jsx("div", { className: "text-[11px] font-semibold text-slate-500 uppercase", children: "Direct Operational Costs" }),
                                  jsx("div", { className: "text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5", children: `UGX ${econ.total_direct_costs.toLocaleString()}` }),
                                  jsx("div", { className: "text-[10px] text-slate-400 mt-0.5", children: "Field, testing & staff" }),
                                ],
                              }),
                              jsxs("div", {
                                className: "p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700",
                                children: [
                                  jsx("div", { className: "text-[11px] font-semibold text-slate-500 uppercase", children: "15% Desk Overhead" }),
                                  jsx("div", { className: "text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5", children: `UGX ${econ.overhead_amount.toLocaleString()}` }),
                                  jsx("div", { className: "text-[10px] text-slate-400 mt-0.5", children: "System & audit allocation" }),
                                ],
                              }),
                              jsxs("div", {
                                className: "p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700",
                                children: [
                                  jsx("div", { className: "text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase", children: "Projected Net Margin" }),
                                  jsx("div", { className: "text-lg font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5", children: `UGX ${econ.projected_net_margin.toLocaleString()}` }),
                                  jsx("div", { className: "text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5", children: "CNG net transaction contribution" }),
                                ],
                              }),
                            ],
                          }),

                          // Input Fields for Costs
                          jsxs("div", {
                            className: "grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2",
                            children: [
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Agreed Fee Rate Per Tonne (UGX)" }),
                                  jsx("input", {
                                    type: "number",
                                    value: selectedTx.fee_margin.cng_fee_per_tonne,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        fee_margin: { ...selectedTx.fee_margin, cng_fee_per_tonne: Number(e.target.value) },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Field Fuel & Transport Cost (UGX)" }),
                                  jsx("input", {
                                    type: "number",
                                    value: selectedTx.fee_margin.cost_field,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        fee_margin: { ...selectedTx.fee_margin, cost_field: Number(e.target.value) },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Testing & Sampling Cost (UGX)" }),
                                  jsx("input", {
                                    type: "number",
                                    value: selectedTx.fee_margin.cost_testing,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        fee_margin: { ...selectedTx.fee_margin, cost_testing: Number(e.target.value) },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Staff Hours Committed" }),
                                  jsx("input", {
                                    type: "number",
                                    value: selectedTx.fee_margin.staff_hours,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        fee_margin: { ...selectedTx.fee_margin, staff_hours: Number(e.target.value) },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Staff Hourly Rate (UGX)" }),
                                  jsx("input", {
                                    type: "number",
                                    value: selectedTx.fee_margin.staff_rate_per_hour,
                                    disabled: true,
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 font-normal",
                                  }),
                                ],
                              }),
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Other Direct Costs (UGX)" }),
                                  jsx("input", {
                                    type: "number",
                                    value: selectedTx.fee_margin.cost_other,
                                    onChange: (e) =>
                                      setSelectedTx({
                                        ...selectedTx,
                                        fee_margin: { ...selectedTx.fee_margin, cost_other: Number(e.target.value) },
                                      }),
                                    className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                                  }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      });

                    }

                    // SECTION 06: DECISION MATRIX SCORE
                    case 6: {
                      const dm = recalculateDecisionMatrix(selectedTx.decision_matrix);
                      return jsxs("div", {
                        className: "space-y-5",
                        children: [
                          jsxs("div", {
                            className: "border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between",
                            children: [
                              jsxs("div", {
                                children: [
                                  jsx("h3", { className: "text-base font-bold text-slate-900 dark:text-slate-100", children: "Element 06 — Decision Matrix Score" }),
                                  jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Score 5 core evaluation criteria (0-20 each, total 100). Preserving business underwriting rules." }),
                                ],
                              }),
                              jsxs("div", {
                                className: "text-right",
                                children: [
                                  jsxs("div", { className: "text-2xl font-black text-emerald-700 dark:text-emerald-400", children: [dm.total_score, " / 100"] }),
                                  jsx("span", {
                                    className: cn(
                                      "inline-block px-2.5 py-0.5 rounded-full text-xs font-bold",
                                      dm.total_score >= 75
                                        ? "bg-emerald-100 text-emerald-900"
                                        : dm.total_score >= 50
                                        ? "bg-amber-100 text-amber-900"
                                        : "bg-red-100 text-red-900"
                                    ),
                                    children: dm.recommendation,
                                  }),
                                ],
                              }),
                            ],
                          }),

                          // 5 Criteria Sliders / Inputs
                          jsxs("div", {
                            className: "space-y-3 text-xs",
                            children: [
                              [
                                { key: "counterparty_reliability_score", label: "1. Counterparty Reliability & Past Performance (0 - 20)" },
                                { key: "quality_compliance_score", label: "2. Quality & Moisture Compliance (0 - 20)" },
                                { key: "margin_feasibility_score", label: "3. Margin & Economic Feasibility (0 - 20)" },
                                { key: "logistics_certainty_score", label: "4. Logistics & Transporter Route Certainty (0 - 20)" },
                                { key: "payment_security_score", label: "5. Payment Security & Terms Risk (0 - 20)" },
                              ].map((crit) =>
                                jsxs(
                                  "div",
                                  {
                                    key: crit.key,
                                    className: "p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4",
                                    children: [
                                      jsx("span", { className: "font-semibold text-slate-700 dark:text-slate-300", children: crit.label }),
                                      jsxs("div", {
                                        className: "flex items-center gap-3",
                                        children: [
                                          jsx("input", {
                                            type: "range",
                                            min: "0",
                                            max: "20",
                                            value: selectedTx.decision_matrix[crit.key] || 0,
                                            onChange: (e) =>
                                              setSelectedTx({
                                                ...selectedTx,
                                                decision_matrix: { ...selectedTx.decision_matrix, [crit.key]: Number(e.target.value) },
                                              }),
                                            className: "w-32 accent-emerald-600",
                                          }),
                                          jsx("span", {
                                            className: "w-8 text-center font-bold text-sm font-mono text-emerald-700 dark:text-emerald-400",
                                            children: selectedTx.decision_matrix[crit.key] || 0,
                                          }),
                                        ],
                                      }),
                                    ],
                                  },
                                  crit.key
                                )
                              ),
                            ],
                          }),

                          // Explanation narrative
                          jsxs("label", {
                            className: "block space-y-1 text-xs font-semibold pt-2",
                            children: [
                              jsx("span", { children: "Evaluation Explanation & Supporting Narrative" }),
                              jsx("textarea", {
                                rows: 2,
                                value: selectedTx.decision_matrix.explanation,
                                onChange: (e) =>
                                  setSelectedTx({
                                    ...selectedTx,
                                    decision_matrix: { ...selectedTx.decision_matrix, explanation: e.target.value },
                                  }),
                                placeholder: "Explain key risks, physical inspection results, and rationale for proceeding.",
                                className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                              }),
                            ],
                          }),
                        ],
                      });

                    }

                    // SECTION 07: CLARENCE APPROVAL STATUS (Server-Enforced Gate)
                    case 7:
                      return jsxs("div", {
                        className: "space-y-5",
                        children: [
                          jsxs("div", {
                            className: "border-b border-slate-100 dark:border-slate-800 pb-3",
                            children: [
                              jsx("h3", { className: "text-base font-bold text-slate-900 dark:text-slate-100", children: "Element 07 — Clarence Approval Status" }),
                              jsx("p", { className: "text-xs text-slate-500 mt-0.5", children: "Only Clarence or an authorized delegated approver may approve transactions. Field officers cannot self-approve." }),
                            ],
                          }),

                          // Current Approval Badge
                          jsxs("div", {
                            className: "p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between",
                            children: [
                              jsxs("div", {
                                children: [
                                  jsx("div", { className: "text-xs text-slate-500", children: "Current Decision Status" }),
                                  jsx("div", {
                                    className: cn(
                                      "text-xl font-bold mt-0.5",
                                      selectedTx.approval.status === "Approved"
                                        ? "text-emerald-700 dark:text-emerald-400"
                                        : selectedTx.approval.status === "Rejected"
                                        ? "text-rose-700 dark:text-rose-400"
                                        : "text-amber-700 dark:text-amber-400"
                                    ),
                                    children: selectedTx.approval.status,
                                  }),
                                ],
                              }),
                              selectedTx.approval.decision_date &&
                                jsxs("div", {
                                  className: "text-right text-xs text-slate-500",
                                  children: [
                                    jsx("div", { children: `Approver: ${selectedTx.approval.approver_name || "Clarence"}` }),
                                    jsx("div", { children: new Date(selectedTx.approval.decision_date).toLocaleString() }),
                                  ],
                                }),
                            ],
                          }),

                          // Clarence Admin Controls VS Field Officer Notice
                          isAdmin
                            ? jsxs("div", {
                                className: "space-y-4 p-4 rounded-xl border-2 border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/20",
                                children: [
                                  jsxs("div", {
                                    children: [
                                      jsx("span", { className: "text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300", children: "Clarence Executive Authority Active" }),
                                      jsx("p", { className: "text-xs text-slate-600 dark:text-slate-400 mt-0.5", children: "You are signed in with approval credentials. You may officially approve or reject this Deal Pack." }),
                                    ],
                                  }),
                                  jsxs("label", {
                                    className: "block space-y-1 text-xs font-semibold",
                                    children: [
                                      jsx("span", { children: "Approver Comments & Execution Conditions" }),
                                      jsx("textarea", {
                                        rows: 2,
                                        value: selectedTx.approval.comments,
                                        onChange: (e) =>
                                          setSelectedTx({
                                            ...selectedTx,
                                            approval: { ...selectedTx.approval, comments: e.target.value },
                                          }),
                                        placeholder: "e.g. Approved. Ensure weighbridge ticket is validated prior to releasing final tranche.",
                                        className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                      }),
                                    ],
                                  }),
                                  jsxs("div", {
                                    className: "flex items-center gap-3 pt-2",
                                    children: [
                                      jsx("button", {
                                        type: "button",
                                        onClick: () => handleApprovalAction("Approved"),
                                        disabled: isSubmitting,
                                        className: "px-5 py-2.5 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-md transition-all",
                                        children: "✓ Approve Deal Pack",
                                      }),
                                      jsx("button", {
                                        type: "button",
                                        onClick: () => handleApprovalAction("Rejected"),
                                        disabled: isSubmitting,
                                        className: "px-5 py-2.5 text-xs font-bold rounded-xl bg-rose-700 hover:bg-rose-800 text-white shadow-md transition-all",
                                        children: "✗ Reject Deal Pack",
                                      }),
                                    ],
                                  }),
                                ],
                              })
                            : jsxs("div", {
                                className: "p-4 rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 text-xs space-y-2",
                                children: [
                                  jsx("div", { className: "font-bold text-amber-900 dark:text-amber-300", children: "Field Officer Mode — Approval Authority Restricted" }),
                                  jsx("p", { className: "text-amber-800 dark:text-amber-400 leading-relaxed", children: "As a field officer, you can capture observations, readings, and complete all Deal Pack sections. Once complete, click 'Submit Deal Pack for Review' so Clarence can review and sign off." }),
                                ],
                              }),
                        ],
                      });


                    default:
                      return null;
                  }
                })(),
              }),

              // Bottom Navigation & Save Drawer
              jsxs("div", {
                className: "flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800",
                children: [
                  jsx("button", {
                    type: "button",
                    onClick: () => setActiveSection((prev) => Math.max(1, prev - 1)),
                    disabled: activeSection === 1,
                    className: "px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 disabled:opacity-40",
                    children: "← Previous Element",
                  }),
                  jsxs("div", {
                    className: "text-xs font-semibold text-slate-500",
                    children: ["Deal Pack Element ", activeSection, " of 7"],
                  }),
                  jsx("button", {
                    type: "button",
                    onClick: () => setActiveSection((prev) => Math.min(7, prev + 1)),
                    disabled: activeSection === 7,
                    className: "px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 disabled:opacity-40",
                    children: "Next Element →",
                  }),
                ],
              }),
            ],
          }),
    ],
  });
}
