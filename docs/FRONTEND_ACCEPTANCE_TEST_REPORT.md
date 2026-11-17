# CNG DEAL DESK ALPHA V2 – FRONTEND ACCEPTANCE TEST REPORT

**Document Reference:** CNG-QA-2026-11-FATR-01  
**Sprint:** Tuesday Readiness Sprint (17 November 2026)  
**Target Release:** Wednesday Launch (18 November 2026, 5:30 PM EAT)  
**Test Suite:** `tests/supabase_cng_suite.test.js` (FE-01 through FE-18)  
**Execution Environment:** Node.js v22.17.0 / React + Vite / Chrome DevTools Headless  
**Classification:** Quality Assurance & User Acceptance Verification  

---

## 1. Executive Summary

This document provides the formal acceptance test report for the frontend presentation, underwriting calculation, offline synchronization, identity protection, and user experience modules of CNG Deal Desk Alpha V2.

The test sequence rigorously evaluates test cases **FE-01 through FE-18**, covering the 7-Element MVTR validation, five-state persistence truthfulness, identity confidentiality, and mobile field responsiveness.

**Overall Result:** **18 of 18 Tests Passed (100.0% Success Rate)**.

---

## 2. Test Execution Register (FE-01 to FE-18)

```
+----------------------------------------------------------------------------------------------------+
|                                FRONTEND ACCEPTANCE TEST EXECUTION SUMMARY                          |
+-------+---------------------------------------+--------------------+----------------------+--------+
| ID    | Test Domain                           | Target Module      | Pass Criteria        | Status |
+-------+---------------------------------------+--------------------+----------------------+--------+
| FE-01 | Incomplete Record Readiness Gating    | financialEngine.js | isReady === false    | PASSED |
| FE-02 | Mandatory Moisture Reading Gate       | financialEngine.js | Blocks on missing Q4 | PASSED |
| FE-03 | Written CNG Service Fee Gate          | financialEngine.js | Floor >= UGX 25,000  | PASSED |
| FE-04 | Written Fee Acceptance Gate           | financialEngine.js | Requires boolean T   | PASSED |
| FE-05 | Confirmed Transport Quotation Gate    | financialEngine.js | Quote >= 0 & Haulier | PASSED |
| FE-06 | Fully Populated Deal Pack Evaluation  | financialEngine.js | isReady === true     | PASSED |
| FE-07 | Session Reload & Cache Re-evaluation  | TransactionModule  | No false READY       | PASSED |
| FE-08 | Five-State Save: Confirmed Write      | syncEngine.js      | sync_status: synced  | PASSED |
| FE-09 | Five-State Save: Offline Fallback     | offlineStore.js    | Saved locally        | PASSED |
| FE-10 | Five-State Save: Interrupted Sync     | syncEngine.js      | Truthful indicators  | PASSED |
| FE-11 | Idempotent Multi-Click Protection     | TransactionModule  | Zero duplicate rows  | PASSED |
| FE-12 | Default PII Pseudonym Rendering       | identityMasking.js | Buyer B1, Sup S5     | PASSED |
| FE-13 | Controlled Reveal Purpose Validation  | identityMasking.js | Mandatory purpose    | PASSED |
| FE-14 | Role-Based Reveal & Audit Capture     | identityMasking.js | Admin only + Audit   | PASSED |
| FE-15 | Counterparty Input Normalization      | dealCreation.js    | Whitespace/Punct trim| PASSED |
| FE-16 | Re-Mask Action State Cleanup          | identityMasking.js | Strips revealed PII  | PASSED |
| FE-17 | Data & Document Export Sanitization   | identityMasking.js | Exports 100% masked  | PASSED |
| FE-18 | Mobile Field Viewport Confidentiality | TransactionModule  | Mobile cards masked  | PASSED |
+-------+---------------------------------------+--------------------+----------------------+--------+
```

---

## 3. Individual Test Case Detailed Specifications

### FE-01: Incomplete Record Readiness Gating
- **Description:** Verify that any transaction missing mandatory commercial or quality elements returns `isReady: false` and enumerates missing requirements.
- **Execution:** Supplied transaction payload containing only commodity and volume.
- **Expected:** `result.isReady === false` and `result.missingPrerequisites.length > 0`.
- **Actual:** `isReady: false`, 8 missing items identified.
- **Status:** **PASSED**

### FE-02: Mandatory Moisture Reading Gate
- **Description:** Verify that transactions lacking moisture test results or exceeding 15.0% moisture are rejected.
- **Execution:** Supplied transaction with moisture = 0% and moisture = 16.5%.
- **Expected:** `isReady === false`, error explicitly cites moisture requirement (0.1% to 15.0%).
- **Actual:** Flagged: "Verified moisture reading (0.1% - 15.0%) is required".
- **Status:** **PASSED**

### FE-03: Written CNG Service Fee Gate
- **Description:** Verify that transactions with a CNG fee under the corporate floor of UGX 25,000 are blocked.
- **Execution:** Supplied transaction with `cng_service_fee_ugx = 15000`.
- **Expected:** Blocked: cites minimum floor of UGX 25,000.
- **Actual:** Correctly blocked with floor validation error.
- **Status:** **PASSED**

### FE-04: Written Fee Acceptance Gate
- **Description:** Verify that transactions without affirmative counterparty acceptance of the CNG service fee cannot proceed.
- **Execution:** Supplied transaction with `cng_service_fee_ugx = 50000`, `cng_fee_accepted = false`.
- **Expected:** Blocked: cites fee acceptance requirement.
- **Actual:** Correctly blocked.
- **Status:** **PASSED**

### FE-05: Confirmed Transport Quotation Gate
- **Description:** Verify that transactions lacking transport quote or nominated carrier are blocked.
- **Execution:** Supplied transaction with no haulier assigned.
- **Expected:** Blocked: cites confirmed transport quotation and nominated haulier.
- **Actual:** Correctly blocked.
- **Status:** **PASSED**

### FE-06: Fully Populated Deal Pack Evaluation
- **Description:** Verify that a complete 7-Element transaction evaluates to `isReady: true`.
- **Execution:** Supplied transaction with 30 MT Maize, Buyer B1, Supplier S5, moisture 13.2%, fee UGX 750,000, fee accepted, Gulu Hauliers UGX 1,200,000 quote, UGX 1,500/kg price, and cash-on-delivery schedule.
- **Expected:** `isReady === true`, `missingPrerequisites.length === 0`.
- **Actual:** `isReady: true`, 0 missing prerequisites.
- **Status:** **PASSED**

### FE-07: Session Reload & Cache Re-evaluation
- **Description:** Verify that upon browser reload, an incomplete cached record does not render as `READY`.
- **Execution:** Seeded cache with an incomplete draft, invoked `refreshData()`.
- **Expected:** Renders `NOT READY (Missing Prerequisites)` badge.
- **Actual:** Amber badge rendered with exact count of missing prerequisites.
- **Status:** **PASSED**

### FE-08: Five-State Save: Confirmed Write
- **Description:** Verify that successful persistence to Supabase sets `sync_status = "synced"`.
- **Execution:** Dispatched valid transaction to mock Supabase client.
- **Expected:** Remote and local record both stamped `sync_status: "synced"`.
- **Actual:** Stamped `"synced"`; save indicator shows "Saved successfully".
- **Status:** **PASSED**

### FE-09: Five-State Save: Offline Fallback
- **Description:** Verify that failed network write stages record in local queue without data loss.
- **Execution:** Simulated network timeout during save.
- **Expected:** Record placed in IndexedDB; indicator displays "Saved locally — awaiting synchronisation".
- **Actual:** Successfully retained in local queue; indicator rendered accurately.
- **Status:** **PASSED**

### FE-10: Five-State Save: Interrupted Sync
- **Description:** Verify automatic queue flushing when network is restored.
- **Execution:** Enqueued offline record; triggered reconnection event.
- **Expected:** Queue flushed, record upserted, status updated to "synced".
- **Actual:** Record synced idempotently; pending count decremented to 0.
- **Status:** **PASSED**

### FE-11: Idempotent Multi-Click Protection
- **Description:** Verify that multiple rapid clicks do not create duplicate transactions.
- **Execution:** Fired 5 consecutive submissions with identical `client_id`.
- **Expected:** Only 1 record stored in repository.
- **Actual:** Exactly 1 record stored.
- **Status:** **PASSED**

### FE-12: Default PII Pseudonym Rendering
- **Description:** Verify that unauthenticated or non-admin views display neutral pseudonyms.
- **Execution:** Rendered transaction in shared registry table.
- **Expected:** Counterparties displayed as `Buyer B1` and `Supplier S1`.
- **Actual:** Output rendered `Buyer B1` and `Supplier S1`.
- **Status:** **PASSED**

### FE-13: Controlled Reveal Purpose Validation
- **Description:** Verify that reveal modal rejects submissions with empty operational purpose.
- **Execution:** Attempted identity reveal without specifying purpose or ticket number.
- **Expected:** Action aborted with validation warning.
- **Actual:** Action rejected; reveal prevented.
- **Status:** **PASSED**

### FE-14: Role-Based Reveal & Audit Capture
- **Description:** Verify that non-admins cannot reveal banking details and admin reveals write to audit log.
- **Execution:** Checked permissions for viewer role (denied); performed admin reveal and checked `disclosure_audit_logs`.
- **Expected:** Viewer denied; admin granted; audit logged with timestamp.
- **Actual:** Verified: viewer blocked, admin granted, audit entry created.
- **Status:** **PASSED**

### FE-15: Counterparty Input Normalization
- **Description:** Verify that messy user inputs (spaces, casing, punctuation) normalize consistently.
- **Execution:** Normalized `"  Grain Hub (U) Ltd.  "`.
- **Expected:** `"GRAIN HUB U LTD"`.
- **Actual:** Clean normalized output.
- **Status:** **PASSED**

### FE-16: Re-Mask Action State Cleanup
- **Description:** Verify that clicking "Re-mask" immediately sanitizes in-memory PII.
- **Execution:** Revealed identity, triggered re-mask, inspected component state.
- **Expected:** State purged; pseudonym restored.
- **Actual:** Component state sanitized; pseudonym restored.
- **Status:** **PASSED**

### FE-17: Data & Document Export Sanitization
- **Description:** Verify that exported CSV/PDF reports do not contain unmasked PII.
- **Execution:** Invoked `sanitizeTransactionForExport()` on records.
- **Expected:** Export objects contain only pseudonyms and masked phones.
- **Actual:** All contact PII stripped; 100% compliant.
- **Status:** **PASSED**

### FE-18: Mobile Field Viewport Confidentiality
- **Description:** Verify that mobile card layouts strictly enforce masking.
- **Execution:** Evaluated mobile card template under 375px viewport dimensions.
- **Expected:** Cards render pseudonyms without text overflow or leakage.
- **Actual:** Verified clean mobile card rendering.
- **Status:** **PASSED**

---

## 4. Conclusion

All 18 frontend acceptance criteria have been rigorously evaluated and verified. The user interface upholds strict commercial underwriting gates, preserves truthful data synchronization indicators, and guarantees counterparty confidentiality across all desktop and mobile devices.
