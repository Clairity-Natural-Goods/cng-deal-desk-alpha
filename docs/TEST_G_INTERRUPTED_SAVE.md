# TEST G: INTERRUPTED SAVE & PRE-SAVE RECONCILIATION RECOVERY
**Project:** CNG Deal Desk Alpha V2  
**Test ID:** TEST-G  
**Suite Harness:** `tests/supabase_cng_suite.test.js`  
**Status:** PASSED (100% Verified)  

---

## 1. Test Objective & Operational Rationale

Field operations in rural Northern Uganda frequently encounter sudden cellular dropouts, intermittent EDGE/3G connectivity, and server timeouts. A robust Deal Desk application must satisfy three essential reliability principles:
1. **Never Lose User Edits:** Uncommitted form inputs must be durably stored on disk/IndexedDB immediately upon save attempt.
2. **Never Show False Cloud Success:** The UI must display `Saved locally — awaiting synchronisation` or `Save failed` when network communication terminates prematurely, never `Saved successfully`.
3. **Prevent Duplicate Records on Retry:** When an interrupted network request actually succeeded on Supabase before the client received the acknowledgement, a subsequent save must reconcile the existing record via `client_id` idempotency rather than inserting a duplicate row.

---

## 2. Test Execution Details

### Step 1: Disconnected / Timeout Simulation
A draft transaction with `client_id = "test-recovery-client-uuid-001"` is saved while offline:
```javascript
const savedLocally = await saveOfflineTransaction(draftTx, { id: "officer_1", name: "Field Officer" });
```
- **Assertion:** `savedLocally` exists and maintains `sync_status = "pending_sync"`.
- **Durable Verification:** `getAllOfflineTransactions()` confirms the transaction is safely stored in the durable local queue.

### Step 2: In-Flight Concurrency Guard
In `assets/transactions/TransactionModule.js`:
```javascript
if (inFlightRef.current) return;
inFlightRef.current = true;
```
Double-clicking the save button or firing simultaneous keyboard events is blocked synchronously in memory.

### Step 3: Pre-Save Reconciliation on Uncertain Timeout
When connectivity returns, `handleSaveDraft` checks Supabase for the existing `client_id` before attempting an insert:
```javascript
const { data: existing } = await supabase
  .from("transactions")
  .select("*")
  .eq("client_id", recordToSave.client_id)
  .maybeSingle();

if (existing && existing.id && existing.sync_version >= (recordToSave.sync_version || 0)) {
  setSelectedTx(existing);
  setSaveState({ status: "saved_server", timestamp: new Date(existing.updated_at), error: null });
  clearFormDraft(recordToSave.client_id);
  showToast("Reconciled confirmed transaction record from Supabase database.", "success");
  return;
}
```
If the previous interrupted attempt succeeded on the database, the record is reconciled cleanly, preventing duplicate database entries.

### Step 4: Truthful Save-State Feedback
The 5-state lifecycle strictly updates the UI:
- `saving`: Displaying spinning indicator and "Saving..."
- `saved_locally`: Displaying amber badge "Saved locally — awaiting synchronisation"
- `saved_server`: Displaying green badge "Saved successfully to cloud" (only after database HTTP 200/201 response)
- `save_failed`: Displaying red badge "Save failed" with error message and retry button
