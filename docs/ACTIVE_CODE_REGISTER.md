# CNG DEAL DESK ALPHA V2 – ACTIVE CODE REGISTER
**Sprint Date:** Tuesday, 17 November 2026  
**Code Freeze Deadline:** Wednesday, 18 November 2026 – 5:30 PM (East Africa Time)  
**Lead Coordinator:** Collins / Technical Lead  
**Active Production Branch:** `main` (commit `90cc428`)  
**Repository:** `https://github.com/Clairity-Natural-Goods/cng-deal-desk-alpha`  
**Supabase Production Project:** `https://ktbmxjakzkopijdzkxlo.supabase.co`  
**Production Hosting:** `https://cng-deal-desk-alpha-rose.vercel.app/`  

---

## 1. Directive Acknowledgement & Mandate Confirmation

The technical implementation team formally confirms:
1. **Total Feature Freeze:** A total feature freeze is in effect until Wednesday, 18 November 2026, 5:30 PM EAT. No new features, workflow rewrites, or framework migrations will be undertaken.
2. **Authorized Scope:** Activities are restricted strictly to defect remediation, readiness validation, persistence verification, security/confidentiality audits, and evidence generation.
3. **Frontend & Backend Coordination:** State-machine transitions and readiness gates are enforced symmetrically across the React UI and PostgreSQL database layers.
4. **Mandatory Evidence:** No defect will be marked fixed without reproducible automated or manual test evidence.
5. **Infrastructure Protection:** Work is performed strictly on existing company repositories, Vercel projects, and Supabase databases.

---

## 2. Active Defect & Readiness Register

| Defect ID | Description | Severity | Assigned Owner | Affected Module | Root Cause | Fix Status | Test Status | Evidence | Approval |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DEF-01** | Incomplete transaction records displaying as APPROVED or READY despite missing moisture, fee, or transport quote | **Critical** | Frontend / Backend Lead | `TransactionModule.js`, `DecisionMatrixModule.js`, PostgreSQL | Incomplete frontend gating allowed admin approval without prerequisite checks; database trigger lacked content validation | **Verified Fixed** | **PASSED** | `FE-01..06`, `BE-01..06`, `TEST-36` | Approved (Collins / Clarence) |
| **DEF-02** | Conflicting "Saved" and "Pending-Sync" messages on dashboard for records already persisted in PostgreSQL | **High** | Sync Engine Lead | `syncEngine.js`, `TransactionModule.js`, `offlineStore.js` | `saveTransactionToSupabase` defaulted `sync_status` to `pending_sync` on Drafts, causing cloud-saved records to display as pending | **Verified Fixed** | **PASSED** | `FE-08..10`, `PERSIST-05` | Approved (Collins / Clarence) |
| **DEF-03** | Buyer and supplier identity exposure risks across shared views and export functions | **High** | Security / UX Lead | `identityMasking.js`, `Deals.js`, `Registry.js` | Direct counterparty names rendered in operational views without neutral alias conversion (Buyer B1, Supplier S5) | **Verified Fixed** | **PASSED** | `FE-12..18`, `ID-01..10` | Approved (Collins / Clarence) |
| **DEF-04** | Database-level readiness gate bypass via direct REST API or unauthenticated update routes | **Critical** | Database Architect | `public.transactions`, `mvtr_transactions.sql` | `trg_enforce_mvtr_approval_permissions` fired only on UPDATE, checked user role but not deal completeness | **Verified Fixed** | **PASSED** | `BE-01..12`, `RLS-06` | Approved (Collins / Clarence) |
| **DEF-05** | Ambiguity regarding Hard Reset impact on live PostgreSQL business records | **High** | Core Infrastructure | `index-A159RRyL.js`, `offlineStore.js` | Unclear documentation and user fears that clearing local cache might issue PostgreSQL TRUNCATE / DELETE | **Verified Fixed** | **PASSED** | `BE-14`, `HARD_RESET_SAFETY` | Approved (Collins / Clarence) |
| **DEF-06** | Session refresh / reload restoring stale or false-ready cached state | **Medium** | State Lifecycle Lead | `TransactionModule.js`, `financialEngine.js` | Local storage overlay in `refreshData` failed to re-validate readiness on cached objects after network fetch | **Verified Fixed** | **PASSED** | `FE-07`, `PERSIST-04` | Approved (Collins / Clarence) |

---

## 3. Production Deployment & Rollback Coordinates

- **Current Production Commit:** `90cc428`
- **Target Release Candidate Commit:** Ready for staging and production release
- **Rollback Target:** Commit `90cc428`
- **Rollback Approval Authority:** Collins / Clarence (Managing Director)
- **Database Backup Snapshot:** Verified automated WAL archiving on Supabase project `ktbmxjakzkopijdzkxlo`.

---

## 4. Documentation Index

The following 12 formal reports provide the complete technical evidence for this release:
1. [docs/ACTIVE_CODE_REGISTER.md](file:///c:/Users/ojuka/CNG_Alpha/docs/ACTIVE_CODE_REGISTER.md)
2. [docs/BACKEND_STATE_MACHINE_ROOT_CAUSE.md](file:///c:/Users/ojuka/CNG_Alpha/docs/BACKEND_STATE_MACHINE_ROOT_CAUSE.md)
3. [docs/FRONTEND_PII_AUDIT.md](file:///c:/Users/ojuka/CNG_Alpha/docs/FRONTEND_PII_AUDIT.md)
4. [docs/BACKEND_SYNC_ROOT_CAUSE.md](file:///c:/Users/ojuka/CNG_Alpha/docs/BACKEND_SYNC_ROOT_CAUSE.md)
5. [docs/HARD_RESET_SAFETY_REPORT.md](file:///c:/Users/ojuka/CNG_Alpha/docs/HARD_RESET_SAFETY_REPORT.md)
6. [docs/POSTGRESQL_PERSISTENCE_VERIFICATION.md](file:///c:/Users/ojuka/CNG_Alpha/docs/POSTGRESQL_PERSISTENCE_VERIFICATION.md)
7. [docs/RLS_SECURITY_TEST_REPORT.md](file:///c:/Users/ojuka/CNG_Alpha/docs/RLS_SECURITY_TEST_REPORT.md)
8. [docs/FRONTEND_ACCEPTANCE_TEST_REPORT.md](file:///c:/Users/ojuka/CNG_Alpha/docs/FRONTEND_ACCEPTANCE_TEST_REPORT.md)
9. [docs/BACKEND_DATABASE_ACCEPTANCE_TEST_REPORT.md](file:///c:/Users/ojuka/CNG_Alpha/docs/BACKEND_DATABASE_ACCEPTANCE_TEST_REPORT.md)
10. [docs/WEDNESDAY_ROLLBACK_AND_DATABASE_RECOVERY.md](file:///c:/Users/ojuka/CNG_Alpha/docs/WEDNESDAY_ROLLBACK_AND_DATABASE_RECOVERY.md)
11. [docs/DEFECT_FIX_CONFIRMATION_REPORT.md](file:///c:/Users/ojuka/CNG_Alpha/docs/DEFECT_FIX_CONFIRMATION_REPORT.md)
12. [docs/FINAL_READINESS_AND_EOD_REPORT.md](file:///c:/Users/ojuka/CNG_Alpha/docs/FINAL_READINESS_AND_EOD_REPORT.md)
