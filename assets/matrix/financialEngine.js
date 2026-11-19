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
  { name: "Sunflower", category: "Oilseeds", defaultUnit: "MT", basePriceUnit: "UGX/KG" },
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
  const seenCategories = new Set();
  let proposedTotal = 0;
  let acceptedTotal = 0;
  let earnedRevenue = 0;
  let hasDuplicateFees = false;
  const duplicateFeeNames = [];

  const processedFees = (Array.isArray(fees) ? fees : []).map((fee, idx) => {
    const feeId = fee.id || `fee_${idx}`;
    const amount = parseFinancialInput(fee.amount) || 0;
    const category = fee.category || "Service Fee";
    const payer = fee.payer || "Buyer";
    const status = fee.acceptanceStatus || FEE_ACCEPTANCE.PROPOSED;
    const hasEvidence = Boolean(fee.acceptanceEvidence && String(fee.acceptanceEvidence).trim() !== "");

    const sig = `${category.toLowerCase().trim()}::${payer.toLowerCase().trim()}`;
    const isDuplicate = seenIds.has(feeId) || seenCategories.has(sig);
    seenIds.add(feeId);
    seenCategories.add(sig);

    if (isDuplicate) {
      hasDuplicateFees = true;
      duplicateFeeNames.push(category);
    }

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
    hasDuplicateFees,
    duplicateFeeNames,
    duplicateWarning: hasDuplicateFees
      ? `Duplicate fee detected (${duplicateFeeNames.join(", ")}). Duplicate entries are excluded from earned revenue.`
      : null,
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

/**
 * Evaluate Transaction Record Readiness (10-Point Mandatory Gate)
 * Symmetrically checks all mandatory Deal Pack requirements.
 */
export function evaluateTransactionReadiness(tx = {}) {
  const missing = [];
  if (!tx || typeof tx !== "object") {
    return { isReady: false, missing: ["No transaction record"] };
  }

  // 1. Mandatory Buyer Information & Volume
  const buyerName = tx.buyer_requirements?.buyer_name?.trim();
  if (!buyerName) {
    missing.push("Buyer identity / institution name");
  }
  const tonnes = Number(tx.buyer_requirements?.required_tonnes || tx.supplier_verification?.confirmed_tonnes || 0);
  if (tonnes <= 0) {
    missing.push("Required commercial volume (kg / MT)");
  }

  // 2. Mandatory Supplier Information & Moisture Reading
  const supplierName = tx.supplier_verification?.supplier_name?.trim();
  if (!supplierName) {
    missing.push("Supplier / cooperative name");
  }
  const moisture = Number(tx.supplier_verification?.moisture_reading_pct || 0);
  if (moisture <= 0 || moisture > 15.0) {
    missing.push("Moisture reading (verified between 0.1% and 15.0%)");
  }

  // 3. Mandatory Written CNG Fee & Fee Acceptance
  const feeGross = Number(tx.fee_margin?.expected_gross_fee || 0);
  const feeRate = Number(tx.fee_margin?.cng_fee_per_tonne || 0);
  if (feeGross <= 0 && feeRate < 25000) {
    missing.push("Written CNG service fee (minimum UGX 25,000 floor)");
  }
  const feeStatus = tx.fee_margin?.acceptance_status;
  if (feeStatus !== "Accepted" && feeStatus !== "Confirmed") {
    missing.push("Written fee acceptance confirmation");
  }

  // 4. Mandatory Transport Quotation & Transporter
  const transportCost = tx.transport_collection?.total_transport_cost;
  if (transportCost === null || transportCost === undefined || Number(transportCost) < 0) {
    missing.push("Transport quotation (total cost in UGX or confirmed zero)");
  }
  const transporterName = tx.transport_collection?.transporter_name?.trim();
  if (!transporterName) {
    missing.push("Transport quotation (carrier / haulier identity)");
  }

  // 5. Mandatory Agreed Price & Payment Schedule
  const pricePerKg = Number(tx.payment_terms?.agreed_price_per_kg || 0);
  if (pricePerKg <= 0) {
    missing.push("Agreed price per kilo (UGX)");
  }
  const schedule = tx.payment_terms?.payment_schedule?.trim();
  if (!schedule) {
    missing.push("Agreed payment schedule terms");
  }

  return {
    isReady: missing.length === 0,
    missing,
  };
}


/**
 * ==============================================================================
 *   CNG FEE SPECIFICATION (CNG Fee.pdf) AUTHORITATIVE IMPLEMENTATION
 *   Directives 4.1 - 4.5, 5, 6, 7
 * ==============================================================================
 */

export const SACK_DEFAULTS = {
  Maize: [100], // Common editable default: 100 kg
  Rice: [50, 100], // Common editable defaults: 50 kg or 100 kg
  Beans: [100],
  Soybeans: [100],
  Sorghum: [100],
  Cassava: [100],
  Sunflower: [50, 70],
};

export const COMMODITY_STANDARDS = {
  Maize: {
    statutoryLimitPct: 13.5,
    standardName: "UNBS / EAS 2:2017",
    standardVersion: "EAS 2:2017 (Maize grains — Specification)",
    isPlaceholder: false,
  },
  Rice: {
    statutoryLimitPct: 14.0, // Explicitly a configurable placeholder pending formal UNBS version confirmation
    standardName: "UNBS Milled Rice (Pending Confirmation)",
    standardVersion: "Placeholder 14.0% — Requires Formal UNBS Confirmation",
    isPlaceholder: true,
  },
  Beans: {
    statutoryLimitPct: 14.0,
    standardName: "UNBS / EAS 46:2017",
    standardVersion: "EAS 46:2017",
    isPlaceholder: false,
  },
  Soybeans: {
    statutoryLimitPct: 13.0,
    standardName: "UNBS / EAS 758:2011",
    standardVersion: "EAS 758:2011",
    isPlaceholder: false,
  },
  Sunflower: {
    statutoryLimitPct: 10.0,
    standardName: "UNBS Sunflower Seed",
    standardVersion: "US 103:2017",
    isPlaceholder: false,
  },
};

/**
 * 4.1 Normalize and Reconcile Quantity
 */
export function reconcileQuantity({
  declaredQtyKg = null,
  verifiedWeighedQtyKg = null,
  sackCount = null,
  kgPerSack = null,
  commodity = "Maize",
} = {}) {
  let calculatedKg = null;
  if (sackCount !== null && kgPerSack !== null) {
    calculatedKg = Number(sackCount) * Number(kgPerSack);
  }

  const verifiedQtyKg = verifiedWeighedQtyKg !== null
    ? Number(verifiedWeighedQtyKg)
    : (declaredQtyKg !== null ? Number(declaredQtyKg) : (calculatedKg ?? 0));

  const quantityMt = verifiedQtyKg / 1000;
  const varianceKg = declaredQtyKg !== null && verifiedWeighedQtyKg !== null
    ? Number(verifiedWeighedQtyKg) - Number(declaredQtyKg)
    : 0;

  return {
    declaredQtyKg: declaredQtyKg !== null ? Number(declaredQtyKg) : calculatedKg,
    verifiedWeighedQtyKg: verifiedWeighedQtyKg !== null ? Number(verifiedWeighedQtyKg) : verifiedQtyKg,
    verifiedQtyKg,
    quantityMt,
    sackCount: sackCount !== null ? Number(sackCount) : null,
    kgPerSack: kgPerSack !== null ? Number(kgPerSack) : (SACK_DEFAULTS[commodity]?.[0] ?? 100),
    varianceKg,
    hasVariance: Math.abs(varianceKg) > 0.001,
  };
}

/**
 * 4.2 Authoritative CNG Procurement Service Fee Calculation
 * 
 * fee_percentage_amount = 0.03 * agreed_commodity_value
 * fee_floor_amount = quantity_mt * 40000
 * cng_procurement_fee = max(fee_percentage_amount, fee_floor_amount)
 * 
 * Fee base is BUYER'S AGREED COMMODITY VALUE only (excluding transport, handling, CNG charges).
 */
export function calculateCngProcurementFee({
  verifiedQtyKg,
  quantityMt = null,
  buyerAgreedPricePerKg = null,
  buyerAgreedPricePerMt = null,
  agreedCommodityValue = null,
  feePayer = "BUYER", // BUYER, SUPPLIER, SPLIT
  splitBuyerPct = null,
  splitSupplierPct = null,
  splitBuyerAmount = null,
  splitSupplierAmount = null,
  additionalCngServices = [],
} = {}) {
  const qtyKg = Number(verifiedQtyKg ?? (quantityMt ? quantityMt * 1000 : 0));
  const qtyMt = quantityMt !== null ? Number(quantityMt) : qtyKg / 1000;

  let commodityValue = 0;
  if (agreedCommodityValue !== null && agreedCommodityValue !== undefined) {
    commodityValue = Number(agreedCommodityValue);
  } else if (buyerAgreedPricePerKg !== null && buyerAgreedPricePerKg !== undefined) {
    commodityValue = Number(buyerAgreedPricePerKg) * qtyKg;
  } else if (buyerAgreedPricePerMt !== null && buyerAgreedPricePerMt !== undefined) {
    commodityValue = Number(buyerAgreedPricePerMt) * qtyMt;
  }

  const feePercentageAmount = Math.round(0.03 * commodityValue);
  const feeFloorAmount = Math.round(qtyMt * 40000);
  const finalProcurementFee = Math.max(feePercentageAmount, feeFloorAmount);
  const tier = feePercentageAmount >= feeFloorAmount ? "3%_PERCENTAGE_TIER" : "FLOOR_TIER_UGX_40000_MT";

  let additionalServicesTotal = 0;
  const processedAdditionalServices = (Array.isArray(additionalCngServices) ? additionalCngServices : []).map(s => {
    const cost = Number(s.amount || 0);
    additionalServicesTotal += cost;
    return { name: s.name, amount: cost, payer: s.payer || feePayer };
  });

  const totalCngCharges = finalProcurementFee + additionalServicesTotal;

  let buyerAllocatedFee = finalProcurementFee;
  let supplierAllocatedFee = 0;
  let splitValid = true;
  let splitError = null;

  const normalizedPayer = String(feePayer).toUpperCase();
  if (normalizedPayer === "SUPPLIER") {
    buyerAllocatedFee = 0;
    supplierAllocatedFee = finalProcurementFee;
  } else if (normalizedPayer === "SPLIT") {
    if (splitBuyerPct !== null && splitSupplierPct !== null) {
      const totalPct = Number(splitBuyerPct) + Number(splitSupplierPct);
      if (Math.abs(totalPct - 100) > 0.01) {
        splitValid = false;
        splitError = `Split allocation percentages must total exactly 100%. Currently: ${totalPct}%.`;
      } else {
        buyerAllocatedFee = Math.round(finalProcurementFee * (Number(splitBuyerPct) / 100));
        supplierAllocatedFee = finalProcurementFee - buyerAllocatedFee;
      }
    } else if (splitBuyerAmount !== null && splitSupplierAmount !== null) {
      const totalAmt = Number(splitBuyerAmount) + Number(splitSupplierAmount);
      if (Math.abs(totalAmt - finalProcurementFee) > 1) {
        splitValid = false;
        splitError = `Split allocation amounts (UGX ${totalAmt.toLocaleString()}) must match total fee (UGX ${finalProcurementFee.toLocaleString()}).`;
      } else {
        buyerAllocatedFee = Number(splitBuyerAmount);
        supplierAllocatedFee = Number(splitSupplierAmount);
      }
    } else {
      splitValid = false;
      splitError = "Split fee payer requires explicit allocation percentages or amounts.";
    }
  }

  return {
    verifiedQtyKg: qtyKg,
    quantityMt: qtyMt,
    agreedCommodityValue: commodityValue,
    feePercentageAmount,
    feeFloorAmount,
    finalProcurementFee,
    tier,
    feePayer: normalizedPayer,
    buyerAllocatedFee,
    supplierAllocatedFee,
    splitValid,
    splitError,
    additionalServicesTotal,
    additionalCngServices: processedAdditionalServices,
    totalCngCharges,
  };
}

/**
 * 4.3 Authoritative Buyer Total Payable and Landed Cost Coverage
 */
export function calculateBuyerPayableAndCoverage({
  buyerCommodityValue,
  supplierCommodityCost = 0,
  costLines = [],
  cngProcurementFee = 0,
  buyerAllocatedCngFee = null,
  additionalCngCharges = 0,
  buyerAllocatedAdditionalCharges = null,
} = {}) {
  const commVal = Number(buyerCommodityValue || 0);
  const suppCost = Number(supplierCommodityCost || 0);
  const bAllocFee = buyerAllocatedCngFee !== null ? Number(buyerAllocatedCngFee) : Number(cngProcurementFee || 0);
  const bAllocAdd = buyerAllocatedAdditionalCharges !== null ? Number(buyerAllocatedAdditionalCharges) : Number(additionalCngCharges || 0);

  let buyerDirectCosts = 0;
  let supplierDirectCosts = 0;
  let cngDirectCosts = 0;
  const processedCostLines = [];

  for (const line of (Array.isArray(costLines) ? costLines : [])) {
    const amt = Number(line.amount || 0);
    const payer = String(line.payer || "BUYER").toUpperCase();
    if (payer === "BUYER") {
      buyerDirectCosts += amt;
    } else if (payer === "SUPPLIER") {
      supplierDirectCosts += amt;
    } else if (payer === "CNG") {
      cngDirectCosts += amt;
    }
    processedCostLines.push({ ...line, amount: amt, payer });
  }

  const buyerTotalPayable = commVal + buyerDirectCosts + bAllocFee + bAllocAdd;
  const totalLandedCost = suppCost + buyerDirectCosts + supplierDirectCosts + cngDirectCosts;
  const requiredCoverageTarget = totalLandedCost + Number(cngProcurementFee || 0);
  const coverageDifference = buyerTotalPayable - requiredCoverageTarget;
  const isCoveragePassed = buyerTotalPayable >= requiredCoverageTarget;

  return {
    buyerCommodityValue: commVal,
    supplierCommodityCost: suppCost,
    buyerDirectCosts,
    supplierDirectCosts,
    cngDirectCosts,
    buyerAllocatedCngFee: bAllocFee,
    buyerAllocatedAdditionalCharges: bAllocAdd,
    buyerTotalPayable,
    totalLandedCost,
    requiredCoverageTarget,
    coverageDifference,
    isCoveragePassed,
    costLines: processedCostLines,
  };
}

/**
 * 4.4 Authoritative CNG Retained Contribution & Net Profit
 */
export function calculateAuthoritativeCngEconomics({
  earnedOrCollectedFees = 0,
  directCngOperationalCosts = 0,
  companyOverheadAllocation = 0,
  taxRatePct = 0,
  isQualityBlocked = false,
} = {}) {
  if (isQualityBlocked) {
    return {
      earnedOrCollectedFees: 0,
      directCngOperationalCosts: Number(directCngOperationalCosts || 0),
      retainedContribution: null,
      netProfitBeforeTax: null,
      taxProvision: null,
      netProfit: null,
      status: "N/A — QUALITY BLOCKED",
    };
  }

  const fees = Number(earnedOrCollectedFees || 0);
  const directOps = Number(directCngOperationalCosts || 0);
  const retainedContribution = fees - directOps;
  const overhead = Number(companyOverheadAllocation || 0);
  const netProfitBeforeTax = retainedContribution - overhead;
  const taxRate = Number(taxRatePct || 0);
  const taxProvision = netProfitBeforeTax > 0 ? Math.round(netProfitBeforeTax * (taxRate / 100)) : 0;
  const netProfit = netProfitBeforeTax - taxProvision;

  return {
    earnedOrCollectedFees: fees,
    directCngOperationalCosts: directOps,
    retainedContribution,
    overheadAllocation: overhead,
    netProfitBeforeTax,
    taxProvision,
    netProfit,
    status: retainedContribution >= 0 ? "CONTRIBUTION_POSITIVE" : "CONTRIBUTION_NEGATIVE",
  };
}

/**
 * 5. Authoritative Moisture & Quality Gate Evaluator
 */
export function evaluateAuthoritativeMoistureQuality({
  commodity = "Maize",
  actualMoisturePct,
  buyerLimitPct = null,
  statutoryLimitPct = null,
  standardName = null,
  standardVersion = null,
  testDateTime = null,
  tester = null,
  evidence = null,
} = {}) {
  const std = COMMODITY_STANDARDS[commodity] || {
    statutoryLimitPct: 13.5,
    standardName: "UNBS Standard",
    standardVersion: "v1.0",
    isPlaceholder: false,
  };

  const statutory = statutoryLimitPct !== null ? Number(statutoryLimitPct) : std.statutoryLimitPct;
  const buyer = buyerLimitPct !== null ? Number(buyerLimitPct) : statutory;

  const effectiveLimitPct = Math.min(statutory, buyer);
  const actual = Number(actualMoisturePct);

  const isPassed = actual <= effectiveLimitPct;
  const isBoundaryEqual = Math.abs(actual - effectiveLimitPct) < 0.001;

  let qualityStatus = isPassed ? "PASSED" : "FAILED";
  let explanation = "";

  if (isPassed) {
    explanation = `Actual moisture ${actual}% satisfies effective limit ${effectiveLimitPct}% (Statutory: ${statutory}%, Buyer: ${buyer}%).`;
  } else {
    explanation = `Quality Gate FAILED: Actual moisture ${actual}% exceeds effective limit ${effectiveLimitPct}%. ` +
      (buyer > statutory
        ? `Buyer tolerance (${buyer}%) cannot override statutory standard (${statutory}%).`
        : `Stricter buyer limit (${buyer}%) applies.`);
  }

  return {
    commodity,
    actualMoisturePct: actual,
    statutoryLimitPct: statutory,
    buyerLimitPct: buyer,
    effectiveLimitPct,
    isPassed,
    isBoundaryEqual,
    qualityStatus,
    standardName: standardName || std.standardName,
    standardVersion: standardVersion || std.standardVersion,
    isStatutoryPlaceholder: std.isPlaceholder,
    testDateTime: testDateTime || new Date().toISOString(),
    tester: tester || "Field Officer",
    evidence: evidence || "Calibrated probe test",
    explanation,
  };
}

/**
 * 6. Authoritative Quote Validity Evaluator
 */
export function evaluateAuthoritativeQuoteValidity({
  quoteTimestamp,
  quoteExpiry,
  currentServerTime = new Date(),
  extendedBy = null,
  extensionReason = null,
  extensionEvidence = null,
} = {}) {
  if (!quoteTimestamp || !quoteExpiry) {
    return {
      isValid: false,
      isExpired: true,
      error: "Missing quote timestamp or expiry date. Executable quotes require both.",
    };
  }

  const now = new Date(currentServerTime).getTime();
  const expiry = new Date(quoteExpiry).getTime();

  let isExpired = now > expiry;
  let extensionApplied = false;

  if (isExpired && extendedBy) {
    const authorizer = String(extendedBy).trim().toLowerCase();
    if (authorizer === "jovin" || authorizer === "collins") {
      if (extensionReason && extensionEvidence) {
        extensionApplied = true;
        isExpired = false;
      }
    }
  }

  return {
    isValid: !isExpired,
    isExpired,
    quoteTimestamp,
    quoteExpiry,
    currentServerTime: new Date(currentServerTime).toISOString(),
    extensionApplied,
    extendedBy,
    extensionReason,
    extensionEvidence,
  };
}

/**
 * 7. Authoritative Dispatch Gate Evaluator (6 Independent States)
 */
export function evaluateAuthoritativeDispatchGate({
  stockStatus = "PENDING",
  qualityStatus = "PENDING",
  commercialApprovalStatus = "PENDING",
  fundingStatus = "PENDING",
  deliveryStatus = "PENDING",
  feeCollectionStatus = "NOT_INVOICED",
  quotesValid = true,
  logisticsConfirmed = false,
  feeAccepted = false,
  mdException = null,
} = {}) {
  const gates = [];
  const blockers = [];

  const g1 = stockStatus === "VERIFIED";
  gates.push({ gate: "STOCK_VERIFIED", passed: g1, status: stockStatus });
  if (!g1) blockers.push("Stock and verified weighed quantity required");

  const g2 = qualityStatus === "PASSED";
  gates.push({ gate: "QUALITY_PASSED", passed: g2, status: qualityStatus });
  if (!g2) blockers.push("Quality assay moisture must be PASSED");

  gates.push({ gate: "QUOTES_ACTIVE", passed: Boolean(quotesValid) });
  if (!quotesValid) blockers.push("Active unexpired buyer and supplier quotes required");

  gates.push({ gate: "LOGISTICS_CONFIRMED", passed: Boolean(logisticsConfirmed) });
  if (!logisticsConfirmed) blockers.push("Confirmed haulier and delivery arrangements required");

  gates.push({ gate: "FEE_ACCEPTED", passed: Boolean(feeAccepted) });
  if (!feeAccepted) blockers.push("Written fee acceptance confirmation required");

  const g6 = commercialApprovalStatus === "APPROVED";
  gates.push({ gate: "COMMERCIAL_APPROVAL", passed: g6, status: commercialApprovalStatus });
  if (!g6) blockers.push("Commercial underwriting must be APPROVED");

  const g7 = fundingStatus === "FUNDED";
  gates.push({ gate: "FUNDING_CONFIRMED", passed: g7, status: fundingStatus });
  if (!g7) blockers.push("Cleared funding confirmation (FUNDED) required before dispatch");

  const allNormalGatesPassed = g1 && g2 && quotesValid && logisticsConfirmed && feeAccepted && g6 && g7;

  let exceptionActive = false;
  let exceptionAudit = null;
  if (!allNormalGatesPassed && mdException) {
    const authorizer = String(mdException.authorizedBy || "").trim().toLowerCase();
    if (authorizer === "clarence" && mdException.reason && mdException.evidence) {
      exceptionActive = true;
      exceptionAudit = {
        authorizedBy: "Clarence",
        reason: mdException.reason,
        timestamp: mdException.timestamp || new Date().toISOString(),
        evidence: mdException.evidence,
        bypassedBlockers: [...blockers],
      };
    }
  }

  const isDispatchReady = allNormalGatesPassed || exceptionActive;
  const dispatchState = isDispatchReady ? "DISPATCH_PERMITTED" : "DISPATCH_BLOCKED";

  return {
    isDispatchReady,
    dispatchState,
    allNormalGatesPassed,
    exceptionActive,
    exceptionAudit,
    blockers: isDispatchReady ? [] : blockers,
    gates,
    states: {
      stock_status: stockStatus,
      quality_status: qualityStatus,
      commercial_approval_status: commercialApprovalStatus,
      funding_status: fundingStatus,
      delivery_status: isDispatchReady ? "DISPATCHED" : deliveryStatus,
      fee_collection_status: feeCollectionStatus,
    },
  };
}


/**
 * 8. Authoritative Decision Matrix Snapshot & Amendment Control (Section 8)
 * 
 * Transactions inherit the approved Decision Matrix financial snapshot as read-only.
 * Any material financial change creates an amendment, recalculates the matrix,
 * and forces re-approval.
 */
export function createDecisionMatrixSnapshot(matrixResult, metadata = {}) {
  if (!matrixResult) return null;
  const timestamp = new Date().toISOString();
  const snapshotInputs = {
    commodity: matrixResult.commodity || "Maize",
    volumeMT: matrixResult.volumeMT || 0,
    volumeKG: matrixResult.volumeKG || 0,
    basePrice: matrixResult.basePrice || 0,
    buyerPricePerKg: matrixResult.buyerPricePerKg || matrixResult.basePrice || 0,
    transportCost: matrixResult.transportCost || 0,
    handlingCogs: matrixResult.handlingCogs || 0,
    feePayer: matrixResult.feePayer || "BUYER",
  };

  const snapshotOutputs = {
    grossRevenue: matrixResult.grossRevenue || 0,
    totalCosts: matrixResult.totalCosts || 0,
    netMargin: matrixResult.netMargin || 0,
    marginPercentage: matrixResult.marginPercentage || 0,
    cngProcurementFee: matrixResult.cngProcurementFee?.finalProcurementFee || matrixResult.serviceEconomics?.earnedServiceRevenue || 0,
    buyerTotalPayable: matrixResult.buyerPayableBreakdown?.buyerTotalPayable || matrixResult.buyerCoverage?.buyerAmount || 0,
    retainedContribution: matrixResult.serviceEconomics?.retainedContribution || 0,
  };

  return {
    snapshot_version: Number(metadata.version || 1),
    engine_version: "2.1.0-cng-fee-pdf",
    approved_at: metadata.approvedAt || timestamp,
    approved_by: metadata.approvedBy || "Clarence (Managing Director)",
    is_approved_snapshot: true,
    status: "APPROVED_SNAPSHOT",
    inputs: snapshotInputs,
    outputs: snapshotOutputs,
  };
}

/**
 * Detect Material Amendments between Current Form Inputs and Approved Snapshot
 */
export function detectFinancialAmendment(currentInputs = {}, approvedSnapshot = null) {
  if (!approvedSnapshot || !approvedSnapshot.inputs) {
    return { hasAmendment: false, modifiedFields: [], isSnapshotStale: false };
  }

  const snap = approvedSnapshot.inputs;
  const modified = [];

  const currVol = Number(currentInputs.volumeMT || currentInputs.volume || (currentInputs.volumeKG ? currentInputs.volumeKG / 1000 : 0));
  if (Math.abs(currVol - snap.volumeMT) > 0.001) {
    modified.push(`Volume (Snapshot: ${snap.volumeMT} MT, Current: ${currVol} MT)`);
  }

  const currPrice = Number(currentInputs.buyerPricePerKg || currentInputs.basePrice || 0);
  if (Math.abs(currPrice - snap.buyerPricePerKg) > 0.001) {
    modified.push(`Buyer Price (Snapshot: UGX ${snap.buyerPricePerKg}, Current: UGX ${currPrice})`);
  }

  const currTransport = Number(currentInputs.transportCost || 0);
  if (Math.abs(currTransport - snap.transportCost) > 0.001) {
    modified.push(`Transport Cost (Snapshot: UGX ${snap.transportCost}, Current: UGX ${currTransport})`);
  }

  const currPayer = String(currentInputs.feePayer || "BUYER").toUpperCase();
  if (currPayer !== String(snap.feePayer || "BUYER").toUpperCase()) {
    modified.push(`Fee Payer (Snapshot: ${snap.feePayer}, Current: ${currPayer})`);
  }

  const hasAmendment = modified.length > 0;

  return {
    hasAmendment,
    isSnapshotStale: hasAmendment,
    modifiedFields: modified,
    recommendation: hasAmendment
      ? "Material financial terms have changed. Approved snapshot is invalidated. Matrix must be recalculated and resubmitted for Clarence approval."
      : "Current terms match the approved immutable snapshot.",
  };
}
