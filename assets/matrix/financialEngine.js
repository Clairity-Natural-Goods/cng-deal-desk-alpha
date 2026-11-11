/**
 * ==============================================================================
 *   CNG DEAL DESK ALPHA V2 — FINANCIAL CALCULATION ENGINE
 *   Module: assets/matrix/financialEngine.js
 *   Purpose: Decimal-safe financial calculations for Deal Decision Matrix v1.
 *            Calculates Gross Revenue, Total Costs, Net Margin, Margin Percentage,
 *            with configurable Handling COGS basis and strict input validation.
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
  TOTAL: "TOTAL", // Flat total transaction cost
  PER_MT: "PER_MT", // Per metric tonne
  PER_KG: "PER_KG", // Per kilogram
};

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
 * 
 * Decimal-safe arithmetic: rounds to nearest integer for UGX.
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
 * 3.2 Total Costs Calculation
 * 
 * If Handling COGS is total transaction cost:
 *   Total Costs = Transport Cost + Handling COGS
 * 
 * If Handling COGS is per unit (per MT):
 *   Total Costs = Transport Cost + (Volume in MT × Handling COGS)
 * 
 * If Handling COGS is per unit (per KG):
 *   Total Costs = Transport Cost + (Volume in KG × Handling COGS)
 */
export function calculateTotalCosts(transportCost, handlingCogs, volume = 0, handlingBasis = HANDLING_BASIS.TOTAL, volumeUnit = "MT") {
  const t = parseFinancialInput(transportCost);
  const h = parseFinancialInput(handlingCogs);

  // Missing values treated as 0 for sum if at least one is provided
  const transportSafe = t !== null && !Number.isNaN(t) && t >= 0 ? t : 0;
  const handlingSafe = h !== null && !Number.isNaN(h) && h >= 0 ? h : 0;

  if ((t !== null && t < 0) || (h !== null && h < 0)) {
    return null; // Reject negatives
  }

  const { volumeMT, volumeKG } = normalizeVolume(volume, volumeUnit);

  let handlingTotal = 0;
  if (handlingBasis === HANDLING_BASIS.PER_MT) {
    handlingTotal = volumeMT * handlingSafe;
  } else if (handlingBasis === HANDLING_BASIS.PER_KG) {
    handlingTotal = volumeKG * handlingSafe;
  } else {
    // Default TOTAL
    handlingTotal = handlingSafe;
  }

  return Math.round(transportSafe + handlingTotal);
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
 * 
 * When Gross Revenue is zero or missing:
 * Returns null (unavailable/incomplete state, avoids Infinity or NaN).
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
 * Full Decision Matrix Evaluation Pipeline
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
  } = inputs;

  const grossRevenue = calculateGrossRevenue(volume, basePrice, volumeUnit, priceUnit);
  const totalCosts = calculateTotalCosts(transportCost, handlingCogs, volume, handlingBasis, volumeUnit);
  const netMargin = calculateNetMargin(grossRevenue, totalCosts);
  const marginPercentage = calculateMarginPercentage(netMargin, grossRevenue);

  const { volumeMT, volumeKG } = normalizeVolume(volume, volumeUnit);

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

  return {
    commodity,
    volumeMT,
    volumeKG,
    grossRevenue,
    totalCosts,
    netMargin,
    marginPercentage,
    commercialStatus,
    isComplete: grossRevenue !== null && totalCosts !== null && grossRevenue > 0,
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
 * Handles negative amounts cleanly: -UGX 25,000
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
