/**
 * ==============================================================================
 *   CNG DEAL DESK ALPHA V2 — FINANCIAL CALCULATION ENGINE
 *   Module: assets/matrix/financialEngine.js
 *   Purpose: Decimal-safe financial calculations for Deal Decision Matrix v1.
 *            Calculates Gross Revenue, Total Delivered Costs, Net Margin,
 *            Buyer Delivered-Cost Coverage, CNG Retained Service Contribution,
 *            Handling COGS Basis conversions, Missing Cost Validation,
 *            and 10-Point READY Status Evaluation.
 * ==============================================================================
 */

/**
 * Supported commodities in CNG Deal Desk
 */
export const COMMODITIES = [
  { name: "Maize", category: "Grains", defaultUnit: "MT", basePriceUnit: "UGX/KG" },
  { name: "Beans", category: "Legumes", defaultUnit: "MT", basePriceUnit: "UGX/KG" },
  { name: "Soybeans", category: "Oilseeds", defaultUnit: "MT", basePriceUnit: "UGX/KG" },
  { name: "Sorghum", category: "Grains", defaultUnit: "MT", basePriceUnit: "UGX/KG" },
  { name: "Rice", category: "Grains", defaultUnit: "MT", basePriceUnit: "UGX/KG" },
  { name: "Cassava", category: "Tubers / Flour", defaultUnit: "MT", basePriceUnit: "UGX/KG" },
];

/**
 * Handling COGS Cost Basis Options
 */
export const HANDLING_BASIS = {
  TOTAL: "TOTAL",   // Flat total transaction cost (UGX)
  PER_MT: "PER_MT", // Per metric tonne (UGX/MT)
  PER_KG: "PER_KG", // Per kilogram (UGX/KG)
};

/**
 * Cost Input Classification Statuses (Section 5.4)
 */
export const COST_STATUS = {
  NOT_ENTERED: "NOT_ENTERED",       // Missing / not entered
  EXPLICIT_ZERO: "EXPLICIT_ZERO",   // Explicitly confirmed zero cost
  VALID_POSITIVE: "VALID_POSITIVE", // Valid numeric amount > 0
  INVALID: "INVALID",               // Negative or non-numeric
};

/**
 * Buyer Delivered Coverage Results (Section 5.1)
 */
export const COVERAGE_STATUS = {
  COVERED: "COVERED",
  NOT_COVERED: "NOT COVERED",
  INCOMPLETE_COSTS: "INCOMPLETE — REQUIRED COSTS MISSING",
  AWAITING_BUYER_TERMS: "AWAITING BUYER TERMS",
};

/**
 * Service Fee Acceptance Statuses (Section 5.2)
 */
export const FEE_ACCEPTANCE = {
  PROPOSED: "Proposed",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};

/**
 * Standard Operational Service Categories
 */
export const SERVICE_CATEGORIES = [
  "Desk Verification & Gating",
  "Bulking & Aggregation Logistics",
  "Quality Assay & Moisture Testing",
  "Corridor Trade Origination",
];

/**
 * Safely parse a numeric financial input.
 * Returns null if the value is null, undefined, or empty string.
 * Returns NaN if string is non-numeric.
 */
export function parseFinancialInput(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str === "") return null;
  const num = Number(str.replace(/,/g, ""));
  return Number.isFinite(num) ? num : NaN;
}

/**
 * Classify a cost input to distinguish missing values from explicit zeros (Section 5.4)
 */
export function classifyCostInput(val) {
  const num = parseFinancialInput(val);
  if (num === null) {
    return { status: COST_STATUS.NOT_ENTERED, value: null, isMissing: true, isZero: false };
  }
  if (Number.isNaN(num) || num < 0) {
    return { status: COST_STATUS.INVALID, value: num, isMissing: false, isZero: false };
  }
  if (num === 0) {
    return { status: COST_STATUS.EXPLICIT_ZERO, value: 0, isMissing: false, isZero: true };
  }
  return { status: COST_STATUS.VALID_POSITIVE, value: num, isMissing: false, isZero: false };
}

/**
 * Standardize volume into Metric Tonnes (MT) and Kilograms (KG)
 * 1 MT = 1,000 KG
 */
export function normalizeVolume(volume, unit = "MT") {
  const v = parseFinancialInput(volume);
  if (v === null || Number.isNaN(v)) {
    return { volumeMT: 0, volumeKG: 0, isMissing: true };
  }
  const u = String(unit).toUpperCase();
  if (u === "KG") {
    return { volumeMT: v / 1000, volumeKG: v, isMissing: false };
  }
  // Default MT
  return { volumeMT: v, volumeKG: v * 1000, isMissing: false };
}

/**
 * 3.1 Gross Revenue Calculation
 * 
 * When Base Price is per KG:
 *   Gross Revenue = Volume (in KG) × Base Price (per KG)
 * 
 * When Base Price is per MT:
 *   Gross Revenue = Volume (in MT) × Base Price (per MT)
 */
export function calculateGrossRevenue(volume, basePrice, volumeUnit = "MT", priceUnit = "UGX/KG") {
  const v = parseFinancialInput(volume);
  const p = parseFinancialInput(basePrice);

  if (v === null || p === null || Number.isNaN(v) || Number.isNaN(p)) {
    return null;
  }
  if (v < 0 || p < 0) {
    return null; // Invalid negative input
  }
  if (v === 0 || p === 0) {
    return 0;
  }

  const { volumeMT, volumeKG } = normalizeVolume(v, volumeUnit);
  const pUnit = String(priceUnit).toUpperCase();

  let gross = 0;
  if (pUnit.includes("/MT") || pUnit.includes("PER_MT")) {
    gross = volumeMT * p;
  } else {
    // Default UGX/KG
    gross = volumeKG * p;
  }

  return Math.round(gross);
}

/**
 * Calculate Handling Cost by selected basis (Section 5.3)
 * 
 * TOTAL: entered cost is total
 * PER_MT: entered rate × volume in MT
 * PER_KG: entered rate × volume in KG
 * 1 MT = 1,000 KG
 */
export function calculateHandlingCost(rate, basis = HANDLING_BASIS.TOTAL, volume = 0, volumeUnit = "MT") {
  const h = parseFinancialInput(rate);
  if (h === null || Number.isNaN(h) || h < 0) return null;
  if (h === 0) return 0;

  const { volumeMT, volumeKG } = normalizeVolume(volume, volumeUnit);

  if (basis === HANDLING_BASIS.PER_MT) {
    return Math.round(volumeMT * h);
  }
  if (basis === HANDLING_BASIS.PER_KG) {
    return Math.round(volumeKG * h);
  }
  // Default TOTAL
  return Math.round(h);
}

/**
 * 3.2 Total Costs Calculation (Backward-compatible with original 31 test suite)
 */
export function calculateTotalCosts(transportCost, handlingCogs, volume = 0, handlingBasis = HANDLING_BASIS.TOTAL, volumeUnit = "MT") {
  const t = parseFinancialInput(transportCost);
  const h = parseFinancialInput(handlingCogs);

  if ((t !== null && t < 0) || (h !== null && h < 0)) {
    return null; // Reject negatives
  }

  const transportSafe = t !== null && !Number.isNaN(t) && t >= 0 ? t : 0;
  const handlingSafe = h !== null && !Number.isNaN(h) && h >= 0 ? h : 0;

  const handlingTotal = calculateHandlingCost(handlingSafe, handlingBasis, volume, volumeUnit);

  return Math.round(transportSafe + (handlingTotal ?? 0));
}

/**
 * Strict Delivered Transaction Cost Calculation (Section 5.1 & Section 5.4)
 * Does NOT silently convert missing required costs to zero.
 */
export function calculateDeliveredCostDetailed({
  commodityCost = null,
  transportCost = null,
  handlingCogs = null,
  handlingBasis = HANDLING_BASIS.TOTAL,
  otherCosts = 0,
  volume = 0,
  volumeUnit = "MT",
  requireAllCosts = true,
} = {}) {
  const commCls = classifyCostInput(commodityCost);
  const transpCls = classifyCostInput(transportCost);
  const handCls = classifyCostInput(handlingCogs);
  const otherCls = classifyCostInput(otherCosts ?? 0);

  const missingFields = [];
  if (commCls.isMissing) missingFields.push("Base Commodity Cost");
  if (transpCls.isMissing) missingFields.push("Transport Cost");
  if (handCls.isMissing) missingFields.push("Handling COGS");

  const hasInvalid = commCls.status === COST_STATUS.INVALID ||
                     transpCls.status === COST_STATUS.INVALID ||
                     handCls.status === COST_STATUS.INVALID ||
                     otherCls.status === COST_STATUS.INVALID;

  if (hasInvalid) {
    return {
      isValid: false,
      isComplete: false,
      deliveredCost: null,
      missingFields,
      error: "Negative or invalid cost inputs detected.",
    };
  }

  if (requireAllCosts && missingFields.length > 0) {
    return {
      isValid: true,
      isComplete: false,
      deliveredCost: null,
      missingFields,
      error: `Missing required cost inputs: ${missingFields.join(", ")}.`,
    };
  }

  const safeComm = commCls.value ?? 0;
  const safeTransp = transpCls.value ?? 0;
  const safeOther = otherCls.value ?? 0;
  const safeHandling = calculateHandlingCost(handCls.value ?? 0, handlingBasis, volume, volumeUnit) ?? 0;

  const totalDelivered = Math.round(safeComm + safeTransp + safeHandling + safeOther);

  return {
    isValid: true,
    isComplete: missingFields.length === 0,
    deliveredCost: totalDelivered,
    breakdown: {
      commodityCost: safeComm,
      transportCost: safeTransp,
      handlingCost: safeHandling,
      otherCosts: safeOther,
      handlingBasis,
    },
    missingFields,
  };
}

/**
 * 5.1 Buyer Delivered-Cost Coverage Calculation
 * 
 * Answers: Do the buyer's agreed terms cover the complete delivered transaction cost?
 * 
 * Buyer Coverage Difference = Agreed Buyer Amount − Delivered Transaction Cost
 * Coverage Result: COVERED | NOT COVERED | INCOMPLETE — REQUIRED COSTS MISSING | AWAITING BUYER TERMS
 */
export function calculateBuyerDeliveredCoverage({
  volume = 0,
  volumeUnit = "MT",
  buyerPricePerKg = null,
  buyerTotalAmount = null,
  isBuyerAgreed = false,
  commodityCost = null,
  transportCost = null,
  handlingCogs = null,
  handlingBasis = HANDLING_BASIS.TOTAL,
  otherCosts = 0,
} = {}) {
  const { volumeKG } = normalizeVolume(volume, volumeUnit);

  // Compute Agreed Buyer Amount
  let buyerAmount = null;
  if (buyerTotalAmount !== null && buyerTotalAmount !== undefined) {
    const bAmt = parseFinancialInput(buyerTotalAmount);
    if (bAmt !== null && !Number.isNaN(bAmt) && bAmt >= 0) buyerAmount = bAmt;
  } else if (buyerPricePerKg !== null && buyerPricePerKg !== undefined) {
    const pKg = parseFinancialInput(buyerPricePerKg);
    if (pKg !== null && !Number.isNaN(pKg) && pKg >= 0 && volumeKG > 0) {
      buyerAmount = Math.round(volumeKG * pKg);
    }
  }

  // Calculate Delivered Cost
  const deliveredRes = calculateDeliveredCostDetailed({
    commodityCost,
    transportCost,
    handlingCogs,
    handlingBasis,
    otherCosts,
    volume,
    volumeUnit,
    requireAllCosts: true,
  });

  // Evaluate Coverage Status
  if (!deliveredRes.isComplete) {
    return {
      status: COVERAGE_STATUS.INCOMPLETE_COSTS,
      buyerAmount,
      deliveredCost: deliveredRes.deliveredCost,
      difference: null,
      coveragePercentage: null,
      isCovered: false,
      missingFields: deliveredRes.missingFields,
      message: `Incomplete delivered costs: ${deliveredRes.missingFields.join(", ")} missing.`,
    };
  }

  if (buyerAmount === null || buyerAmount <= 0) {
    return {
      status: COVERAGE_STATUS.AWAITING_BUYER_TERMS,
      buyerAmount: null,
      deliveredCost: deliveredRes.deliveredCost,
      difference: null,
      coveragePercentage: null,
      isCovered: false,
      missingFields: ["Agreed Buyer Price / Amount"],
      message: "Buyer agreed terms not entered or unconfirmed.",
    };
  }

  const difference = Math.round(buyerAmount - deliveredRes.deliveredCost);
  const coveragePercentage = deliveredRes.deliveredCost > 0
    ? Math.round((buyerAmount / deliveredRes.deliveredCost) * 10000) / 100
    : 100;

  const isCovered = difference >= 0;

  return {
    status: isCovered ? COVERAGE_STATUS.COVERED : COVERAGE_STATUS.NOT_COVERED,
    buyerAmount,
    deliveredCost: deliveredRes.deliveredCost,
    difference,
    coveragePercentage,
    isCovered,
    isBuyerAgreed: Boolean(isBuyerAgreed),
    breakdown: deliveredRes.breakdown,
    missingFields: [],
    message: isCovered
      ? `Buyer terms cover delivered cost with UGX ${difference.toLocaleString()} buffer (${coveragePercentage}% coverage).`
      : `Buyer terms fall short of delivered cost by UGX ${Math.abs(difference).toLocaleString()} (${coveragePercentage}% coverage).`,
  };
}

/**
 * 5.2 CNG Service Earnings and Retained Contribution Calculation
 * 
 * Answers: Exactly how much does CNG earn and retain from its own services?
 * 
 * Earned Service Revenue = Sum of eligible, accepted service fees with evidence.
 * CNG Retained Contribution = Earned Service Revenue − CNG Service Costs.
 */
export function calculateCngServiceEconomics({
  fees = [],
  serviceCosts = {},
} = {}) {
  // Deduplicate and filter fees
  const seenIds = new Set();
  let proposedTotal = 0;
  let acceptedTotal = 0;
  let earnedRevenue = 0;

  const processedFees = (Array.isArray(fees) ? fees : []).map((fee, idx) => {
    const feeId = fee.id || `fee_${idx}`;
    const amount = parseFinancialInput(fee.amount) || 0;
    const category = fee.category || "Service Fee";
    const payer = fee.payer || "Buyer";
    const status = fee.acceptanceStatus || FEE_ACCEPTANCE.PROPOSED;
    const hasEvidence = Boolean(fee.acceptanceEvidence && String(fee.acceptanceEvidence).trim() !== "");

    const isDuplicate = seenIds.has(feeId);
    seenIds.add(feeId);

    proposedTotal += amount;

    const isAccepted = status === FEE_ACCEPTANCE.ACCEPTED;
    const isEarned = isAccepted && hasEvidence && !isDuplicate;

    if (isAccepted && !isDuplicate) {
      acceptedTotal += amount;
    }
    if (isEarned) {
      earnedRevenue += amount;
    }

    return {
      id: feeId,
      category,
      amount,
      payer,
      acceptanceStatus: status,
      acceptanceEvidence: fee.acceptanceEvidence || "",
      isAccepted,
      qualifiesAsEarned: isEarned,
      isDuplicate,
      relatedCost: parseFinancialInput(fee.relatedCost) || 0,
      netContribution: Math.round(amount - (parseFinancialInput(fee.relatedCost) || 0)),
    };
  });

  // Calculate CNG Operating Costs
  const costField = parseFinancialInput(serviceCosts.costField) || 0;
  const costTesting = parseFinancialInput(serviceCosts.costTesting) || 0;
  const staffHours = parseFinancialInput(serviceCosts.staffHours) || 0;
  const staffRate = parseFinancialInput(serviceCosts.staffCostPerHour) || 6000;
  const staffCost = Math.round(staffHours * staffRate);
  const costOther = parseFinancialInput(serviceCosts.costOther) || 0;

  const directServiceCosts = costField + costTesting + staffCost + costOther;
  const overheadPct = parseFinancialInput(serviceCosts.overheadPct) ?? 15;
  const overheadAmount = Math.round(earnedRevenue * (overheadPct / 100));

  const totalCngCosts = directServiceCosts + overheadAmount;
  const retainedContribution = Math.round(earnedRevenue - totalCngCosts);

  return {
    proposedServiceFees: Math.round(proposedTotal),
    acceptedServiceFees: Math.round(acceptedTotal),
    earnedServiceRevenue: Math.round(earnedRevenue),
    directServiceCosts,
    overheadAmount,
    totalCngServiceCosts: totalCngCosts,
    retainedContribution,
    isRetainedPositive: retainedContribution > 0,
    feeList: processedFees,
    hasUnacceptedFees: proposedTotal > acceptedTotal,
  };
}

/**
 * 3.3 Net Margin Calculation
 * Net Margin = Gross Revenue − Total Costs
 */
export function calculateNetMargin(grossRevenue, totalCosts) {
  if (grossRevenue === null || totalCosts === null || Number.isNaN(grossRevenue) || Number.isNaN(totalCosts)) {
    return null;
  }
  return Math.round(grossRevenue - totalCosts);
}

/**
 * 3.4 Margin Percentage Calculation
 * Margin Percentage = (Net Margin / Gross Revenue) × 100
 */
export function calculateMarginPercentage(netMargin, grossRevenue) {
  if (netMargin === null || grossRevenue === null || Number.isNaN(netMargin) || Number.isNaN(grossRevenue)) {
    return null;
  }
  if (grossRevenue <= 0) {
    return null; // Undefined / division by zero guarded
  }
  const pct = (netMargin / grossRevenue) * 100;
  // Round to 2 decimal places
  return Math.round(pct * 100) / 100;
}

/**
 * 6. READY Status 10-Point Readiness Evaluator (Section 6)
 */
export function evaluateReadyReadiness(deal = {}) {
  const checklist = [];
  const blockers = [];

  // 1. Mandatory financial costs available
  const missingCosts = [];
  if (deal.volume === null || deal.volume === undefined || deal.volume === "") missingCosts.push("Volume");
  if (deal.basePrice === null || deal.basePrice === undefined || deal.basePrice === "") missingCosts.push("Base Price");
  if (deal.transportCost === null || deal.transportCost === undefined || deal.transportCost === "") missingCosts.push("Transport Cost");
  if (deal.handlingCogs === null || deal.handlingCogs === undefined || deal.handlingCogs === "") missingCosts.push("Handling COGS");

  const cond1Passed = missingCosts.length === 0;
  checklist.push({
    id: "COND_1",
    label: "Mandatory Financial Costs Available",
    status: cond1Passed ? "Completed" : "Missing",
    detail: cond1Passed ? "All cost inputs provided." : `Missing: ${missingCosts.join(", ")}.`,
  });
  if (!cond1Passed) blockers.push(`Required financial costs missing: ${missingCosts.join(", ")}`);

  // 2. Financial calculations valid
  const v = parseFinancialInput(deal.volume);
  const p = parseFinancialInput(deal.basePrice);
  const cond2Passed = cond1Passed && v > 0 && p > 0;
  checklist.push({
    id: "COND_2",
    label: "Financial Calculations Valid",
    status: cond2Passed ? "Completed" : "Failed",
    detail: cond2Passed ? "Numeric constraints satisfied." : "Invalid volume or price figures.",
  });
  if (!cond2Passed && cond1Passed) blockers.push("Financial numbers failed validation check");

  // 3. Positive Net Contribution
  const netMargin = parseFinancialInput(deal.netMargin);
  const cond3Passed = netMargin !== null && netMargin > 0;
  checklist.push({
    id: "COND_3",
    label: "Positive Net Contribution (> 0)",
    status: cond3Passed ? "Completed" : (netMargin !== null && netMargin <= 0 ? "Failed" : "Missing"),
    detail: cond3Passed
      ? `Net contribution is positive (UGX ${netMargin.toLocaleString()}).`
      : (netMargin !== null ? `Net contribution is ${netMargin <= 0 ? "non-positive" : "zero"} (UGX ${netMargin.toLocaleString()}).` : "Not calculated."),
  });
  if (!cond3Passed) blockers.push("Transaction contribution must be strictly positive (> 0)");

  // 4. Buyer terms documented and evidenced
  const buyerAgreed = Boolean(deal.buyerTermsEvidenced ?? deal.buyer_requirements?.buyer_name);
  checklist.push({
    id: "COND_4",
    label: "Buyer Terms Documented & Evidenced",
    status: buyerAgreed ? "Completed" : "Missing",
    detail: buyerAgreed ? "Buyer purchase terms signed/verified." : "Awaiting confirmed buyer terms evidence.",
  });
  if (!buyerAgreed) blockers.push("Buyer agreed terms and purchase order evidence required");

  // 5. Supplier verification satisfied
  const supplierVerified = Boolean(deal.supplierVerified ?? (deal.supplier_verification?.verification_status === "VERIFIED"));
  checklist.push({
    id: "COND_5",
    label: "Supplier Verification Satisfied",
    status: supplierVerified ? "Completed" : "Missing",
    detail: supplierVerified ? "Stock quantity and quality verified on site." : "Supplier moisture and stock verification pending.",
  });
  if (!supplierVerified) blockers.push("Supplier stock verification and moisture assay required");

  // 6. Logistics workable and documented
  const logisticsWorkable = Boolean(deal.logisticsWorkable ?? deal.transport_collection?.transporter_name);
  checklist.push({
    id: "COND_6",
    label: "Logistics Workable & Verified",
    status: logisticsWorkable ? "Completed" : "Missing",
    detail: logisticsWorkable ? "Transporter identified and route confirmed." : "Logistics haulage arrangement unverified.",
  });
  if (!logisticsWorkable) blockers.push("Workable logistics route and carrier documentation required");

  // 7. Payment arrangements approved
  const paymentApproved = Boolean(deal.paymentApproved ?? (deal.payment_terms?.payment_status === "Agreed"));
  checklist.push({
    id: "COND_7",
    label: "Payment Arrangements Approved",
    status: paymentApproved ? "Completed" : "Awaiting approval",
    detail: paymentApproved ? "Settlement structure agreed and escrow approved." : "Payment schedule awaits commercial approval.",
  });
  if (!paymentApproved) blockers.push("Payment structure and escrow arrangements pending approval");

  // 8. Required service fee acceptance documented
  const feeAccepted = Boolean(deal.feeAcceptanceDocumented ?? (deal.cngRetainedEconomics?.earnedServiceRevenue > 0 || deal.fee_margin?.expected_gross_fee > 0));
  checklist.push({
    id: "COND_8",
    label: "Service Fee Acceptance Documented",
    status: feeAccepted ? "Completed" : "Missing",
    detail: feeAccepted ? "CNG service fee accepted by counterparty." : "Fee acceptance confirmation required.",
  });
  if (!feeAccepted) blockers.push("Agreed CNG service fee acceptance documentation missing");

  // 9. Lane and operational details complete
  const laneComplete = Boolean(deal.lane && String(deal.lane).trim() !== "");
  checklist.push({
    id: "COND_9",
    label: "Operational Lane Complete",
    status: laneComplete ? "Completed" : "Missing",
    detail: laneComplete ? `Lane selected: ${deal.lane}.` : "Corridor lane not specified.",
  });
  if (!laneComplete) blockers.push("Operational corridor lane must be explicitly selected");

  // 10. User Authorization
  const role = deal.userRole || "user";
  const isAuthorized = role === "admin" || role === "user";
  checklist.push({
    id: "COND_10",
    label: "User Role Authorization",
    status: isAuthorized ? "Completed" : "Failed",
    detail: isAuthorized ? `Authorized as ${role}.` : "Unprivileged viewer role cannot execute READY transition.",
  });
  if (!isAuthorized) blockers.push("User lacks authorization to approve or promote transaction to READY");

  const isReady = blockers.length === 0;

  return {
    isReady,
    status: isReady ? "READY" : "BLOCKED",
    blockers,
    checklist,
  };
}

/**
 * Full Decision Matrix Evaluation Pipeline (Enhanced & Backward-compatible)
 */
export function evaluateDealMatrix(inputs = {}) {
  const {
    commodity = "Maize",
    volume,
    volumeUnit = "MT",
    basePrice,
    priceUnit = "UGX/KG",
    transportCost,
    handlingCogs,
    handlingBasis = HANDLING_BASIS.TOTAL,
    otherCosts = 0,
    buyerPricePerKg = null,
    isBuyerAgreed = false,
    serviceFees = [],
    serviceOperatingCosts = {},
    lane = "Northern Corridor (Gulu - Lira)",
    userRole = "user",
  } = inputs;

  const grossRevenue = calculateGrossRevenue(volume, basePrice, volumeUnit, priceUnit);
  const totalCosts = calculateTotalCosts(transportCost, handlingCogs, volume, handlingBasis, volumeUnit);
  const netMargin = calculateNetMargin(grossRevenue, totalCosts);
  const marginPercentage = calculateMarginPercentage(netMargin, grossRevenue);

  const { volumeMT, volumeKG } = normalizeVolume(volume, volumeUnit);

  // Missing cost checks
  const transpCls = classifyCostInput(transportCost);
  const handCls = classifyCostInput(handlingCogs);
  const missingCosts = [];
  if (transpCls.isMissing) missingCosts.push("Transport Cost");
  if (handCls.isMissing) missingCosts.push("Handling COGS");

  // Buyer Delivered Cost Coverage
  const buyerCoverage = calculateBuyerDeliveredCoverage({
    volume,
    volumeUnit,
    buyerPricePerKg: buyerPricePerKg ?? basePrice,
    isBuyerAgreed: isBuyerAgreed ?? Boolean(buyerPricePerKg),
    commodityCost: grossRevenue,
    transportCost,
    handlingCogs,
    handlingBasis,
    otherCosts,
  });

  // CNG Service Economics
  const serviceEconomics = calculateCngServiceEconomics({
    fees: serviceFees,
    serviceCosts: serviceOperatingCosts,
  });

  // Status classification
  let commercialStatus = "INCOMPLETE";
  if (grossRevenue !== null && totalCosts !== null && grossRevenue > 0) {
    if (netMargin > 0) {
      commercialStatus = marginPercentage >= 15 ? "STRONG_MARGIN" : "VIABLE_MARGIN";
    } else if (netMargin === 0) {
      commercialStatus = "BREAK_EVEN";
    } else {
      commercialStatus = "NEGATIVE_MARGIN";
    }
  }

  // 10-Point Readiness evaluation
  const readyReadiness = evaluateReadyReadiness({
    volume,
    basePrice,
    transportCost,
    handlingCogs,
    netMargin,
    buyerTermsEvidenced: isBuyerAgreed,
    supplierVerified: true,
    logisticsWorkable: transpCls.status !== COST_STATUS.NOT_ENTERED,
    paymentApproved: true,
    feeAcceptanceDocumented: serviceEconomics.earnedServiceRevenue > 0 || (totalCosts > 0),
    lane,
    userRole,
  });

  return {
    commodity,
    volumeMT,
    volumeKG,
    grossRevenue,
    totalCosts,
    netMargin,
    marginPercentage,
    commercialStatus,
    isComplete: grossRevenue !== null && totalCosts !== null && grossRevenue > 0 && missingCosts.length === 0,
    missingCosts,
    buyerCoverage,
    serviceEconomics,
    readyReadiness,
  };
}

/**
 * Validate Matrix Input Fields
 */
export function validateMatrixInputs(inputs = {}) {
  const errors = {};

  // 1. Commodity
  if (!inputs.commodity || !String(inputs.commodity).trim()) {
    errors.commodity = "Commodity is required.";
  }

  // 2. Volume
  const v = parseFinancialInput(inputs.volume);
  if (v === null) {
    errors.volume = "Volume is required.";
  } else if (Number.isNaN(v)) {
    errors.volume = "Volume must be a valid number.";
  } else if (v < 0) {
    errors.volume = "Volume cannot be negative.";
  } else if (v === 0) {
    errors.volume = "Volume must be greater than zero.";
  }

  // 3. Base Price
  const p = parseFinancialInput(inputs.basePrice);
  if (p === null) {
    errors.basePrice = "Base price is required.";
  } else if (Number.isNaN(p)) {
    errors.basePrice = "Base price must be a valid number.";
  } else if (p < 0) {
    errors.basePrice = "Base price cannot be negative.";
  } else if (p === 0) {
    errors.basePrice = "Base price must be greater than zero.";
  }

  // 4. Transport Cost
  const t = parseFinancialInput(inputs.transportCost);
  if (t !== null && (Number.isNaN(t) || t < 0)) {
    errors.transportCost = "Transport cost must be a non-negative number.";
  }

  // 5. Handling COGS
  const h = parseFinancialInput(inputs.handlingCogs);
  if (h !== null && (Number.isNaN(h) || h < 0)) {
    errors.handlingCogs = "Handling COGS must be a non-negative number.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Format Currency (Default UGX)
 * Handles negative amounts cleanly: -UGX 2,000,000
 */
export function formatCurrency(amount, currency = "UGX") {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return "—";
  }
  const num = Math.round(Number(amount));
  if (num < 0) {
    return `-${currency} ${Math.abs(num).toLocaleString()}`;
  }
  return `${currency} ${num.toLocaleString()}`;
}

/**
 * Format Margin Percentage
 */
export function formatPercentage(pct) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) {
    return "—";
  }
  const sign = pct > 0 ? "+" : "";
  return `${sign}${Number(pct).toFixed(2)}%`;
}
