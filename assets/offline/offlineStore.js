/**
 * ==============================================================================
 *   CNG DEAL DESK ALPHA V2 — OFFLINE-FIRST INDEXEDDB STORE
 *   Module: assets/offline/offlineStore.js
 *   Purpose: Durable local persistence for MVTR transactions, field captures,
 *            audit events, and counterparty caching when connectivity is poor.
 * ==============================================================================
 */

const DB_NAME = "CNG_DEAL_DESK_OFFLINE_DB";
const DB_VERSION = 1;

// In-memory fallback for environments without IndexedDB (e.g., Node.js tests or private browsing)
const memoryStore = {
  transactions: new Map(),
  events: new Map(),
  parties: new Map(),
  metadata: new Map(),
};

/**
 * Check if IndexedDB is available
 */
function hasIndexedDB() {
  return typeof window !== "undefined" && Boolean(window.indexedDB);
}

/**
 * Open (or create) the IndexedDB database
 */
export function openOfflineDb() {
  if (!hasIndexedDB()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
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
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.warn("Failed to open IndexedDB, falling back to memory:", event.target.error);
      resolve(null);
    };
  });
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
 * Ensure standard 7 Deal Pack sections with defaults
 */
export function normalizeTransactionRecord(data, currentUser = null) {
  const now = new Date().toISOString();
  const clientId = data.client_id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `cid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const reference = data.reference || generateTransactionReference();
  const createdByName = data.created_by_name || currentUser?.user_metadata?.name || currentUser?.name || currentUser?.email || "Field Officer";
  const createdBy = data.created_by || currentUser?.id || null;

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
    buyer_id: data.buyer_id || null,
    supplier_id: data.supplier_id || null,
    commodity: data.commodity || "Maize",

    // 01. Buyer Requirements
    buyer_requirements: {
      buyer_name: data.buyer_requirements?.buyer_name || "",
      product_specification: data.buyer_requirements?.product_specification || "",
      required_tonnes: Number(data.buyer_requirements?.required_tonnes) || 0,
      moisture_limit_pct: Number(data.buyer_requirements?.moisture_limit_pct) || 14.0,
      quality_spec: data.buyer_requirements?.quality_spec || "Grade 1 - Clean, dry, free of pests",
      delivery_location: data.buyer_requirements?.delivery_location || "",
      delivery_district: data.buyer_requirements?.delivery_district || "Gulu",
      required_delivery_date: data.buyer_requirements?.required_delivery_date || "",
      purchasing_conditions: data.buyer_requirements?.purchasing_conditions || "",
    },

    // 02. Supplier Verification
    supplier_verification: {
      supplier_name: data.supplier_verification?.supplier_name || "",
      contact_person: data.supplier_verification?.contact_person || "",
      phone: data.supplier_verification?.phone || "",
      district: data.supplier_verification?.district || "Amuru",
      location_details: data.supplier_verification?.location_details || "",
      verification_status: data.supplier_verification?.verification_status || "REPORTED",
      claimed_tonnes: Number(data.supplier_verification?.claimed_tonnes) || 0,
      confirmed_tonnes: Number(data.supplier_verification?.confirmed_tonnes) || 0,
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
      estimated_tonnes: Number(data.transport_collection?.estimated_tonnes) || 0,
      transport_rate_per_tonne: Number(data.transport_collection?.transport_rate_per_tonne) || 0,
      total_transport_cost: Number(data.transport_collection?.total_transport_cost) || 0,
      collection_status: data.transport_collection?.collection_status || "Planned",
      waybill_ref: data.transport_collection?.waybill_ref || "",
      notes: data.transport_collection?.notes || "",
    },

    // 04. Payment Terms
    payment_terms: {
      agreed_price_per_kg: Number(data.payment_terms?.agreed_price_per_kg) || 0,
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
      projected_net_margin: Number(data.fee_margin?.projected_net_margin) || 0,
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
  };
}

/**
 * Save transaction to offline store
 */
export async function saveOfflineTransaction(recordData, currentUser = null) {
  const normalized = normalizeTransactionRecord(recordData, currentUser);
  const db = await openOfflineDb();

  if (!db) {
    memoryStore.transactions.set(normalized.client_id, normalized);
    return normalized;
  }

  return new Promise((resolve, reject) => {
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
      console.warn("IndexedDB transaction save error:", e.target.error);
      memoryStore.transactions.set(normalized.client_id, normalized);
      resolve(normalized);
    };
  });
}

/**
 * Get offline transaction by client_id
 */
export async function getOfflineTransaction(clientId) {
  const db = await openOfflineDb();
  if (!db) {
    return memoryStore.transactions.get(clientId) || null;
  }

  return new Promise((resolve) => {
    const tx = db.transaction("transactions", "readonly");
    const store = tx.objectStore("transactions");
    const request = store.get(clientId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(memoryStore.transactions.get(clientId) || null);
  });
}

/**
 * Get all offline transactions sorted by created_at descending
 */
export async function getAllOfflineTransactions() {
  const db = await openOfflineDb();
  if (!db) {
    return Array.from(memoryStore.transactions.values()).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
  }

  return new Promise((resolve) => {
    const tx = db.transaction("transactions", "readonly");
    const store = tx.objectStore("transactions");
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result || [];
      results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      resolve(results);
    };
    request.onerror = () => {
      resolve(Array.from(memoryStore.transactions.values()));
    };
  });
}

/**
 * Get transactions currently pending synchronization
 */
export async function getPendingSyncTransactions() {
  const all = await getAllOfflineTransactions();
  return all.filter((tx) => tx.sync_status === "pending_sync" || tx.sync_status === "sync_failed");
}

/**
 * Mark a transaction as synced
 */
export async function markTransactionSynced(clientId, serverRecord = {}) {
  const existing = await getOfflineTransaction(clientId);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...serverRecord,
    client_id: clientId,
    id: serverRecord.id || existing.id,
    sync_status: "synced",
    sync_error: null,
    last_sync_attempt: new Date().toISOString(),
    sync_version: (existing.sync_version || 1) + 1,
  };

  const db = await openOfflineDb();
  if (!db) {
    memoryStore.transactions.set(clientId, updated);
    return updated;
  }

  return new Promise((resolve) => {
    const tx = db.transaction("transactions", "readwrite");
    tx.objectStore("transactions").put(updated);
    tx.oncomplete = () => resolve(updated);
    tx.onerror = () => {
      memoryStore.transactions.set(clientId, updated);
      resolve(updated);
    };
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

  const db = await openOfflineDb();
  if (!db) {
    memoryStore.transactions.set(clientId, updated);
    return updated;
  }

  return new Promise((resolve) => {
    const tx = db.transaction("transactions", "readwrite");
    tx.objectStore("transactions").put(updated);
    tx.oncomplete = () => resolve(updated);
    tx.onerror = () => {
      memoryStore.transactions.set(clientId, updated);
      resolve(updated);
    };
  });
}

/**
 * Delete a transaction from the offline store
 */
export async function deleteOfflineTransaction(clientId) {
  const db = await openOfflineDb();
  if (!db) {
    memoryStore.transactions.delete(clientId);
    return true;
  }

  return new Promise((resolve) => {
    const tx = db.transaction("transactions", "readwrite");
    tx.objectStore("transactions").delete(clientId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

/**
 * Cache counterparties locally so field officers can select buyers/suppliers offline
 */
export async function cacheCounterparties(partiesList) {
  if (!Array.isArray(partiesList)) return;
  const db = await openOfflineDb();
  if (!db) {
    partiesList.forEach((p) => memoryStore.parties.set(p.id, p));
    return;
  }

  return new Promise((resolve) => {
    const tx = db.transaction("cached_parties", "readwrite");
    const store = tx.objectStore("cached_parties");
    partiesList.forEach((p) => store.put(p));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

/**
 * Retrieve cached counterparties
 */
export async function getCachedParties() {
  const db = await openOfflineDb();
  if (!db) {
    return Array.from(memoryStore.parties.values());
  }

  return new Promise((resolve) => {
    const tx = db.transaction("cached_parties", "readonly");
    const store = tx.objectStore("cached_parties");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve(Array.from(memoryStore.parties.values()));
  });
}

/**
 * Get counts of transactions by status
 */
export async function getOfflineStats() {
  const all = await getAllOfflineTransactions();
  return {
    total: all.length,
    pending_sync: all.filter((t) => t.sync_status === "pending_sync").length,
    sync_failed: all.filter((t) => t.sync_status === "sync_failed").length,
    synced: all.filter((t) => t.sync_status === "synced").length,
    drafts: all.filter((t) => t.status === "Draft").length,
    approved: all.filter((t) => t.status === "Approved").length,
  };
}
