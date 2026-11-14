/**
 * ==============================================================================
 *   CNG DEAL DESK ALPHA V2 — PAYMENT STATE MANAGEMENT & MATERIAL REVALIDATION
 *   Module: assets/transactions/paymentStateMachine.js
 *   Purpose: Enforces the 5 authoritative payment lifecycle states:
 *            PENDING, FUNDED, RELEASED, DISPUTED, REFUNDED.
 *            Validates state transitions and triggers material change revalidation.
 * ==============================================================================
 */

/**
 * 5 Authoritative Payment States
 */
export const PAYMENT_STATES = {
  PENDING: "PENDING",     // Awaiting initial buyer deposit or escrow funding
  FUNDED: "FUNDED",       // Buyer funds received and verified in designated account
  RELEASED: "RELEASED",   // Funds successfully disbursed to supplier upon delivery acceptance
  DISPUTED: "DISPUTED",   // Payment held or challenged due to quality, shortage, or breach
  REFUNDED: "REFUNDED",   // Funds returned to buyer following unresolved dispute or cancellation
};

/**
 * Valid state transition graph
 */
export const VALID_PAYMENT_TRANSITIONS = {
  [PAYMENT_STATES.PENDING]: [PAYMENT_STATES.FUNDED],
  [PAYMENT_STATES.FUNDED]: [PAYMENT_STATES.RELEASED, PAYMENT_STATES.DISPUTED],
  [PAYMENT_STATES.RELEASED]: [PAYMENT_STATES.DISPUTED], // Post-release dispute
  [PAYMENT_STATES.DISPUTED]: [PAYMENT_STATES.FUNDED, PAYMENT_STATES.REFUNDED],
  [PAYMENT_STATES.REFUNDED]: [], // Terminal state
};

/**
 * Roles authorized to execute specific payment transitions
 */
export const PAYMENT_ROLE_PERMISSIONS = {
  FUND: ["admin", "finance", "compliance"],
  RELEASE: ["admin", "finance"],
  DISPUTE: ["admin", "finance", "operations", "field_officer"],
  REFUND: ["admin", "finance"],
};

/**
 * Validate a proposed payment state transition.
 */
export function validatePaymentTransition(fromState, toState, userRole = "user") {
  const normFrom = String(fromState || PAYMENT_STATES.PENDING).toUpperCase();
  const normTo = String(toState || "").toUpperCase();

  if (!Object.values(PAYMENT_STATES).includes(normTo)) {
    return {
      isValid: false,
      error: `Invalid target payment state: "${toState}". Must be one of: ${Object.values(PAYMENT_STATES).join(", ")}.`,
    };
  }

  if (normFrom === normTo) {
    return { isValid: true, noop: true };
  }

  const allowedNext = VALID_PAYMENT_TRANSITIONS[normFrom] || [];
  if (!allowedNext.includes(normTo)) {
    return {
      isValid: false,
      error: `Invalid transition from "${normFrom}" to "${normTo}". Allowed transitions: ${allowedNext.join(", ") || "None (Terminal)"}.`,
    };
  }

  // Permission checks
  const role = String(userRole || "user").toLowerCase();
  let requiredRoles = ["admin", "finance"];

  if (normTo === PAYMENT_STATES.DISPUTED) {
    requiredRoles = PAYMENT_ROLE_PERMISSIONS.DISPUTE;
  } else if (normTo === PAYMENT_STATES.FUNDED) {
    requiredRoles = PAYMENT_ROLE_PERMISSIONS.FUND;
  } else if (normTo === PAYMENT_STATES.RELEASED) {
    requiredRoles = PAYMENT_ROLE_PERMISSIONS.RELEASE;
  } else if (normTo === PAYMENT_STATES.REFUNDED) {
    requiredRoles = PAYMENT_ROLE_PERMISSIONS.REFUND;
  }

  if (!requiredRoles.includes(role)) {
    return {
      isValid: false,
      error: `Unauthorized: Role "${role}" does not have permission to transition payment to "${normTo}". Required: ${requiredRoles.join(", ")}.`,
    };
  }

  return { isValid: true };
}

/**
 * Material transaction fields that require re-evaluation and invalidation of stale approvals
 */
export const MATERIAL_TRANSACTION_FIELDS = [
  "buyer_price_per_kg",
  "supplier_price_per_kg",
  "base_price",
  "volume",
  "proof_quantity_tonnes",
  "required_tonnes",
  "commodity",
  "cost_transport",
  "cost_handling",
  "handling_cogs",
  "cost_testing",
  "cost_field",
  "cost_other",
  "proposed_service_fee",
  "accepted_service_fees",
  "delivery_location",
  "delivery_district",
];

/**
 * Detects material changes between an existing transaction/deal and an updated payload.
 * Returns { hasMaterialChange, changedFields, requiresRevalidation }
 */
export function detectMaterialChanges(original = {}, updated = {}) {
  const changedFields = [];

  for (const field of MATERIAL_TRANSACTION_FIELDS) {
    const origVal = original[field] !== undefined ? original[field] : original.buyer_requirements?.[field] ?? original.supplier_verification?.[field];
    const updateVal = updated[field] !== undefined ? updated[field] : updated.buyer_requirements?.[field] ?? updated.supplier_verification?.[field];

    if (updateVal !== undefined && origVal !== undefined) {
      // Normalize numbers for precision comparison
      const numOrig = Number(origVal);
      const numUpdate = Number(updateVal);

      if (Number.isFinite(numOrig) && Number.isFinite(numUpdate)) {
        if (Math.abs(numOrig - numUpdate) > 0.0001) {
          changedFields.push({ field, previous: origVal, updated: updateVal });
        }
      } else if (String(origVal).trim() !== String(updateVal).trim()) {
        changedFields.push({ field, previous: origVal, updated: updateVal });
      }
    }
  }

  const isApproved = original.status === "Approved" ||
                     original.approval_status === "Approved" ||
                     original.status === "DealPackComplete";

  const hasMaterialChange = changedFields.length > 0;
  const requiresRevalidation = hasMaterialChange && isApproved;

  return {
    hasMaterialChange,
    requiresRevalidation,
    changedFields,
    newStatus: requiresRevalidation ? "PendingApproval" : (original.status || "Draft"),
  };
}
