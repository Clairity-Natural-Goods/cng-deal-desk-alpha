/**
 * ==============================================================================
 *   CNG DEAL DESK ALPHA V2 — DEAL CREATION & NORMALIZATION ENGINE
 *   Module: assets/dealCreation.js
 *   Purpose: Validates and normalizes payload for creating new commodity deals.
 *            Ensures required foreign keys, numeric quantities, and initial evidence
 *            gates conform to Supabase schema constraints.
 * ==============================================================================
 */

/**
 * Normalizes and validates deal creation payload before database insertion.
 * 
 * Required fields:
 * - name: string (non-empty)
 * - proof_quantity_tonnes: numeric > 0
 * 
 * Foreign key safety:
 * - buyer_id: null if empty string, undefined, or 'none' (never pass empty string)
 * - supplier_id: null if empty string, undefined, or 'none'
 * 
 * Defaults:
 * - stage: 0
 * - evidence: 8 OPEN gates
 * - per_tonne_fee: 30000
 * - minimum_fee: 25000
 * - approval_status: 'Not requested'
 * - payment_status: 'PENDING'
 */
export function normalizeDealCreationPayload(payload = {}) {
  const name = String(payload.name ?? "").trim();
  if (!name) {
    throw new Error("Deal name is required.");
  }

  const rawQty = payload.proof_quantity_tonnes;
  if (rawQty === null || rawQty === undefined || String(rawQty).trim() === "") {
    throw new Error("Proof quantity must be greater than zero.");
  }

  const proofQuantityTonnes = Number(String(rawQty).replace(/,/g, "").trim());
  if (!Number.isFinite(proofQuantityTonnes) || proofQuantityTonnes <= 0) {
    throw new Error("Proof quantity must be greater than zero.");
  }

  const buyerId = payload.buyer_id && String(payload.buyer_id).trim() !== "" && payload.buyer_id !== "none"
    ? String(payload.buyer_id).trim()
    : null;

  const supplierId = payload.supplier_id && String(payload.supplier_id).trim() !== "" && payload.supplier_id !== "none"
    ? String(payload.supplier_id).trim()
    : null;

  const commodity = payload.commodity || "Maize";
  const evidence = Array.isArray(payload.evidence) && payload.evidence.length === 8
    ? payload.evidence
    : Array(8).fill("OPEN");

  return {
    ...payload,
    name,
    commodity,
    buyer_id: buyerId,
    supplier_id: supplierId,
    proof_quantity_tonnes: proofQuantityTonnes,
    stage: typeof payload.stage === "number" ? payload.stage : 0,
    evidence,
    per_tonne_fee: typeof payload.per_tonne_fee === "number" ? payload.per_tonne_fee : 30000,
    minimum_fee: typeof payload.minimum_fee === "number" ? payload.minimum_fee : 25000,
    commissioned: Boolean(payload.commissioned),
    cost_field: typeof payload.cost_field === "number" ? payload.cost_field : 0,
    cost_testing: typeof payload.cost_testing === "number" ? payload.cost_testing : 0,
    cost_transport: typeof payload.cost_transport === "number" ? payload.cost_transport : 0,
    cost_other: typeof payload.cost_other === "number" ? payload.cost_other : 0,
    staff_hours: typeof payload.staff_hours === "number" ? payload.staff_hours : 0,
    staff_cost_per_hour: typeof payload.staff_cost_per_hour === "number" ? payload.staff_cost_per_hour : 6000,
    working_days: typeof payload.working_days === "number" ? payload.working_days : 0,
    approval_status: payload.approval_status || "Not requested",
    payment_status: payload.payment_status || "PENDING",
    classification: payload.classification || "Not classified",
    reconciled: Boolean(payload.reconciled),
  };
}
