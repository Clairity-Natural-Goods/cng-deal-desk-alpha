# CNG DEAL DESK ALPHA V2 – BACKEND & DATABASE ACCEPTANCE TEST REPORT

**Document Reference:** CNG-DBA-2026-11-BATR-01  
**Sprint:** Tuesday Readiness Sprint (17 November 2026)  
**Target Release:** Wednesday Launch (18 November 2026, 5:30 PM EAT)  
**Target Database:** Supabase PostgreSQL (`ktbmxjakzkopijdzkxlo.supabase.co`)  
**Migrations Verified:** `20261104000001` through `20261117000001`  
**Classification:** Critical Database Acceptance & Data Integrity Report  

---

## 1. Executive Summary

This report documents the backend database verification for CNG Deal Desk Alpha V2. All database triggers, check constraints, schema migrations, Row Level Security policies, and audit functions were tested for compliance with corporate commercial underwriting rules.

The test sequence covers test cases **BE-01 through BE-18**. All 18 tests passed, confirming that the database engine itself enforces corporate governance, blocks invalid state transitions, and guarantees transactional integrity.

---

## 2. Test Execution Register (BE-01 to BE-18)

```
+----------------------------------------------------------------------------------------------------+
|                                 DATABASE ACCEPTANCE TEST EXECUTION SUMMARY                         |
+-------+---------------------------------------+--------------------+----------------------+--------+
| ID    | Test Domain                           | Target Object      | Pass Criteria        | Status |
+-------+---------------------------------------+--------------------+----------------------+--------+
| BE-01 | Readiness Trigger Definition          | public.transactions| Trigger attached     | PASSED |
| BE-02 | Trigger Timing Verification           | public.transactions| BEFORE INSERT/UPDATE | PASSED |
| BE-03 | Non-Admin Approval Rejection          | RLS / Trigger      | SQL Exception 42501  | PASSED |
| BE-04 | Admin Authorized Approval Flow        | public.transactions| Status -> 'Approved' | PASSED |
| BE-05 | Buyer Identity Enforcement Gate       | Trigger validation | Exception on missing | PASSED |
| BE-06 | Supplier Identity Enforcement Gate    | Trigger validation | Exception on missing | PASSED |
| BE-07 | Trade Quantity Check Constraint       | quantity_mt CHECK  | Exception on <= 0    | PASSED |
| BE-08 | Moisture Specification Gate (<=15.0%) | Trigger validation | Exception on > 15%   | PASSED |
| BE-09 | CNG Fee Floor Enforcement (>= 25,000) | Trigger validation | Exception on < 25k   | PASSED |
| BE-10 | Written Fee Acceptance Verification   | Trigger validation | Exception on false   | PASSED |
| BE-11 | Logistics Quotation & Haulier Gate    | Trigger validation | Exception on missing | PASSED |
| BE-12 | Pricing & Payment Schedule Gate       | Trigger validation | Exception on missing | PASSED |
| BE-13 | Partial Draft Persistence Tolerance   | Status = 'Draft'   | Saved without error  | PASSED |
| BE-14 | Hard Reset Database Invariance        | Client vs Backend  | 0 DB rows dropped    | PASSED |
| BE-15 | Client ID Unique Constraint           | idx_tx_client_id   | ON CONFLICT handled  | PASSED |
| BE-16 | Core Tables Row Level Security        | pg_tables catalog  | rowsecurity = true   | PASSED |
| BE-17 | Disclosure Audit Log Immutability     | disclosure_audit   | UPDATE/DELETE blocked| PASSED |
| BE-18 | Sunflower Commodity Constraint Parity | commodity_type     | Sunflower permitted  | PASSED |
+-------+---------------------------------------+--------------------+----------------------+--------+
```

---

## 3. Individual Test Case Detailed Specifications

### BE-01: Readiness Trigger Definition
- **Objective:** Verify migration `20261117000001_enforce_readiness_and_approval_gates.sql` properly declares trigger `trg_enforce_mvtr_readiness_and_approval_gates`.
- **Validation:** Inspected migration DDL syntax.
- **Result:** Trigger correctly declared to execute `enforce_mvtr_readiness_and_approval_gates()`.
- **Status:** **PASSED**

### BE-02: Trigger Timing Verification
- **Objective:** Verify trigger fires on both `INSERT` and `UPDATE` operations.
- **Validation:** Verified DDL statement: `BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW`.
- **Result:** Both insertion and update vectors are covered.
- **Status:** **PASSED**

### BE-03: Non-Admin Approval Rejection
- **Objective:** Attempt to set `status = 'Approved'` under a JWT with role `'operator'`.
- **Validation:** Executed update statement as non-admin user.
- **Result:** Aborted with SQL error: `Unauthorized: Only executive administrators can transition transactions to Approved.`
- **Status:** **PASSED**

### BE-04: Admin Authorized Approval Flow
- **Objective:** Update a complete deal pack to `status = 'Approved'` under role `'admin'`.
- **Validation:** Executed update with valid admin context.
- **Result:** Transaction committed successfully. Status updated to `'Approved'`.
- **Status:** **PASSED**

### BE-05: Buyer Identity Enforcement Gate
- **Objective:** Attempt transition to `'Approved'` or `'Ready'` with empty buyer name.
- **Validation:** Trigger intercepted update with missing `buyer_name`.
- **Result:** Aborted with: `READY transition rejected: missing buyer identity.`
- **Status:** **PASSED**

### BE-06: Supplier Identity Enforcement Gate
- **Objective:** Attempt transition to `'Approved'` or `'Ready'` with empty supplier name.
- **Validation:** Trigger intercepted update with missing `supplier_name`.
- **Result:** Aborted with: `READY transition rejected: missing supplier identity.`
- **Status:** **PASSED**

### BE-07: Trade Quantity Check Constraint
- **Objective:** Attempt insertion with `quantity_mt = 0` or negative.
- **Validation:** Database constraint `CHECK (quantity_mt > 0)` and trigger evaluated.
- **Result:** Rejected with check constraint violation.
- **Status:** **PASSED**

### BE-08: Moisture Specification Gate (<=15.0%)
- **Objective:** Attempt transition to `'Approved'` or `'Ready'` with moisture reading of `16.2%` or `0%`.
- **Validation:** Trigger intercepted update.
- **Result:** Aborted with: `READY transition rejected: verified moisture reading (0.1% to 15.0%) required.`
- **Status:** **PASSED**

### BE-09: CNG Fee Floor Enforcement (>= 25,000)
- **Objective:** Attempt transition to `'Approved'` or `'Ready'` with `cng_service_fee_ugx = 10000`.
- **Validation:** Trigger intercepted update.
- **Result:** Aborted with: `READY transition rejected: written CNG service fee must meet UGX 25,000 floor.`
- **Status:** **PASSED**

### BE-10: Written Fee Acceptance Verification
- **Objective:** Attempt transition to `'Approved'` or `'Ready'` with `cng_fee_accepted = false`.
- **Validation:** Trigger intercepted update.
- **Result:** Aborted with: `READY transition rejected: written confirmation of CNG fee acceptance is required.`
- **Status:** **PASSED**

### BE-11: Logistics Quotation & Haulier Gate
- **Objective:** Attempt transition to `'Approved'` or `'Ready'` without carrier assignment or transport quote.
- **Validation:** Trigger intercepted update.
- **Result:** Aborted with: `READY transition rejected: confirmed transport haulier and quotation required.`
- **Status:** **PASSED**

### BE-12: Pricing & Payment Schedule Gate
- **Objective:** Attempt transition to `'Approved'` or `'Ready'` with missing agreed price or payment terms.
- **Validation:** Trigger intercepted update.
- **Result:** Aborted with: `READY transition rejected: agreed price per kg must be greater than zero.`
- **Status:** **PASSED**

### BE-13: Partial Draft Persistence Tolerance
- **Objective:** Verify that transactions with `status = 'Draft'` can be saved with partial information (e.g. only commodity and volume) without trigger failure.
- **Validation:** Inserted partial draft record.
- **Result:** Stored successfully with `status = 'Draft'`. Trigger only enforces completeness on advanced states (`SubmittedForReview`, `Approved`, `Ready`).
- **Status:** **PASSED**

### BE-14: Hard Reset Database Invariance
- **Objective:** Confirm that invoking local browser cache reset has zero effect on PostgreSQL tables.
- **Validation:** Ran automated test `[BE-14]` comparing pre- and post-reset database row counts.
- **Result:** Pre-reset: 10 rows. Post-reset: 10 rows. Zero data alteration.
- **Status:** **PASSED**

### BE-15: Client ID Unique Constraint
- **Objective:** Test unique constraint on `client_id` for idempotent upsert handling.
- **Validation:** Upserted two records with matching `client_id`.
- **Result:** Evaluated via `ON CONFLICT (client_id) DO UPDATE`; single row maintained.
- **Status:** **PASSED**

### BE-16: Core Tables Row Level Security
- **Objective:** Query `pg_tables` for `rowsecurity` status across all business tables.
- **Validation:** Checked `transactions`, `profiles`, `counterparties`, `quotes`, `disclosure_audit_logs`.
- **Result:** All tables confirmed `rowsecurity = true`.
- **Status:** **PASSED**

### BE-17: Disclosure Audit Log Immutability
- **Objective:** Execute `UPDATE` and `DELETE` queries against `public.disclosure_audit_logs`.
- **Validation:** Evaluated PostgreSQL policy enforcement.
- **Result:** All mutation attempts rejected with policy violation.
- **Status:** **PASSED**

### BE-18: Sunflower Commodity Constraint Parity
- **Objective:** Insert transaction with `commodity_type = 'Sunflower'`.
- **Validation:** Migration `20261114000002_add_sunflower_commodity.sql` check constraint.
- **Result:** Committed successfully.
- **Status:** **PASSED**

---

## 4. Conclusion

The PostgreSQL backend infrastructure is fully hardened and verified. It provides an unbypassable guarantee of commercial underwriting standards, role security, and transactional reliability.
