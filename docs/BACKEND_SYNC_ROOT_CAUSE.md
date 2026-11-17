# CNG DEAL DESK ALPHA V2 – BACKEND SYNCHRONISATION ROOT CAUSE ANALYSIS

**Document Reference:** CNG-ARC-2026-11-SYNC-01  
**Sprint:** Tuesday Readiness Sprint (17 November 2026)  
**Target Release:** Wednesday Launch (18 November 2026, 5:30 PM EAT)  
**System Components:** `assets/offline/syncEngine.js`, `assets/transactions/TransactionModule.js`, `assets/offline/offlineStore.js`, `public.transactions`  
**Classification:** Internal Technical Architecture & Root Cause Analysis  

---

## 1. Executive Summary

During field testing and operational dashboard review, users encountered contradictory state indicators: after clicking save and receiving a toast confirmation indicating successful persistence, the dashboard metric cards and status badges displayed records as **"Pending-Sync (0)"** or flagged saved drafts as unsynchronised pending changes.

This document identifies the root cause of this synchronisation contradiction, demonstrates how the frontend client and offline engine misattributed draft transactions to the local offline synchronization queue, and documents the permanent fix that strictly enforces five mutually exclusive, truthful save states.

---

## 2. Problem Statement & Incident Symptoms

Field operators and desk analysts reported the following contradictory behaviors:
1. **Contradictory Dashboard Metrics:** Upon creating a new draft transaction with a strong network connection, the application showed "Saved successfully to cloud", yet the dashboard metric card for "Pending Sync" incremented or flashed, while refreshing the page caused pending sync counters to drop to zero while the draft persisted in Supabase.
2. **False "Pending-Sync" Badge on Remote Records:** Records successfully stored in PostgreSQL with valid UUIDs were assigned `sync_status = "pending_sync"` solely because their commercial lifecycle status was `Draft`.
3. **Save-State Flapping:** The save-state banner in the transaction form flapped between "Saved locally" and "Sync pending" despite zero network interruptions.

---

## 3. Comprehensive Root Cause Analysis

Investigation of the offline engine and transaction UI revealed two compounding architectural defects in `syncEngine.js` and `TransactionModule.js`.

### 3.1 Defect Vector 1: Artificial `pending_sync` Assignment in `syncEngine.js`

In `assets/offline/syncEngine.js`, the remote persistence function `saveTransactionToSupabase` contained logic that forcibly tagged any draft record as `pending_sync`, even when the Supabase insert/upsert call succeeded with HTTP 200/201:

```javascript
// DEFECTIVE IMPLEMENTATION in syncEngine.js (saveTransactionToSupabase):
const syncStatus = record.sync_status || (record.status === "Draft" ? "pending_sync" : "synced");

const payload = {
  // ...
  sync_status: syncStatus, // FORCED DRAFTS TO BE 'pending_sync' IN THE DATABASE
  updated_at: new Date().toISOString()
};

const { data, error } = await supabase.from("transactions").upsert(payload, { onConflict: "client_id" });
```

#### Why This Broke Synchronisation Truthfulness:
- The function conflated **commercial lifecycle status** (`status = 'Draft'`) with **transport synchronisation status** (`sync_status = 'synced'`).
- A draft that had been 100% written to remote PostgreSQL was stamped `sync_status = 'pending_sync'` in the database table itself.
- Consequently, every time the application queried Supabase, the remote database returned `pending_sync` for cloud-persisted drafts.

### 3.2 Defect Vector 2: Contradictory Metric Filtering in `TransactionModule.js`

In `assets/transactions/TransactionModule.js`, the dashboard statistics calculation contained an additional synthetic filter that forced remote drafts into the pending sync count:

```javascript
// DEFECTIVE IMPLEMENTATION in TransactionModule.js (refreshData):
const pendingSyncCount = allRecords.filter(t => 
  t.sync_status === "pending_sync" || 
  (t.status === "Draft" && t.sync_status !== "synced")
).length;
```

#### Why This Failed:
- Even if a draft was in transit or partially reconciled, the filter artificially classified any draft whose `sync_status` was not strictly `"synced"` as pending sync.
- Combined with Defect Vector 1, where drafts were written to the database with `sync_status = 'pending_sync'`, drafts could **never** exit the pending sync state on the dashboard unless they were converted to `SubmittedForReview` or `Approved`.
- When a user refreshed the browser, if local storage was cleared or reloaded, the metric temporarily read 0 before re-fetching the corrupted `sync_status` from the database.

---

## 4. Remediation & The Five Authoritative Save States

### 4.1 Strict Disentanglement of Lifecycle and Sync Status

To eliminate this conflict permanently, the application now enforces a strict architectural boundary:
- **Commercial Lifecycle Status (`status`):** `Draft`, `SubmittedForReview`, `Approved`, `Ready`, `Rejected`, `Archived`.
- **Transport Sync Status (`sync_status`):** `synced`, `pending_sync`, `sync_failed`.

When a record is successfully written to Supabase PostgreSQL, its `sync_status` is **always** set to `"synced"`, regardless of whether its commercial status is `Draft` or `Approved`.

```javascript
// CORRECTED IMPLEMENTATION in assets/offline/syncEngine.js:
export async function saveTransactionToSupabase(record) {
  // ...
  // Any confirmed write to remote PostgreSQL establishes truth as 'synced'
  const payload = {
    ...dbRecord,
    sync_status: "synced",
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from("transactions").upsert(payload, { onConflict: "client_id" });
  if (error) throw error;
  
  // Also update local cache to mirror confirmed cloud state
  await offlineStore.saveTransaction({ ...record, sync_status: "synced" });
  return data;
}
```

### 4.2 The Five Authoritative Save States

The UI indicator in `TransactionModule.js` and `DecisionMatrixModule.js` now strictly renders one of five mutually exclusive states:

```
+--------------------------------------------------------------------------------------------------+
|                                    FIVE AUTHORITATIVE SAVE STATES                                |
+---+---------------------------------------------------+------------------------------------------+
| # | State Label                                       | Condition & Trigger Event                |
+---+---------------------------------------------------+------------------------------------------+
| 1 | "Saving..."                                       | Async persistence operation in flight.   |
|   |                                                   | Submit button disabled, spinner active.  |
+---+---------------------------------------------------+------------------------------------------+
| 2 | "Saved locally — awaiting synchronisation"        | Network offline or write timed out.      |
|   |                                                   | Record saved in local IndexedDB queue.   |
+---+---------------------------------------------------+------------------------------------------+
| 3 | "Saved successfully"                              | Remote PostgreSQL write confirmed (200). |
|   | (Confirmed cloud persistence)                     | sync_status = 'synced', timestamp logged.|
+---+---------------------------------------------------+------------------------------------------+
| 4 | "Sync pending"                                    | Network restored; background worker is   |
|   | (Queue flushing)                                  | actively draining queued local records.  |
+---+---------------------------------------------------+------------------------------------------+
| 5 | "Save failed"                                     | Fatal validation error or DB exception.  |
|   |                                                   | Error toast displayed, retry available.  |
+---+---------------------------------------------------+------------------------------------------+
```

### 4.3 Reconciled Dashboard Metric Calculation

In `assets/transactions/TransactionModule.js`, dashboard metrics now calculate counts based on truthful database and local queue states:

```javascript
// CORRECTED IMPLEMENTATION in assets/transactions/TransactionModule.js:
const stats = {
  total: records.length,
  drafts: records.filter(r => r.status === "Draft").length,
  ready: records.filter(r => evaluateTransactionReadiness(r).isReady).length,
  approved: records.filter(r => r.status === "Approved" && evaluateTransactionReadiness(r).isReady).length,
  // Only records genuinely waiting in local queue or tagged pending_sync are counted:
  pending_sync: records.filter(r => r.sync_status === "pending_sync").length
};
```

---

## 5. Verification & Test Evidence

The corrected synchronisation engine was validated across automated regression tests:

| Test ID | Scenario | Expected Outcome | Actual Outcome | Status |
| :--- | :--- | :--- | :--- | :--- |
| **FE-08** | Confirmed write to PostgreSQL | `sync_status` set to `"synced"`; no false pending badge | Confirmed write sets `sync_status: "synced"` | **PASS** |
| **FE-09** | Simulated database network failure | Input preserved; local queue updated; `sync_status: "pending_sync"` | Preserved in IndexedDB; indicator shows "Saved locally" | **PASS** |
| **FE-10** | Interrupted save recovery | Network reconnected; queue drained idempotently | Records pushed to cloud; status updated to `"synced"` | **PASS** |
| **FE-11** | Idempotency on repeated clicks | Multiple saves with identical `client_id` do not create duplicate rows | Upsert matches `client_id`; single row preserved | **PASS** |
| **PERSIST-04**| Database draft persistence | Incomplete draft transactions preserved with `Draft` status | Preserved in PostgreSQL without wiping | **PASS** |
| **PERSIST-05**| Pending sync & draft metrics | Truthful metric separation between draft count and pending sync count | Accurate metrics on dashboard and after refresh | **PASS** |

---

## 6. Conclusion & Operational Impact

The synchronisation contradiction is fully resolved. Draft transactions now achieve confirmed cloud synchronization immediately upon saving if network connectivity exists, correctly reflecting `Saved successfully` with a green indicator. If the network drops, records are safely staged locally with a truthful `Saved locally — awaiting synchronisation` indicator and reconciled automatically without user data loss.
