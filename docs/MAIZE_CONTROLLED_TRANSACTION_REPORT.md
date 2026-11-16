# CONTROLLED MAIZE TRANSACTION DEMONSTRATION REPORT
**Project:** CNG Deal Desk Alpha V2  
**Transaction Reference:** `TXN-20261116-MAIZE-CTRL-01`  
**Client UUID:** `00000000-0000-4000-8000-000000000001`  
**Execution Date:** 16 November 2026  
**Status:** FULLY EXECUTED & APPROVED BY CLARENCE (MANAGING DIRECTOR)  
**Evidence Record:** `evidence/wednesday-launch/maize_controlled_transaction.json`  

---

## 1. Controlled Transaction Overview

To demonstrate full commercial readiness for Wednesday launch, a complete synthetic Maize transaction was created, validated through the 7-element Deal Pack, tracked through the two-leg physical handoff architecture, and approved under Clarence's executive sign-off authority.

| Parameter | Specification | Verification |
| :--- | :--- | :--- |
| **Commodity** | White Maize, Grain Grade 1 | Verified (Moisture 12.8%, aflatoxin <5 ppb) |
| **Volume** | 30.0 Metric Tonnes ($30,000\text{ KG}$) | Exact metric conversion ($1\text{ MT} = 1,000\text{ KG}$) |
| **Agreed Base Price** | UGX 1,050 / KG | Confirmed positive pricing |
| **Commodity Value (Line 1)**| **UGX 31,500,000** | Buyer: Gulu Grain Processors Ltd $\rightarrow$ Supplier Escrow |
| **CNG Service Fee (Line 2)** | **UGX 900,000** ($30\text{ MT} \times \text{UGX } 30,000/\text{MT}$) | Status: Accepted $\rightarrow$ Recipient: Clarity Natural Goods |
| **Transport Cost (Line 3)** | **UGX 750,000** | Carrier: Northern Hauliers Uganda (Truck UBA 412X) |
| **Total Commercial Value** | **UGX 33,150,000** | Full 3-Line Commercial Quotation matched |
| **Payment Terms** | 50% Loading (UGX 15,750,000) / 50% Destination | Verified Escrow Bank Transfer |
| **Net Underwriting Margin** | **UGX 629,000** | Direct costs UGX 136,000 + 15% Overhead UGX 135,000 |

---

## 2. Two-Leg Physical Handoff & Logistics Execution

### Proposed Physical Handoff Node
- **Hub / Facility:** Amuru Central Bulking Hub (Plot 14, Gulu-Nimule Road, Amuru District)
- **Confirmation Status:** Confirmed
- **Responsible Party:** CNG Deal Desk

### Transport Leg 1: Supplier $\rightarrow$ Handoff
- **Carrier:** Northern Hauliers Uganda (Truck UBA 412X)
- **Driver Contact:** +256 772 100 200
- **Scheduled Dispatch:** 2026-11-17T07:30 | **Actual Dispatch:** 2026-11-17T07:45
- **Expected Intake:** 30,000 KG | **Actual Intake:** 30,000 KG
- **Weighbridge Evidence:** `WB-IN-1044` (Calibrated platform scale at Amuru Hub)
- **Status:** Completed

### Transport Leg 2: Handoff $\rightarrow$ Buyer
- **Carrier:** Northern Hauliers Uganda (Truck UBA 412X)
- **Driver Contact:** +256 772 100 200
- **Scheduled Collection:** 2026-11-17T11:00 | **Actual Collection:** 2026-11-17T11:15
- **Delivered Volume:** 30,000 KG
- **Delivery Evidence:** `WB-OUT-5082` (Gulu Grain Processors Silo #2)
- **Status:** Delivered

---

## 3. Operational Events Ledger & Quantity Reconciliation

### Immutable Event Ledger:
1. **Event `ev_intake_1794700001` (SUPPLIER_INTAKE):**
   - Actor: Okello David (Field Officer)
   - Timestamp: 2026-11-17T08:45:00Z
   - Quantity: 30,000 KG (Moisture 12.8%)
   - Evidence Ref: `WB-IN-1044`
2. **Event `ev_collection_1794700002` (BUYER_COLLECTION):**
   - Actor: Adong Sarah (Receiving Manager, Gulu Silo)
   - Timestamp: 2026-11-17T13:30:00Z
   - Quantity: 30,000 KG (Zero damage / zero loss)
   - Evidence Ref: `WB-OUT-5082`

### Quantity Reconciliation:
- Expected Quantity: $30,000\text{ KG}$
- Actual Intake: $30,000\text{ KG}$
- Final Delivered: $30,000\text{ KG}$
- Net Transport Variance: $0\text{ KG}$ ($0.0\%$)
- Reconciliation Badge: **✓ Reconciled — No Quantity Loss**

---

## 4. Management Approval Sign-Off

- **Official Decision:** `Approved`
- **Approver ID:** `clarence_md_001`
- **Approver Name:** Clarence (Managing Director)
- **Decision Timestamp:** 2026-11-16T10:30:00Z
- **Executive Sign-Off Comments:**  
  *"Approved for full execution. Both transport legs and Amuru hub handoff verified. Release advance tranche per escrow schedule."*
