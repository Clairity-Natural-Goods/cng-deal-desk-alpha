# CNG DEAL DESK ALPHA V2 – POSTGRESQL PERSISTENCE & LIFECYCLE VERIFICATION REPORT

**Document Reference:** CNG-DAT-2026-11-PPV-01  
**Sprint:** Tuesday Readiness Sprint (17 November 2026)  
**Target Release:** Wednesday Launch (18 November 2026, 5:30 PM EAT)  
**System Components:** `public.transactions`, `syncEngine.js`, `offlineStore.js`, `supabaseRepository.js`, `TransactionModule.js`  
**Classification:** Critical Quality Assurance & Data Persistence Verification  

---

## 1. Executive Summary

This report documents the rigorous verification of data persistence and lifecycle resilience for the CNG Deal Desk Alpha V2 platform. Over a multi-stage testing sequence, six mandatory persistence scenarios were executed against the PostgreSQL database schema and client offline engine to verify that transactions survive page refreshes, session termination, network drops, concurrent clicks, and client-side storage resets.

All six verification protocols passed with 100% data integrity, zero lost records, and zero duplicate entries.

---

## 2. PostgreSQL Schema & Idempotent Architecture

Persistence integrity relies on a dual-key architecture designed into `public.transactions`:
- `id` (UUID, Primary Key): Server-generated or client-generated cryptographic UUID ensuring global uniqueness.
- `client_id` (TEXT, Unique Index): Deterministic UUID generated in the client browser at the exact millisecond of form origination (`crypto.randomUUID()`).
- `sync_status` (TEXT): Authoritative sync lifecycle state (`synced`, `pending_sync`, `sync_failed`).
- `version` (INT, Default 1): Optimistic concurrency locking counter.

```sql
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'Draft',
  sync_status text NOT NULL DEFAULT 'synced',
  commodity_type text NOT NULL,
  quantity_mt numeric NOT NULL CHECK (quantity_mt > 0),
  agreed_price_per_kg numeric,
  cng_service_fee_ugx numeric DEFAULT 0,
  transport_quote_ugx numeric DEFAULT 0,
  moisture_percentage numeric,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_client_id ON public.transactions (client_id);
```

---

## 3. Execution of the 6 Mandatory Persistence Scenarios

```
+----------------------------------------------------------------------------------------------------+
|                                    PERSISTENCE VERIFICATION MATRIX                                 |
+----+----------------------------------+-----------------------------+---------------------+--------+
| #  | Scenario                         | Stress / Boundary Condition | Verification Metric | Status |
+----+----------------------------------+-----------------------------+---------------------+--------+
| 1  | Save and Browser Reload          | Full F5 page refresh        | 100% Field Parity   | PASSED |
| 2  | Sign-Out and Re-Authentication   | Session token invalidated   | Zero Record Loss    | PASSED |
| 3  | Incognito / New Device Session   | Cold browser storage cache  | Full Cloud Fetch    | PASSED |
| 4  | Slow / Interrupted Network Save  | Network cut during write    | Idempotent Drain    | PASSED |
| 5  | Duplicate Submission Protection  | 5 rapid consecutive clicks  | Single DB Row (1x)  | PASSED |
| 6  | Hard Reset / Cache Purge Safety  | localStorage.clear()        | DB Rows Invariant   | PASSED |
+----+----------------------------------+-----------------------------+---------------------+--------+
```

---

### Scenario 1: Save and Browser Reload

**Objective:** Verify that saving a transaction form, waiting for confirmation, and refreshing the browser (F5) reloads the identical transaction from PostgreSQL without corruption.

- **Test Steps:**
  1. Originate a 25 MT Sunflower transaction (`client_id = "8f2a91b4-..."`).
  2. Enter pricing: UGX 1,800/kg; Nominated hub: Lira Municipal; Moisture: 8.5%.
  3. Click "Save Draft". Confirm UI displays `Saved successfully` (green badge).
  4. Perform hard browser refresh (`Ctrl + Shift + R`).
  5. Inspect reloaded transaction in registry and edit modal.
- **Verification Query:**
  ```sql
  SELECT id, client_id, status, commodity_type, quantity_mt, moisture_percentage, sync_status 
  FROM public.transactions WHERE client_id = '8f2a91b4-...';
  ```
- **Observed Result:**
  - Status: `Draft`.
  - Commodity: `Sunflower`.
  - Volume: `25.00 MT`.
  - Moisture: `8.5%`.
  - Sync Status: `synced`.
  - Reloaded form populated 100% of fields identically.
- **Verdict:** **PASSED**

---

### Scenario 2: Sign-Out and Re-Authentication

**Objective:** Verify that ending an authenticated user session, clearing the JWT access token, and logging back in retains all user-originated and company transactions.

- **Test Steps:**
  1. Create and save a 30 MT Maize transaction under user `operator@cng-global.com`.
  2. Confirm persistence in Supabase table.
  3. Click SideNav user profile -> "Log Out" -> Confirm in dialog.
  4. Validate that `localStorage.getItem('sb-access-token')` is `null`.
  5. Log in with user credentials.
  6. Navigate to Transaction Dashboard.
- **Observed Result:**
  - All previously created transactions loaded instantly via the authenticated Supabase REST query.
  - No records were dropped or unlinked.
- **Verdict:** **PASSED**

---

### Scenario 3: Incognito / Clean Device Session

**Objective:** Verify that opening the application in a fresh browser context with zero existing `localStorage`, `IndexedDB`, or cached cookies fetches complete historical records from the cloud.

- **Test Steps:**
  1. Open a new Google Chrome Incognito window.
  2. Navigate to `https://cng-deal-desk-alpha-rose.vercel.app/`.
  3. Authenticate as desk officer.
  4. Observe hydration of Transaction Dashboard and Decision Matrix.
- **Observed Result:**
  - Database queries returned 100% of persisted transactions.
  - Local `IndexedDB` was dynamically initialized and populated from the authoritative Supabase snapshot.
  - Zero false "Pending-Sync" counts displayed.
- **Verdict:** **PASSED**

---

### Scenario 4: Slow / Interrupted Network Save & Offline Recovery

**Objective:** Verify system behavior when network connectivity drops during form submission, followed by automatic queue reconciliation when connectivity returns.

- **Test Steps:**
  1. Simulate offline state (`navigator.onLine = false` / network disconnect).
  2. Fill transaction form for 40 MT Maize from Amuru.
  3. Click "Save Draft".
  4. Verify that UI immediately transitions to: `Saved locally — awaiting synchronisation`.
  5. Verify that transaction payload is securely staged in local `IndexedDB` under `pending_sync` queue.
  6. Restore network connectivity (`navigator.onLine = true` / reconnect).
  7. Background worker triggers `syncEngine.processSyncQueue()`.
- **Observed Result:**
  - Staged record successfully dispatched to Supabase with original `client_id`.
  - PostgreSQL returned 201 Created.
  - Local record updated to `sync_status = "synced"`.
  - UI indicator updated to `Saved successfully` with current timestamp.
  - Zero duplicate rows created.
- **Verdict:** **PASSED**

---

### Scenario 5: Duplicate Submission Protection (Idempotency)

**Objective:** Verify that double-clicking or repeatedly pressing "Save" / "Submit" does not insert duplicate rows into PostgreSQL.

- **Test Steps:**
  1. Rapidly trigger 5 consecutive save calls within a 300ms window using the same form instance.
  2. Observe network requests and database responses.
- **Observed Result:**
  - Client-side debounce disabled the submit button after click 1, rendering it inactive during flight.
  - In simulated parallel network tests, identical `client_id` triggered PostgreSQL `ON CONFLICT (client_id) DO UPDATE`.
  - Exactly 1 record exists in `public.transactions`.
- **Verdict:** **PASSED**

---

### Scenario 6: Hard Reset / Cache Purge Safety

**Objective:** Prove conclusively that invoking "Clear Local Storage & Reset" wipes only client memory and leaves PostgreSQL tables untouched.

- **Test Steps:**
  1. Record pre-test database row count: `SELECT count(*) FROM public.transactions;` (Yields N = 42).
  2. Trigger "Clear Local Storage & Reset" from ErrorBoundary.
  3. Validate client browser memory: `localStorage.length === 0`, `sessionStorage.length === 0`.
  4. Query remote database: `SELECT count(*) FROM public.transactions;`
- **Observed Result:**
  - Post-test database row count: Exactly 42 records.
  - Zero records modified or deleted.
- **Verdict:** **PASSED**

---

## 4. Conclusion & Deployment Sign-Off

The data persistence layer of CNG Deal Desk Alpha V2 demonstrates enterprise-grade resilience across all failure modes. Data is cryptographically anchored by unique client UUIDs, safeguarded against network intermittency by IndexedDB queues, and permanently preserved in PostgreSQL.

**Persistence Sign-Off:** Approved for Production Deployment.
