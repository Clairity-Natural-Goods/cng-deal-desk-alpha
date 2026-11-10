# Minimum Viable Transaction Record (MVTR) — Delivery Report

**Project**: CNG Deal Desk Alpha V2  
**Module**: Minimum Viable Transaction Record (MVTR) & Offline Field Capture Desk  
**Target Infrastructure**: Supabase PostgreSQL + Vercel Production Hosting  
**Test Suite**: `tests/supabase_cng_suite.test.js` (24 Automated Tests Passed, 100% Success Rate)  
**Status**: Complete, Verified, Built & Ready for Field Operations  

---

## 1. Executive Summary

In response to Management's master mandate for immediate field deployment in Northern Uganda (Amuru, Gulu, Lira, Nwoya, Oyam, Kitgum corridors), the **Minimum Viable Transaction Record (MVTR)** module has been fully implemented, verified, and integrated into **CNG Deal Desk Alpha V2**.

The priority of this release is to **capture real commercial deal information in the field**, **preserve it safely when internet connectivity is poor or nonexistent**, and **synchronize it seamlessly to the Deal Desk and Supabase cloud** when connectivity returns.

### Core Architecture Highlights
1. **Durable Offline-First Persistence**: Powered by **IndexedDB** (`CNG_DEAL_DESK_OFFLINE_DB`) rather than ephemeral browser session state. Full counterparty caching allows field officers to draft transactions, record calibrated moisture readings, and log transporter terms in remote villages with zero network connection.
2. **Mandatory 7-Element Deal Pack**: Implements every single mandatory section with structured fields, commercial margin calculators, and underwriting decision scoring.
3. **Clarence Approval Authority (DEF-01)**: Server-enforced via PostgreSQL trigger `trg_enforce_mvtr_approval_permissions` and React role-gating. Field officers cannot self-approve; only Clarence / designated administrators can approve or reject records.
4. **Normalized Duplicate Counterparty Prevention (DEF-04)**: Enforced via PostgreSQL unique index `idx_parties_unique_normalized` on `(normalize_counterparty_name(name), normalize_district(district))` and repository-level 409 `DUPLICATE_COUNTERPARTY` conflict handling.

---

## 2. Seven Mandatory Deal Pack Elements

Every transaction record captures all seven mandatory Deal Pack elements without exception:

| Element | Description | Fields Captured | Business Rule Enforcement |
| :--- | :--- | :--- | :--- |
| **01. Buyer Requirements** | Purchasing mandate and technical specifications | Buyer name/party, commodity (Maize, Beans, Soybeans, Sorghum, Rice, Cassava), required tonnes, max moisture limit (%), quality grade (Grade 1/2), delivery district, delivery facility, target date, purchasing conditions. | Validated before review submission. Requires non-zero tonnage. |
| **02. Supplier Verification** | Physical field verification and quality testing | Supplier name/party, contact person, phone, district, location details, verification status (`REPORTED` vs `VERIFIED`), confirmed tonnes, **field moisture tester reading (%)**, verification date, officer name, evidence notes. | Strict separation between self-reported and physically verified stock; moisture probe reading required. |
| **03. Transport / Collection** | Logistics coordination and waybill tracking | Transport arrangement (`Company-arranged`, `Self-collection`, `Supplier-delivered`), collection point, destination facility, transporter identity and phone, volume moved, rate per tonne, total transport cost (UGX), collection status (`Planned`, `In transit`, `Delivered`, `Weighed at destination`), waybill ref. | Ensures haulage costs are established prior to margin sign-off. |
| **04. Payment Terms** | Commercial settlement schedule and payment security | Agreed price per kg (UGX), currency (`UGX`), payment method (Bank transfer, Mobile money, Cash against weighbridge ticket, Escrow), payment schedule, deposit requirement, deposit amount (UGX), outstanding balance (UGX), payment status (`Agreed`, `Reported paid`, `Verified paid`). | Strict verification barrier: "Reported paid" cannot be treated as "Verified paid" without confirmed banking clearance. |
| **05. CNG Fee / Margin** | Commercial fee structure and transaction net margin | Agreed CNG fee per tonne (default UGX 30,000/t), calculation basis, expected gross fee, direct operational costs (field fuel, testing/moisture probe, transport coordination, staff hours @ UGX 6,000/hr), **15% Deal Desk overhead allocation**, projected net margin. | **Minimum fee floor rule**: UGX 25,000 applied to any non-zero accepted volume below threshold; UGX 0 for zero tonnes. No silent or assumed numbers. |
| **06. Decision Matrix Score** | Quantitative underwriting risk assessment | 5 Real-world criteria scored 0 to 20 points (Total 0 to 100):<br>1. Counterparty Reliability & History (0-20)<br>2. Quality & Moisture Compliance (0-20)<br>3. Margin & Economic Feasibility (0-20)<br>4. Logistics & Route Certainty (0-20)<br>5. Payment Security & Terms Risk (0-20) | Automated recommendation:<br>• **Score ≥ 75**: *Recommended: Proceed*<br>• **Score 50–74**: *Conditional: Proceed with Mitigations*<br>• **Score < 50**: *High Risk: Do Not Proceed* |
| **07. Clarence Approval Status** | Server-enforced governance gate | Status (`Pending`, `Approved`, `Rejected`), approver identity, decision date/time, approver comments/conditions, rejection reason. | **Only Clarence or authorized administrator (`role = 'admin'`) can approve or reject.** Field officers are strictly barred by database trigger from modifying approval status. |

---

## 3. Offline-First Field Architecture & Sync Engine

Field officers in Northern Uganda frequently operate in areas with intermittent 2G/3G connectivity. The MVTR architecture guarantees zero data loss:

```
+-------------------------------------------------------------------------+
|                         FIELD DEVICE (BROWSER)                          |
|                                                                         |
|  +----------------------------+       +-------------------------------+ |
|  |  Field Officer Capture UI  | ----> |  assets/offlineStore.js       | |
|  |  (7-Element Deal Pack Form)|       |  (IndexedDB: CNG_OFFLINE_DB)  | |
|  +----------------------------+       +-------------------------------+ |
|                                                       |                 |
|                                                       v                 |
|                                       +-------------------------------+ |
|                                       |  Pending Sync Queue           | |
|                                       |  (client_id, pending_sync)    | |
|                                       +-------------------------------+ |
+-------------------------------------------------------|-----------------+
                                                        |
                                          [Online Event / Auto-Poll]
                                                        |
                                                        v
+-------------------------------------------------------------------------+
|                       SUPABASE CLOUD POSTGRESQL                         |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |  public.transactions                                              |  |
|  |  - client_id UUID UNIQUE (Idempotent upsert target)               |  |
|  |  - reference TEXT UNIQUE (TXN-YYYYMMDD-XXXX)                      |  |
|  |  - trg_enforce_mvtr_approval_permissions (Clarence Gate)          |  |
|  |  - Row Level Security (Authenticated Read/Write)                  |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

### Key Offline Features
- **Durable Local Storage (`assets/offline/offlineStore.js`)**: All transactions are stored in IndexedDB store `transactions` with keyed indexes on `client_id`, `reference`, `status`, `sync_status`, and `updated_at`.
- **Idempotent Synchronization (`assets/offline/syncEngine.js`)**: Every record is tagged with a client-generated UUID (`client_id`). The sync engine uses `upsert(payload, { onConflict: 'client_id' })`, ensuring repeated sync attempts never generate duplicate transactions.
- **Visual Connectivity & Sync Pill**: The application header displays real-time connection state (`Online` in emerald vs `Offline Mode (IndexedDB)` in amber), pending sync queue count, and a manual "Sync Cloud Now" retry trigger.
- **Audit History Log (`public.transaction_events`)**: Every lifecycle event (`FIELD_CAPTURED`, `SUBMITTED`, `APPROVED`, `REJECTED`, `SYNCED`) is recorded with actor name, timestamp, and metadata.
- **Offline Counterparty Cache**: Counterparties are cached in IndexedDB store `cached_parties`, enabling field officers to select buyers and suppliers while entirely offline.

---

## 4. Defect Remediation: DEF-01 & DEF-04

### DEF-01: Authentication Integrity & Access Control Remediation
- **Problem**: Insecure authentication bypasses and lack of server-side enforcement on approval transitions.
- **Solution**:
  1. All hardcoded operator bypasses (`usr_operator`) were completely expunged from all client bundles and repository code.
  2. Protected routes asynchronously verify Supabase Auth session tokens; unauthenticated requests redirect to `/login`.
  3. User profiles default strictly to `role = 'user'`. Trigger `trg_prevent_role_escalation` bars client-side role modifications.
  4. Trigger `trg_enforce_mvtr_approval_permissions` verifies `public.current_user_role() = 'admin'` whenever a transaction's approval status transitions to `Approved` or `Rejected`. Unauthorized attempts fail immediately with `PERMISSION_DENIED`.

### DEF-04: Duplicate Counterparty Prevention
- **Problem**: Inconsistent normalization allowed counterparties with minor casing or punctuation variations to be registered multiple times in the same district.
- **Solution**:
  1. Implemented deterministic normalization:
     - `normalizeCounterpartyName(name)`: lowercases, strips all punctuation and symbols (`[^\p{L}\p{N}\s]`), collapses multiple whitespace characters.
     - `normalizeDistrict(district)`: lowercases and trims district name.
  2. Enforced at PostgreSQL database level:
     ```sql
     CREATE UNIQUE INDEX idx_parties_unique_normalized
     ON public.parties (
       public.normalize_counterparty_name(name),
       public.normalize_district(district)
     );
     ```
  3. Handled in `assets/supabaseRepository.js` and frontend form: catches PostgreSQL constraint code `23505` and returns structured `{ code: 'DUPLICATE_COUNTERPARTY', status: 409 }` with human-readable error messages.

---

## 5. Automated Test Suite Results

Test execution ran on **Node.js v22.17.0** using `tests/supabase_cng_suite.test.js`:

```text
================================================================================
  CNG DEAL DESK ALPHA V2 — AUTOMATED VERIFICATION SUITE
  Timestamp : 2026-11-10T11:36:55.602Z
  Runtime   : Node.js v22.17.0
================================================================================

>>> [TEST-01] Evidence Gating - Stage 1 blocked when initial gates are unverified... PASSED
>>> [TEST-02] Evidence Gating - Stage 1 unlocks when all initial gates are VERIFIED... PASSED
>>> [TEST-03] Evidence Gating - Stage 3 blocks advance to Stage 4 without verified moisture test... PASSED
>>> [TEST-04] Auto-Regression - StageCap regresses Stage 4 back to Stage 1 if prior gate revoked... PASSED
>>> [TEST-05] Partial Acceptance - Desk verification fee scales strictly with accepted tonnes... PASSED
>>> [TEST-06] Partial Acceptance - Zero accepted tonnes produces UGX 0 fee... PASSED
>>> [TEST-07] Partial Acceptance - Sub-threshold tonnage enforces UGX 25,000 minimum fee floor... PASSED
>>> [TEST-08] Payment Statuses - Strict differentiation between Reported paid and Verified paid... PASSED
>>> [TEST-09] Market Intelligence - Observations without aggregate consent excluded from corridor averages... PASSED
>>> [TEST-10] Market Intelligence - Districts with < 3 verified sources flagged as gaps... PASSED
>>> [TEST-11] Counterparty Normalization - Correctly strips punctuation, extra spaces, and casing... PASSED
>>> [TEST-12] Duplicate Counterparty Rejection - Rejects duplicate party with DUPLICATE_COUNTERPARTY error... PASSED
>>> [TEST-13] Concurrent Submissions - Simulated concurrent duplicate attempts are blocked... PASSED
>>> [TEST-14] Security Audit - No hardcoded 'usr_operator' bypass in production bundle... PASSED
>>> [TEST-15] Security Audit - No exposed service_role key in frontend files or repository... PASSED
>>> [TEST-16] Security Audit - Profiles role escalation trigger defined in database migrations... PASSED
>>> [TEST-18] MVTR 7-Element Structure - Transaction record encapsulates all 7 mandatory Deal Pack sections... PASSED
>>> [TEST-19] MVTR Offline Storage - Durable IndexedDB/memory store captures records with pending_sync... PASSED
>>> [TEST-20] MVTR Sync Idempotency - Client-generated UUID prevents duplicates across retries... PASSED
>>> [TEST-21] DEF-01 Verification - Clarence approval trigger blocks non-admins from approving deals... PASSED
>>> [TEST-22] MVTR Commercial Calculations - Minimum fee floor UGX 25,000 and 15% overhead rule... PASSED
>>> [TEST-23] MVTR Decision Matrix - Underwriting thresholds enforce Proceed, Conditional, or Reject... PASSED
>>> [TEST-24] DEF-04 Verification - End-to-end duplicate counterparty detection with 409 DUPLICATE_COUNTERPARTY... PASSED
>>> [TEST-17] Vercel Configuration - vercel.json contains universal SPA rewrite rule... PASSED

================================================================================
  FINAL TEST SUMMARY: 24 PASSED | 0 FAILED | 0 SKIPPED
  Overall Success Rate: 100.0%
================================================================================
```

---

## 6. Deployment & Deliverables Verification

1. **Source Code & Migrations**:
   - `supabase/migrations/20261110000001_mvtr_transactions.sql`
   - `assets/offline/offlineStore.js`
   - `assets/offline/syncEngine.js`
   - `assets/transactions/TransactionModule.js`
   - `assets/supabaseRepository.js`
   - `assets/index-A159RRyL.js`
   - `scripts/build-check.js`
   - `tests/supabase_cng_suite.test.js`
2. **Production Hosting**: Vercel SPA (`https://cng-deal-desk-alpha.vercel.app`)
3. **Database Backend**: Supabase PostgreSQL (`https://kwivtzoimfvnhovrdrcz.supabase.co`)
4. **Git Branch & Commit**: Branch `main` on `https://github.com/AmicaDev/cng-deal-desk-alpha.git`
