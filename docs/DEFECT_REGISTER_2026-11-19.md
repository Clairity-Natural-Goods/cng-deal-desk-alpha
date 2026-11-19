# CNG DEAL DESK ALPHA V2 – MASTER DEFECT REGISTER

**Sprint Date:** 19 November 2026  
**Document Ref:** CNG-DEF-2026-11-19-01  
**Project:** CNG Deal Desk Alpha V2  
**Target Window:** Staging QA & Release Readiness  
**Lead QA:** Andrew / Collins  

---

## 1. Defect Classification & Triage Matrix

```
+-----------------------------------------------------------------------------------------------------------------------+
|                                              ACTIVE DEFECT & ISSUE REGISTER                                           |
+--------+----------+---------------------------------------------------+--------------+------------+-------------------+
| ID     | Severity | Summary                                           | Assigned     | Status     | Blocker Status    |
+--------+----------+---------------------------------------------------+--------------+------------+-------------------+
| DEF-01 | Critical | Incomplete records showing APPROVED/READY on UI   | Frontend Lead| RESOLVED   | Closed / Verified |
| DEF-02 | High     | Conflicting Saved vs Pending-Sync metrics on dash | Sync Lead    | RESOLVED   | Closed / Verified |
| DEF-03 | High     | Counterparty PII leakage risk across shared views | Security Lead| RESOLVED   | Closed / Verified |
| DEF-04 | Critical | Database readiness trigger bypass on direct API   | Database Lead| RESOLVED   | Closed / Verified |
| DEF-05 | High     | Ambiguity on Hard Reset impact on PostgreSQL data | Core Lead    | RESOLVED   | Closed / Verified |
| DEF-06 | Medium   | Browser reload restoring stale false-ready cache  | UI Lead      | RESOLVED   | Closed / Verified |
| DEF-07 | Medium   | Rice statutory moisture standard confirmation     | Compliance   | IN PROGRESS| Non-blocking *    |
| DEF-08 | Low      | Supabase CLI not in local Windows PATH            | DevOps       | WORKAROUND | Non-blocking **   |
+--------+----------+---------------------------------------------------+--------------+------------+-------------------+
```

*\* DEF-07 Note: Milled rice standard of 14.0% is configured as an explicit placeholder pending formal UNBS version publication. The system flags this in the UI while enforcing the rule.*  
*\*\* DEF-08 Note: Migrations are applied via Supabase Dashboard SQL Editor or CI/CD pipelines.*

---

## 2. Detailed Closure Records (DEF-01 through DEF-06)

### DEF-01: Incomplete Records Showing APPROVED or READY
- **Severity:** Critical (P0)
- **Reproduction:** Create draft with only commodity and tonnage; check supervisory checkbox or set status string to 'Approved'. Incomplete record previously showed green READY badge.
- **Root Cause:** UI badge renderer checked string `status` without cross-validating payload against `evaluateTransactionReadiness(tx)`.
- **Resolution:** `renderStatusBadge` in `TransactionModule.js` overrides display to amber `NOT READY ([N] Missing)` if any commercial prerequisite is omitted. Approval button disabled.
- **Verification Evidence:** Automated tests `FE-01` through `FE-06`. Status: **CLOSED**.

### DEF-02: Conflicting Saved vs Pending-Sync Badges
- **Severity:** High (P1)
- **Reproduction:** Save draft with good network connection; toast showed "Saved successfully" while dashboard pending sync counter incremented.
- **Root Cause:** `saveTransactionToSupabase` defaulted `sync_status = "pending_sync"` for Drafts.
- **Resolution:** Remote PostgreSQL write stamps `sync_status = "synced"`. Metric calculation updated to count only local offline queue records.
- **Verification Evidence:** Automated tests `FE-08` through `FE-10`, `PERSIST-05`. Status: **CLOSED**.

### DEF-03: Counterparty PII Leakage Risk
- **Severity:** High (P1)
- **Reproduction:** Open shared registry table or export CSV; unmasked phone numbers and counterparty legal names were visible to non-admins.
- **Root Cause:** Absence of deterministic pseudonymization in shared viewports.
- **Resolution:** Added `generateNeutralBuyerCode` (`Buyer B1`), `generateNeutralSupplierCode` (`Supplier S5`), `generateNeutralDealCode` (`Deal D012`), and `sanitizeTransactionForExport`.
- **Verification Evidence:** Automated tests `FE-12` through `FE-18`, `ID-01` through `ID-10`. Status: **CLOSED**.

### DEF-04: Database-Level Readiness Trigger Bypass
- **Severity:** Critical (P0)
- **Reproduction:** Direct REST POST to `/rest/v1/transactions` with `status = 'Approved'` on empty payload.
- **Root Cause:** Trigger only fired `BEFORE UPDATE` and checked user role but not deal completeness.
- **Resolution:** Created migration `20261117000001_enforce_readiness_and_approval_gates.sql`. Attached trigger `BEFORE INSERT OR UPDATE` validating moisture, fees, quotes, prices, and volumes.
- **Verification Evidence:** Automated tests `BE-01` through `BE-12`. Status: **CLOSED**.

### DEF-05: Ambiguity Regarding Hard Reset Impact
- **Severity:** High (P1)
- **Reproduction:** Operators feared clicking "Clear Local Storage & Reset" would delete live database records.
- **Root Cause:** Lack of technical audit documentation.
- **Resolution:** Inspected `ErrorBoundary` in `assets/index-A159RRyL.js`. Proved handler only calls `localStorage.clear()`, issuing 0 SQL mutations. Published `HARD_RESET_SAFETY_REPORT.md`.
- **Verification Evidence:** Automated test `BE-14`. Status: **CLOSED**.

### DEF-06: Browser Reload Restoring Stale Cache
- **Severity:** Medium (P2)
- **Reproduction:** Refresh browser on draft; cached flags restored false ready state.
- **Root Cause:** `refreshData()` failed to re-evaluate mathematical readiness dynamically.
- **Resolution:** Added dynamic `evaluateTransactionReadiness` execution to all hydrated records on reload.
- **Verification Evidence:** Automated test `FE-07`. Status: **CLOSED**.

---

## 3. Open Operational Items (DEF-07 & DEF-08)

### DEF-07: Rice Statutory Moisture Standard Confirmation
- **Severity:** Medium (P2)
- **Impact:** Trading rice requires confirmed statutory maximum to prevent dispute.
- **Current Behavior:** System uses 14.0% configurable placeholder, flagged with `isStatutoryPlaceholder: true`. Stricter buyer limits (e.g. 13.0%) take precedence.
- **Action Required:** Jovin to provide official UNBS Gazette standard number for milled rice.
- **Workaround:** Fully operational under configurable standard setting. Non-blocking.

### DEF-08: Supabase CLI in Local Path
- **Severity:** Low (P3)
- **Impact:** Cannot run `supabase migration list --linked` from local terminal without PATH configuration.
- **Workaround:** Migrations managed via Supabase Dashboard SQL Editor and Git CI/CD. Non-blocking.

---

**Master Defect Status:** Zero Critical (P0) or High (P1) Open Blockers. Ready for Staging.
