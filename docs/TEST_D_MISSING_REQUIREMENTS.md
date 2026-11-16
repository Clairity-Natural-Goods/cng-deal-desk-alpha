# TEST D: MISSING REQUIREMENTS BLOCKING READY STATUS
**Project:** CNG Deal Desk Alpha V2  
**Test ID:** TEST-D  
**Suite Harness:** `tests/supabase_cng_suite.test.js`  
**Status:** PASSED (100% Verified)  

---

## 1. Test Objective & Operational Rationale

In agricultural trade operations across Northern Uganda, accidental omission of costs (e.g., handling COGS, transport costs, or base purchase prices) can turn a seemingly profitable transaction into a severe financial deficit. 

Previously, unentered costs risked being coerced to `0` by standard JavaScript falsy evaluations (`Number(val) || 0`), silently inflating projected margins and allowing incomplete deals to achieve `READY` status.

**Test D verifies:**
1. Unentered or omitted costs are classified explicitly as `NOT_ENTERED` with `isMissing: true` and `value: null`.
2. Confirmed zero costs (e.g., subsidized weighbridge fee or supplier-delivered haulage) are classified as `EXPLICIT_ZERO` with `isZero: true` and `value: 0`.
3. Incomplete commercial terms (missing price per kilo, missing payment schedule, unentered transport cost, or missing counterparty identities) strictly block transition to `READY` status in the underwriting decision engine and trigger clear blocker notifications.

---

## 2. Test Execution Details

### Input Scenario 1: Cost Classification
```javascript
const missingCost = classifyCostInput(null, "Transport Cost", true);
// Result: { status: "NOT_ENTERED", value: null, isMissing: true, isZero: false }

const confirmedZeroCost = classifyCostInput(0, "Subsidized Weighbridge Fee", false, true);
// Result: { status: "EXPLICIT_ZERO", value: 0, isMissing: false, isZero: true }
```

### Input Scenario 2: Incomplete Deal Pack Evaluation
```javascript
const incompleteDeal = {
  commodity: "Maize",
  buyer_requirements: { buyer_name: "Gulu Millers", required_tonnes: 30 },
  supplier_verification: { supplier_name: "Amuru Farmers Co-op", confirmed_tonnes: 30 },
  payment_terms: { agreed_price_per_kg: null, payment_schedule: "" },
  transport_collection: { total_transport_cost: null, transporter_name: "" },
  fee_margin: { expected_gross_fee: 0 },
};

const readiness = evaluateReadyReadiness(incompleteDeal);
```

### Assertions & Output
- `readiness.isReady === false` (BLOCKED)
- `readiness.blockers` returned 8 specific blockers:
  - "Required financial costs missing: Base Price, Transport Cost, Handling COGS"
  - "Transaction contribution must be strictly positive (> 0)"
  - "Buyer agreed terms and purchase order evidence required"
  - "Supplier stock verification and moisture assay required"
  - "Workable logistics route and carrier documentation required"
  - "Payment structure and escrow arrangements pending approval"
  - "Agreed CNG service fee acceptance documentation missing"
  - "Operational corridor lane must be explicitly selected"

### Frontend Form Defense
In `assets/transactions/TransactionModule.js`, `handleSubmitForReview` applies synchronous gating:
```javascript
if (missing.length > 0) {
  showToast(`Cannot submit Deal Pack — Missing Mandatory Requirements:\n${missing.join("\n")}`, "error");
  return;
}
```
Incomplete deals cannot be submitted for Clarence review, preventing unvetted commercial liabilities.
