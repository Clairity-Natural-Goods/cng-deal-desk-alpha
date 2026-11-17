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
import {
  maskPersonName,
  maskPhoneNumber,
  maskEmailAddress,
  maskContactAddress,
  maskBankAccount,
  canUserRevealIdentity,
  recordDisclosureAudit,
  maskTransaction,
} from "../identityMasking.js";

const React = toESM(reactExport(), 1);
const { useState, useEffect, useMemo, useCallback, useRef } = React;
import { classifyCostInput, COST_STATUS, evaluateReadyReadiness, evaluateTransactionReadiness } from "../matrix/financialEngine.js";
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
  const inFlightRef = useRef(false); // Synchronous guard against double submissions

  // Wave 2: Controlled Identity Disclosure Modal & Audited Access
  const [revealedTxIds, setRevealedTxIds] = useState(new Set());
  const [revealModalOpen, setRevealModalOpen] = useState(false);
  const [revealPurpose, setRevealPurpose] = useState("OPERATIONAL"); // 'OPERATIONAL' or 'BANKING'
  const [revealReason, setRevealReason] = useState("");
  const [revealError, setRevealError] = useState(null);
  const [isRevealing, setIsRevealing] = useState(false);

  // Wave 3: Debounced Search, Multi-Criteria Filtering & Pagination
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterCommodity, setFilterCommodity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterDateRange, setFilterDateRange] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 9;

  // Phase 7: Operational Event & Management Approval Local States
  const [rejectionReasonInput, setRejectionReasonInput] = useState("");
  const [intakeInputKg, setIntakeInputKg] = useState("");
  const [intakeInputRef, setIntakeInputRef] = useState("");
  const [intakeInputNotes, setIntakeInputNotes] = useState("");
  const [collectionInputKg, setCollectionInputKg] = useState("");
  const [collectionInputRef, setCollectionInputRef] = useState("");
  const [collectionInputNotes, setCollectionInputNotes] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Wave 4: 5-State Last-Saved Indicator State
  const [saveState, setSaveState] = useState({
    status: "idle", // 'idle' | 'saving' | 'saved_locally' | 'saved_server' | 'sync_pending' | 'save_failed'
    timestamp: null,
    error: null,
  });

  // Wave 7: Safe Form Recovery & Local Draft Retention
  const [recoveryDraft, setRecoveryDraft] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  // Check for stored draft when opening a transaction
  const checkRecoveryDraft = useCallback((tx) => {
    if (!tx || !tx.client_id) return;
    try {
      const draftKey = `cng_draft_${currentUser?.id || "anon"}_${tx.client_id}`;
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        const draftTime = new Date(parsed.timestamp || 0).getTime();
        const txTime = new Date(tx.updated_at || tx.created_at || 0).getTime();
        if (draftTime > txTime + 2000) {
          setRecoveryDraft(parsed);
          return;
        }
      }
    } catch (e) {}
    setRecoveryDraft(null);
  }, [currentUser]);

  // Autosave form changes to local storage
  const handleTxChange = useCallback((updatedTx) => {
    setSelectedTx(updatedTx);
    setIsDirty(true);
    try {
      if (updatedTx?.client_id) {
        const draftKey = `cng_draft_${currentUser?.id || "anon"}_${updatedTx.client_id}`;
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            tx: updatedTx,
          })
        );
      }
    } catch (e) {}
  }, [currentUser]);

  // Clear draft
  const clearFormDraft = useCallback((clientId) => {
    try {
      if (clientId) {
        const draftKey = `cng_draft_${currentUser?.id || "anon"}_${clientId}`;
        localStorage.removeItem(draftKey);
      }
    } catch (e) {}
    setRecoveryDraft(null);
    setIsDirty(false);
  }, [currentUser]);

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
            sync_status: remote.sync_status || "synced",
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
        pending_sync: mergedList.filter((t) => t.sync_status === "pending_sync").length,
        sync_failed: mergedList.filter((t) => t.sync_status === "sync_failed").length,
        synced: mergedList.filter((t) => t.sync_status === "synced").length,
        drafts: mergedList.filter((t) => t.status === "Draft" || t.status === "FieldCaptured").length,
        approved: mergedList.filter((t) => t.status === "Approved" && evaluateTransactionReadiness(t).isReady).length,
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

  // Filtered & Sorted transactions for list view (Multi-Criteria & Debounced)
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        // Tab filter
        if (activeTab === "pending" && tx.sync_status !== "pending_sync" && tx.sync_status !== "sync_failed") return false;
        if (activeTab === "draft" && tx.status !== "Draft" && tx.status !== "FieldCaptured") return false;
        if (activeTab === "submitted" && tx.status !== "SubmittedForReview" && tx.status !== "PendingApproval") return false;
        if (activeTab === "approved" && tx.status !== "Approved") return false;

        // Commodity filter
        if (filterCommodity !== "all" && tx.commodity !== filterCommodity) return false;

        // Status filter
        if (filterStatus !== "all" && tx.status !== filterStatus) return false;

        // Payment status filter
        if (filterPayment !== "all" && tx.payment_terms?.payment_status !== filterPayment) return false;

        // Date range filter
        if (filterDateRange !== "all") {
          const txDate = new Date(tx.created_at || tx.updated_at || Date.now());
          const now = Date.now();
          const dayMs = 24 * 60 * 60 * 1000;
          if (filterDateRange === "today" && now - txDate.getTime() > dayMs) return false;
          if (filterDateRange === "7d" && now - txDate.getTime() > 7 * dayMs) return false;
          if (filterDateRange === "30d" && now - txDate.getTime() > 30 * dayMs) return false;
        }

        // Debounced search query
        if (debouncedSearch.trim()) {
          const q = debouncedSearch.toLowerCase();
          const refMatch = (tx.reference || "").toLowerCase().includes(q);
          const buyerMatch = (tx.buyer_requirements?.buyer_name || "").toLowerCase().includes(q);
          const supplierMatch = (tx.supplier_verification?.supplier_name || "").toLowerCase().includes(q);
          const commMatch = (tx.commodity || "").toLowerCase().includes(q);
          const officerMatch = (tx.created_by_name || "").toLowerCase().includes(q);
          return refMatch || buyerMatch || supplierMatch || commMatch || officerMatch;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "oldest") {
          return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        }
        if (sortBy === "ref") {
          return (a.reference || "").localeCompare(b.reference || "");
        }
        if (sortBy === "tonnes") {
          const tA = Number(a.buyer_requirements?.required_tonnes || 0);
          const tB = Number(b.buyer_requirements?.required_tonnes || 0);
          return tB - tA;
        }
        // default newest
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
  }, [transactions, activeTab, debouncedSearch, filterCommodity, filterStatus, filterPayment, filterDateRange, sortBy]);

  // Paginated slice
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredTransactions.slice(start, start + PAGE_SIZE);
  }, [filteredTransactions, currentPage, PAGE_SIZE]);

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
        collection_point: "Amuru Bulking Station",
        destination: "Gulu Grain Processing Silo #2",
        transporter_name: "Northern Hauliers Uganda",
        transporter_contact: "+256 772 100 200",
        estimated_tonnes: 30,
        transport_rate_per_tonne: 25000,
        total_transport_cost: 750000,
        collection_status: "Planned",
        waybill_ref: "WB-2026-001",
        notes: "Direct farm-gate to central bulking handoff.",
        handoff_location: {
          hub_name: "Amuru Central Bulking Hub",
          district: "Amuru",
          physical_reference: "Plot 14, Gulu-Nimule Road",
          scheduled_datetime: `${today}T10:00`,
          confirmation_status: "Confirmed",
          responsible_party: "CNG Deal Desk",
        },
        leg1_supplier_to_handoff: {
          carrier_name: "Northern Hauliers Uganda",
          driver_contact: "+256 772 100 200",
          scheduled_dispatch: `${today}T08:00`,
          actual_dispatch: `${today}T08:30`,
          expected_intake_kg: 30000,
          actual_intake_kg: 30000,
          evidence_reference: "WB-IN-001",
          status: "Completed",
        },
        leg2_handoff_to_buyer: {
          carrier_name: "Swift Grain Logistics",
          driver_contact: "+256 782 300 400",
          scheduled_collection: `${today}T14:00`,
          actual_collection: `${today}T14:15`,
          collected_kg: 30000,
          delivered_kg: 30000,
          evidence_reference: "WB-OUT-001",
          status: "Delivered",
        },
        events: [],
        quantity_reconciliation: {
          expected_kg: 30000,
          intake_kg: 30000,
          collection_kg: 30000,
          delivered_kg: 30000,
          variance_kg: 0,
          variance_pct: 0,
          has_discrepancy: false,
        },
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

  // Save current record directly to Supabase database (with synchronous in-flight guard, reconciliation & 5-state tracking)
  const handleSaveDraft = async () => {
    if (!selectedTx) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSubmitting(true);
    setSaveState({ status: "saving", timestamp: new Date(), error: null });
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

      // Reconcile uncertain network timeout: check if already committed
      try {
        const { data: existing } = await supabase
          .from("transactions")
          .select("*")
          .eq("client_id", recordToSave.client_id)
          .maybeSingle();
        if (existing && existing.id && existing.sync_version >= (recordToSave.sync_version || 0)) {
          setSelectedTx(existing);
          setSaveState({ status: "saved_server", timestamp: new Date(existing.updated_at || Date.now()), error: null });
          clearFormDraft(recordToSave.client_id);
          showToast("Reconciled confirmed transaction record from Supabase database.", "success");
          await refreshData();
          return;
        }
      } catch (checkErr) {
        console.warn("Pre-save reconciliation query note:", checkErr);
      }

      try {
        // Direct write to Supabase database
        const savedServer = await saveTransactionToSupabase(recordToSave, currentUser);
        setSelectedTx(savedServer);
        setSaveState({ status: "saved_server", timestamp: new Date(), error: null });
        clearFormDraft(recordToSave.client_id);
        showToast("Draft saved directly to Supabase PostgreSQL database.", "success");
      } catch (dbErr) {
        console.warn("Direct database write failed, saving to local offline store:", dbErr);
        await saveOfflineTransaction(recordToSave, currentUser);
        setSelectedTx(recordToSave);
        setSaveState({ status: "saved_locally", timestamp: new Date(), error: null });
        clearFormDraft(recordToSave.client_id);
        showToast(`Saved locally — awaiting synchronisation (${dbErr.message}).`, "warning");
      }

      await refreshData();
    } catch (err) {
      setSaveState({ status: "save_failed", timestamp: new Date(), error: err.message });
      showToast(`Error saving draft: ${err.message}`, "error");
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Submit Deal Pack for Clarence Review (with strict incomplete commercial terms defense & in-flight guard)
  const handleSubmitForReview = async () => {
    if (!selectedTx) return;
    if (inFlightRef.current) return;

    // Strict Validation: Unknown costs and unconfirmed terms must be visibly incomplete (Phase 5 & Test D)
    const missing = [];
    if (!selectedTx.buyer_requirements?.buyer_name) missing.push("Section 1: Buyer Name / Institution");
    if (!selectedTx.supplier_verification?.supplier_name) missing.push("Section 2: Supplier / Cooperative Name");
    if (Number(selectedTx.buyer_requirements?.required_tonnes) <= 0) missing.push("Section 1: Quantity in Kilograms / Tonnes");
    
    // Check price per kg
    const priceVal = selectedTx.payment_terms?.agreed_price_per_kg;
    if (priceVal === null || priceVal === undefined || Number(priceVal) <= 0) {
      missing.push("Section 4: Price per kilo (UGX) [Must be positive number]");
    }
    
    // Check payment terms
    if (!selectedTx.payment_terms?.payment_schedule) {
      missing.push("Section 4: Payment Schedule Terms");
    }

    // Check transport cost (must not be unentered/missing)
    const transportVal = selectedTx.transport_collection?.total_transport_cost;
    if (transportVal === null || transportVal === undefined) {
      missing.push("Section 3: Transport Cost [Provide amount or explicitly confirm 0]");
    }

    // Check CNG fee margin
    if (Number(selectedTx.fee_margin?.expected_gross_fee) <= 0) {
      missing.push("Section 5: CNG Service Fee");
    }

    if (missing.length > 0) {
      showToast(`Cannot submit Deal Pack — Missing Mandatory Requirements:\n${missing.join("\n")}`, "error");
      return;
    }

    inFlightRef.current = true;
    setIsSubmitting(true);
    setSaveState({ status: "saving", timestamp: new Date(), error: null });
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
        setSaveState({ status: "saved_server", timestamp: new Date(), error: null });
        clearFormDraft(recordToSave.client_id);
        showToast("Deal Pack submitted and saved to Supabase database.", "success");
      } catch (dbErr) {
        console.warn("Direct DB submit notice, falling back to local queue:", dbErr);
        await saveOfflineTransaction(recordToSave, currentUser);
        setSelectedTx(recordToSave);
        setSaveState({ status: "saved_locally", timestamp: new Date(), error: null });
        clearFormDraft(recordToSave.client_id);
        showToast("Deal Pack queued locally for Clarence review.", "success");
      }

      await refreshData();
    } catch (err) {
      setSaveState({ status: "save_failed", timestamp: new Date(), error: err.message });
      showToast(`Submission error: ${err.message}`, "error");
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Clarence Approval Action (Restricted to Admin / Clarence with in-flight guard)
  const handleApprovalAction = async (decision, rejectionReason = "") => {
    if (!isAdmin) {
      showToast("PERMISSION DENIED: Only Clarence or an authorized administrator can approve or reject records.", "error");
      return;
    }
    // Frontend Blocker A Defense: Incomplete transactions cannot enter Approved
    if (decision === "Approved") {
      const readiness = evaluateTransactionReadiness(selectedTx);
      if (!readiness.isReady) {
        showToast(`Cannot approve Deal Pack — Missing Mandatory Requirements:\n${readiness.missing.join("\n")}`, "error");
        return;
      }
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
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
          rejection_reason: rejectionReason || selectedTx.approval?.rejection_reason || "",
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
      inFlightRef.current = false;
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

  // Phase 6: Three-Line Commercial Quotation & Pricing Helper
  const renderThreeLineQuotation = (tx) => {
    if (!tx) return null;
    const commodity = tx.commodity || "Maize";
    const tonnes = Number(tx.buyer_requirements?.required_tonnes || tx.supplier_verification?.confirmed_tonnes || 0);
    const kg = tonnes * 1000;
    const agreedPricePerKg = Number(tx.payment_terms?.agreed_price_per_kg || 0);
    const totalCommodityValue = Math.round(kg * agreedPricePerKg);
    const buyerName = tx.buyer_requirements?.buyer_name || "Pending Buyer";
    const supplierName = tx.supplier_verification?.supplier_name || "Pending Supplier";

    // Line 2: CNG Service Fees
    const feeRate = Number(tx.fee_margin?.cng_fee_per_tonne || 30000);
    const minFee = Number(tx.fee_margin?.minimum_fee || 25000);
    const proposedFee = Math.max(Math.round(tonnes * feeRate), minFee);
    const feeStatus = tx.fee_margin?.acceptance_status || (tx.status === "Approved" ? "Accepted" : "Proposed");
    const isFeeAccepted = feeStatus === "Accepted";
    const acceptedFee = isFeeAccepted ? proposedFee : 0;

    // Line 3: Third-Party Transport Costs
    const transportCost = Number(tx.transport_collection?.total_transport_cost || 0);
    const transportPayer = tx.transport_collection?.arrangement === "Self-collection" ? buyerName : "CNG / Deducted from settlement";
    const carrierName = tx.transport_collection?.transporter_name || "Third-party Haulier";
    const transportConfirmed = Boolean(transportCost > 0 && tx.transport_collection?.transporter_name);

    // Total Commercial Due & Outstanding
    const totalCommercialDue = totalCommodityValue + proposedFee + transportCost;
    const depositPaid = Number(tx.payment_terms?.deposit_amount || 0);
    const outstandingBalance = Math.max(0, totalCommercialDue - depositPaid);

    return jsxs("div", {
      className: "p-5 rounded-2xl border-2 border-emerald-500/30 bg-white dark:bg-slate-900 shadow-md space-y-4",
      children: [
        jsxs("div", {
          className: "flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3",
          children: [
            jsxs("div", {
              className: "flex items-center gap-2",
              children: [
                jsx("span", { className: "text-xl", children: "📜" }),
                jsxs("div", {
                  children: [
                    jsx("h4", { className: "font-bold text-sm text-slate-900 dark:text-slate-100 uppercase tracking-wide", children: "Three-Line Commercial Quotation Breakdown" }),
                    jsx("p", { className: "text-[11px] text-slate-500", children: "Standardized commercial quotation categories, payer/recipient allocations, and settlement obligations." }),
                  ],
                }),
              ],
            }),
            jsx("span", { className: "font-mono font-bold text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300", children: "UGX Currency Standard" }),
          ],
        }),

        // Line 1: Commodity Value
        jsxs("div", {
          className: "p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2",
          children: [
            jsxs("div", {
              className: "flex items-center justify-between flex-wrap gap-2",
              children: [
                jsxs("div", {
                  className: "flex items-center gap-2",
                  children: [
                    jsx("span", { className: "w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs", children: "1" }),
                    jsx("span", { className: "font-bold text-xs text-slate-900 dark:text-slate-100", children: "Line 1: Commodity Value" }),
                    jsx("span", { className: "text-[11px] text-slate-500", children: `(${commodity} • ${tonnes} MT / ${kg.toLocaleString()} KG)` }),
                  ],
                }),
                jsx("div", { className: "font-black text-sm text-emerald-700 dark:text-emerald-400 font-mono", children: `UGX ${totalCommodityValue.toLocaleString()}` }),
              ],
            }),
            jsxs("div", {
              className: "grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1 text-slate-600 dark:text-slate-300 border-t border-slate-200/60 dark:border-slate-700/40",
              children: [
                jsxs("div", { children: [jsx("span", { className: "text-slate-400", children: "Unit Price: " }), jsx("strong", { children: `UGX ${agreedPricePerKg.toLocaleString()}/kg` })] }),
                jsxs("div", { children: [jsx("span", { className: "text-slate-400", children: "Volume: " }), jsx("strong", { children: `${kg.toLocaleString()} kg (${tonnes} t)` })] }),
                jsxs("div", { children: [jsx("span", { className: "text-slate-400", children: "Payer: " }), jsx("strong", { children: buyerName })] }),
                jsxs("div", { children: [jsx("span", { className: "text-slate-400", children: "Recipient: " }), jsx("strong", { children: `${supplierName} (Escrow)` })] }),
              ],
            }),
          ],
        }),

        // Line 2: CNG Service Fees
        jsxs("div", {
          className: "p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2",
          children: [
            jsxs("div", {
              className: "flex items-center justify-between flex-wrap gap-2",
              children: [
                jsxs("div", {
                  className: "flex items-center gap-2",
                  children: [
                    jsx("span", { className: "w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs", children: "2" }),
                    jsx("span", { className: "font-bold text-xs text-slate-900 dark:text-slate-100", children: "Line 2: CNG Service Fees" }),
                    jsx("span", { className: cn("text-[10px] px-2 py-0.5 rounded font-bold uppercase", isFeeAccepted ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"), children: `Status: ${feeStatus}` }),
                  ],
                }),
                jsxs("div", {
                  className: "text-right font-mono",
                  children: [
                    jsx("div", { className: "font-black text-sm text-blue-700 dark:text-blue-400", children: `UGX ${proposedFee.toLocaleString()}` }),
                    !isFeeAccepted && jsx("div", { className: "text-[10px] text-amber-600 dark:text-amber-400 font-sans font-medium", children: "Unaccepted: UGX 0 earned" }),
                  ],
                }),
              ],
            }),
            jsxs("div", {
              className: "grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1 text-slate-600 dark:text-slate-300 border-t border-slate-200/60 dark:border-slate-700/40",
              children: [
                jsxs("div", { children: [jsx("span", { className: "text-slate-400", children: "Fee Basis: " }), jsx("strong", { children: `${tonnes} t @ UGX ${feeRate.toLocaleString()}/t` })] }),
                jsxs("div", { children: [jsx("span", { className: "text-slate-400", children: "Accepted Fee: " }), jsx("strong", { children: `UGX ${acceptedFee.toLocaleString()}` })] }),
                jsxs("div", { children: [jsx("span", { className: "text-slate-400", children: "Payer: " }), jsx("strong", { children: buyerName })] }),
                jsxs("div", { children: [jsx("span", { className: "text-slate-400", children: "Recipient: " }), jsx("strong", { children: "Clarity Natural Goods" })] }),
              ],
            }),
          ],
        }),

        // Line 3: Third-Party Costs (Transport)
        jsxs("div", {
          className: "p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2",
          children: [
            jsxs("div", {
              className: "flex items-center justify-between flex-wrap gap-2",
              children: [
                jsxs("div", {
                  className: "flex items-center gap-2",
                  children: [
                    jsx("span", { className: "w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-xs", children: "3" }),
                    jsx("span", { className: "font-bold text-xs text-slate-900 dark:text-slate-100", children: "Line 3: Third-Party Costs (Transport)" }),
                    jsx("span", { className: cn("text-[10px] px-2 py-0.5 rounded font-bold uppercase", transportConfirmed ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"), children: transportConfirmed ? "Confirmed" : "Estimated" }),
                  ],
                }),
                jsx("div", { className: "font-black text-sm text-purple-700 dark:text-purple-400 font-mono", children: `UGX ${transportCost.toLocaleString()}` }),
              ],
            }),
            jsxs("div", {
              className: "grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1 text-slate-600 dark:text-slate-300 border-t border-slate-200/60 dark:border-slate-700/40",
              children: [
                jsxs("div", { children: [jsx("span", { className: "text-slate-400", children: "Carrier: " }), jsx("strong", { children: carrierName })] }),
                jsxs("div", { children: [jsx("span", { className: "text-slate-400", children: "Route: " }), jsx("strong", { children: `${tx.transport_collection?.collection_point || "Hub"} → ${tx.transport_collection?.destination || "Destination"}` })] }),
                jsxs("div", { children: [jsx("span", { className: "text-slate-400", children: "Payer: " }), jsx("strong", { children: transportPayer })] }),
                jsxs("div", { children: [jsx("span", { className: "text-slate-400", children: "Recipient: " }), jsx("strong", { children: carrierName })] }),
              ],
            }),
          ],
        }),

        // Payment Responsibility Summary Banner
        jsxs("div", {
          className: "p-4 rounded-xl bg-slate-900 text-white dark:bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner",
          children: [
            jsxs("div", {
              className: "space-y-1 text-center sm:text-left",
              children: [
                jsx("div", { className: "text-[11px] text-slate-400 font-medium uppercase tracking-wider", children: "Total Commercial Deal Value" }),
                jsx("div", { className: "text-xl font-black font-mono text-white", children: `UGX ${totalCommercialDue.toLocaleString()}` }),
              ],
            }),
            jsxs("div", {
              className: "flex items-center gap-4 text-xs font-mono",
              children: [
                jsxs("div", {
                  className: "text-right",
                  children: [
                    jsx("div", { className: "text-[10px] text-slate-400", children: "Confirmed / Due" }),
                    jsx("div", { className: "font-bold text-emerald-400", children: `UGX ${(totalCommodityValue + acceptedFee + transportCost).toLocaleString()}` }),
                  ],
                }),
                jsxs("div", {
                  className: "text-right",
                  children: [
                    jsx("div", { className: "text-[10px] text-slate-400", children: "Outstanding Balance" }),
                    jsx("div", { className: "font-bold text-amber-400", children: `UGX ${outstandingBalance.toLocaleString()}` }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
  };

  // Phase 7: Operational Event Handlers for Supplier Intake & Buyer Collection
  const handleLogIntakeEvent = (intakeKg, evidenceRef, notes) => {
    const today = new Date().toISOString();
    const event = {
      id: `ev_intake_${Date.now()}`,
      event_type: "SUPPLIER_INTAKE",
      actor: currentUser?.name || currentUser?.email || "Field Officer",
      timestamp: today,
      quantity_kg: Number(intakeKg) || 0,
      unit: "KG",
      status: "COMPLETED",
      notes: notes || "Supplier intake confirmed on site.",
      evidence: evidenceRef || "WEIGHBRIDGE-TKT",
    };

    const existingEvents = selectedTx.transport_collection?.events || [];
    const updatedEvents = [...existingEvents, event];

    const expectedKg = (selectedTx.buyer_requirements?.required_tonnes || 0) * 1000;
    const currentIntake = Number(intakeKg) || 0;
    const deliveredKg = selectedTx.transport_collection?.quantity_reconciliation?.delivered_kg || 0;
    const varianceKg = currentIntake - expectedKg;
    const variancePct = expectedKg > 0 ? (varianceKg / expectedKg) * 100 : 0;

    const updatedTx = {
      ...selectedTx,
      transport_collection: {
        ...selectedTx.transport_collection,
        leg1_supplier_to_handoff: {
          ...selectedTx.transport_collection?.leg1_supplier_to_handoff,
          actual_intake_kg: currentIntake,
          intake_status: "CONFIRMED",
          intake_officer: currentUser?.name || "Field Officer",
          evidence_reference: evidenceRef || "",
        },
        events: updatedEvents,
        quantity_reconciliation: {
          expected_kg: expectedKg,
          intake_kg: currentIntake,
          collection_kg: currentIntake,
          delivered_kg: deliveredKg,
          variance_kg: varianceKg,
          variance_pct: Math.round(variancePct * 100) / 100,
          has_discrepancy: Math.abs(varianceKg) > 0,
        },
      },
    };
    setSelectedTx(updatedTx);
    showToast(`Supplier intake event recorded: ${currentIntake.toLocaleString()} kg confirmed.`, "success");
  };

  const handleLogCollectionEvent = (deliveredKg, evidenceRef, notes) => {
    const today = new Date().toISOString();
    const event = {
      id: `ev_collection_${Date.now()}`,
      event_type: "BUYER_COLLECTION",
      actor: currentUser?.name || currentUser?.email || "Logistics Officer",
      timestamp: today,
      quantity_kg: Number(deliveredKg) || 0,
      unit: "KG",
      status: "COMPLETED",
      notes: notes || "Buyer collection and destination delivery confirmed.",
      evidence: evidenceRef || "WAYBILL-OUT",
    };

    const existingEvents = selectedTx.transport_collection?.events || [];
    const updatedEvents = [...existingEvents, event];

    const expectedKg = (selectedTx.buyer_requirements?.required_tonnes || 0) * 1000;
    const intakeKg = selectedTx.transport_collection?.quantity_reconciliation?.intake_kg || expectedKg;
    const currentDelivered = Number(deliveredKg) || 0;
    const varianceKg = currentDelivered - intakeKg;
    const variancePct = intakeKg > 0 ? (varianceKg / intakeKg) * 100 : 0;

    const updatedTx = {
      ...selectedTx,
      transport_collection: {
        ...selectedTx.transport_collection,
        leg2_handoff_to_buyer: {
          ...selectedTx.transport_collection?.leg2_handoff_to_buyer,
          delivered_kg: currentDelivered,
          delivery_status: "DELIVERED",
          receiving_officer: currentUser?.name || "Logistics Officer",
          evidence_reference: evidenceRef || "",
        },
        events: updatedEvents,
        quantity_reconciliation: {
          expected_kg: expectedKg,
          intake_kg: intakeKg,
          collection_kg: intakeKg,
          delivered_kg: currentDelivered,
          variance_kg: varianceKg,
          variance_pct: Math.round(variancePct * 100) / 100,
          has_discrepancy: Math.abs(varianceKg) > 0,
        },
      },
    };
    setSelectedTx(updatedTx);
    showToast(`Buyer collection event recorded: ${currentDelivered.toLocaleString()} kg delivered.`, "success");
  };

  // Wave 4: 5-State Last-Saved Indicator Helper
  const renderSaveStateIndicator = (state) => {
    switch (state.status) {
      case "saving":
        return jsxs("div", {
          className: "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 animate-pulse",
          children: [
            jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" }),
            jsx("span", { children: "Saving..." }),
          ],
        });
      case "saved_locally":
        return jsxs("div", {
          className: "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
          children: [
            jsx("span", { children: "💾" }),
            jsx("span", { children: "Saved locally — awaiting synchronisation" }),
            state.timestamp && jsx("span", { className: "text-[10px] opacity-75 font-normal", children: `(${new Date(state.timestamp).toLocaleTimeString()})` }),
          ],
        });
      case "saved_server":
        return jsxs("div", {
          className: "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
          children: [
            jsx("span", { children: "☁️" }),
            jsx("span", { children: "Saved successfully" }),
            state.timestamp && jsx("span", { className: "text-[10px] opacity-75 font-normal", children: `(${new Date(state.timestamp).toLocaleTimeString()})` }),
          ],
        });
      case "sync_pending":
        return jsxs("div", {
          className: "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800",
          children: [
            jsx("span", { children: "🔄" }),
            jsx("span", { children: "Sync pending" }),
          ],
        });
      case "save_failed":
        return jsxs("div", {
          className: "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800",
          children: [
            jsx("span", { children: "⚠️" }),
            jsx("span", { children: "Save failed" }),
            jsx("button", {
              type: "button",
              onClick: handleSaveDraft,
              className: "ml-1 underline hover:no-underline font-bold",
              children: "Retry",
            }),
          ],
        });
      default:
        return null;
    }
  };

  // Wave 2: Controlled Identity Disclosure Handler
  const handleRevealIdentity = async () => {
    if (!selectedTx) return;
    setIsRevealing(true);
    setRevealError(null);
    try {
      const allowed = canUserRevealIdentity(currentUser, revealPurpose);
      if (!allowed) {
        setRevealError(`PERMISSION DENIED: Your role (${currentUser?.role || "user"}) cannot access ${revealPurpose} counterparty details.`);
        return;
      }

      const partyName = selectedTx.supplier_verification?.supplier_name || selectedTx.buyer_requirements?.buyer_name || "Counterparty";
      await recordDisclosureAudit(supabase, {
        partyId: partyName,
        transactionId: selectedTx.client_id || selectedTx.id,
        purpose: revealPurpose,
        reason: revealReason || `Operational review by ${currentUser?.name || currentUser?.email || "User"}`,
        userId: currentUser?.id,
        username: currentUser?.username || currentUser?.name || currentUser?.email,
        userRole: currentUser?.role || "operator",
      });

      const next = new Set(revealedTxIds);
      next.add(selectedTx.client_id);
      setRevealedTxIds(next);
      setRevealModalOpen(false);
      showToast(`Identity revealed under ${revealPurpose} clearance (Audited).`, "success");
    } catch (err) {
      setRevealError(`Audit error: ${err.message}`);
    } finally {
      setIsRevealing(false);
    }
  };

  // Wave 8: Chronological Activity Timeline Helper
  const renderActivityTimeline = (tx) => {
    const isRevealed = revealedTxIds.has(tx.client_id);
    const officerName = isRevealed ? (tx.created_by_name || "Field Officer") : maskPersonName(tx.created_by_name || "Field Officer");
    const buyerName = isRevealed ? (tx.buyer_requirements?.buyer_name || "Pending") : maskPersonName(tx.buyer_requirements?.buyer_name || "Pending");
    const supplierName = isRevealed ? (tx.supplier_verification?.supplier_name || "Pending") : maskPersonName(tx.supplier_verification?.supplier_name || "Pending");
    const approverName = isRevealed ? (tx.approval?.approver_name || "Clarence") : maskPersonName(tx.approval?.approver_name || "Clarence");

    const events = [
      {
        title: "Transaction Initiated",
        desc: `Draft initiated by ${officerName} for ${tx.commodity || "Commodity"} (${tx.buyer_requirements?.required_tonnes || 0} tonnes)`,
        time: tx.created_at ? new Date(tx.created_at).toLocaleString() : "Initial stage",
        state: "done",
      },
      {
        title: "Supplier Verification",
        desc: `Supplier ${supplierName} recorded with status: ${tx.supplier_verification?.verification_status || "PENDING"} (${tx.supplier_verification?.moisture_reading_pct || "0"}% moisture)`,
        time: tx.supplier_verification?.verification_date || "Pending",
        state: tx.supplier_verification?.supplier_name ? "done" : "pending",
      },
      {
        title: "Logistics & Collection",
        desc: `Transporter: ${tx.transport_collection?.transporter_name || "Unassigned"} • Rate UGX ${(tx.transport_collection?.transport_rate_per_tonne || 0).toLocaleString()}/t`,
        time: tx.transport_collection?.collection_status || "Planned",
        state: tx.transport_collection?.transporter_name ? "done" : "pending",
      },
      {
        title: "Payment Terms",
        desc: `Agreed UGX ${(tx.payment_terms?.agreed_price_per_kg || 0).toLocaleString()}/kg • Method: ${tx.payment_terms?.payment_method || "Pending"}`,
        time: "Locked",
        state: Number(tx.payment_terms?.agreed_price_per_kg) > 0 ? "done" : "pending",
      },
      {
        title: "Clarence Underwriting Review",
        desc: `Decision: ${tx.approval?.status || tx.status || "Pending"} • Evaluated by: ${approverName}`,
        time: tx.approval?.decision_date ? new Date(tx.approval.decision_date).toLocaleString() : "Awaiting review",
        state: tx.status === "Approved" ? "approved" : tx.status === "Rejected" ? "rejected" : "pending",
      },
      {
        title: "Supabase Cloud Database Sync",
        desc: tx.sync_status === "synced" ? "Fully synchronized to PostgreSQL cloud database" : "Queued in local store",
        time: tx.sync_status === "synced" ? "Confirmed" : "In Queue",
        state: tx.sync_status === "synced" ? "done" : "pending",
      },
    ];

    return jsxs("div", {
      className: "mt-8 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4",
      children: [
        jsxs("div", {
          className: "flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3",
          children: [
            jsxs("div", {
              className: "flex items-center gap-2",
              children: [
                jsx("span", { className: "text-lg", children: "⏱️" }),
                jsx("h4", { className: "font-bold text-sm text-slate-900 dark:text-slate-100", children: "Transaction Activity Timeline" }),
              ],
            }),
            jsx("span", { className: "text-xs text-slate-500 font-mono", children: tx.reference }),
          ],
        }),
        jsx("div", {
          className: "relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800",
          children: events.map((ev, idx) =>
            jsxs("div", {
              key: idx,
              className: "relative",
              children: [
                jsx("span", {
                  className: cn(
                    "absolute -left-6 top-1 w-4 h-4 rounded-full border-2 bg-white dark:bg-slate-900 flex items-center justify-center text-[9px] font-bold",
                    ev.state === "done" || ev.state === "approved"
                      ? "border-emerald-500 text-emerald-500"
                      : ev.state === "rejected"
                      ? "border-rose-500 text-rose-500"
                      : "border-slate-300 dark:border-slate-700 text-slate-400"
                  ),
                  children: ev.state === "done" || ev.state === "approved" ? "✓" : ev.state === "rejected" ? "✕" : "○",
                }),
                jsxs("div", {
                  className: "space-y-0.5",
                  children: [
                    jsxs("div", {
                      className: "flex items-center justify-between gap-2 flex-wrap",
                      children: [
                        jsx("span", { className: "text-xs font-bold text-slate-900 dark:text-slate-100", children: ev.title }),
                        jsx("span", { className: "text-[11px] text-slate-500", children: ev.time }),
                      ],
                    }),
                    jsx("p", { className: "text-xs text-slate-600 dark:text-slate-400", children: ev.desc }),
                  ],
                }),
              ],
            })
          ),
        }),
      ],
    });
  };

  // Render Status Badge
  const renderStatusBadge = (status, tx = null) => {
    // Frontend Blocker A Defense: Incomplete transactions cannot display as Approved or Ready
    if (tx && (status === "Approved" || status === "Ready")) {
      const readiness = evaluateTransactionReadiness(tx);
      if (!readiness.isReady) {
        return jsx("span", {
          className: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border tracking-wide bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 font-semibold",
          title: `NOT READY: Missing ${readiness.missing.join(", ")}`,
          children: `NOT READY (${readiness.missing.length} Missing)`,
        });
      }
    }
    const map = {
      Draft: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700",
      FieldCaptured: "bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
      DealPackIncomplete: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
      DealPackComplete: "bg-teal-50 text-teal-800 border-teal-300 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800",
      SubmittedForReview: "bg-blue-50 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
      Approved: "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 font-semibold",
      Rejected: "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
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
        className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-medium border border-emerald-200 dark:border-emerald-800",
        title: "Synchronized with Supabase",
        children: [
          jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" }),
          "Synced",
        ],
      });
    }
    if (syncStatus === "sync_failed") {
      return jsxs("span", {
        className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-rose-50 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 font-bold border border-rose-300 dark:border-rose-700 cursor-pointer shrink-0 max-w-full whitespace-nowrap",
        title: errorMsg || "Sync failed. Click to retry.",
        onClick: handleManualSync,
        children: [
          jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-rose-600 dark:bg-rose-400 animate-pulse shrink-0" }),
          "Sync Failed",
        ],
      });
    }
    return jsxs("span", {
      className: "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-600 font-bold border shrink-0 max-w-full whitespace-nowrap shadow-xs",
      title: "Pending synchronization to Supabase",
      children: [
        jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse shrink-0" }),
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
            className: "flex flex-wrap items-center gap-2.5 max-w-full",
            children: [
              // Online / Offline Indicator
              jsxs("div", {
                className: cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border shrink-0",
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

              // Pending Sync Counter Pill (Fully responsive & contained)
              jsxs("div", {
                className: "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 shrink-0 max-w-full",
                children: [
                  stats.pending_sync > 0
                    ? jsxs("span", {
                        className: "text-amber-600 dark:text-amber-300 font-bold whitespace-nowrap",
                        children: [stats.pending_sync, " pending sync"],
                      })
                    : jsx("span", {
                        className: "text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap",
                        children: "Queue empty",
                      }),
                ],
              }),

              // Retry Sync Button
              jsx("button", {
                type: "button",
                onClick: handleManualSync,
                disabled: syncState.isSyncing,
                className: "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 shrink-0",
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
                      jsx("div", { className: "text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase", children: "Total Records" }),
                      jsx("div", { className: "text-2xl font-bold text-slate-900 dark:text-white mt-1", children: stats.total }),
                    ],
                  }),
                  jsxs("div", {
                    className: "p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm",
                    children: [
                      jsx("div", { className: "text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide", children: "Pending Sync" }),
                      jsx("div", { className: "text-2xl font-black text-amber-600 dark:text-amber-300 mt-1", children: stats.pending_sync }),
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
                        className: "w-full h-full min-h-[56px] rounded-xl bg-emerald-700 hover:bg-emerald-800 !text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 border border-emerald-800",
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

                  // Debounced Search Input with Clear Action
                  jsxs("div", {
                    className: "relative w-full sm:w-72",
                    children: [
                      jsx("input", {
                        type: "text",
                        placeholder: "Search reference, buyer, supplier, officer...",
                        value: searchQuery,
                        onChange: (e) => setSearchQuery(e.target.value),
                        className: "w-full pl-8 pr-7 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-emerald-600",
                      }),
                      jsx("span", {
                        className: "absolute left-2.5 top-2 text-xs text-slate-400 pointer-events-none",
                        children: "🔍",
                      }),
                      searchQuery &&
                        jsx("button", {
                          type: "button",
                          onClick: () => setSearchQuery(""),
                          className: "absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200",
                          children: "✕",
                        }),
                    ],
                  }),
                ],
              }),

              // Multi-Criteria Filter Controls & Sort Bar
              jsxs("div", {
                className: "flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs",
                children: [
                  // Commodity filter
                  jsxs("div", {
                    className: "flex items-center gap-1.5",
                    children: [
                      jsx("span", { className: "text-slate-500 font-medium", children: "Commodity:" }),
                      jsx("select", {
                        value: filterCommodity,
                        onChange: (e) => { setFilterCommodity(e.target.value); setCurrentPage(1); },
                        className: "p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold",
                        children: [
                          jsx("option", { value: "all", children: "All Commodities" }),
                          ...COMMODITIES.map((c) => jsx("option", { value: c, children: c }, c)),
                        ],
                      }),
                    ],
                  }),
                  // Status filter
                  jsxs("div", {
                    className: "flex items-center gap-1.5",
                    children: [
                      jsx("span", { className: "text-slate-500 font-medium", children: "Status:" }),
                      jsx("select", {
                        value: filterStatus,
                        onChange: (e) => { setFilterStatus(e.target.value); setCurrentPage(1); },
                        className: "p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold",
                        children: [
                          jsx("option", { value: "all", children: "All Statuses" }),
                          jsx("option", { value: "Draft", children: "Draft" }),
                          jsx("option", { value: "SubmittedForReview", children: "Review Queue" }),
                          jsx("option", { value: "Approved", children: "Approved" }),
                        ],
                      }),
                    ],
                  }),
                  // Payment filter
                  jsxs("div", {
                    className: "flex items-center gap-1.5",
                    children: [
                      jsx("span", { className: "text-slate-500 font-medium", children: "Payment:" }),
                      jsx("select", {
                        value: filterPayment,
                        onChange: (e) => { setFilterPayment(e.target.value); setCurrentPage(1); },
                        className: "p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold",
                        children: [
                          jsx("option", { value: "all", children: "All Payments" }),
                          jsx("option", { value: "Agreed", children: "Agreed" }),
                          jsx("option", { value: "Reported", children: "Reported" }),
                          jsx("option", { value: "Verified", children: "Verified" }),
                        ],
                      }),
                    ],
                  }),
                  // Timeframe filter
                  jsxs("div", {
                    className: "flex items-center gap-1.5",
                    children: [
                      jsx("span", { className: "text-slate-500 font-medium", children: "Timeframe:" }),
                      jsx("select", {
                        value: filterDateRange,
                        onChange: (e) => { setFilterDateRange(e.target.value); setCurrentPage(1); },
                        className: "p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold",
                        children: [
                          jsx("option", { value: "all", children: "All Time" }),
                          jsx("option", { value: "today", children: "Today" }),
                          jsx("option", { value: "7d", children: "Last 7 Days" }),
                          jsx("option", { value: "30d", children: "Last 30 Days" }),
                        ],
                      }),
                    ],
                  }),
                  // Sort By
                  jsxs("div", {
                    className: "flex items-center gap-1.5",
                    children: [
                      jsx("span", { className: "text-slate-500 font-medium", children: "Sort:" }),
                      jsx("select", {
                        value: sortBy,
                        onChange: (e) => setSortBy(e.target.value),
                        className: "p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold",
                        children: [
                          jsx("option", { value: "newest", children: "Newest First" }),
                          jsx("option", { value: "oldest", children: "Oldest First" }),
                          jsx("option", { value: "ref", children: "Reference (A-Z)" }),
                          jsx("option", { value: "tonnes", children: "Volume (High-Low)" }),
                        ],
                      }),
                    ],
                  }),
                  // Quick Reset
                  (filterCommodity !== "all" || filterStatus !== "all" || filterPayment !== "all" || filterDateRange !== "all" || searchQuery) &&
                    jsx("button", {
                      type: "button",
                      onClick: () => {
                        setFilterCommodity("all");
                        setFilterStatus("all");
                        setFilterPayment("all");
                        setFilterDateRange("all");
                        setSearchQuery("");
                        setCurrentPage(1);
                      },
                      className: "ml-auto px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800",
                      children: "Reset All Filters",
                    }),
                ],
              }),

              // Transactions Card Listing (Masked by default with pagination)
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
                : jsxs("div", {
                    className: "space-y-4",
                    children: [
                      jsx("div", {
                        className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
                        children: paginatedTransactions.map((tx) => {
                          const completedCount = getCompletenessCount(tx);
                          const isRevealed = revealedTxIds.has(tx.client_id);
                          const rawBuyer = tx.buyer_requirements?.buyer_name || "Pending";
                          const rawSupplier = tx.supplier_verification?.supplier_name || "Pending";
                          const displayBuyer = isRevealed ? rawBuyer : maskPersonName(rawBuyer);
                          const displaySupplier = isRevealed ? rawSupplier : maskPersonName(rawSupplier);

                          return jsxs(
                            "div",
                            {
                              key: tx.client_id,
                              className: "p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4",
                              children: [
                                jsxs("div", {
                                  className: "space-y-3",
                                  children: [
                                    // Top row: Reference & Badges (Contained on mobile)
                                    jsxs("div", {
                                      className: "flex items-start justify-between gap-2 flex-wrap sm:flex-nowrap min-w-0 max-w-full",
                                      children: [
                                        jsxs("div", {
                                          className: "min-w-0 max-w-full",
                                          children: [
                                            jsx("span", {
                                              className: "font-mono font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 block truncate",
                                              children: tx.reference,
                                            }),
                                            jsx("div", {
                                              className: "text-[11px] text-slate-500",
                                              children: tx.created_at ? new Date(tx.created_at).toLocaleDateString() : "Just now",
                                            }),
                                          ],
                                        }),
                                        jsxs("div", {
                                          className: "flex flex-wrap sm:flex-col items-end gap-1 shrink-0 max-w-full",
                                          children: [
                                            renderStatusBadge(tx.status, tx),
                                            renderSyncBadge(tx.sync_status, tx.sync_error),
                                          ],
                                        }),
                                      ],
                                    }),

                                    // Buyer & Supplier summary (Identity Masked by Default)
                                    jsxs("div", {
                                      className: "p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-1.5 text-xs",
                                      children: [
                                        jsxs("div", {
                                          className: "flex justify-between items-center",
                                          children: [
                                            jsx("span", { className: "text-slate-600 dark:text-slate-300 font-medium", children: "Buyer:" }),
                                            jsxs("span", {
                                              className: "font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[160px] flex items-center gap-1",
                                              children: [
                                                !isRevealed && rawBuyer !== "Pending" && jsx("span", { className: "text-[10px] text-slate-400", children: "🔒" }),
                                                displayBuyer,
                                              ],
                                            }),
                                          ],
                                        }),
                                        jsxs("div", {
                                          className: "flex justify-between items-center",
                                          children: [
                                            jsx("span", { className: "text-slate-600 dark:text-slate-300 font-medium", children: "Supplier:" }),
                                            jsxs("span", {
                                              className: "font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[160px] flex items-center gap-1",
                                              children: [
                                                !isRevealed && rawSupplier !== "Pending" && jsx("span", { className: "text-[10px] text-slate-400", children: "🔒" }),
                                                displaySupplier,
                                              ],
                                            }),
                                          ],
                                        }),
                                        jsxs("div", {
                                          className: "flex justify-between",
                                          children: [
                                            jsx("span", { className: "text-slate-600 dark:text-slate-300 font-medium", children: "Commodity:" }),
                                            jsxs("span", { className: "font-semibold text-emerald-700 dark:text-emerald-400", children: [tx.commodity, " • ", tx.supplier_verification?.confirmed_tonnes || tx.buyer_requirements?.required_tonnes || 0, " t (", ((tx.supplier_verification?.confirmed_tonnes || tx.buyer_requirements?.required_tonnes || 0) * 1000).toLocaleString(), " kg)"] }),
                                          ],
                                        }),
                                        jsxs("div", {
                                          className: "flex justify-between",
                                          children: [
                                            jsx("span", { className: "text-slate-600 dark:text-slate-300 font-medium", children: "Moisture:" }),
                                            jsx("span", { className: "font-semibold text-slate-900 dark:text-slate-100", children: tx.supplier_verification?.moisture_reading_pct ? `${tx.supplier_verification.moisture_reading_pct}%` : "Not tested" }),
                                          ],
                                        }),
                                      ],
                                    }),

                                    // Progress bar for 7 Deal Pack elements
                                    jsxs("div", {
                                      className: "space-y-1",
                                      children: [
                                        jsxs("div", {
                                          className: "flex justify-between text-[11px] text-slate-600 dark:text-slate-300",
                                          children: [
                                            jsx("span", { children: "Deal Pack Elements" }),
                                            jsxs("span", { className: "font-semibold text-slate-900 dark:text-slate-100", children: [completedCount, " / 7 Complete"] }),
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
                                      className: "text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[140px]",
                                      children: `By: ${tx.created_by_name || "Field Officer"}`,
                                    }),
                                    jsx("button", {
                                      type: "button",
                                      onClick: () => {
                                        setSelectedTx(tx);
                                        checkRecoveryDraft(tx);
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

                      // Pagination Controls
                      totalPages > 1 &&
                        jsxs("div", {
                          className: "flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs shadow-sm",
                          children: [
                            jsx("span", {
                              className: "text-slate-500 font-medium",
                              children: `Showing ${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, filteredTransactions.length)} of ${filteredTransactions.length} records`,
                            }),
                            jsxs("div", {
                              className: "flex items-center gap-2",
                              children: [
                                jsx("button", {
                                  type: "button",
                                  disabled: currentPage <= 1,
                                  onClick: () => setCurrentPage((p) => Math.max(1, p - 1)),
                                  className: "px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold transition-all",
                                  children: "← Previous",
                                }),
                                jsx("span", {
                                  className: "font-semibold px-2 text-slate-700 dark:text-slate-300",
                                  children: `Page ${currentPage} of ${totalPages}`,
                                }),
                                jsx("button", {
                                  type: "button",
                                  disabled: currentPage >= totalPages,
                                  onClick: () => setCurrentPage((p) => Math.min(totalPages, p + 1)),
                                  className: "px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold transition-all",
                                  children: "Next →",
                                }),
                              ],
                            }),
                          ],
                        }),
                    ],
                  }),
            ],
          })
        : // TRANSACTION DETAIL / 7-ELEMENT DEAL PACK FORM VIEW
          jsxs("main", {
            className: "space-y-6",
            children: [
              // Top Back button and Header (Mobile contained)
              jsxs("div", {
                className: "flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm max-w-full overflow-hidden",
                children: [
                  jsxs("div", {
                    className: "flex flex-col sm:flex-row sm:items-center gap-3 min-w-0 max-w-full",
                    children: [
                      jsx("button", {
                        type: "button",
                        onClick: () => setSelectedTx(null),
                        className: "px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 shrink-0 self-start sm:self-auto",
                        children: "← Back to Transactions",
                      }),
                      jsxs("div", {
                        className: "min-w-0 max-w-full space-y-0.5",
                        children: [
                          jsxs("div", {
                            className: "flex flex-wrap items-center gap-2 max-w-full",
                            children: [
                              jsx("span", {
                                className: "font-bold text-base md:text-lg text-slate-900 dark:text-slate-100 whitespace-nowrap",
                                children: "New Transaction Record",
                              }),
                              jsx("span", {
                                className: "font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shrink-0",
                                children: selectedTx.reference,
                              }),
                              renderStatusBadge(selectedTx.status, selectedTx),
                              renderSyncBadge(selectedTx.sync_status, selectedTx.sync_error),
                              renderSaveStateIndicator(saveState),
                            ],
                          }),
                          jsxs("div", {
                            className: "text-xs text-slate-500 truncate max-w-full",
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

                  // Action buttons & Identity Reveal Trigger
                  jsxs("div", {
                    className: "flex flex-wrap items-center gap-2",
                    children: [
                      // Identity Reveal Toggle Button
                      revealedTxIds.has(selectedTx.client_id)
                        ? jsx("button", {
                            type: "button",
                            onClick: () => {
                              const next = new Set(revealedTxIds);
                              next.delete(selectedTx.client_id);
                              setRevealedTxIds(next);
                              showToast("Counterparty identity details re-masked.", "info");
                            },
                            className: "px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 flex items-center gap-1.5",
                            children: [jsx("span", { children: "🔒" }), "Re-mask Details"],
                          })
                        : jsx("button", {
                            type: "button",
                            onClick: () => {
                              setRevealModalOpen(true);
                              setRevealError(null);
                              setRevealReason("");
                            },
                            className: "px-3 py-2 text-xs font-bold rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 flex items-center gap-1.5",
                            children: [jsx("span", { children: "👁️" }), "Reveal Identity Info"],
                          }),
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

              // Safe Recovery Draft Alert Banner (Wave 7)
              recoveryDraft &&
                jsxs("div", {
                  className: "p-4 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm",
                  children: [
                    jsxs("div", {
                      className: "flex items-center gap-3",
                      children: [
                        jsx("span", { className: "text-2xl", children: "⚠️" }),
                        jsxs("div", {
                          children: [
                            jsx("div", { className: "text-sm font-bold text-amber-900 dark:text-amber-200", children: "Unsaved local draft detected" }),
                            jsx("div", { className: "text-xs text-amber-700 dark:text-amber-400 mt-0.5", children: `You have uncommitted edits saved on this device from ${new Date(recoveryDraft.timestamp).toLocaleTimeString()}. Would you like to restore where you stopped?` }),
                          ],
                        }),
                      ],
                    }),
                    jsxs("div", {
                      className: "flex items-center gap-2 self-end sm:self-auto shrink-0",
                      children: [
                        jsx("button", {
                          type: "button",
                          onClick: () => {
                            setSelectedTx(recoveryDraft.tx);
                            setRecoveryDraft(null);
                            showToast("Restored unsaved draft edits.", "success");
                          },
                          className: "px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm",
                          children: "Restore Edits",
                        }),
                        jsx("button", {
                          type: "button",
                          onClick: () => {
                            clearFormDraft(selectedTx.client_id);
                            showToast("Unsaved draft discarded.", "info");
                          },
                          className: "px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40",
                          children: "Discard",
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
                  { num: 7, title: "07 Submit" },
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
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      ),
                      children: [
                        jsx("span", {
                          className: "text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold",
                          children: sec.num === 7 ? "Submit" : `Element ${sec.num}`,
                        }),
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
                              jsx("p", { className: "text-xs text-slate-600 dark:text-slate-300 mt-0.5", children: "Capture buyer identity, specification, required tonnage, moisture tolerance, and purchasing conditions." }),
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
                                  jsx("span", { children: "Required Quantity — Kilograms (1 t = 1,000 kg) *" }),
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
                              jsx("p", { className: "text-xs text-slate-600 dark:text-slate-300 mt-0.5", children: "Capture supplier identity, calibrated field moisture readings, confirmed volumes, and physical verification." }),
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
                                  jsx("span", { children: "Confirmed Volume — Kilograms (1 t = 1,000 kg) *" }),
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


                    // SECTION 03: TRANSPORT / COLLECTION — PHYSICAL HANDOFF & TWO TRANSPORT LEGS
                    case 3: {
                      const tc = selectedTx.transport_collection || {};
                      const handoff = tc.handoff_location || {};
                      const leg1 = tc.leg1_supplier_to_handoff || {};
                      const leg2 = tc.leg2_handoff_to_buyer || {};
                      const events = tc.events || [];
                      const recon = tc.quantity_reconciliation || {
                        expected_kg: (selectedTx.buyer_requirements?.required_tonnes || 0) * 1000,
                        intake_kg: leg1.actual_intake_kg || 0,
                        delivered_kg: leg2.delivered_kg || 0,
                        variance_kg: (leg2.delivered_kg || 0) - ((selectedTx.buyer_requirements?.required_tonnes || 0) * 1000),
                        has_discrepancy: false,
                      };

                      return jsxs("div", {
                        className: "space-y-6",
                        children: [
                          jsxs("div", {
                            className: "border-b border-slate-100 dark:border-slate-800 pb-3",
                            children: [
                              jsx("h3", { className: "text-base font-bold text-slate-900 dark:text-slate-100", children: "Element 03 — Physical Handoff, Two Transport Legs & Reconciliation" }),
                              jsx("p", { className: "text-xs text-slate-600 dark:text-slate-300 mt-0.5", children: "Two-leg transport architecture, nominated physical handoff hub, separate intake & collection events, and discrepancy tracking." }),
                            ],
                          }),

                          // SUB-CARD 1: NOMINATED PHYSICAL HANDOFF LOCATION
                          jsxs("div", {
                            className: "p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-3",
                            children: [
                              jsxs("div", {
                                className: "flex items-center justify-between",
                                children: [
                                  jsxs("div", {
                                    className: "flex items-center gap-2",
                                    children: [
                                      jsx("span", { className: "text-base", children: "📍" }),
                                      jsx("h4", { className: "text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-200", children: "Proposed Physical Handoff Location (Leg 1 → Leg 2 Node)" }),
                                    ],
                                  }),
                                  jsx("span", {
                                    className: cn(
                                      "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                                      handoff.confirmation_status === "Confirmed" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-amber-100 text-amber-800"
                                    ),
                                    children: handoff.confirmation_status || "Proposed",
                                  }),
                                ],
                              }),
                              jsxs("div", {
                                className: "grid grid-cols-1 md:grid-cols-3 gap-3 text-xs",
                                children: [
                                  jsxs("label", {
                                    className: "space-y-1 font-semibold",
                                    children: [
                                      jsx("span", { children: "Hub / Bulking Facility Name *" }),
                                      jsx("input", {
                                        type: "text",
                                        value: handoff.hub_name || "",
                                        onChange: (e) =>
                                          setSelectedTx({
                                            ...selectedTx,
                                            transport_collection: {
                                              ...tc,
                                              handoff_location: { ...handoff, hub_name: e.target.value },
                                            },
                                          }),
                                        placeholder: "e.g. Amuru Central Bulking Hub",
                                        className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                      }),
                                    ],
                                  }),
                                  jsxs("label", {
                                    className: "space-y-1 font-semibold",
                                    children: [
                                      jsx("span", { children: "District" }),
                                      jsx("select", {
                                        value: handoff.district || "Amuru",
                                        onChange: (e) =>
                                          setSelectedTx({
                                            ...selectedTx,
                                            transport_collection: {
                                              ...tc,
                                              handoff_location: { ...handoff, district: e.target.value },
                                            },
                                          }),
                                        className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                        children: DISTRICTS.map((d) => jsx("option", { value: d, children: d }, d)),
                                      }),
                                    ],
                                  }),
                                  jsxs("label", {
                                    className: "space-y-1 font-semibold",
                                    children: [
                                      jsx("span", { children: "Physical Reference / Landmark" }),
                                      jsx("input", {
                                        type: "text",
                                        value: handoff.physical_reference || "",
                                        onChange: (e) =>
                                          setSelectedTx({
                                            ...selectedTx,
                                            transport_collection: {
                                              ...tc,
                                              handoff_location: { ...handoff, physical_reference: e.target.value },
                                            },
                                          }),
                                        placeholder: "e.g. Plot 14, Gulu-Nimule Road",
                                        className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                      }),
                                    ],
                                  }),
                                  jsxs("label", {
                                    className: "space-y-1 font-semibold",
                                    children: [
                                      jsx("span", { children: "Scheduled Date & Time" }),
                                      jsx("input", {
                                        type: "datetime-local",
                                        value: handoff.scheduled_datetime || "",
                                        onChange: (e) =>
                                          setSelectedTx({
                                            ...selectedTx,
                                            transport_collection: {
                                              ...tc,
                                              handoff_location: { ...handoff, scheduled_datetime: e.target.value },
                                            },
                                          }),
                                        className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                      }),
                                    ],
                                  }),
                                  jsxs("label", {
                                    className: "space-y-1 font-semibold",
                                    children: [
                                      jsx("span", { children: "Confirmation Status" }),
                                      jsx("select", {
                                        value: handoff.confirmation_status || "Proposed",
                                        onChange: (e) =>
                                          setSelectedTx({
                                            ...selectedTx,
                                            transport_collection: {
                                              ...tc,
                                              handoff_location: { ...handoff, confirmation_status: e.target.value },
                                            },
                                          }),
                                        className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                        children: [
                                          jsx("option", { value: "Proposed", children: "Proposed (Pending Agreement)" }),
                                          jsx("option", { value: "Confirmed", children: "Confirmed (Both Parties Agreed)" }),
                                          jsx("option", { value: "Rejected", children: "Rejected / Renegotiate Node" }),
                                        ],
                                      }),
                                    ],
                                  }),
                                  jsxs("label", {
                                    className: "space-y-1 font-semibold",
                                    children: [
                                      jsx("span", { children: "Responsible Party" }),
                                      jsx("input", {
                                        type: "text",
                                        value: handoff.responsible_party || "CNG Deal Desk",
                                        onChange: (e) =>
                                          setSelectedTx({
                                            ...selectedTx,
                                            transport_collection: {
                                              ...tc,
                                              handoff_location: { ...handoff, responsible_party: e.target.value },
                                            },
                                          }),
                                        className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),

                          // SUB-CARD 2 & 3: TWO SEPARATE TRANSPORT LEGS
                          jsxs("div", {
                            className: "grid grid-cols-1 lg:grid-cols-2 gap-4",
                            children: [
                              // LEG 1: SUPPLIER TO HANDOFF
                              jsxs("div", {
                                className: "p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3",
                                children: [
                                  jsxs("div", {
                                    className: "flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2",
                                    children: [
                                      jsxs("div", {
                                        className: "flex items-center gap-2",
                                        children: [
                                          jsx("span", { className: "w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]", children: "L1" }),
                                          jsx("h4", { className: "text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100", children: "Transport Leg 1: Supplier → Handoff" }),
                                        ],
                                      }),
                                      jsx("span", { className: "text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200", children: leg1.status || "Planned" }),
                                    ],
                                  }),
                                  jsxs("div", {
                                    className: "grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs",
                                    children: [
                                      jsxs("label", {
                                        className: "space-y-1 font-semibold",
                                        children: [
                                          jsx("span", { children: "Haulier / Carrier Name *" }),
                                          jsx("input", {
                                            type: "text",
                                            value: leg1.carrier_name || tc.transporter_name || "",
                                            onChange: (e) =>
                                              setSelectedTx({
                                                ...selectedTx,
                                                transport_collection: {
                                                  ...tc,
                                                  transporter_name: e.target.value,
                                                  leg1_supplier_to_handoff: { ...leg1, carrier_name: e.target.value },
                                                },
                                              }),
                                            placeholder: "e.g. Northern Hauliers",
                                            className: "w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                          }),
                                        ],
                                      }),
                                      jsxs("label", {
                                        className: "space-y-1 font-semibold",
                                        children: [
                                          jsx("span", { children: "Driver Contact" }),
                                          jsx("input", {
                                            type: "text",
                                            value: leg1.driver_contact || tc.transporter_contact || "",
                                            onChange: (e) =>
                                              setSelectedTx({
                                                ...selectedTx,
                                                transport_collection: {
                                                  ...tc,
                                                  leg1_supplier_to_handoff: { ...leg1, driver_contact: e.target.value },
                                                },
                                              }),
                                            placeholder: "+256 772 000 000",
                                            className: "w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                          }),
                                        ],
                                      }),
                                      jsxs("label", {
                                        className: "space-y-1 font-semibold",
                                        children: [
                                          jsx("span", { children: "Scheduled Dispatch" }),
                                          jsx("input", {
                                            type: "datetime-local",
                                            value: leg1.scheduled_dispatch || "",
                                            onChange: (e) =>
                                              setSelectedTx({
                                                ...selectedTx,
                                                transport_collection: {
                                                  ...tc,
                                                  leg1_supplier_to_handoff: { ...leg1, scheduled_dispatch: e.target.value },
                                                },
                                              }),
                                            className: "w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                          }),
                                        ],
                                      }),
                                      jsxs("label", {
                                        className: "space-y-1 font-semibold",
                                        children: [
                                          jsx("span", { children: "Intake Ticket / Weighbridge Ref" }),
                                          jsx("input", {
                                            type: "text",
                                            value: leg1.evidence_reference || "",
                                            onChange: (e) =>
                                              setSelectedTx({
                                                ...selectedTx,
                                                transport_collection: {
                                                  ...tc,
                                                  leg1_supplier_to_handoff: { ...leg1, evidence_reference: e.target.value },
                                                },
                                              }),
                                            placeholder: "WB-IN-1002",
                                            className: "w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                ],
                              }),

                              // LEG 2: HANDOFF TO BUYER
                              jsxs("div", {
                                className: "p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3",
                                children: [
                                  jsxs("div", {
                                    className: "flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2",
                                    children: [
                                      jsxs("div", {
                                        className: "flex items-center gap-2",
                                        children: [
                                          jsx("span", { className: "w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]", children: "L2" }),
                                          jsx("h4", { className: "text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100", children: "Transport Leg 2: Handoff → Buyer" }),
                                        ],
                                      }),
                                      jsx("span", { className: "text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200", children: leg2.status || "Planned" }),
                                    ],
                                  }),
                                  jsxs("div", {
                                    className: "grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs",
                                    children: [
                                      jsxs("label", {
                                        className: "space-y-1 font-semibold",
                                        children: [
                                          jsx("span", { children: "Carrier / Logistics Service *" }),
                                          jsx("input", {
                                            type: "text",
                                            value: leg2.carrier_name || "",
                                            onChange: (e) =>
                                              setSelectedTx({
                                                ...selectedTx,
                                                transport_collection: {
                                                  ...tc,
                                                  leg2_handoff_to_buyer: { ...leg2, carrier_name: e.target.value },
                                                },
                                              }),
                                            placeholder: "e.g. Swift Grain Logistics",
                                            className: "w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                          }),
                                        ],
                                      }),
                                      jsxs("label", {
                                        className: "space-y-1 font-semibold",
                                        children: [
                                          jsx("span", { children: "Driver Contact" }),
                                          jsx("input", {
                                            type: "text",
                                            value: leg2.driver_contact || "",
                                            onChange: (e) =>
                                              setSelectedTx({
                                                ...selectedTx,
                                                transport_collection: {
                                                  ...tc,
                                                  leg2_handoff_to_buyer: { ...leg2, driver_contact: e.target.value },
                                                },
                                              }),
                                            placeholder: "+256 782 000 000",
                                            className: "w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                          }),
                                        ],
                                      }),
                                      jsxs("label", {
                                        className: "space-y-1 font-semibold",
                                        children: [
                                          jsx("span", { children: "Scheduled Collection" }),
                                          jsx("input", {
                                            type: "datetime-local",
                                            value: leg2.scheduled_collection || "",
                                            onChange: (e) =>
                                              setSelectedTx({
                                                ...selectedTx,
                                                transport_collection: {
                                                  ...tc,
                                                  leg2_handoff_to_buyer: { ...leg2, scheduled_collection: e.target.value },
                                                },
                                              }),
                                            className: "w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                          }),
                                        ],
                                      }),
                                      jsxs("label", {
                                        className: "space-y-1 font-semibold",
                                        children: [
                                          jsx("span", { children: "Buyer Delivery Note / Release Ref" }),
                                          jsx("input", {
                                            type: "text",
                                            value: leg2.evidence_reference || "",
                                            onChange: (e) =>
                                              setSelectedTx({
                                                ...selectedTx,
                                                transport_collection: {
                                                  ...tc,
                                                  leg2_handoff_to_buyer: { ...leg2, evidence_reference: e.target.value },
                                                },
                                              }),
                                            placeholder: "WB-OUT-5001",
                                            className: "w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),

                          // SUB-CARD 4: OPERATIONAL EVENTS LEDGER (Intake & Collection Segregated)
                          jsxs("div", {
                            className: "p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 shadow-sm",
                            children: [
                              jsxs("div", {
                                className: "flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2",
                                children: [
                                  jsxs("div", {
                                    children: [
                                      jsx("h4", { className: "text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100", children: "Operational Event Ledger (Intake & Collection Segregation)" }),
                                      jsx("p", { className: "text-[11px] text-slate-500", children: "Supplier intake and buyer collection events are stored independently and never overwrite each other." }),
                                    ],
                                  }),
                                  jsx("span", { className: "text-xs font-mono font-bold text-slate-400", children: `${events.length} Logged Events` }),
                                ],
                              }),

                              // Fast Logging Action Form
                              jsxs("div", {
                                className: "grid grid-cols-1 md:grid-cols-2 gap-4 pt-1",
                                children: [
                                  // Quick Log Intake
                                  jsxs("div", {
                                    className: "p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-2 text-xs",
                                    children: [
                                      jsx("div", { className: "font-bold text-emerald-800 dark:text-emerald-300", children: "+ Record Supplier Intake Event (Leg 1)" }),
                                      jsxs("div", {
                                        className: "grid grid-cols-2 gap-2",
                                        children: [
                                          jsx("input", {
                                            type: "number",
                                            placeholder: "Intake kg (e.g. 30000)",
                                            value: intakeInputKg,
                                            onChange: (e) => setIntakeInputKg(e.target.value),
                                            className: "p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900",
                                          }),
                                          jsx("input", {
                                            type: "text",
                                            placeholder: "Weighbridge Ref",
                                            value: intakeInputRef,
                                            onChange: (e) => setIntakeInputRef(e.target.value),
                                            className: "p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900",
                                          }),
                                        ],
                                      }),
                                      jsx("input", {
                                        type: "text",
                                        placeholder: "Inspection notes / moisture reading",
                                        value: intakeInputNotes,
                                        onChange: (e) => setIntakeInputNotes(e.target.value),
                                        className: "w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900",
                                      }),
                                      jsx("button", {
                                        type: "button",
                                        onClick: () => {
                                          if (!intakeInputKg) {
                                            showToast("Please enter verified intake weight in KG", "error");
                                            return;
                                          }
                                          handleLogIntakeEvent(intakeInputKg, intakeInputRef, intakeInputNotes);
                                          setIntakeInputKg("");
                                          setIntakeInputRef("");
                                          setIntakeInputNotes("");
                                        },
                                        className: "w-full py-1.5 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-sm",
                                        children: "Log Supplier Intake Event",
                                      }),
                                    ],
                                  }),

                                  // Quick Log Buyer Collection
                                  jsxs("div", {
                                    className: "p-3 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 space-y-2 text-xs",
                                    children: [
                                      jsx("div", { className: "font-bold text-blue-800 dark:text-blue-300", children: "+ Record Buyer Collection Event (Leg 2)" }),
                                      jsxs("div", {
                                        className: "grid grid-cols-2 gap-2",
                                        children: [
                                          jsx("input", {
                                            type: "number",
                                            placeholder: "Delivered kg (e.g. 30000)",
                                            value: collectionInputKg,
                                            onChange: (e) => setCollectionInputKg(e.target.value),
                                            className: "p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900",
                                          }),
                                          jsx("input", {
                                            type: "text",
                                            placeholder: "Waybill / Delivery Ref",
                                            value: collectionInputRef,
                                            onChange: (e) => setCollectionInputRef(e.target.value),
                                            className: "p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900",
                                          }),
                                        ],
                                      }),
                                      jsx("input", {
                                        type: "text",
                                        placeholder: "Buyer acceptance notes / receiving officer",
                                        value: collectionInputNotes,
                                        onChange: (e) => setCollectionInputNotes(e.target.value),
                                        className: "w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900",
                                      }),
                                      jsx("button", {
                                        type: "button",
                                        onClick: () => {
                                          if (!collectionInputKg) {
                                            showToast("Please enter verified delivered weight in KG", "error");
                                            return;
                                          }
                                          handleLogCollectionEvent(collectionInputKg, collectionInputRef, collectionInputNotes);
                                          setCollectionInputKg("");
                                          setCollectionInputRef("");
                                          setCollectionInputNotes("");
                                        },
                                        className: "w-full py-1.5 px-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs shadow-sm",
                                        children: "Log Buyer Collection Event",
                                      }),
                                    ],
                                  }),
                                ],
                              }),

                              // Events List / Table
                              events.length > 0
                                ? jsxs("div", {
                                    className: "overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg",
                                    children: [
                                      jsxs("table", {
                                        className: "w-full text-[11px] text-left",
                                        children: [
                                          jsx("thead", {
                                            className: "bg-slate-50 dark:bg-slate-800/80 text-slate-500 uppercase font-semibold",
                                            children: [
                                              jsxs("tr", {
                                                children: [
                                                  jsx("th", { className: "p-2", children: "Type" }),
                                                  jsx("th", { className: "p-2", children: "Quantity" }),
                                                  jsx("th", { className: "p-2", children: "Actor" }),
                                                  jsx("th", { className: "p-2", children: "Evidence / Ref" }),
                                                  jsx("th", { className: "p-2", children: "Timestamp" }),
                                                  jsx("th", { className: "p-2", children: "Notes" }),
                                                ],
                                              }),
                                            ],
                                          }),
                                          jsx("tbody", {
                                            className: "divide-y divide-slate-100 dark:divide-slate-800",
                                            children: events.map((ev, idx) =>
                                              jsxs(
                                                "tr",
                                                {
                                                  className: "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                                                  children: [
                                                    jsx("td", {
                                                      className: "p-2",
                                                      children: jsx("span", {
                                                        className: cn(
                                                          "font-bold px-1.5 py-0.5 rounded text-[10px]",
                                                          ev.event_type === "SUPPLIER_INTAKE"
                                                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                                            : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                                                        ),
                                                        children: ev.event_type,
                                                      }),
                                                    }),
                                                    jsx("td", { className: "p-2 font-mono font-bold", children: `${(ev.quantity_kg || 0).toLocaleString()} KG` }),
                                                    jsx("td", { className: "p-2", children: ev.actor }),
                                                    jsx("td", { className: "p-2 font-mono text-[10px]", children: ev.evidence || "—" }),
                                                    jsx("td", { className: "p-2 text-slate-400", children: new Date(ev.timestamp).toLocaleString() }),
                                                    jsx("td", { className: "p-2 text-slate-600 dark:text-slate-300 max-w-xs truncate", children: ev.notes }),
                                                  ],
                                                },
                                                ev.id || idx
                                              )
                                            ),
                                          }),
                                        ],
                                      }),
                                    ],
                                  })
                                : jsx("div", { className: "text-center py-4 text-xs text-slate-400 italic", children: "No operational intake or collection events recorded yet." }),
                            ],
                          }),

                          // SUB-CARD 5: QUANTITY RECONCILIATION & DISCREPANCY TRACKING
                          jsxs("div", {
                            className: cn(
                              "p-4 rounded-xl border-2 shadow-sm space-y-3",
                              recon.has_discrepancy
                                ? "border-amber-400/80 bg-amber-50/40 dark:bg-amber-950/20"
                                : "border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10"
                            ),
                            children: [
                              jsxs("div", {
                                className: "flex items-center justify-between",
                                children: [
                                  jsxs("div", {
                                    className: "flex items-center gap-2",
                                    children: [
                                      jsx("span", { className: "text-lg", children: recon.has_discrepancy ? "⚠️" : "⚖️" }),
                                      jsx("h4", { className: "text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100", children: "Two-Leg Quantity Reconciliation" }),
                                    ],
                                  }),
                                  jsx("span", {
                                    className: cn(
                                      "text-xs font-bold px-2.5 py-1 rounded-full",
                                      recon.has_discrepancy
                                        ? "bg-amber-500 text-white"
                                        : "bg-emerald-600 text-white"
                                    ),
                                    children: recon.has_discrepancy
                                      ? `Discrepancy: ${recon.variance_kg.toLocaleString()} KG (${recon.variance_pct}%)`
                                      : "Reconciled — No Quantity Loss",
                                  }),
                                ],
                              }),
                              jsxs("div", {
                                className: "grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1",
                                children: [
                                  jsxs("div", {
                                    className: "p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800",
                                    children: [
                                      jsx("div", { className: "text-[10px] text-slate-400 font-medium", children: "Expected Contract KG" }),
                                      jsx("div", { className: "text-sm font-black font-mono mt-0.5", children: `${(recon.expected_kg || 0).toLocaleString()} kg` }),
                                    ],
                                  }),
                                  jsxs("div", {
                                    className: "p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800",
                                    children: [
                                      jsx("div", { className: "text-[10px] text-slate-400 font-medium", children: "Leg 1 Actual Intake KG" }),
                                      jsx("div", { className: "text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5", children: `${(recon.intake_kg || leg1.actual_intake_kg || 0).toLocaleString()} kg` }),
                                    ],
                                  }),
                                  jsxs("div", {
                                    className: "p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800",
                                    children: [
                                      jsx("div", { className: "text-[10px] text-slate-400 font-medium", children: "Leg 2 Delivered KG" }),
                                      jsx("div", { className: "text-sm font-black font-mono text-blue-600 dark:text-blue-400 mt-0.5", children: `${(recon.delivered_kg || leg2.delivered_kg || 0).toLocaleString()} kg` }),
                                    ],
                                  }),
                                  jsxs("div", {
                                    className: "p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800",
                                    children: [
                                      jsx("div", { className: "text-[10px] text-slate-400 font-medium", children: "Net Transport Variance" }),
                                      jsx("div", {
                                        className: cn(
                                          "text-sm font-black font-mono mt-0.5",
                                          (recon.variance_kg || 0) === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                                        ),
                                        children: `${(recon.variance_kg || 0).toLocaleString()} kg`,
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      });
                    }

// SECTION 04: PAYMENT TERMS
                    case 4:
                      return jsxs("div", {
                        className: "space-y-5",
                        children: [
                          jsxs("div", {
                            className: "border-b border-slate-100 dark:border-slate-800 pb-3",
                            children: [
                              jsx("h3", { className: "text-base font-bold text-slate-900 dark:text-slate-100", children: "Element 04 — Payment Terms" }),
                              jsx("p", { className: "text-xs text-slate-600 dark:text-slate-300 mt-0.5", children: "Agreed pricing, currency (UGX), payment schedule, deposit requirement, and strict payment verification status." }),
                            ],
                          }),
                          jsxs("div", {
                            className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-xs",
                            children: [
                              jsxs("label", {
                                className: "space-y-1 font-semibold",
                                children: [
                                  jsx("span", { children: "Price per kilo (UGX) *" }),
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
                                  jsx("span", { children: "The amount you will be paid (UGX)" }),
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
                        className: "space-y-6",
                        children: [
                          renderThreeLineQuotation(selectedTx),
                          jsxs("div", {
                            className: "border-b border-slate-100 dark:border-slate-800 pb-3",
                            children: [
                              jsx("h3", { className: "text-base font-bold text-slate-900 dark:text-slate-100", children: "Element 05 — CNG Fee & Margin Calculator" }),
                              jsx("p", { className: "text-xs text-slate-600 dark:text-slate-300 mt-0.5", children: "Explicit commercial calculation: minimum UGX 25,000 floor rule, operational costs, and 15% overhead." }),
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
                                  jsx("p", { className: "text-xs text-slate-600 dark:text-slate-300 mt-0.5", children: "Score 5 core evaluation criteria (0-20 each, total 100). Preserving business underwriting rules." }),
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

                    // SECTION 07: SUBMIT & MANAGEMENT APPROVAL STATUS
                    case 7: {
                      const approvalStatus = selectedTx.approval?.status || selectedTx.status || "Draft";
                      const approverName = selectedTx.approval?.approver_name || (approvalStatus === "Approved" ? "Clarence (Managing Director)" : "Clarence");
                      const decisionDate = selectedTx.approval?.decision_date;
                      const rejectionReason = selectedTx.approval?.rejection_reason || selectedTx.approval?.comments || "";

                      return jsxs("div", {
                        className: "space-y-6",
                        children: [
                          jsxs("div", {
                            className: "border-b border-slate-100 dark:border-slate-800 pb-3",
                            children: [
                              jsx("h3", { className: "text-base font-bold text-slate-900 dark:text-slate-100", children: "Submit — Management Approval & Final Sign-Off" }),
                              jsx("p", { className: "text-xs text-slate-600 dark:text-slate-300 mt-0.5", children: "Official Clarence sign-off gate, commercial quotation verification, and execution authorization." }),
                            ],
                          }),

                          // Three-Line Commercial Quotation Breakdown
                          renderThreeLineQuotation(selectedTx),

                          // Current Approval Badge Card
                          jsxs("div", {
                            className: "p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between flex-wrap gap-3",
                            children: [
                              jsxs("div", {
                                children: [
                                  jsx("div", { className: "text-xs text-slate-500 font-medium", children: "Official Management Status" }),
                                  jsx("div", {
                                    className: cn(
                                      "text-xl font-black mt-0.5 tracking-tight",
                                      approvalStatus === "Approved"
                                        ? "text-emerald-700 dark:text-emerald-400"
                                        : approvalStatus === "Rejected"
                                        ? "text-rose-700 dark:text-rose-400"
                                        : approvalStatus === "Returned for Correction"
                                        ? "text-purple-700 dark:text-purple-400"
                                        : "text-amber-700 dark:text-amber-400"
                                    ),
                                    children: approvalStatus,
                                  }),
                                ],
                              }),
                              decisionDate &&
                                jsxs("div", {
                                  className: "text-right text-xs text-slate-500",
                                  children: [
                                    jsxs("div", { children: [jsx("span", { className: "font-semibold", children: "Approver: " }), approverName] }),
                                    jsx("div", { children: new Date(decisionDate).toLocaleString() }),
                                  ],
                                }),
                            ],
                          }),

                          // Rejection / Correction reason notice if applicable
                          rejectionReason &&
                            jsxs("div", {
                              className: "p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 text-xs space-y-1",
                              children: [
                                jsx("div", { className: "font-bold text-rose-800 dark:text-rose-300", children: "Management Feedback / Reason for Correction:" }),
                                jsx("p", { className: "text-rose-700 dark:text-rose-400 whitespace-pre-wrap", children: rejectionReason }),
                              ],
                            }),

                          // Clarence Admin Controls VS Field Officer Notice
                          isAdmin
                            ? jsxs("div", {
                                className: "space-y-4 p-5 rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/20",
                                children: [
                                  jsxs("div", {
                                    children: [
                                      jsx("span", { className: "text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300", children: "Clarence Executive Authority Active" }),
                                      jsx("p", { className: "text-xs text-slate-600 dark:text-slate-400 mt-0.5", children: "You are signed in with executive sign-off authority. You may officially approve, reject, or return this Deal Pack for correction." }),
                                    ],
                                  }),
                                  jsxs("label", {
                                    className: "block space-y-1 text-xs font-semibold",
                                    children: [
                                      jsx("span", { children: "Sign-Off Notes / Reason for Rejection or Correction" }),
                                      jsx("textarea", {
                                        rows: 2,
                                        value: rejectionReasonInput,
                                        onChange: (e) => setRejectionReasonInput(e.target.value),
                                        placeholder: "e.g. Approved. Verify weighbridge ticket WB-IN-001 prior to releasing final tranche.",
                                        className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-normal",
                                      }),
                                    ],
                                  }),
                                  jsxs("div", {
                                    className: "flex items-center gap-3 pt-2 flex-wrap",
                                    children: [
                                      jsx("button", {
                                        type: "button",
                                        onClick: () => handleApprovalAction("Approved", rejectionReasonInput),
                                        disabled: isSubmitting,
                                        className: "px-5 py-2.5 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-md transition-all",
                                        children: "✓ Approve Deal Pack",
                                      }),
                                      jsx("button", {
                                        type: "button",
                                        onClick: () => {
                                          if (!rejectionReasonInput.trim()) {
                                            showToast("Please provide correction instructions before returning.", "error");
                                            return;
                                          }
                                          handleApprovalAction("Returned for Correction", rejectionReasonInput);
                                        },
                                        disabled: isSubmitting,
                                        className: "px-5 py-2.5 text-xs font-bold rounded-xl bg-purple-700 hover:bg-purple-800 text-white shadow-md transition-all",
                                        children: "↩ Return for Correction",
                                      }),
                                      jsx("button", {
                                        type: "button",
                                        onClick: () => {
                                          if (!rejectionReasonInput.trim()) {
                                            showToast("Please provide rejection reason before rejecting.", "error");
                                            return;
                                          }
                                          handleApprovalAction("Rejected", rejectionReasonInput);
                                        },
                                        disabled: isSubmitting,
                                        className: "px-5 py-2.5 text-xs font-bold rounded-xl bg-rose-700 hover:bg-rose-800 text-white shadow-md transition-all",
                                        children: "✗ Reject Deal Pack",
                                      }),
                                    ],
                                  }),
                                ],
                              })
                            : jsxs("div", {
                                className: "p-4 rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 text-xs space-y-3",
                                children: [
                                  jsx("div", { className: "font-bold text-amber-900 dark:text-amber-300", children: "Field Officer Mode — Ready for Clarence Review" }),
                                  jsx("p", { className: "text-amber-800 dark:text-amber-400 leading-relaxed", children: "You have completed Deal Pack sections. Click 'Submit Deal Pack for Review' below to initiate official executive review." }),
                                  jsx("button", {
                                    type: "button",
                                    onClick: handleSubmitForReview,
                                    disabled: isSubmitting,
                                    className: "px-5 py-2.5 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-md transition-all",
                                    children: "Submit Deal Pack for Clarence Review",
                                  }),
                                ],
                              }),
                        ],
                      });
                    }

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
                    children: activeSection === 7 ? "← Previous: Element 6" : "← Previous Element",
                  }),
                  jsxs("div", {
                    className: "text-xs font-semibold text-slate-500",
                    children: [activeSection === 7 ? "Deal Pack: Submit (7 of 7)" : `Deal Pack Element ${activeSection} of 7`],
                  }),
                  jsx("button", {
                    type: "button",
                    onClick: () => setActiveSection((prev) => Math.min(7, prev + 1)),
                    disabled: activeSection === 7,
                    className: "px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 disabled:opacity-40",
                    children: activeSection === 6 ? "Next: Submit →" : "Next Element →",
                  }),
                ],
              }),

              // Wave 8: Chronological Activity Timeline
              renderActivityTimeline(selectedTx),
            ],
          }),

      // Wave 2: Controlled Identity Disclosure Modal Dialog
      revealModalOpen &&
        jsxs("div", {
          className: "fixed inset-0 z-[2147483600] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm",
          children: [
            jsxs("div", {
              className: "w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto",
              children: [
                jsxs("div", {
                  className: "flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3",
                  children: [
                    jsxs("div", {
                      className: "flex items-center gap-2",
                      children: [
                        jsx("span", { className: "text-xl", children: "🛡️" }),
                        jsx("h3", { className: "font-bold text-base text-slate-900 dark:text-slate-100", children: "Identity Disclosure Clearance" }),
                      ],
                    }),
                    jsx("button", {
                      type: "button",
                      onClick: () => setRevealModalOpen(false),
                      className: "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg p-1",
                      children: "✕",
                    }),
                  ],
                }),
                jsx("p", {
                  className: "text-xs text-slate-600 dark:text-slate-300 leading-relaxed",
                  children: "Unmasking buyer and supplier personal contact details requires operational or banking authorization. Every reveal action is recorded with an immutable audit log.",
                }),
                revealError &&
                  jsx("div", {
                    className: "p-3 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 font-medium",
                    children: revealError,
                  }),
                jsxs("div", {
                  className: "space-y-3 text-xs",
                  children: [
                    jsxs("label", {
                      className: "block space-y-1 font-semibold text-slate-700 dark:text-slate-300",
                      children: [
                        jsx("span", { children: "Disclosure Purpose *" }),
                        jsx("select", {
                          value: revealPurpose,
                          onChange: (e) => setRevealPurpose(e.target.value),
                          className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                          children: [
                            jsx("option", { value: "OPERATIONAL", children: "OPERATIONAL — Field Logistics & Dispatch" }),
                            jsx("option", { value: "BANKING", children: "BANKING — Settlement & Banking Compliance" }),
                          ],
                        }),
                      ],
                    }),
                    jsxs("label", {
                      className: "block space-y-1 font-semibold text-slate-700 dark:text-slate-300",
                      children: [
                        jsx("span", { children: "Business Justification Reason *" }),
                        jsx("textarea", {
                          rows: 3,
                          value: revealReason,
                          onChange: (e) => setRevealReason(e.target.value),
                          placeholder: "e.g. Weighbridge clearance and supplier mobile money disbursement",
                          className: "w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent font-normal",
                        }),
                      ],
                    }),
                    jsxs("div", {
                      className: "p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500",
                      children: [
                        "Authorized user: ",
                        jsx("strong", { children: currentUser?.name || currentUser?.email || "Unknown" }),
                        " (Role: ",
                        jsx("strong", { children: currentUser?.role || "operator" }),
                        ")",
                      ],
                    }),
                  ],
                }),
                jsxs("div", {
                  className: "flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800",
                  children: [
                    jsx("button", {
                      type: "button",
                      onClick: () => setRevealModalOpen(false),
                      className: "px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800",
                      children: "Cancel",
                    }),
                    jsx("button", {
                      type: "button",
                      onClick: handleRevealIdentity,
                      disabled: isRevealing,
                      className: "px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-sm disabled:opacity-50",
                      children: isRevealing ? "Verifying..." : "Verify & Reveal Identity",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
    ],
  });
}
