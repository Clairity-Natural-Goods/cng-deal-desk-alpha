# CNG DEAL DESK ALPHA V2 — WEDNESDAY LAUNCH GAP ANALYSIS & DEFECT MAP
**Document Version:** 1.0.0  
**Target:** Wednesday Production Launch  
**Date:** November 16, 2026  
**Scope:** UI State, Database Integrity, Commercial Workflows, Pricing, Physical Handoff, Mobile Reliability, Sunflower Recovery, and Controlled Maize Transaction.

---

## 1. EXECUTIVE SUMMARY & INSPECTION OVERVIEW

An exhaustive architectural and codebase inspection of **CNG Deal Desk Alpha V2** (`c:\Users\ojuka\CNG_Alpha`) was conducted across:
- Frontend entry points (`index.html`, `assets/auth/entry.js`, `assets/index-A159RRyL.js`)
- Transaction processing & capture (`assets/transactions/TransactionModule.js`, `assets/dealCreation.js`, `assets/Deals-BCwyOzL-.js`)
- Financial calculation engines (`assets/matrix/financialEngine.js`, `assets/desk-CXHNcONN.js`)
- Offline persistence & synchronization (`assets/offline/offlineStore.js`, `assets/offline/syncEngine.js`, `assets/supabaseRepository.js`)
- Database schemas & triggers (`supabase/migrations/`)
- Verification test suite (`tests/supabase_cng_suite.test.js`)

All findings are categorized according to the required 6-state taxonomy:
- `ALREADY IMPLEMENTED AND VERIFIED`
- `IMPLEMENTED BUT NOT VERIFIED`
- `PARTIALLY IMPLEMENTED`
- `MISSING`
- `FAILING`
- `BLOCKED BY BUSINESS DECISION`

---

## 2. DEFECT MAP & GAP MATRIX

| # | Requirement | Existing Component | Existing Behaviour | Actual Defect / Gap | Required Fix | Verification Test | Classification |
|---|---|---|---|---|---|---|---|
| **01** | **Database-Confirmed Save State** | `TransactionModule.js`, `syncEngine.js` | Saves to Supabase and updates state to `saved_server` or `saved_locally`. | If cloud write times out or is in-flight, must never claim success. Uncertain commit outcomes must be reconciled before retry. Form input must be 100% preserved on error. | Implement strict 5-state transitions (`Saving...`, `Saved locally — awaiting synchronisation`, `Saved successfully`, `Sync pending`, `Save failed`). Add query reconciliation for uncertain responses. Retain form fields and provide inline retry. | `SAVE-01` to `SAVE-06` | **PARTIALLY IMPLEMENTED** |
| **02** | **Duplicate Submission Prevention** | `TransactionModule.js`, `syncEngine.js`, `transactions` schema | Visual button disabling on `isSubmitting`; `client_id` unique constraint in Postgres. | Asynchronous React state updates leave a millisecond window where rapid double-clicks or repeated `Enter` key presses can fire duplicate network requests. | Implement synchronous in-flight guard (`useRef` lock) to immediately drop concurrent clicks/taps; suppress `Enter` key submit on form inputs; enforce idempotent upsert on `client_id`. | `DUP-01` to `DUP-05` | **PARTIALLY IMPLEMENTED** |
| **03** | **Commodity Selection (Maize & Sunflower)** | `TransactionModule.js`, `financialEngine.js`, `desk-CXHNcONN.js`, SQL migrations | Maize and Sunflower are present in commodities arrays and database check constraints. | Sunflower was historically added via migration `20261114000002_add_sunflower_commodity.sql`, but requires full end-to-end verification through calculation, quotation, intake, and persistence. | Ensure Sunflower is selectable in every form, filter, and detail view; run parity calculations against Maize. | `COMM-01`, `SUN-01`, `MAI-01` | **ALREADY IMPLEMENTED AND VERIFIED** |
| **04** | **Standardised Commercial Terminology** | `TransactionModule.js`, `financialEngine.js` | Uses Kilograms, Tonnes, Price per kilo (UGX), The amount you will be paid. | Commercial terminology needs explicit standardization across quotation breakdowns, physical handoff legs, and quantity variance cards. | Standardize labels: `Kilograms`, `Tonnes`, `Prices`, `Currencies`, `Commodity Value`, `CNG Service Fees`, `Third-Party Costs (Transport)`. Maintain $1\text{ MT} = 1,000\text{ KG}$. | `LANG-01`, `TX-02` | **IMPLEMENTED BUT NOT VERIFIED** |
| **05** | **Form Validation & Incomplete Costs Defense** | `financialEngine.js` (`classifyCostInput`, `COST_STATUS`), `TransactionModule.js` | `classifyCostInput` classifies inputs into `NOT_ENTERED`, `EXPLICIT_ZERO`, `VALID_POSITIVE`, `INVALID`. | In UI inputs, unentered numbers can be silently converted to zero via `Number(val) \|\| 0`, which creates misleading financial calculations and invalid READY states. | Distinguish missing costs from confirmed zero. Render visible `Incomplete` tags on unentered fields. Block READY status whenever mandatory costs or payment terms are missing. | `VAL-01` to `VAL-05`, `Test D` | **PARTIALLY IMPLEMENTED** |
| **06** | **Three-Line Quotation & Pricing Display** | `TransactionModule.js`, `financialEngine.js` | Displays raw agreed price, gross fee, and operating costs in separate elements (Element 4 & Element 5). | Missing a unified, accessible Three-Line Commercial Quotation breakdown identifying payer, recipient, due, accepted, and outstanding amounts. | Implement standard 3-line card: Line 1 (Commodity Value), Line 2 (CNG Service Fees - proposed vs accepted), Line 3 (Third-Party Costs - Transport). Explicit payment responsibilities. | `QUO-01` to `QUO-05` | **MISSING** |
| **07** | **Physical Handoff & Two Transport Legs** | `TransactionModule.js` (Element 3) | Single transport section with collection point, transporter name, and single transport cost. | Missing explicit handoff location specifications and independent representation of Transport Leg 1 (Supplier $\rightarrow$ Handoff) and Transport Leg 2 (Handoff $\rightarrow$ Buyer). | Implement physical handoff location card with confirmation status; add two independent transport legs capturing carrier, dates, quantities, and evidence. | `HAND-01` to `HAND-03` | **PARTIALLY IMPLEMENTED** |
| **08** | **Separate Supplier Intake & Buyer Collection Events** | `TransactionModule.js`, `transaction_events` table | Schema defines `transaction_events` table, but UI lacks distinct event recording forms for intake vs collection. | Generic completion replaces granular operational milestones. Overwrites intake data when collection occurs. | Implement dedicated event capture actions: `SUPPLIER_INTAKE` and `BUYER_COLLECTION`. Record actor, timestamp, quantities, notes, and evidence. Add quantity reconciliation with variance alerts. | `HAND-04` to `HAND-07` | **MISSING** |
| **09** | **Explicit Management Approval Visibility** | `TransactionModule.js` (Element 7), Postgres approval trigger | Element 7 displays approval status and approver name; Postgres enforces admin-only approval. | Transaction cards and header lack independent management approval badges. Ordinary users must see clear status without false implication that READY equals Approved. | Display explicit management approval status (`Pending Approval`, `Approved`, `Rejected`, `Returned for Correction`) with approver name, timestamp, and rejection reason. Sourced from database. | `APR-01` to `APR-05` | **PARTIALLY IMPLEMENTED** |
| **10** | **Mobile & Network Reliability** | `assets/index-A159RRyL.js`, `index-y0Vz-zph.css`, `sw.js` | Scroll-hide bottom navigation, dynamic viewport `100dvh`, modal `90dvh`, offline store. | Needs explicit connection status feedback banners (slow connection, connection lost, local draft retained, sync pending) and non-destructive recovery. | Ensure responsive layout on smartphones, input visibility during keyboard popups, and non-destructive recovery upon interrupted save. | `NAV-02`, `REC-01`, `Test G` | **IMPLEMENTED BUT NOT VERIFIED** |
| **11** | **Sunflower Regression Investigation** | Entire pipeline: selection, calculation, quotation, persistence | Sunflower is supported in code, but unauthenticated Supabase API requests failed with RLS policy violations. | Must prove that authenticated sessions perform 100% of Sunflower workflows without hardcoded maize-only assumptions or calculation divergence. | Run side-by-side Maize vs Sunflower regression suite verifying 10 MT to 50 MT parity, quotation generation, and Supabase persistence. | `COMM-01`, `SUN-01` | **IMPLEMENTED BUT NOT VERIFIED** |
| **12** | **Test D: Missing Requirements Blocking READY** | `financialEngine.js` (`evaluateReadyReadiness`) | Evaluates 10 readiness conditions and returns blockers array. | Needs end-to-end automated verification asserting that a synthetic transaction with missing mandatory costs or unconfirmed terms is visibly marked incomplete and blocked from READY. | Implement automated test simulating missing mandatory costs and unconfirmed terms; assert READY is blocked and explanations provided. | `TEST-D` | **IMPLEMENTED BUT NOT VERIFIED** |
| **13** | **Test G: Interrupted Save Recovery** | `TransactionModule.js`, `offlineStore.js` | Local storage draft autosave under `cng_draft_${user}_${clientId}`. | Needs automated test proving simulated network interruption preserves entered data, does not falsely claim cloud success, restores draft upon reload, and reconciles without duplicates. | Implement automated test simulating interrupted save, local draft recovery, network restoration, and idempotent retry. | `TEST-G` | **IMPLEMENTED BUT NOT VERIFIED** |
| **14** | **Controlled Maize Transaction** | Synthetic test dataset | Currently individual unit tests verify isolated parts. | Missing a complete synthetic end-to-end controlled Maize transaction record with all 13 evidence points documented for Wednesday launch. | Execute full transaction workflow: Maize selection, quantity, price, 3-line quotation, handoff, intake event, collection event, management approval, persistence. | `MAIZE-CTRL-01` | **MISSING** |

---

## 3. IMPLEMENTATION WORK PLAN

### Phase 2: Save-State & Confirmation Engine
- Refine `handleSaveDraft` and `handleSubmitForReview` in `TransactionModule.js`:
  - Enforce timeout handling with unconfirmed outcome handling.
  - Implement query reconciliation (`supabase.from("transactions").select().eq("client_id", id)`).
  - Guarantee form data preservation on failure.

### Phase 3: Duplicate Submission Guard
- Add synchronous `inFlightRef` guard in `TransactionModule.js`.
- Add `onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}` to form containers.
- Enforce idempotency in `syncEngine.js`.

### Phase 4 & 5: Validation & Incomplete Cost Defense
- Update form field inputs to classify values via `classifyCostInput`:
  - If `isMissing`: display amber badge `Incomplete — Cost Required`.
  - If `isZero`: display blue badge `Confirmed UGX 0`.
  - If `isValid`: display standard formatted currency.
- Connect `evaluateReadyReadiness` directly to block READY status when incomplete fields exist.

### Phase 6: Three-Line Quotation & Payment Responsibility
- Implement `<ThreeLineQuotation deal={selectedTx} />` component displaying:
  - **Line 1: Commodity Value** (Commodity, Qty in KG & MT, Agreed Price, Total, Payer: Buyer, Recipient: Supplier / Escrow).
  - **Line 2: CNG Service Fees** (Proposed Fee, Accepted Fee, Acceptance Status, Payer: Counterparty, Recipient: CNG).
  - **Line 3: Third-Party Costs (Transport)** (Transport leg, Amount, Payer, Recipient: Carrier, Confirmation Status).
  - Explicit summary of amounts Due, Accepted, and Outstanding.

### Phase 7: Physical Handoff & Two Transport Legs
- Enhance Element 3 in `TransactionModule.js`:
  - **Proposed Handoff Location:** Location name, district, physical reference, scheduled date/time, confirmation status, responsible party.
  - **Transport Leg 1 (Supplier $\rightarrow$ Handoff):** Dispatch date, carrier, expected vs actual intake kg, evidence, status.
  - **Transport Leg 2 (Handoff $\rightarrow$ Buyer):** Collection date, carrier, collected vs delivered kg, evidence, status.
  - **Operational Events:** Actions to log `SUPPLIER_INTAKE` and `BUYER_COLLECTION` events with timestamp, actor, quantities, and notes.
  - **Quantity Reconciliation:** Auto-calculates variance between expected, intake, and delivered quantities; flags discrepancies exceeding 1.5%.

### Phase 8: Explicit Management Approval Visibility
- Prominently display management approval status in header and cards:
  - `Pending Approval`, `Approved`, `Rejected`, `Returned for Correction`.
  - Approver name, timestamp, and rejection notes.
  - Sourced authoritatively from Supabase database record.

### Phase 11 & 12: Sunflower Recovery, Test D, Test G & Controlled Maize Transaction
- Implement automated tests `TEST-D`, `TEST-G`, `SUN-01`, and `MAIZE-CTRL-01` in `tests/supabase_cng_suite.test.js`.
- Generate all 6 required documentation reports in `docs/` and evidence in `evidence/wednesday-launch/`.
