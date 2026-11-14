# Production Setup & Operations Guide: CNG Deal Desk Alpha V2

This step-by-step guide explains how to complete the final cloud configuration in your **Supabase Dashboard**, **GitHub Repository**, and **Vercel Project**.

---

## Authoritative Company Infrastructure

- **GitHub Repository**: [`https://github.com/Clairity-Natural-Goods/cng-deal-desk-alpha`](https://github.com/Clairity-Natural-Goods/cng-deal-desk-alpha)
- **Production Branch**: `main`
- **Company Supabase Project**: [`https://ktbmxjakzkopijdzkxlo.supabase.co`](https://ktbmxjakzkopijdzkxlo.supabase.co)
- **Supabase Project Ref**: `ktbmxjakzkopijdzkxlo`
- **Supabase Publishable Key**: `sb_publishable_ffsFhgLkKV1IGGEJKGV-2w_b9xRTZ1H`
- **Company Vercel Dashboard**: [`https://vercel.com/cng-global/cng-deal-desk-alpha`](https://vercel.com/cng-global/cng-deal-desk-alpha)
- **Authoritative Production Domain**: `cng-deal-desk-alpha-rose.vercel.app`
- **Production URL**: [`https://cng-deal-desk-alpha-rose.vercel.app`](https://cng-deal-desk-alpha-rose.vercel.app)

---

## 1. Apply Supabase Database Migrations

You have an authoritative company Supabase project connected at:
- **Project URL**: `https://ktbmxjakzkopijdzkxlo.supabase.co`

### Step 1.1: Run the Schema & Feature Migrations
1. Open your browser and navigate to your **[Supabase Dashboard](https://supabase.com/dashboard/project/ktbmxjakzkopijdzkxlo)**.
2. In the left navigation bar, click on **SQL Editor**.
3. Click **+ New Query**.
4. Run the migrations in chronological order:
   - `supabase/migrations/20261104000001_initial_schema.sql` (Core tables, normalization, RLS)
   - `supabase/migrations/20261104000002_seed_data.sql` (Seed parties, observations, baseline deals)
   - `supabase/migrations/20261104000003_auto_confirm_users.sql` (Auto-confirm auth trigger)
   - `supabase/migrations/20261110000001_mvtr_transactions.sql` (MVTR transactions & Clarence approval)
   - `supabase/migrations/20261114000001_identity_disclosure_and_audit.sql` (Identity disclosure & audit trail)
5. Click **Run** (or press `Ctrl + Enter`).
6. Confirm that each query succeeds.

### Step 1.2: Configure Supabase Auth Site URL & Redirect URLs
To prevent confirmation emails and password resets from defaulting to localhost:
1. In the Supabase Dashboard, go to **Authentication** -> **URL Configuration**.
2. Set **Site URL** to:
   ```
   https://cng-deal-desk-alpha-rose.vercel.app
   ```
3. In **Redirect URLs**, add:
   ```
   https://cng-deal-desk-alpha-rose.vercel.app/**
   https://cng-deal-desk-alpha-rose.vercel.app/login
   https://cng-deal-desk-alpha-rose.vercel.app/settings
   ```
4. Click **Save**.

---

## 2. Push Code to GitHub

The source repository is [`Clairity-Natural-Goods/cng-deal-desk-alpha`](https://github.com/Clairity-Natural-Goods/cng-deal-desk-alpha), on branch `main`.

From your terminal in `C:\Users\ojuka\CNG_Alpha`:
```bash
git push origin main
```
*(If resetting previous commits, use `git push --force origin main`)*.

---

## 3. Verify Vercel Environment Variables & Deployment

The Vercel project is [`cng-global/cng-deal-desk-alpha`](https://vercel.com/cng-global/cng-deal-desk-alpha), with production domain [`cng-deal-desk-alpha-rose.vercel.app`](https://cng-deal-desk-alpha-rose.vercel.app). Pushing to `main` triggers a Vercel deployment.

### Step 3.1: Add Environment Variables in Vercel
1. Open the Vercel project linked above.
2. Navigate to **Settings** -> **Environment Variables**.
3. Ensure the following variables are configured for **Production**:
   - **`VITE_SUPABASE_URL`**: `https://ktbmxjakzkopijdzkxlo.supabase.co`
   - **`VITE_SUPABASE_ANON_KEY`**: `sb_publishable_ffsFhgLkKV1IGGEJKGV-2w_b9xRTZ1H`
4. Trigger a **Redeploy** from the **Deployments** tab.

### Step 3.2: Verify SPA Rewrites
- `vercel.json` in the root automatically configures SPA routing (`/(.*) -> /index.html`).
- Once deployed, visiting direct URLs like `https://cng-deal-desk-alpha-rose.vercel.app/matrix` or refreshing the page will load seamlessly without a 404 error.

---

## 4. Backup & Disaster Recovery Verification Procedure (BAK-01)

### Daily Automated Backups
Supabase manages automated daily backups for the PostgreSQL database (`ktbmxjakzkopijdzkxlo`).

### Manual Snapshot & Offline Export
1. On the Deal Desk UI, navigate to `/data`.
2. Click **Download a full backup**. The system generates a timestamped JSON file `cng-deal-desk-backup-YYYY-MM-DD.json`.
3. In accordance with Identity Disclosure Controls, sensitive counterparty contact details in standard exports are masked by default (`maskExportRecords`).
4. To restore in an approved test environment, drag and drop the backup file into the **Restore from a backup** panel on the `/data` page.
5. The system performs idempotent bulk upserts via `Party.bulkCreate()`, `Deal.bulkCreate()`, and `Observation.bulkCreate()`.
