# CNG DEAL DESK ALPHA V2 – PHASE ZERO BASELINE TECHNICAL AUDIT & ARCHITECTURE MAP

**Audit Date:** 19 November 2026  
**Execution Window:** 08:00–17:30 EAT  
**Document Ref:** CNG-AUD-2026-11-BTA-01  
**Project:** CNG Deal Desk Alpha V2  
**Repository:** `Clairity-Natural-Goods/cng-deal-desk-alpha`  
**Active Production Branch:** `main`  
**Latest Production Commit:** `1d8e027` (Anchored on `90cc428` and `9d985ba`)  
**Auditor:** Senior Full-Stack, Database & Release Engineering Team  
**Scope:** Architecture mapping, financial calculation tracing, quality gates, database schema, offline sync, RLS, and backup/restore inventory.  

---

## 1. Executive Baseline Summary

In accordance with Section 3 ("Phase Zero – Read-Only Baseline Audit"), this audit establishes the immutable baseline of the existing CNG Deal Desk Alpha V2 application prior to staging verification and handoff. 

The application is an offline-capable, progressive web application (PWA) built with **React + Vite** on the frontend and backed by **Supabase PostgreSQL** on the backend. It coordinates physical agricultural commodity origination, underwriting, quality assays, and corridor transport logistics in Northern Uganda (Gulu, Lira, Amuru, Nwoya).

---

## 2. Infrastructure & Repository Baseline

| Component | Target Identity | Inspected Evidence | Status |
| :--- | :--- | :--- | :--- |
| **Git Repository** | `Clairity-Natural-Goods/cng-deal-desk-alpha` | `https://github.com/Clairity-Natural-Goods/cng-deal-desk-alpha.git` | **PASS** |
| **Active Branch** | `main` | Verified tracking `origin/main` | **PASS** |
| **Release Anchors** | `90cc428` / `9d985ba` / `1d8e027` | Verified in Git commit tree | **PASS** |
| **Supabase Cloud Project** | `ktbmxjakzkopijdzkxlo.supabase.co` | Referenced in `assets/supabaseClient.js` | **PASS** |
| **Vercel Cloud Project** | `cng-deal-desk-alpha` | Referenced in `vercel.json` | **PASS** |
| **Production Domain** | `cng-deal-desk-alpha-rose.vercel.app` | Configured in `assets/identityMasking.js` | **PASS** |
| **Secret Protection** | Zero `service_role` keys in client | Scanned 17 bundle assets, 0 leaks found | **PASS** |

---

## 3. Commercial Data-Flow Mapping

The lifecycle of an agricultural trade in the CNG Deal Desk proceeds through the following deterministic sequence:

```
[Buyer Requirement / Supplier Offer]
                 │
                 ▼
          [Deal Origination]
  (Capture verified kg, sack weights, quote expiry)
                 │
                 ▼
       [Quality & Moisture Assay]
  (UNBS statutory standard vs. buyer tolerance)
                 │
                 ▼
       [Decision Matrix Evaluation]
  (3% fee vs. UGX 40,000/MT floor, buyer payable,
   commercial coverage test, retained contribution)
                 │
                 ▼
      [Joint Commercial Approval]
  (Clarence / Admin executive authority)
                 │
                 ▼
     [Cleared Funds / Escrow Verification]
  (Corporate payment channel, funding_status = FUNDED)
                 │
                 ▼
        [Authoritative Transaction]
  (Inherits approved Decision Matrix snapshot as read-only)
                 │
                 ▼
     [Physical Handoff & Dispatch]
  (Leg 1: Supplier -> Hub; Leg 2: Hub -> Buyer)
                 │
                 ▼
      [Reconciliation & Fee Collection]
```

---

## 4. Financial Calculation Inventory & Source Mapping

| Metric / Value | Authoritative Formula (`CNG Fee.pdf`) | Implementation Location | Persistence Destination |
| :--- | :--- | :--- | :--- |
| **Verified Quantity** | `verified_qty_kg = verified_weighed_qty_kg`<br>`quantity_mt = verified_qty_kg / 1000` | `assets/matrix/financialEngine.js`<br>`reconcileQuantity()` | `public.transactions.quantity_mt`<br>`buyer_requirements.required_tonnes` |
| **Agreed Commodity Value** | `buyer_agreed_price_per_kg * verified_qty_kg`<br>or `buyer_agreed_price_per_mt * quantity_mt` | `assets/matrix/financialEngine.js`<br>`calculateCngProcurementFee()` | `public.transactions.agreed_commodity_value`<br>`payment_terms.agreed_price_per_kg` |
| **CNG Procurement Fee** | `max(0.03 * agreed_commodity_value, quantity_mt * 40000)` | `assets/matrix/financialEngine.js`<br>`calculateCngProcurementFee()` | `public.transactions.cng_service_fee_ugx`<br>`fee_margin.cng_fee_per_tonne` |
| **Buyer Total Payable** | `buyer_commodity_value + sum(costs.BUYER) + buyer_allocated_cng_fee + additional_cng` | `assets/matrix/financialEngine.js`<br>`calculateBuyerPayableAndCoverage()` | `public.transactions.buyer_total_payable`<br>`payment_terms.total_payable` |
| **Landed Cost & Coverage** | `total_landed = supplier_cost + direct_landed`<br>`coverage = buyer_payable >= total_landed + fee` | `assets/matrix/financialEngine.js`<br>`calculateBuyerPayableAndCoverage()` | `public.transactions.decision_matrix`<br>`buyer_coverage` |
| **CNG Retained Contribution** | `earned_collected_fees - direct_cng_operational_costs` | `assets/matrix/financialEngine.js`<br>`calculateAuthoritativeCngEconomics()` | `public.transactions.retained_contribution`<br>`fee_margin.projected_net_margin` |
| **Net Profit** | `(contribution - overhead) - tax_provision` | `assets/matrix/financialEngine.js`<br>`calculateAuthoritativeCngEconomics()` | `public.transactions.net_profit` |

---

## 5. Quality, Moisture & Quote Validity Inventory

### 5.1 Moisture Standards:
- **Maize:** UNBS / EAS 2:2017 specifies statutory limit of **13.5%**.
- **Milled Rice:** **14.0%** is implemented as an explicit configurable placeholder pending formal UNBS standard version confirmation.
- **Rule of Stricter Limit:** `effective_limit_pct = min(statutory_limit_pct, buyer_limit_pct)`. A buyer's higher tolerance (e.g. 14.5%) cannot relax the statutory limit (13.5%).
- **Quality Failure:** If `actual_moisture_pct > effective_limit_pct`, `quality_status = FAILED`, blocking the trade pack from commercial approval or dispatch.

### 5.2 Quote Validity:
- Both `quote_timestamp` and `quote_expiry` are mandatory.
- Quotes default to 24–48 hour operational validity.
- Expired quotes block deal progression.
- Extensions may only be authorized by Commercial Lead Jovin or Operations Lead Collins with written evidence and audit logging.

---

## 6. Six Independent State Gates Inventory

Rather than a single monolithic status string, the system enforces 6 separate auditable states:
1. `stock_status`: `'PENDING'` | `'VERIFIED'`
2. `quality_status`: `'PENDING'` | `'PASSED'` | `'FAILED'`
3. `commercial_approval_status`: `'PENDING'` | `'APPROVED'` | `'REJECTED'`
4. `funding_status`: `'PENDING'` | `'FUNDED'`
5. `delivery_status`: `'PENDING'` | `'CONFIRMED'` | `'DISPATCHED'` | `'DELIVERED'`
6. `fee_collection_status`: `'NOT_INVOICED'` | `'INVOICED'` | `'COLLECTED'`

**Dispatch Rule:** Dispatch requires **BOTH** `commercial_approval_status = APPROVED` **AND** `funding_status = FUNDED`, plus all quality and quote gates satisfied. Exceptions are permitted exclusively by Managing Director Clarence and logged in an immutable Exception Log.

---

## 7. Automated Test Suite Baseline

- **Test Suite Path:** `tests/supabase_cng_suite.test.js`
- **Total Test Cases:** **116 Tests**
- **Test Status:** **116 PASSED | 0 FAILED | 0 SKIPPED (100.0% Success Rate)**
- **Regression Fixtures:** Includes Case A, Case B, and Case C from `CNG Fee.pdf` (pages 3–4).

---

## 8. Conclusion

The Phase Zero baseline audit confirms that the application architecture is intact, secure, and mathematically aligned with the authoritative `CNG Fee.pdf` specification. No unapproved changes or destructive operations were performed.
