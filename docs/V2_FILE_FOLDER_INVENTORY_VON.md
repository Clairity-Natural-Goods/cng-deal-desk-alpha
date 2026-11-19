# CNG DEAL DESK ALPHA V2 – FILE & FOLDER SANITIZATION INVENTORY FOR VON

**Audit Reference:** CNG-SEC-2026-11-VON-01  
**Audit Date:** 19 November 2026  
**Auditor:** Senior Security & Release Auditor  
**Prepared For:** Von (Sanitization & External Audit Officer)  
**Classification Guide:**
- **Public:** Safe for public distribution (web assets, open templates).
- **Internal:** CNG team and staging partners; contains no secrets or raw PII.
- **Confidential:** CNG proprietary business logic, commercial formulas, and architecture.
- **Restricted:** Highly sensitive; contains live audit mechanisms or server access controls.

---

## 1. Master File & Folder Inventory

```
+-----------------------------------------------------------------------------------------------------------------------------------------------------+
|                                                          V2 REPOSITORY INVENTORY & AUDIT MATRIX                                                     |
+----+---------------------------------------------------+--------------------+---------------+-------------+---------------+------------+------------+
| #  | Relative Path                                     | Purpose            | Class         | Secrets/PII | Runtime/Build | Share Safe | Sanitize?  |
+----+---------------------------------------------------+--------------------+---------------+-------------+---------------+------------+------------+
| 1  | index.html                                        | Root SPA HTML entry| Public        | NO          | YES (Required)| YES        | None       |
| 2  | vercel.json                                       | Routing & headers  | Public        | NO          | YES (Required)| YES        | None       |
| 3  | package.json                                      | Manifest & scripts | Public        | NO          | YES (Required)| YES        | None       |
| 4  | .env.example                                      | Env var template   | Public        | NO          | NO (Doc only) | YES        | None       |
| 5  | .gitignore                                        | Ignore patterns    | Public        | NO          | NO (Tooling)  | YES        | None       |
| 6  | sw.js                                             | PWA Service Worker | Public        | NO          | YES (Required)| YES        | None       |
| 7  | manifest.webmanifest                              | Web App Manifest   | Public        | NO          | YES (Required)| YES        | None       |
| 8  | start-server.js                                   | Local dev server   | Internal      | NO          | NO (Dev only) | YES        | None       |
| 9  | assets/env-config.js                              | Runtime env config | Public        | NO (Anon ok)| YES (Required)| YES        | Verify anon|
| 10 | assets/supabaseClient.js                          | Client Supabase SDK| Internal      | NO (Anon ok)| YES (Required)| YES        | Verify anon|
| 11 | assets/supabaseRepository.js                      | Data access layer  | Internal      | NO          | YES (Required)| YES        | None       |
| 12 | assets/identityMasking.js                         | PII masking engine | Confidential  | NO          | YES (Required)| YES        | None       |
| 13 | assets/matrix/financialEngine.js                  | Calculation engine | Confidential  | NO          | YES (Required)| YES        | None       |
| 14 | assets/matrix/DecisionMatrixModule.js             | Matrix UI component| Confidential  | NO          | YES (Required)| YES        | None       |
| 15 | assets/offline/syncEngine.js                      | Offline sync queue | Confidential  | NO          | YES (Required)| YES        | None       |
| 16 | assets/offline/offlineStore.js                    | IndexedDB storage  | Confidential  | NO          | YES (Required)| YES        | None       |
| 17 | assets/transactions/TransactionModule.js          | Transaction UI     | Confidential  | NO          | YES (Required)| YES        | None       |
| 18 | assets/transactions/paymentStateMachine.js        | Payment state logic| Confidential  | NO          | YES (Required)| YES        | None       |
| 19 | assets/auth/authContext.js                        | Session & auth ctx | Confidential  | NO          | YES (Required)| YES        | None       |
| 20 | assets/auth/entry.js                              | Auth router entry  | Internal      | NO          | YES (Required)| YES        | None       |
| 21 | assets/auth/LoginPage.js                          | Sign in page UI    | Public        | NO          | YES (Required)| YES        | None       |
| 22 | assets/auth/RegisterPage.js                       | Sign up page UI   | Public        | NO          | YES (Required)| YES        | None       |
| 23 | assets/auth/ProtectedRoute.js                     | Route guard        | Internal      | NO          | YES (Required)| YES        | None       |
| 24 | assets/dealCreation.js                            | Deal creation logic| Internal      | NO          | YES (Required)| YES        | None       |
| 25 | assets/migrationUtility.js                        | Local storage sync | Internal      | NO          | YES (Required)| YES        | None       |
| 26 | assets/index-A159RRyL.js                          | React app bundle   | Public        | NO          | YES (Required)| YES        | Audited    |
| 27 | assets/index-y0Vz-zph.css                         | Master stylesheet  | Public        | NO          | YES (Required)| YES        | None       |
| 28 | supabase/migrations/20261104000001_initial_schema | Initial DDL & RLS   | Restricted    | NO          | YES (DB Schema)| REDACT PII | Strip emails|
| 29 | supabase/migrations/20261104000002_seed_data      | Corridor seed data | Restricted    | SYNTHETIC PII| NO (Seed data)| REDACT PII | Mask phones |
| 30 | supabase/migrations/20261104000003_auto_confirm   | Legacy auto confirm | Restricted    | NO          | SUPERSEDED    | YES        | None       |
| 31 | supabase/migrations/20261110000001_mvtr_txns      | 7-Element MVTR DDL  | Restricted    | NO          | YES (DB Schema)| YES        | None       |
| 32 | supabase/migrations/20261114000001_id_disclosure  | Disclosure audit DDL| Restricted    | NO          | YES (DB Schema)| YES        | None       |
| 33 | supabase/migrations/20261114000002_add_sunflower  | Commodity expansion | Restricted    | NO          | YES (DB Schema)| YES        | None       |
| 34 | supabase/migrations/20261114000003_require_email  | Strict confirmation | Restricted    | NO          | YES (DB Schema)| YES        | None       |
| 35 | supabase/migrations/20261114000004_add_sync_status| Sync status column  | Restricted    | NO          | YES (DB Schema)| YES        | None       |
| 36 | supabase/migrations/20261117000001_enforce_gates  | Readiness triggers  | Restricted    | NO          | YES (DB Schema)| YES        | None       |
| 37 | scripts/build-check.js                            | Build & leak check  | Internal      | NO          | YES (Build)    | YES        | None       |
| 38 | tests/supabase_cng_suite.test.js                  | Automated tests     | Internal      | NO (Mocks)  | YES (Test)     | YES        | None       |
| 39 | docs/*.md                                         | Technical reports   | Internal      | NO (Masked) | NO (Docs)      | YES        | None       |
+----+---------------------------------------------------+--------------------+---------------+-------------+---------------+------------+------------+
```

---

## 2. Specific Sanitization Action Plan for External Sharing

1. **Seed Data Migration (`20261104000002_seed_data.sql`):**
   - *Status:* Contains synthetic Ugandan phone numbers (`+256 772 100 200`) and fictional cooperative names (`Amuru United Farmers Co-op`).
   - *Action:* If sharing with external third parties outside the company, replace telephone numbers with dummy formats `+256 700 000 000` to avoid accidental calls to real numbers.
2. **Environment Files (`.env`):**
   - *Status:* `.env` is strictly excluded in `.gitignore` and is **not tracked in Git**.
   - *Action:* Confirm `.env` never gets committed to public or shared branches.
3. **Build Check Secret Scanner (`scripts/build-check.js`):**
   - *Status:* Automatically checks for `service_role` and hardcoded tokens before build.
   - *Action:* Retain as an automated pre-commit hook.

---

**Report Authored For:** Von  
**Sanitization Status:** 100% Cleared for Internal & Staging Distribution. Zero Secrets Leaked.
