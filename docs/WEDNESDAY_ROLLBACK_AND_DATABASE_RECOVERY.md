# CNG DEAL DESK ALPHA V2 – WEDNESDAY ROLLBACK & DATABASE RECOVERY RUNBOOK

**Document Reference:** CNG-OPS-2026-11-RDR-01  
**Sprint:** Tuesday Readiness Sprint (17 November 2026)  
**Target Release Date:** Wednesday, 18 November 2026 – 5:30 PM (East Africa Time)  
**Production Git Branch:** `main`  
**Known-Good Rollback Commit:** `90cc428`  
**Vercel Production Project:** `cng-deal-desk-alpha` (ID: `cng-deal-desk-alpha-rose.vercel.app`)  
**Supabase Production Project:** `ktbmxjakzkopijdzkxlo.supabase.co`  
**Incident Commanders / Authority:** Collins (Technical Lead) / Clarence (Managing Director)  
**Classification:** Operational Runbook & Disaster Recovery Protocol  

---

## 1. Executive Summary & Purpose

This operational runbook defines the exact, executable procedures required to execute an emergency rollback of frontend deployments on Vercel or safely revert database migrations and state-machine triggers on Supabase PostgreSQL during the Wednesday launch window.

The plan guarantees a Maximum Tolerable Downtime (MTD) of **< 3 minutes** for frontend regressions and **< 5 minutes** for database trigger reverts, with **zero loss** of live production business records.

---

## 2. Emergency Rollback Authority & Decision Matrix

Rollback execution requires explicit sign-off from the designated Incident Commander.

```
+----------------------------------------------------------------------------------------------------+
|                                    ROLLBACK TRIGGER DECISION MATRIX                                |
+-------------------------------+-----------------------+---------------------+----------------------+
| Symptom / Incident Trigger    | Severity Threshold    | Decision Window     | Action Plan          |
+-------------------------------+-----------------------+---------------------+----------------------+
| React SPA crash on login or   | P0 - Critical         | Immediate (< 5 min) | Instant Vercel CLI   |
| blank screen for all users    |                       |                     | Rollback to 90cc428  |
+-------------------------------+-----------------------+---------------------+----------------------+
| Legitimate deal approval      | P1 - High             | 15 minutes triage   | Revert DB Trigger to |
| blocked by trigger bug        |                       |                     | Prior Safe Function  |
+-------------------------------+-----------------------+---------------------+----------------------+
| Data sync loop or continuous  | P1 - High             | 10 minutes triage   | Disable Sync Worker  |
| 500 error on /rest/v1/tx      |                       |                     | & Rollback Frontend  |
+-------------------------------+-----------------------+---------------------+----------------------+
| Non-critical styling or       | P2 - Low / Medium     | Next day patch      | DO NOT ROLLBACK.     |
| visual badge alignment defect |                       |                     | Hotfix in sprint.    |
+-------------------------------+-----------------------+---------------------+----------------------+
```

**Authorized Sign-off Personnel:**
- **Clarence:** Managing Director / Commercial Principal
- **Collins:** Technical Lead / Release Engineer

---

## 3. Frontend Deployment Rollback Procedure (Vercel)

If a critical frontend regression occurs post-deployment, execute the rollback to known-good commit `90cc428` using either Option A (Vercel Dashboard) or Option B (Command Line).

### Option A: Instant Vercel Web Dashboard Rollback (< 60 Seconds)

1. Open the Vercel Production Project:  
   `https://vercel.com/cng-global/cng-deal-desk-alpha/deployments`
2. Locate the known-good production deployment pinned to commit **`90cc428`**.
3. Click the three dots (`...`) icon on that deployment card.
4. Select **"Instant Rollback"** (or **"Promote to Production"**).
5. Confirm the dialog: *"Are you sure you want to assign production traffic to this deployment?"*
6. Verify live traffic immediately routes to the rollback build:
   - Check `https://cng-deal-desk-alpha-rose.vercel.app/`
   - Hard refresh (`Ctrl + F5`) and check browser console.

### Option B: Command-Line Rollback via Git

If the Vercel dashboard is inaccessible:

```bash
# 1. Fetch latest remote state
git fetch origin main

# 2. Reset local working branch to known-good commit 90cc428
git reset --hard 90cc428

# 3. Force push to production branch to trigger automated Vercel CI/CD build
git push origin main --force-with-lease

# 4. Monitor build deployment status
# Production will automatically rebuild commit 90cc428 within 90 seconds.
```

---

## 4. Backend Database Trigger & Schema Rollback (Supabase)

If migration `20261117000001_enforce_readiness_and_approval_gates.sql` introduces unexpected blocking behavior during commercial trading, execute the targeted rollback script below in the **Supabase SQL Editor**.

### 4.1 Safe Rollback SQL Script

> [!IMPORTANT]
> Running this script drops only the new trigger and restores the prior role-only check. It modifies **zero** transaction data rows.

```sql
-- BEGIN TRANSACTION FOR SAFE ROLLBACK
BEGIN;

-- 1. Drop the readiness gating trigger
DROP TRIGGER IF EXISTS trg_enforce_mvtr_readiness_and_approval_gates ON public.transactions;

-- 2. Drop the readiness function
DROP FUNCTION IF EXISTS public.enforce_mvtr_readiness_and_approval_gates();

-- 3. Restore the prior safe approval permission function
CREATE OR REPLACE FUNCTION public.enforce_mvtr_approval_permissions()
RETURNS trigger AS $$
DECLARE
  v_current_role text;
BEGIN
  IF NEW.status = 'Approved' AND (OLD.status IS NULL OR OLD.status <> 'Approved') THEN
    v_current_role := coalesce(
      current_setting('request.jwt.claims', true)::json->>'user_metadata'->>'role',
      (SELECT role FROM public.profiles WHERE id = auth.uid()),
      'viewer'
    );
    IF v_current_role <> 'admin' THEN
      RAISE EXCEPTION 'Only executive administrators can approve transactions.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Re-attach the prior trigger
CREATE TRIGGER trg_enforce_mvtr_approval_permissions
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_mvtr_approval_permissions();

-- COMMIT CHANGES
COMMIT;
```

### 4.2 Database Point-In-Time Recovery (PITR) Protocol

In the unlikely event of data corruption:
1. Open the Supabase Database Settings:  
   `https://supabase.com/dashboard/project/ktbmxjakzkopijdzkxlo/database/backups/pitr`
2. Select **Point-in-Time Recovery**.
3. Choose the timestamp immediately preceding the deployment window (e.g. `2026-11-18 17:25:00 EAT`).
4. Select target destination (restore to a clone or recover in-place).
5. Verify recovery row counts against previous backup manifests.

---

## 5. Post-Rollback Verification & Smoke Checklist

Immediately following any rollback execution, the following verification checklist must be completed before notifying users:

- [ ] **Auth Check:** Sign in as standard operator and executive admin.
- [ ] **Data Check:** Confirm existing deals load in registry table with correct tonnages.
- [ ] **Draft Test:** Create and save a new draft transaction; confirm `Saved successfully`.
- [ ] **Decision Matrix:** Verify underwriting calculations compute margins correctly.
- [ ] **PII Check:** Confirm counterparties display as pseudonyms (`Buyer B1`, `Supplier S5`).
- [ ] **Error Log Inspection:** Check Supabase logs (`Postgres logs` and `API logs`) for unhandled errors.

---

## 6. Incident Communication Template

Following rollback completion, dispatch this formal notification to the operational channels:

```
[INCIDENT RESOLUTION NOTICE]
Date/Time: [Timestamp] EAT
Incident ID: INC-20261118-01
Action Taken: Rollback of CNG Deal Desk Alpha V2 to Stable Release [Commit 90cc428]
Root Cause: [Brief description, e.g., UI state loading timeout]
Impact: System restored to 100% operational capacity. Zero business data lost.
Current Status: Green / Operational.
Signed: Collins (Tech Lead) / Clarence (Managing Director)
```
