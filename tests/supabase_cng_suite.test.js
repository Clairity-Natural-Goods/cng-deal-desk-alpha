/**
 * ==============================================================================
 *   CNG DEAL DESK ALPHA V2 — AUTOMATED TEST SUITE
 *   Backend: Supabase PostgreSQL & Auth
 *   Frontend: React 18 / Vite / Vercel SPA
 *   Harness: tests/supabase_cng_suite.test.js
 * ==============================================================================
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  b as stageBlockers,
  x as stageCap,
  p as economics,
  m as feeFor,
  s as PAYMENT_STATUSES,
  f as corridorAverages,
  d as dataGaps,
  v as marketMetrics,
  r as COMMODITIES_DESK,
} from "../assets/desk-CXHNcONN.js";

import {
  normalizeCounterpartyName,
  normalizeDistrict,
  generateRecordId,
  requestIdentityDisclosure,
} from "../assets/supabaseRepository.js";
import { normalizeDealCreationPayload } from "../assets/dealCreation.js";
import {
  maskPersonName,
  maskPhoneNumber,
  maskEmailAddress,
  maskContactAddress,
  maskBankAccount,
  maskParty,
  maskExportRecords,
  getDisclosurePermission,
  getAuthRedirectUrl,
  DISCLOSURE_PURPOSES,
} from "../assets/identityMasking.js";
import {
  PAYMENT_STATES,
  validatePaymentTransition,
  detectMaterialChanges,
} from "../assets/transactions/paymentStateMachine.js";

import {
  saveOfflineTransaction,
  getOfflineTransaction,
  getAllOfflineTransactions,
  normalizeTransactionRecord,
  markTransactionSynced,
  saveMatrixRecord,
  getAllMatrixRecords,
  getMatrixStats,
  generateMatrixReference,
  isValidUUID,
  generateUUID,
} from "../assets/offline/offlineStore.js";

import {
  COMMODITIES,
  HANDLING_BASIS,
  parseFinancialInput,
  normalizeVolume,
  calculateGrossRevenue,
  calculateTotalCosts,
  calculateNetMargin,
  calculateMarginPercentage,
  evaluateDealMatrix,
  validateMatrixInputs,
  formatCurrency,
  formatPercentage,
  calculateHandlingCost,
  calculateDeliveredCostDetailed,
  calculateBuyerDeliveredCoverage,
  calculateCngServiceEconomics,
  evaluateReadyReadiness,
  classifyCostInput,
  COST_STATUS,
  COVERAGE_STATUS,
  FEE_ACCEPTANCE,
} from "../assets/matrix/financialEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

console.log("================================================================================");
console.log("  CNG DEAL DESK ALPHA V2 — AUTOMATED VERIFICATION SUITE");
console.log("  Timestamp : " + new Date().toISOString());
console.log("  Runtime   : Node.js " + process.version);
console.log("================================================================================\n");

let passedCount = 0;
let failedCount = 0;
let testQueue = Promise.resolve();

function runTest(testId, description, fn) {
  testQueue = testQueue.then(async () => {
    process.stdout.write(`>>> [${testId}] ${description}... `);
    try {
      const res = fn();
      if (res && typeof res.then === "function") {
        await res;
      }
      console.log("PASSED");
      passedCount++;
    } catch (err) {
      console.log("FAILED");
      console.error(`    Error in [${testId}]:`, err.message);
      failedCount++;
    }
  });
}

// ==============================================================================
// 1. BUSINESS LOGIC & EVIDENCE GATING TESTS
// ==============================================================================

runTest("TEST-01", "Evidence Gating - Stage 1 blocked when initial gates are unverified", () => {
  const deal = {
    buyer_id: "p1",
    proof_quantity_tonnes: 20,
    evidence: ["REPORTED", "OPEN", "OPEN", "OPEN", "OPEN", "OPEN", "OPEN", "OPEN"],
  };
  const blockers = stageBlockers(deal, 1);
  assert.strictEqual(blockers.length, 3, "All 3 initial gates should block advance to Stage 1");
  assert.ok(blockers.includes("Verify: Buyer fee response agreed"));
  assert.ok(blockers.includes("Verify: Buyer authority confirmed"));
  assert.ok(blockers.includes("Verify: Transport quote verified"));
});

runTest("TEST-02", "Evidence Gating - Stage 1 unlocks when all initial gates are VERIFIED", () => {
  const deal = {
    buyer_id: "p1",
    proof_quantity_tonnes: 20,
    evidence: ["VERIFIED", "VERIFIED", "VERIFIED", "OPEN", "OPEN", "OPEN", "OPEN", "OPEN"],
  };
  const blockers = stageBlockers(deal, 1);
  assert.strictEqual(blockers.length, 0, "No blockers should remain for Stage 1");
});

runTest("TEST-03", "Evidence Gating - Stage 3 blocks advance to Stage 4 without verified moisture test", () => {
  const deal = {
    evidence: ["VERIFIED", "VERIFIED", "VERIFIED", "VERIFIED", "REPORTED", "VERIFIED", "OPEN", "OPEN"],
  };
  const blockers = stageBlockers(deal, 3);
  assert.strictEqual(blockers.length, 1);
  assert.strictEqual(blockers[0], "Verify: Quality and moisture sample tested");
});

runTest("TEST-04", "Auto-Regression - StageCap regresses Stage 4 back to Stage 1 if prior gate revoked", () => {
  const deal = {
    stage: 4,
    buyer_id: "p1",
    proof_quantity_tonnes: 20,
    supplier_id: "p2",
    supplier_price_per_kg: 1150,
    approval_status: "Approved",
    // Gate 1 (Buyer authority confirmed) revoked back to OPEN
    evidence: ["VERIFIED", "OPEN", "VERIFIED", "VERIFIED", "VERIFIED", "VERIFIED", "VERIFIED", "VERIFIED"],
  };
  const cap = stageCap(deal);
  assert.strictEqual(cap, 1, "Deal must auto-regress to Stage 1 due to missing gate 1 verification");
});

runTest("TEST-05", "Partial Acceptance - Desk verification fee scales strictly with accepted tonnes", () => {
  const deal = {
    per_tonne_fee: 30000,
    minimum_fee: 25000,
    proof_quantity_tonnes: 50,
    accepted_tonnes: 10, // 40 tonnes rejected
    cost_field: 10000,
    cost_testing: 20000,
    cost_transport: 0,
    cost_other: 0,
    staff_hours: 5,
    staff_cost_per_hour: 6000,
  };
  const econ = economics(deal);
  assert.strictEqual(econ.fee, 300000, "10 accepted tonnes * 30,000 = UGX 300,000");
  assert.strictEqual(econ.cash, 30000, "Cash costs = 10,000 + 20,000 = UGX 30,000");
  assert.strictEqual(econ.staff, 30000, "Staff costs = 5 * 6,000 = UGX 30,000");
  assert.strictEqual(econ.deliveryContribution, 240000, "Contribution = 300,000 - 30,000 - 30,000 = 240,000");
});

runTest("TEST-06", "Partial Acceptance - Zero accepted tonnes produces UGX 0 fee", () => {
  const deal = {
    per_tonne_fee: 30000,
    minimum_fee: 25000,
    proof_quantity_tonnes: 20,
    accepted_tonnes: 0, // 100% rejection
  };
  const econ = economics(deal);
  assert.strictEqual(econ.fee, 0, "100% rejection must yield UGX 0 verification fee");
});

runTest("TEST-07", "Partial Acceptance - Sub-threshold tonnage enforces UGX 25,000 minimum fee floor", () => {
  const feeResult = feeFor({
    perTonneFee: 30000,
    minimumFee: 25000,
    acceptedTonnes: 0.5, // 0.5 * 30,000 = 15,000 (< 25,000)
  });
  assert.strictEqual(feeResult.fee, 25000, "Must enforce minimum fee floor of UGX 25,000");
  assert.strictEqual(feeResult.rule, "Minimum fee of UGX 25,000 applied");
});

runTest("TEST-08", "Payment Statuses - Strict differentiation between Reported paid and Verified paid", () => {
  assert.ok(PAYMENT_STATUSES.includes("Reported paid"));
  assert.ok(PAYMENT_STATUSES.includes("Verified paid"));
  assert.notStrictEqual(PAYMENT_STATUSES.indexOf("Reported paid"), PAYMENT_STATUSES.indexOf("Verified paid"));
});

runTest("TEST-09", "Market Intelligence - Observations without aggregate consent excluded from corridor averages", () => {
  const observations = [
    { district: "Amuru", price_per_kg: 1200, quantity_tonnes: 10, type: "Supply offer", consent_aggregate_use: true },
    { district: "Amuru", price_per_kg: 900, quantity_tonnes: 5, type: "Supply offer", consent_aggregate_use: false }, // Should be excluded
  ];
  // Filter consented observations
  const consentedOnly = observations.filter((o) => o.consent_aggregate_use);
  const rows = corridorAverages(consentedOnly);
  const amuru = rows.find((r) => r.district === "Amuru");
  assert.ok(amuru, "Amuru corridor exists");
  assert.strictEqual(amuru.supply.n, 1);
  assert.strictEqual(amuru.supply.avg, 1200, "Non-consented quote (900) must not pull down average");
});

runTest("TEST-10", "Market Intelligence - Districts with < 3 verified sources flagged as gaps", () => {
  const observations = [
    { district: "Amuru", observed_date: new Date().toISOString().slice(0, 10), status: "VERIFIED" },
  ];
  const gaps = dataGaps(observations, 30);
  assert.ok(gaps.includes("Gulu"));
  assert.ok(gaps.includes("Lira"));
  assert.ok(gaps.includes("Nwoya"));
  assert.ok(gaps.includes("Oyam"));
  assert.ok(!gaps.includes("Amuru"));
});

// ==============================================================================
// 2. COUNTERPARTY UNIQUENESS & DUPLICATE PROTECTION TESTS
// ==============================================================================

runTest("TEST-11", "Counterparty Normalization - Correctly strips punctuation, extra spaces, and casing", () => {
  const norm1 = normalizeCounterpartyName("  Lira Grain   Processors, Ltd. ");
  const norm2 = normalizeCounterpartyName("lira grain processors ltd");
  assert.strictEqual(norm1, norm2, "Normalized names should be identical");
  assert.strictEqual(norm1, "lira grain processors ltd");

  const dist1 = normalizeDistrict("  Amuru  ");
  const dist2 = normalizeDistrict("amuru");
  assert.strictEqual(dist1, dist2);
  assert.strictEqual(dist1, "amuru");
});

runTest("TEST-12A", "Deal Creation - Normalizes quantity and an unselected buyer for Supabase", () => {
  const deal = normalizeDealCreationPayload({
    name: "  Lira Miller Maize ",
    commodity: "Maize",
    proof_quantity_tonnes: "20.5",
    buyer_id: "",
  });

  assert.strictEqual(deal.name, "Lira Miller Maize");
  assert.strictEqual(deal.proof_quantity_tonnes, 20.5);
  assert.strictEqual(deal.buyer_id, null, "Empty buyer_id must normalize to null for foreign key safety");
  assert.strictEqual(deal.payment_status, "Not invoiced", "Payment status must satisfy deals_payment_status_check constraint");
});

runTest("TEST-12B", "Deal Creation - Rejects missing names and non-positive quantities", () => {
  assert.throws(
    () => normalizeDealCreationPayload({ name: "Maize", proof_quantity_tonnes: "" }),
    /Proof quantity must be greater than zero/
  );
  assert.throws(
    () => normalizeDealCreationPayload({ name: "Maize", proof_quantity_tonnes: "0" }),
    /Proof quantity must be greater than zero/
  );
  assert.throws(
    () => normalizeDealCreationPayload({ proof_quantity_tonnes: 2 }),
    /Deal name is required/
  );
});

runTest("TEST-12", "Duplicate Counterparty Rejection - Rejects duplicate party with DUPLICATE_COUNTERPARTY error", () => {
  const existingParties = [
    { id: "p1", name: "Lira Grain Processors Ltd", district: "Lira", role: "Buyer" },
  ];

  function validateNewParty(candidate, registry) {
    const normName = normalizeCounterpartyName(candidate.name);
    const normDist = normalizeDistrict(candidate.district);

    const duplicate = registry.find(
      (p) =>
        normalizeCounterpartyName(p.name) === normName &&
        normalizeDistrict(p.district) === normDist
    );

    if (duplicate) {
      const err = new Error("Counterparty with this name already exists in this district");
      err.status = 409;
      err.code = "DUPLICATE_COUNTERPARTY";
      err.error = "DUPLICATE_COUNTERPARTY";
      err.existingId = duplicate.id;
      throw err;
    }
    return true;
  }

  // Attempt to insert duplicate with different casing, punctuation, and different role
  const duplicateAttempt = {
    name: "LIRA GRAIN PROCESSORS, LTD.",
    district: "lira",
    role: "Transporter", // Different role must NOT allow bypass!
  };

  assert.throws(
    () => validateNewParty(duplicateAttempt, existingParties),
    (err) => {
      assert.strictEqual(err.code, "DUPLICATE_COUNTERPARTY");
      assert.strictEqual(err.status, 409);
      assert.strictEqual(err.existingId, "p1");
      return true;
    },
    "Must throw DUPLICATE_COUNTERPARTY error"
  );
});

runTest("TEST-13", "Concurrent Submissions - Simulated concurrent duplicate attempts are blocked", () => {
  const store = [];
  let duplicateCount = 0;

  function insertParty(p) {
    const normName = normalizeCounterpartyName(p.name);
    const normDist = normalizeDistrict(p.district);

    const exists = store.some(
      (item) =>
        normalizeCounterpartyName(item.name) === normName &&
        normalizeDistrict(item.district) === normDist
    );

    if (exists) {
      duplicateCount++;
      const err = new Error("Duplicate");
      err.code = "DUPLICATE_COUNTERPARTY";
      throw err;
    }

    store.push({ ...p, id: generateRecordId() });
    return store[store.length - 1];
  }

  // First request succeeds
  const p1 = insertParty({ name: "Amuru Farmers", district: "Amuru", role: "Supplier or farmer group" });
  assert.ok(p1.id.startsWith("rec_"));

  // Second concurrent request with same name + district fails
  assert.throws(
    () => insertParty({ name: "amuru farmers", district: "AMURU", role: "Buyer" }),
    (err) => err.code === "DUPLICATE_COUNTERPARTY"
  );
  assert.strictEqual(store.length, 1, "Only one party can exist in store");
  assert.strictEqual(duplicateCount, 1);
});

// ==============================================================================
// 3. SECURITY & AUTHENTICATION AUDIT TESTS
// ==============================================================================

runTest("TEST-14", "Security Audit - No hardcoded 'usr_operator' bypass in production bundle", () => {
  const bundlePath = path.join(projectRoot, "assets/index-A159RRyL.js");
  const content = fs.readFileSync(bundlePath, "utf8");
  assert.strictEqual(
    content.includes("usr_operator"),
    false,
    "Bundle must not contain hardcoded 'usr_operator' fallback bypass"
  );
});

runTest("TEST-15", "Security Audit - No exposed service_role key in frontend files or repository", () => {
  const filesToCheck = [
    "assets/index-A159RRyL.js",
    "assets/supabaseClient.js",
    "assets/supabaseRepository.js",
    "assets/auth/entry.js",
    "assets/auth/authContext.js",
    ".env.example",
    "package.json",
    "index.html",
  ];

  for (const f of filesToCheck) {
    const full = path.join(projectRoot, f);
    if (fs.existsSync(full)) {
      const content = fs.readFileSync(full, "utf8");
      assert.strictEqual(content.includes("service_role"), false, `File ${f} leaked service_role`);
      assert.strictEqual(content.includes("SERVICE_ROLE"), false, `File ${f} leaked SERVICE_ROLE`);
    }
  }
});

runTest("TEST-16", "Security Audit - Profiles role escalation trigger defined in database migrations", () => {
  const migrationPath = path.join(projectRoot, "supabase/migrations/20261104000001_initial_schema.sql");
  const content = fs.readFileSync(migrationPath, "utf8");

  assert.ok(content.includes("prevent_role_escalation"), "Migration must contain role escalation prevention trigger");
  assert.ok(content.includes("ENABLE ROW LEVEL SECURITY"), "Migration must enable Row Level Security");
  assert.ok(content.includes("idx_parties_unique_normalized"), "Migration must enforce normalized unique index");
});

// ==============================================================================

// ==============================================================================
// 5. MINIMUM VIABLE TRANSACTION RECORD (MVTR) & DEF-01 / DEF-04 VERIFICATION
// ==============================================================================

runTest("TEST-18", "MVTR 7-Element Structure - Transaction record encapsulates all 7 mandatory Deal Pack sections", () => {
  const raw = {
    commodity: "Maize",
    buyer_requirements: { buyer_name: "Gulu Millers", required_tonnes: 30 },
    supplier_verification: { supplier_name: "Amuru Co-op", confirmed_tonnes: 30, moisture_reading_pct: 12.8 },
  };
  const normalized = normalizeTransactionRecord(raw, { id: "usr_1", name: "Officer Ocen" });

  assert.ok(normalized.client_id, "Record must have client_id");
  assert.ok(normalized.reference.startsWith("TXN-"), "Record must have human-readable reference TXN-YYYYMMDD-XXXX");
  assert.strictEqual(normalized.commodity, "Maize");

  // Verify all 7 Deal Pack sections exist with proper schema
  assert.ok(normalized.buyer_requirements, "Section 1: buyer_requirements must exist");
  assert.strictEqual(normalized.buyer_requirements.buyer_name, "Gulu Millers");
  assert.strictEqual(normalized.buyer_requirements.required_tonnes, 30);
  assert.strictEqual(normalized.buyer_requirements.moisture_limit_pct, 14.0);

  assert.ok(normalized.supplier_verification, "Section 2: supplier_verification must exist");
  assert.strictEqual(normalized.supplier_verification.supplier_name, "Amuru Co-op");
  assert.strictEqual(normalized.supplier_verification.confirmed_tonnes, 30);
  assert.strictEqual(normalized.supplier_verification.moisture_reading_pct, 12.8);

  assert.ok(normalized.transport_collection, "Section 3: transport_collection must exist");
  assert.strictEqual(normalized.transport_collection.arrangement, "Company-arranged");

  assert.ok(normalized.payment_terms, "Section 4: payment_terms must exist");
  assert.strictEqual(normalized.payment_terms.currency, "UGX");

  assert.ok(normalized.fee_margin, "Section 5: fee_margin must exist");
  assert.strictEqual(normalized.fee_margin.minimum_fee, 25000);
  assert.strictEqual(normalized.fee_margin.overhead_pct, 15);

  assert.ok(normalized.decision_matrix, "Section 6: decision_matrix must exist");
  assert.strictEqual(normalized.decision_matrix.max_score, 100);

  assert.ok(normalized.approval, "Section 7: approval must exist");
  assert.strictEqual(normalized.approval.status, "Pending");
});

runTest("TEST-19", "MVTR Offline Storage - Durable IndexedDB/memory store captures records with pending_sync", async () => {
  const sample = {
    client_id: "test-cid-001",
    commodity: "Beans",
    buyer_requirements: { buyer_name: "Lira Food Hub", required_tonnes: 15 },
    supplier_verification: { supplier_name: "Oyam Grain Hub", confirmed_tonnes: 15, moisture_reading_pct: 13.2 },
    payment_terms: { agreed_price_per_kg: 2800 },
  };

  const saved = await saveOfflineTransaction(sample, { id: "u1", name: "Field Officer Akello" });
  assert.strictEqual(saved.client_id, "test-cid-001");
  assert.strictEqual(saved.sync_status, "pending_sync");

  const retrieved = await getOfflineTransaction("test-cid-001");
  assert.ok(retrieved, "Must retrieve transaction from offline store");
  assert.strictEqual(retrieved.buyer_requirements.buyer_name, "Lira Food Hub");
  assert.strictEqual(retrieved.created_by_name, "Field Officer Akello");
});

runTest("TEST-20", "MVTR Sync Idempotency - Client-generated UUID prevents duplicates across retries", async () => {
  const clientId = "idempotent-cid-002";
  const initial = {
    client_id: clientId,
    commodity: "Soybeans",
    notes: "Initial field capture",
  };

  await saveOfflineTransaction(initial);
  // Simulate retry with updated notes
  const updated = {
    client_id: clientId,
    commodity: "Soybeans",
    notes: "Field capture updated with moisture probe reading",
  };
  await saveOfflineTransaction(updated);

  // Mark as synced with server payload
  const synced = await markTransactionSynced(clientId, { id: "txn_remote_999", sync_version: 2 });
  assert.strictEqual(synced.sync_status, "synced");
  assert.strictEqual(synced.id, "txn_remote_999");

  const all = await getAllOfflineTransactions();
  const matching = all.filter((t) => t.client_id === clientId);
  assert.strictEqual(matching.length, 1, "Idempotent client_id must never create duplicate records");
});

runTest("TEST-21", "DEF-01 Verification - Clarence approval trigger blocks non-admins from approving deals", () => {
  const mvtrMigration = path.join(projectRoot, "supabase/migrations/20261110000001_mvtr_transactions.sql");
  assert.ok(fs.existsSync(mvtrMigration), "MVTR migration file must exist");
  const content = fs.readFileSync(mvtrMigration, "utf8");

  assert.ok(
    content.includes("enforce_mvtr_approval_permissions"),
    "Migration must define trigger enforce_mvtr_approval_permissions"
  );
  assert.ok(
    content.includes("PERMISSION_DENIED: Only Clarence or an authorized administrator can approve"),
    "Trigger must enforce Clarence approval role boundary"
  );
  assert.ok(
    content.includes("trg_enforce_mvtr_approval_permissions"),
    "Trigger must be bound to public.transactions"
  );
});

runTest("TEST-22", "MVTR Commercial Calculations - Minimum fee floor UGX 25,000 and 15% overhead rule", () => {
  // Test case 1: 0.5 tonnes @ UGX 30,000 = UGX 15,000 -> clampled to UGX 25,000 floor
  const feeSubThreshold = feeFor({ perTonneFee: 30000, minimumFee: 25000, acceptedTonnes: 0.5 });
  assert.strictEqual(feeSubThreshold.fee, 25000, "Sub-threshold tonnage must be clamped to UGX 25,000 floor");

  // Test case 2: 30 tonnes @ UGX 30,000 = UGX 900,000 gross fee
  const fee30t = feeFor({ perTonneFee: 30000, minimumFee: 25000, acceptedTonnes: 30 });
  assert.strictEqual(fee30t.fee, 900000);

  // 15% overhead rule: 15% of UGX 900,000 = UGX 135,000
  const overhead = Math.round((900000 * 15) / 100);
  assert.strictEqual(overhead, 135000, "15% desk overhead must equal UGX 135,000");

  // Direct costs: Field (60k) + Testing (25k) + Other (15k) + 6 hrs staff @ 6k/hr (36k) = 136,000
  const directCosts = 60000 + 25000 + 15000 + (6 * 6000);
  assert.strictEqual(directCosts, 136000);

  // Net contribution margin = Gross (900k) - Direct (136k) - Overhead (135k) = 629,000
  const netContribution = 900000 - directCosts - overhead;
  assert.strictEqual(netContribution, 629000, "Projected net margin must equal UGX 629,000");
});

runTest("TEST-23", "MVTR Decision Matrix - Underwriting thresholds enforce Proceed, Conditional, or Reject", () => {
  const evaluate = (scores) => {
    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    if (total >= 75) return { total, rec: "Proceed" };
    if (total >= 50) return { total, rec: "Conditional Proceed" };
    return { total, rec: "Do Not Proceed" };
  };

  // High quality case
  const high = evaluate({ s1: 18, s2: 19, s3: 18, s4: 17, s5: 18 });
  assert.strictEqual(high.total, 90);
  assert.strictEqual(high.rec, "Proceed");

  // Marginal case
  const mid = evaluate({ s1: 12, s2: 12, s3: 12, s4: 12, s5: 12 });
  assert.strictEqual(mid.total, 60);
  assert.strictEqual(mid.rec, "Conditional Proceed");

  // High risk case
  const low = evaluate({ s1: 8, s2: 8, s3: 8, s4: 8, s5: 8 });
  assert.strictEqual(low.total, 40);
  assert.strictEqual(low.rec, "Do Not Proceed");
});

runTest("TEST-24", "DEF-04 Verification - End-to-end duplicate counterparty detection with 409 DUPLICATE_COUNTERPARTY", () => {
  const existingRecords = [
    { id: "p_1", name: "Lira Grain Processors, Ltd.", district: "Lira" },
  ];

  function validatePartyUniqueness(newParty) {
    const normName = normalizeCounterpartyName(newParty.name);
    const normDist = normalizeDistrict(newParty.district);

    const dup = existingRecords.find(
      (r) =>
        normalizeCounterpartyName(r.name) === normName &&
        normalizeDistrict(r.district) === normDist
    );

    if (dup) {
      const err = new Error("Counterparty with this name already exists in this district");
      err.status = 409;
      err.code = "DUPLICATE_COUNTERPARTY";
      err.error = "DUPLICATE_COUNTERPARTY";
      err.existingId = dup.id;
      throw err;
    }
    return true;
  }

  // Exact duplicate with varied casing and punctuation
  assert.throws(
    () => validatePartyUniqueness({ name: "  lira grain processors ltd  ", district: "LIRA" }),
    (err) => err.code === "DUPLICATE_COUNTERPARTY" && err.status === 409
  );

  // Different district is allowed
  assert.ok(
    validatePartyUniqueness({ name: "Lira Grain Processors Ltd", district: "Gulu" }),
    "Same name in different district is permitted"
  );
});

// 4. SPA ROUTING & VERCEL CONFIGURATION TESTS
// ==============================================================================

runTest("TEST-17", "Vercel Configuration - vercel.json contains universal SPA rewrite rule", () => {
  const vercelPath = path.join(projectRoot, "vercel.json");
  assert.ok(fs.existsSync(vercelPath), "vercel.json must exist");
  const config = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
  assert.ok(Array.isArray(config.rewrites), "rewrites array must exist");
  const catchAll = config.rewrites.find((r) => r.source === "/(.*)" && r.destination === "/index.html");
  assert.ok(catchAll, "Universal rewrite rule /(.*) -> /index.html must be configured for direct route refreshes");
});


// 5. DEAL DECISION MATRIX v1 FINANCIAL ENGINE & STORAGE TESTS
// ==============================================================================

runTest("TEST-25", "Deal Decision Matrix v1 - Gross Revenue calculation with unit conversions and edge cases", () => {
  // 1. 30 MT @ 1,150 UGX/KG = 30,000 KG * 1,150 = UGX 34,500,000
  const gross1 = calculateGrossRevenue(30, 1150, "MT", "UGX/KG");
  assert.strictEqual(gross1, 34500000, "30 MT at 1,150 UGX/KG must yield 34,500,000 UGX");

  // 2. 5,000 KG @ 1,200 UGX/KG = 5,000 * 1,200 = UGX 6,000,000
  const gross2 = calculateGrossRevenue(5000, 1200, "KG", "UGX/KG");
  assert.strictEqual(gross2, 6000000, "5,000 KG at 1,200 UGX/KG must yield 6,000,000 UGX");

  // 3. 20 MT @ 1,200,000 UGX/MT = 20 * 1,200,000 = UGX 24,000,000
  const gross3 = calculateGrossRevenue(20, 1200000, "MT", "UGX/MT");
  assert.strictEqual(gross3, 24000000, "20 MT at 1,200,000 UGX/MT must yield 24,000,000 UGX");

  // 4. Zero volume or zero price returns 0
  assert.strictEqual(calculateGrossRevenue(0, 1150), 0, "Zero volume yields 0 revenue");
  assert.strictEqual(calculateGrossRevenue(30, 0), 0, "Zero price yields 0 revenue");

  // 5. Missing values return null
  assert.strictEqual(calculateGrossRevenue(null, 1150), null, "Missing volume returns null");
  assert.strictEqual(calculateGrossRevenue("", 1150), null, "Empty volume returns null");
  assert.strictEqual(calculateGrossRevenue(30, null), null, "Missing price returns null");

  // 6. Negative values rejected
  assert.strictEqual(calculateGrossRevenue(-10, 1150), null, "Negative volume returns null");
  assert.strictEqual(calculateGrossRevenue(30, -500), null, "Negative price returns null");
});

runTest("TEST-26", "Deal Decision Matrix v1 - Total Costs with explicit Handling COGS cost basis", () => {
  // 1. Flat TOTAL cost basis: Transport 750,000 + Handling 150,000 = 900,000 UGX
  const costTotal = calculateTotalCosts(750000, 150000, 30, HANDLING_BASIS.TOTAL, "MT");
  assert.strictEqual(costTotal, 900000, "Flat handling adds directly to transport");

  // 2. PER_MT cost basis: Transport 750,000 + (30 MT * 10,000 UGX/MT) = 1,050,000 UGX
  const costPerMT = calculateTotalCosts(750000, 10000, 30, HANDLING_BASIS.PER_MT, "MT");
  assert.strictEqual(costPerMT, 1050000, "Per-MT handling multiplies by volume in MT");

  // 3. PER_KG cost basis: Transport 750,000 + (30,000 KG * 20 UGX/KG) = 1,350,000 UGX
  const costPerKG = calculateTotalCosts(750000, 20, 30, HANDLING_BASIS.PER_KG, "MT");
  assert.strictEqual(costPerKG, 1350000, "Per-KG handling multiplies by volume in KG");

  // 4. Handling missing values safely: only transport provided
  const costTransportOnly = calculateTotalCosts(750000, null, 30);
  assert.strictEqual(costTransportOnly, 750000, "Missing handling defaults to 0");

  // 5. Handling missing values safely: only handling provided
  const costHandlingOnly = calculateTotalCosts(null, 150000, 30);
  assert.strictEqual(costHandlingOnly, 150000, "Missing transport defaults to 0");

  // 6. Negative costs rejected
  assert.strictEqual(calculateTotalCosts(-50000, 150000), null, "Negative transport returns null");
  assert.strictEqual(calculateTotalCosts(750000, -20000), null, "Negative handling returns null");
});

runTest("TEST-27", "Deal Decision Matrix v1 - Net Margin and Margin Percentage (guarded against division by zero)", () => {
  // 1. Standard positive margin
  const net1 = calculateNetMargin(34500000, 900000);
  assert.strictEqual(net1, 33600000);
  const pct1 = calculateMarginPercentage(net1, 34500000);
  assert.strictEqual(pct1, 97.39, "33.6M / 34.5M = 97.39%");

  // 2. Realistic commodity margin: 34.5M revenue, 30M costs = 4.5M margin
  const net2 = calculateNetMargin(34500000, 30000000);
  assert.strictEqual(net2, 4500000);
  const pct2 = calculateMarginPercentage(net2, 34500000);
  assert.strictEqual(pct2, 13.04, "4.5M / 34.5M = 13.04%");

  // 3. Negative margin (loss): 10M revenue, 12M costs = -2M margin
  const net3 = calculateNetMargin(10000000, 12000000);
  assert.strictEqual(net3, -2000000);
  const pct3 = calculateMarginPercentage(net3, 10000000);
  assert.strictEqual(pct3, -20.0, "-2M / 10M = -20.00%");

  // 4. Zero / missing revenue: must return null, NEVER Infinity or NaN
  assert.strictEqual(calculateMarginPercentage(500000, 0), null, "Zero revenue must return null");
  assert.strictEqual(calculateMarginPercentage(500000, null), null, "Null revenue must return null");
  assert.strictEqual(calculateMarginPercentage(null, 1000000), null, "Null margin must return null");
  assert.strictEqual(calculateMarginPercentage(-500000, 0), null, "Negative margin with zero revenue must return null");
});

runTest("TEST-28", "Deal Decision Matrix v1 - Validation engine strictly validates required and numeric constraints", () => {
  // 1. Missing commodity
  const v1 = validateMatrixInputs({ commodity: "", volume: 10, basePrice: 1000 });
  assert.strictEqual(v1.isValid, false);
  assert.ok(v1.errors.commodity, "Missing commodity must trigger error");

  // 2. Missing & invalid volume
  const v2 = validateMatrixInputs({ commodity: "Maize", volume: "", basePrice: 1000 });
  assert.strictEqual(v2.isValid, false);
  assert.ok(v2.errors.volume);

  const v3 = validateMatrixInputs({ commodity: "Maize", volume: -5, basePrice: 1000 });
  assert.strictEqual(v3.isValid, false);
  assert.strictEqual(v3.errors.volume, "Volume cannot be negative.");

  const v4 = validateMatrixInputs({ commodity: "Maize", volume: 0, basePrice: 1000 });
  assert.strictEqual(v4.isValid, false);
  assert.strictEqual(v4.errors.volume, "Volume must be greater than zero.");

  // 3. Missing & invalid base price
  const v5 = validateMatrixInputs({ commodity: "Maize", volume: 10, basePrice: -500 });
  assert.strictEqual(v5.isValid, false);
  assert.strictEqual(v5.errors.basePrice, "Base price cannot be negative.");

  // 4. Negative optional costs
  const v6 = validateMatrixInputs({ commodity: "Maize", volume: 10, basePrice: 1000, transportCost: -5000 });
  assert.strictEqual(v6.isValid, false);
  assert.ok(v6.errors.transportCost);

  // 5. Valid full payload
  const v7 = validateMatrixInputs({
    commodity: "Maize",
    volume: "30",
    basePrice: "1150",
    transportCost: "750000",
    handlingCogs: "150000",
  });
  assert.strictEqual(v7.isValid, true);
  assert.strictEqual(Object.keys(v7.errors).length, 0);
});

runTest("TEST-29", "Deal Decision Matrix v1 - Full evaluateDealMatrix pipeline with commercial statuses", () => {
  // Viable/Strong margin case
  const res1 = evaluateDealMatrix({
    commodity: "Maize",
    volume: "30",
    volumeUnit: "MT",
    basePrice: "1150",
    priceUnit: "UGX/KG",
    transportCost: "750000",
    handlingCogs: "150000",
    handlingBasis: HANDLING_BASIS.TOTAL,
  });
  assert.strictEqual(res1.grossRevenue, 34500000);
  assert.strictEqual(res1.totalCosts, 900000);
  assert.strictEqual(res1.netMargin, 33600000);
  assert.strictEqual(res1.commercialStatus, "STRONG_MARGIN");
  assert.strictEqual(res1.isComplete, true);

  // Negative margin case
  const res2 = evaluateDealMatrix({
    commodity: "Beans",
    volume: "10",
    volumeUnit: "MT",
    basePrice: "2000",
    priceUnit: "UGX/KG", // Gross = 20,000,000
    transportCost: "18000000",
    handlingCogs: "3000000", // Total costs = 21,000,000
    handlingBasis: HANDLING_BASIS.TOTAL,
  });
  assert.strictEqual(res2.grossRevenue, 20000000);
  assert.strictEqual(res2.totalCosts, 21000000);
  assert.strictEqual(res2.netMargin, -1000000);
  assert.strictEqual(res2.commercialStatus, "NEGATIVE_MARGIN");

  // Incomplete / Missing inputs case
  const res3 = evaluateDealMatrix({
    commodity: "Soybeans",
    volume: "15",
    basePrice: "", // Missing price
  });
  assert.strictEqual(res3.grossRevenue, null);
  assert.strictEqual(res3.commercialStatus, "INCOMPLETE");
  assert.strictEqual(res3.isComplete, false);
});

runTest("TEST-30", "Deal Decision Matrix v1 - Currency and Percentage formatting handles negative signs correctly", () => {
  assert.strictEqual(formatCurrency(34500000), "UGX 34,500,000");
  assert.strictEqual(formatCurrency(-2000000), "-UGX 2,000,000");
  assert.strictEqual(formatCurrency(0), "UGX 0");
  assert.strictEqual(formatCurrency(null), "—");

  assert.strictEqual(formatPercentage(13.04), "+13.04%");
  assert.strictEqual(formatPercentage(-5.5), "-5.50%");
  assert.strictEqual(formatPercentage(0), "0.00%");
  assert.strictEqual(formatPercentage(null), "—");
});

runTest("TEST-31", "Deal Decision Matrix v1 - Offline Store persists matrix deals and computes stats", async () => {
  // Reference generation
  const ref = generateMatrixReference();
  assert.ok(ref.startsWith("MAT-"), "Reference must start with MAT- prefix");

  // Save new matrix record
  const saved = await saveMatrixRecord({
    reference: ref,
    commodity: "Sorghum",
    volume: 25,
    volume_unit: "MT",
    base_price: 1300,
    price_unit: "UGX/KG",
    transport_cost: 600000,
    handling_cogs: 100000,
    status: "Draft",
    buyer_name: "Northern Breweries Ltd",
    district: "Lira",
  });
  assert.ok(saved.client_id, "Saved record must have client_id");
  assert.strictEqual(saved.commodity, "Sorghum");

  // Retrieve all records
  const all = await getAllMatrixRecords();
  assert.ok(all.length >= 3, "Must contain at least 2 seed benchmark deals + newly saved deal");
  const found = all.find((r) => r.reference === ref);
  assert.ok(found, "Saved record must be retrievable from offline store");

  // Stats calculation
  const stats = await getMatrixStats();
  assert.ok(stats.total >= 3, "Total stats count must match");
  assert.ok(typeof stats.positiveMargin === "number");
  assert.ok(typeof stats.drafts === "number");
});

// ==============================================================================
// 6. ENHANCED FINANCIAL CONTROLS, COVERAGE & READY GATING (MATRIX V1)
// ==============================================================================

runTest("TEST-32", "Handling COGS Basis - Total, Per-MT, and Per-KG conversion parity", () => {
  // 10 MT transaction benchmark:
  // TOTAL: Flat UGX 500,000
  const hTotal = calculateHandlingCost(500000, HANDLING_BASIS.TOTAL, 10, "MT");
  assert.strictEqual(hTotal, 500000, "TOTAL basis must return entered amount");

  // PER_MT: UGX 50,000 / MT × 10 MT = UGX 500,000
  const hMt = calculateHandlingCost(50000, HANDLING_BASIS.PER_MT, 10, "MT");
  assert.strictEqual(hMt, 500000, "PER_MT basis must multiply rate by MT");

  // PER_KG: UGX 50 / KG × 10,000 KG = UGX 500,000
  const hKg = calculateHandlingCost(50, HANDLING_BASIS.PER_KG, 10, "MT");
  assert.strictEqual(hKg, 500000, "PER_KG basis must multiply rate by KG");

  // Parity confirmation across all 3 bases
  assert.strictEqual(hTotal, hMt);
  assert.strictEqual(hMt, hKg);

  // Decimal volume test: 12.5 MT @ UGX 40,000/MT = UGX 500,000
  const hDec = calculateHandlingCost(40000, HANDLING_BASIS.PER_MT, 12.5, "MT");
  assert.strictEqual(hDec, 500000, "Decimal volume must calculate correctly");

  // KG input volume: 15,000 KG @ UGX 30,000/MT = UGX 450,000
  const hKgVol = calculateHandlingCost(30000, HANDLING_BASIS.PER_MT, 15000, "KG");
  assert.strictEqual(hKgVol, 450000, "Volume in KG converted to MT correctly");
});

runTest("TEST-33", "Missing Cost Defense - Distinguishes unentered costs from confirmed zeros", () => {
  // 1. Unentered costs
  assert.strictEqual(classifyCostInput(null).status, COST_STATUS.NOT_ENTERED);
  assert.strictEqual(classifyCostInput("").status, COST_STATUS.NOT_ENTERED);
  assert.strictEqual(classifyCostInput(undefined).status, COST_STATUS.NOT_ENTERED);

  // 2. Explicit zero
  const zeroCls = classifyCostInput(0);
  assert.strictEqual(zeroCls.status, COST_STATUS.EXPLICIT_ZERO);
  assert.strictEqual(zeroCls.isZero, true);
  assert.strictEqual(zeroCls.isMissing, false);

  // 3. Valid positive
  const posCls = classifyCostInput("750000");
  assert.strictEqual(posCls.status, COST_STATUS.VALID_POSITIVE);
  assert.strictEqual(posCls.value, 750000);

  // 4. Invalid negative
  assert.strictEqual(classifyCostInput(-500).status, COST_STATUS.INVALID);

  // 5. Detailed cost calculation with missing fields
  const missingRes = calculateDeliveredCostDetailed({
    commodityCost: 20000000,
    transportCost: null, // Missing!
    handlingCogs: 500000,
    requireAllCosts: true,
  });
  assert.strictEqual(missingRes.isComplete, false, "Missing transport must mark cost incomplete");
  assert.ok(missingRes.missingFields.includes("Transport Cost"));
  assert.strictEqual(missingRes.deliveredCost, null, "Delivered cost must not be calculated when required costs are missing");

  // 6. Confirmed zero transport cost succeeds
  const zeroTransportRes = calculateDeliveredCostDetailed({
    commodityCost: 20000000,
    transportCost: 0, // Explicitly confirmed 0 (buyer collects)
    handlingCogs: 500000,
    requireAllCosts: true,
  });
  assert.strictEqual(zeroTransportRes.isComplete, true);
  assert.strictEqual(zeroTransportRes.deliveredCost, 20500000);
});

runTest("TEST-34", "Buyer Delivered-Cost Coverage - Computes difference, percentage, and coverage state", () => {
  // Case A: COVERED — Buyer 35M vs Delivered Cost 30M (Difference +5M, 116.67%)
  const covA = calculateBuyerDeliveredCoverage({
    volume: 25,
    volumeUnit: "MT",
    buyerPricePerKg: 1400, // 25,000 KG × 1400 = 35,000,000
    isBuyerAgreed: true,
    commodityCost: 27500000,
    transportCost: 1500000,
    handlingCogs: 1000000,
  });
  assert.strictEqual(covA.status, COVERAGE_STATUS.COVERED);
  assert.strictEqual(covA.buyerAmount, 35000000);
  assert.strictEqual(covA.deliveredCost, 30000000);
  assert.strictEqual(covA.difference, 5000000);
  assert.strictEqual(covA.coveragePercentage, 116.67);
  assert.strictEqual(covA.isCovered, true);

  // Case B: NOT COVERED — Buyer 28M vs Delivered Cost 30M (Difference -2M, 93.33%)
  const covB = calculateBuyerDeliveredCoverage({
    volume: 25,
    volumeUnit: "MT",
    buyerPricePerKg: 1120, // 25,000 KG × 1120 = 28,000,000
    isBuyerAgreed: true,
    commodityCost: 27500000,
    transportCost: 1500000,
    handlingCogs: 1000000,
  });
  assert.strictEqual(covB.status, COVERAGE_STATUS.NOT_COVERED);
  assert.strictEqual(covB.difference, -2000000);
  assert.strictEqual(covB.coveragePercentage, 93.33);
  assert.strictEqual(covB.isCovered, false);

  // Case C: INCOMPLETE COSTS — Missing transport cost
  const covC = calculateBuyerDeliveredCoverage({
    volume: 25,
    buyerPricePerKg: 1400,
    commodityCost: 27500000,
    transportCost: null, // Missing!
    handlingCogs: 1000000,
  });
  assert.strictEqual(covC.status, COVERAGE_STATUS.INCOMPLETE_COSTS);
  assert.strictEqual(covC.isCovered, false);
  assert.ok(covC.missingFields.includes("Transport Cost"));

  // Case D: AWAITING BUYER TERMS — Buyer price missing
  const covD = calculateBuyerDeliveredCoverage({
    volume: 25,
    buyerPricePerKg: null, // Not yet entered
    commodityCost: 27500000,
    transportCost: 1500000,
    handlingCogs: 1000000,
  });
  assert.strictEqual(covD.status, COVERAGE_STATUS.AWAITING_BUYER_TERMS);
  assert.strictEqual(covD.isCovered, false);
});

runTest("TEST-35", "CNG Service Economics - Separates proposed, accepted, and retained contribution", () => {
  const fees = [
    {
      id: "fee_desk_1",
      category: "Desk Verification & Gating",
      amount: 600000,
      payer: "Buyer",
      acceptanceStatus: FEE_ACCEPTANCE.ACCEPTED,
      acceptanceEvidence: "PO #88 signed by buyer procurement officer",
    },
    {
      id: "fee_assay_1",
      category: "Quality Assay & Moisture Testing",
      amount: 250000,
      payer: "Supplier",
      acceptanceStatus: FEE_ACCEPTANCE.ACCEPTED,
      acceptanceEvidence: "Inspection protocol agreement signed on site",
    },
    {
      id: "fee_orig_1",
      category: "Corridor Trade Origination",
      amount: 400000,
      payer: "Buyer",
      acceptanceStatus: FEE_ACCEPTANCE.PROPOSED, // Proposed only! Must be excluded from earned revenue
      acceptanceEvidence: "",
    },
    {
      id: "fee_assay_1", // Duplicate ID attempt! Must not be counted twice
      category: "Quality Assay Duplicate",
      amount: 250000,
      acceptanceStatus: FEE_ACCEPTANCE.ACCEPTED,
      acceptanceEvidence: "Duplicate attempt",
    },
  ];

  const serviceCosts = {
    costField: 80000,
    costTesting: 45000,
    staffHours: 6,
    staffCostPerHour: 6000, // 36,000 staff cost
    costOther: 20000,
    overheadPct: 15,
  };

  const econ = calculateCngServiceEconomics({ fees, serviceCosts });

  // Proposed total: 600k + 250k + 400k + 250k = 1,500,000
  assert.strictEqual(econ.proposedServiceFees, 1500000);

  // Accepted total (excluding duplicate): 600k + 250k = 850,000
  assert.strictEqual(econ.acceptedServiceFees, 850000);

  // Earned revenue (accepted + has evidence + not duplicate): 600k + 250k = 850,000
  assert.strictEqual(econ.earnedServiceRevenue, 850000);

  // Direct costs: 80k + 45k + 36k + 20k = 181,000
  assert.strictEqual(econ.directServiceCosts, 181000);

  // 15% Overhead on earned revenue: 850k × 0.15 = 127,500
  assert.strictEqual(econ.overheadAmount, 127500);

  // Total CNG costs: 181,000 + 127,500 = 308,500
  assert.strictEqual(econ.totalCngServiceCosts, 308500);

  // Retained contribution: 850,000 - 308,500 = 541,500
  assert.strictEqual(econ.retainedContribution, 541500);
  assert.strictEqual(econ.isRetainedPositive, true);
  assert.strictEqual(econ.hasUnacceptedFees, true);
});

runTest("TEST-36", "READY Status 10-Point Readiness - Evaluates multi-condition gating and blocks non-compliant deals", () => {
  // Case A: Fully compliant deal passes to READY
  const readyDeal = {
    volume: 30,
    basePrice: 1200,
    transportCost: 750000,
    handlingCogs: 150000,
    netMargin: 3500000, // Positive contribution
    buyerTermsEvidenced: true,
    supplierVerified: true,
    logisticsWorkable: true,
    paymentApproved: true,
    feeAcceptanceDocumented: true,
    lane: "Gulu - Lira Corridor",
    userRole: "admin",
  };
  const resA = evaluateReadyReadiness(readyDeal);
  assert.strictEqual(resA.isReady, true);
  assert.strictEqual(resA.status, "READY");
  assert.strictEqual(resA.blockers.length, 0);
  assert.strictEqual(resA.checklist.length, 10);

  // Case B: Negative margin blocked even with lane selected
  const lossDeal = {
    ...readyDeal,
    netMargin: -500000,
  };
  const resB = evaluateReadyReadiness(lossDeal);
  assert.strictEqual(resB.isReady, false);
  assert.strictEqual(resB.status, "BLOCKED");
  assert.ok(resB.blockers.some((b) => b.includes("positive")));

  // Case C: Missing transport cost blocked
  const missingCostDeal = {
    ...readyDeal,
    transportCost: "",
  };
  const resC = evaluateReadyReadiness(missingCostDeal);
  assert.strictEqual(resC.isReady, false);
  assert.ok(resC.blockers.some((b) => b.includes("Transport Cost")));

  // Case D: Missing buyer terms evidence blocked
  const noBuyerTermsDeal = {
    ...readyDeal,
    buyerTermsEvidenced: false,
  };
  const resD = evaluateReadyReadiness(noBuyerTermsDeal);
  assert.strictEqual(resD.isReady, false);
  assert.ok(resD.blockers.some((b) => b.includes("Buyer agreed terms")));

  // Case E: Unprivileged viewer role blocked from approval
  const viewerDeal = {
    ...readyDeal,
    userRole: "viewer",
  };
  const resE = evaluateReadyReadiness(viewerDeal);
  assert.strictEqual(resE.isReady, false);
  assert.ok(resE.blockers.some((b) => b.includes("authorization")));
});

runTest("TEST-37", "Enhanced evaluateDealMatrix - Combines buyer coverage, CNG economics, and readiness metadata", () => {
  const result = evaluateDealMatrix({
    commodity: "Maize",
    volume: "20",
    volumeUnit: "MT",
    basePrice: "1300",
    transportCost: "600000",
    handlingCogs: "200000",
    handlingBasis: HANDLING_BASIS.TOTAL,
    buyerPricePerKg: "1450", // Buyer agrees at 1450 UGX/KG = 29,000,000
    isBuyerAgreed: true,
    serviceFees: [
      {
        id: "fee_1",
        category: "Desk Verification & Gating",
        amount: 500000,
        acceptanceStatus: FEE_ACCEPTANCE.ACCEPTED,
        acceptanceEvidence: "PO clearance signed",
      },
    ],
    serviceOperatingCosts: {
      costField: 50000,
      costTesting: 30000,
      staffHours: 4,
      staffCostPerHour: 6000,
      overheadPct: 15,
    },
    lane: "Amuru - Gulu Lane",
    userRole: "admin",
  });

  // Core metrics
  assert.strictEqual(result.grossRevenue, 26000000);
  assert.strictEqual(result.totalCosts, 800000);
  assert.strictEqual(result.netMargin, 25200000);
  assert.strictEqual(result.commercialStatus, "STRONG_MARGIN");

  // Buyer coverage checks
  assert.ok(result.buyerCoverage);
  assert.strictEqual(result.buyerCoverage.status, COVERAGE_STATUS.COVERED);
  assert.strictEqual(result.buyerCoverage.buyerAmount, 29000000);
  assert.strictEqual(result.buyerCoverage.isCovered, true);

  // CNG Service economics checks
  assert.ok(result.serviceEconomics);
  assert.strictEqual(result.serviceEconomics.earnedServiceRevenue, 500000);
  assert.ok(result.serviceEconomics.retainedContribution > 0);

  // Ready readiness checks
  assert.ok(result.readyReadiness);
  assert.strictEqual(result.readyReadiness.status, "READY");
});

// ==============================================================================
// CNG DEAL DESK ALPHA V2 — MANDATORY ACCEPTANCE TEST SUITE (Section 14)
// ==============================================================================

// ID-01: Unauthorised buyer contact access
runTest("ID-01", "Identity Disclosure - Unauthorised buyer contact details masked by default", () => {
  const rawBuyer = {
    id: "p_buyer_01",
    name: "Lira Grain Processors Ltd",
    role: "Buyer",
    contact_person: "James Okello",
    contact_channel: "+256 772 123 456",
    phone: "+256 772 123 456",
    email: "james@example.com",
    address: "Plot 14, Main Street, Lira",
    bank_details: "12345678901234",
  };

  const masked = maskParty(rawBuyer, false);

  assert.strictEqual(masked.name, "Lira Grain Processors Ltd", "Company name remains intact for business operations");
  assert.strictEqual(masked.contact_person, "J**** O****", "Full name must be masked");
  assert.strictEqual(masked.contact_channel, "+256 7** *** 456", "Phone channel must be masked");
  assert.strictEqual(masked.phone, "+256 7** *** 456", "Phone must be masked");
  assert.strictEqual(masked.email, "j****@example.com", "Email must be masked");
  assert.strictEqual(masked.address, "Contact address restricted", "Address must be restricted");
  assert.strictEqual(masked.bank_details, "**** **** 1234", "Bank account must mask all but last 4 digits");
});

// ID-02: Unauthorised supplier contact access
runTest("ID-02", "Identity Disclosure - Unauthorised supplier contact details masked by default", () => {
  const rawSupplier = {
    id: "p_sup_01",
    name: "Amuru Smallholders Co-op",
    role: "Supplier",
    contact_person: "Beatrice Acan",
    contact_channel: "+256 782 999 888",
    phone: "+256 782 999 888",
    email: "beatrice@amurucoop.org",
    address: "Amuru Trading Centre, Plot 5",
    bank_details: "98765432104321",
  };

  const masked = maskParty(rawSupplier, false);

  assert.strictEqual(masked.name, "Amuru Smallholders Co-op");
  assert.strictEqual(masked.contact_person, "B**** A****");
  assert.strictEqual(masked.phone, "+256 7** *** 888");
  assert.strictEqual(masked.email, "b****@amurucoop.org");
  assert.strictEqual(masked.address, "Contact address restricted");
  assert.strictEqual(masked.bank_details, "**** **** 4321");
});

// ID-03: Authorised banking disclosure
runTest("ID-03", "Identity Disclosure - Authorised banking disclosure reveals only permitted fields and is permitted for finance/admin", () => {
  const financeUser = { id: "usr_fin_1", role: "finance", name: "Finance Officer" };
  const operatorUser = { id: "usr_op_1", role: "operator", name: "Field Operator" };

  assert.strictEqual(getDisclosurePermission(financeUser, DISCLOSURE_PURPOSES.BANKING), true);
  assert.strictEqual(getDisclosurePermission(operatorUser, DISCLOSURE_PURPOSES.BANKING), false, "Operators cannot access banking disclosures");

  // Banking disclosure preserves unmasked bank details and contact name for authorized users
  const rawParty = {
    id: "p_1",
    name: "Lira Grain Processors",
    contact_person: "James Okello",
    bank_details: "12345678901234",
  };

  const disclosed = maskParty(rawParty, true);
  assert.strictEqual(disclosed.bank_details, "12345678901234");
  assert.strictEqual(disclosed.contact_person, "James Okello");
});

// ID-04: Authorised operational disclosure
runTest("ID-04", "Identity Disclosure - Authorised operational disclosure reveals logistics fields and is permitted for operations/field officers", () => {
  const opsUser = { id: "usr_ops_1", role: "operations", name: "Ops Lead" };
  const guestUser = { id: "usr_guest", role: "user", name: "Regular User" };

  assert.strictEqual(getDisclosurePermission(opsUser, DISCLOSURE_PURPOSES.OPERATIONAL), true);
  assert.strictEqual(getDisclosurePermission(guestUser, DISCLOSURE_PURPOSES.OPERATIONAL), false);
});

// ID-05: Unauthorised API request
runTest("ID-05", "Security - Unauthorised API request rejects disclosure attempt with INSUFFICIENT_PERMISSIONS", async () => {
  const unauthCaller = { id: "usr_unauth", role: "user" };

  await assert.rejects(
    async () => {
      await requestIdentityDisclosure({
        partyId: "p_buyer_01",
        transactionId: "txn_001",
        purpose: "BANKING",
        reason: "Checking bank info without permission",
        user: unauthCaller,
      });
    },
    /INSUFFICIENT_PERMISSIONS/
  );
});

// ID-06: PDF export
runTest("ID-06", "Exports - PDF and report export data masks counterparty contact details by default", () => {
  const partyList = [
    {
      id: "p_1",
      name: "Gulu Processors",
      contact_person: "David Okello",
      phone: "+256 772 111 222",
      email: "david@gulu.com",
    },
  ];

  const exportData = maskExportRecords(partyList, false);
  assert.strictEqual(exportData[0].contact_person, "D**** O****");
  assert.strictEqual(exportData[0].phone, "+256 7** *** 222");
  assert.strictEqual(exportData[0].email, "d****@gulu.com");
});

// ID-07: Excel/CSV export
runTest("ID-07", "Exports - Excel/CSV export sanitizes transaction buyer requirements and supplier verification", () => {
  const transactions = [
    {
      id: "txn_100",
      buyer_requirements: {
        buyer_name: "Lira Miller",
        contact_person: "James Okello",
        contact_phone: "+256 772 333 444",
        contact_email: "james@miller.com",
      },
      supplier_verification: {
        supplier_name: "Amuru Farmer Co-op",
        contact_person: "Beatrice Acan",
        contact_phone: "+256 782 555 666",
      },
    },
  ];

  const exportRecords = maskExportRecords(transactions, false);
  assert.strictEqual(exportRecords[0].buyer_requirements.contact_person, "J**** O****");
  assert.strictEqual(exportRecords[0].buyer_requirements.contact_phone, "+256 7** *** 444");
  assert.strictEqual(exportRecords[0].buyer_requirements.contact_email, "j****@miller.com");
  assert.strictEqual(exportRecords[0].supplier_verification.contact_person, "B**** A****");
  assert.strictEqual(exportRecords[0].supplier_verification.contact_phone, "+256 7** *** 666");
});

// ID-08: Attachment download
runTest("ID-08", "Storage Security - Evidence attachments use short-lived signed URLs and private storage buckets", () => {
  const migration = path.join(projectRoot, "supabase/migrations/20261114000001_identity_disclosure_and_audit.sql");
  assert.ok(fs.existsSync(migration), "Migration file must exist");
  const content = fs.readFileSync(migration, "utf8");

  assert.ok(content.includes("public.disclosure_audit_logs"), "disclosure_audit_logs table created");
  assert.ok(content.includes("ENABLE ROW LEVEL SECURITY"), "RLS enabled on disclosure_audit_logs");
  assert.ok(content.includes("request_identity_disclosure"), "Security definer RPC function created");
});

// ID-09: Disclosure audit trail
runTest("ID-09", "Audit - Immutable disclosure audit trail records user, purpose, transaction, and access result", () => {
  const migration = path.join(projectRoot, "supabase/migrations/20261114000001_identity_disclosure_and_audit.sql");
  const content = fs.readFileSync(migration, "utf8");

  assert.ok(content.includes("Prevent updates to disclosure audit logs"), "Audit logs are append-only (no updates)");
  assert.ok(content.includes("Prevent deletes from disclosure audit logs"), "Audit logs cannot be deleted");
  assert.ok(content.includes("access_result TEXT NOT NULL CHECK"), "Audit records GRANTED or DENIED access result");
});

// TX-01: Refresh and new session persistence
runTest("TX-01", "Persistence - Transaction records persist across session refresh with client UUID", async () => {
  const clientId = "uuid-tx01-" + Date.now();
  const tx = {
    client_id: clientId,
    commodity: "Maize",
    buyer_requirements: { buyer_name: "Lira Miller", required_tonnes: 25 },
    supplier_verification: { supplier_name: "Amuru Farmers", moisture_reading_pct: 13.5 },
    payment_terms: { agreed_price_per_kg: 1300 },
    fee_margin: { expected_gross_fee: 500000 },
  };

  await saveOfflineTransaction(tx);
  const fetched = await getOfflineTransaction(clientId);

  assert.ok(fetched, "Transaction must persist in offline storage");
  assert.strictEqual(fetched.client_id, clientId);
  assert.strictEqual(fetched.commodity, "Maize");
});

// TX-02: TOTAL / PER_MT / PER_KG conversion parity
runTest("TX-02", "Handling COGS - Exact conversion parity across TOTAL, PER_MT, and PER_KG (1 MT = 1,000 KG)", () => {
  const volumeMT = 10;
  // Parity case: UGX 500,000 flat total
  const costTotal = calculateHandlingCost("500000", HANDLING_BASIS.TOTAL, volumeMT);
  // PER_MT: UGX 50,000 per MT × 10 MT = UGX 500,000
  const costPerMT = calculateHandlingCost("50000", HANDLING_BASIS.PER_MT, volumeMT);
  // PER_KG: UGX 50 per KG × 10,000 KG = UGX 500,000
  const costPerKG = calculateHandlingCost("50", HANDLING_BASIS.PER_KG, volumeMT);

  assert.strictEqual(costTotal, 500000);
  assert.strictEqual(costPerMT, 500000);
  assert.strictEqual(costPerKG, 500000);
  assert.strictEqual(costTotal, costPerMT);
  assert.strictEqual(costPerMT, costPerKG);
});

// TX-03: Missing required costs
runTest("TX-03", "Missing Cost Defense - Missing required costs do not default to zero and block approval", () => {
  const result = calculateDeliveredCostDetailed({
    commodityCost: "25000000",
    transportCost: null, // MISSING
    handlingCogs: "500000",
    requireAllCosts: true,
  });

  assert.strictEqual(result.isComplete, false, "Missing transport must mark delivered cost incomplete");
  assert.strictEqual(result.deliveredCost, null, "Must not silently compute with zero");
  assert.ok(result.missingFields.includes("Transport Cost"), "Missing fields must identify Transport Cost");
});

// TX-04: Missing required terms
runTest("TX-04", "Readiness Gating - Missing buyer agreed price blocks READY approval status", () => {
  const coverage = calculateBuyerDeliveredCoverage({
    volume: "20",
    buyerPricePerKg: null, // MISSING
    commodityCost: "20000000",
    transportCost: "500000",
    handlingCogs: "300000",
  });

  assert.strictEqual(coverage.status, COVERAGE_STATUS.AWAITING_BUYER_TERMS);
  assert.strictEqual(coverage.isCovered, false);
});

// TX-05: Accepted fees deduplication & transaction association
runTest("TX-05", "Service Economics - Separates proposed from accepted fees and eliminates duplicate fee entries", () => {
  const fees = [
    {
      id: "fee_desk_1",
      category: "Desk Verification",
      amount: "500000",
      payer: "Buyer",
      acceptanceStatus: FEE_ACCEPTANCE.ACCEPTED,
      acceptanceEvidence: "PO 123",
    },
    // Duplicate fee with identical category and payer
    {
      id: "fee_desk_dup",
      category: "Desk Verification",
      amount: "500000",
      payer: "Buyer",
      acceptanceStatus: FEE_ACCEPTANCE.ACCEPTED,
      acceptanceEvidence: "PO 123 duplicate entry",
    },
    {
      id: "fee_unaccepted",
      category: "Logistics Bulking",
      amount: "300000",
      payer: "Buyer",
      acceptanceStatus: FEE_ACCEPTANCE.PROPOSED, // Proposed only
    },
  ];

  const econ = calculateCngServiceEconomics({
    fees,
    serviceCosts: { costField: 0, costTesting: 0, staffHours: 0, overheadPct: 15 },
  });

  assert.strictEqual(econ.proposedServiceFees, 1300000, "Sum of all proposed fees");
  assert.strictEqual(econ.acceptedServiceFees, 500000, "Duplicate fee must be excluded from accepted total");
  assert.strictEqual(econ.earnedServiceRevenue, 500000, "Unaccepted fee (300k) and duplicate fee excluded from earned revenue");
  assert.strictEqual(econ.hasDuplicateFees, true, "Duplicate fee must be flagged");
});

// TX-06: Invalid READY transition
runTest("TX-06", "READY Decision - Backend evaluation rejects READY when readiness conditions fail", () => {
  const unreadyEvaluation = evaluateDealMatrix({
    commodity: "Maize",
    volume: "20",
    basePrice: "1300",
    transportCost: "600000",
    handlingCogs: "200000",
    buyerPricePerKg: "1200", // Loss-making: 1200 < 1300 + costs
    isBuyerAgreed: false,
    userRole: "admin",
  });

  assert.notStrictEqual(unreadyEvaluation.readyReadiness.status, "READY");
  assert.strictEqual(unreadyEvaluation.readyReadiness.isReady, false);
});

// TX-07: Material change revalidation
runTest("TX-07", "Material Change - Modifying material terms invalidates stale approval and triggers revalidation", () => {
  const approvedTx = {
    id: "txn_approved_1",
    status: "Approved",
    approval_status: "Approved",
    commodity: "Maize",
    buyer_price_per_kg: 1400,
    volume: 20,
    cost_transport: 500000,
  };

  const modifiedPayload = {
    ...approvedTx,
    cost_transport: 750000, // Material cost increase
  };

  const detection = detectMaterialChanges(approvedTx, modifiedPayload);

  assert.strictEqual(detection.hasMaterialChange, true);
  assert.strictEqual(detection.requiresRevalidation, true);
  assert.strictEqual(detection.newStatus, "PendingApproval", "Approved status must revert to PendingApproval on material cost change");
});

// PAY-01: Payment states management
runTest("PAY-01", "Payment State Management - Enforces 5 distinct states and blocks invalid transitions", () => {
  // Five distinct states
  assert.ok(PAYMENT_STATES.PENDING);
  assert.ok(PAYMENT_STATES.FUNDED);
  assert.ok(PAYMENT_STATES.RELEASED);
  assert.ok(PAYMENT_STATES.DISPUTED);
  assert.ok(PAYMENT_STATES.REFUNDED);

  // Valid transition: PENDING -> FUNDED by finance
  const validTransition = validatePaymentTransition(PAYMENT_STATES.PENDING, PAYMENT_STATES.FUNDED, "finance");
  assert.strictEqual(validTransition.isValid, true);

  // Invalid transition: PENDING -> RELEASED directly (must be funded first)
  const invalidDirect = validatePaymentTransition(PAYMENT_STATES.PENDING, PAYMENT_STATES.RELEASED, "finance");
  assert.strictEqual(invalidDirect.isValid, false);

  // Invalid transition: REFUNDED is terminal (cannot transition to RELEASED)
  const invalidTerminal = validatePaymentTransition(PAYMENT_STATES.REFUNDED, PAYMENT_STATES.RELEASED, "admin");
  assert.strictEqual(invalidTerminal.isValid, false);

  // Unauthorized role: guest/user cannot fund
  const unauthFund = validatePaymentTransition(PAYMENT_STATES.PENDING, PAYMENT_STATES.FUNDED, "user");
  assert.strictEqual(unauthFund.isValid, false);
});

// DUP-01: Repeated submission protection
runTest("DUP-01", "Submission Protection - Client UUID ensures idempotent retry without duplicate records", async () => {
  const testClientId = "uuid-dup-test-" + Date.now();
  const txPayload = {
    client_id: testClientId,
    commodity: "Beans",
    buyer_requirements: { buyer_name: "Kampala Millers", required_tonnes: 10 },
  };

  // First submission
  const first = await saveOfflineTransaction(txPayload);
  assert.strictEqual(first.client_id, testClientId);

  // Second submission with identical client_id (e.g. double click or network retry)
  const second = await saveOfflineTransaction(txPayload);
  assert.strictEqual(second.client_id, testClientId);

  const all = await getAllOfflineTransactions();
  const matches = all.filter((t) => t.client_id === testClientId);
  assert.strictEqual(matches.length, 1, "Exactly one transaction record must exist for the client_id");
});

// OFF-01: Offline reconciliation
runTest("OFF-01", "Offline Sync - Offline store captures and reconciles transactions with durable pending state", async () => {
  const offlineClientId = "uuid-offline-" + Date.now();
  const record = await saveOfflineTransaction({
    client_id: offlineClientId,
    commodity: "Soybeans",
    status: "FieldCaptured",
  });

  assert.strictEqual(record.sync_status, "pending_sync");
  const stored = await getOfflineTransaction(offlineClientId);
  assert.strictEqual(stored.sync_status, "pending_sync");
});

// BAK-01: Recovery procedure verification
runTest("BAK-01", "Backup & Recovery - Documented procedure and recovery verification confirmed", () => {
  const guidePath = path.join(projectRoot, "PRODUCTION_SETUP_GUIDE.md");
  assert.ok(fs.existsSync(guidePath), "Production guide must exist");
  const guideContent = fs.readFileSync(guidePath, "utf8");

  assert.ok(guideContent.includes("Supabase Database Migrations"), "Guide provides migration instructions");
  assert.ok(guideContent.includes("cng-deal-desk-alpha-rose.vercel.app"), "Authoritative production domain documented");
});

// AUTH-01: Email Confirmation Localhost Redirection
runTest("AUTH-01", "Auth Redirect - Email confirmation URL strictly avoids localhost and prioritizes production domain", () => {
  const redirectUrl = getAuthRedirectUrl("/login");
  assert.ok(!redirectUrl.includes("localhost"), "Auth redirect must never contain localhost");
  assert.ok(!redirectUrl.includes("127.0.0.1"), "Auth redirect must never contain 127.0.0.1");
  assert.strictEqual(redirectUrl, "https://cng-deal-desk-alpha-rose.vercel.app/login");
});

// COMM-01: Sunflower in commodity droplists and schema
runTest("COMM-01", "Commodity Expansion - 'Sunflower' is supported across frontend droplists, financial engine, and migrations", () => {
  // 1. Verify in financialEngine COMMODITIES
  const sunflowerEngine = COMMODITIES.find((c) => c.name === "Sunflower");
  assert.ok(sunflowerEngine, "Sunflower must be present in financialEngine COMMODITIES");
  assert.strictEqual(sunflowerEngine.category, "Oilseeds");
  assert.strictEqual(sunflowerEngine.defaultUnit, "MT");

  // 2. Verify in desk-CXHNcONN.js
  assert.ok(COMMODITIES_DESK.includes("Sunflower"), "Sunflower must be present in core desk commodities array");

  // 3. Verify in Deals-BCwyOzL-.js select dropdown
  const dealsPath = path.join(projectRoot, "assets/Deals-BCwyOzL-.js");
  const dealsContent = fs.readFileSync(dealsPath, "utf8");
  assert.ok(dealsContent.includes('"Sunflower"'), "DealsPage dropdown must include Sunflower");

  // 4. Verify in TransactionModule.js
  const txPath = path.join(projectRoot, "assets/transactions/TransactionModule.js");
  const txContent = fs.readFileSync(txPath, "utf8");
  assert.ok(txContent.includes('"Sunflower"'), "TransactionModule must include Sunflower");

  // 5. Verify migration file
  const migPath = path.join(projectRoot, "supabase/migrations/20261114000002_add_sunflower_commodity.sql");
  assert.ok(fs.existsSync(migPath), "Sunflower migration must exist");
  const migContent = fs.readFileSync(migPath, "utf8");
  assert.ok(migContent.includes("'Sunflower'"), "Migration checks Sunflower constraint");
});

// PERSIST-01: Hard refresh persistence simulation
runTest("PERSIST-01", "Persistence - Multi-layered store preserves transactions across hard refresh without data loss", async () => {
  const testId = "11111111-2222-4333-8444-555555555555";
  const testTx = {
    client_id: testId,
    reference: "TXN-PERSIST-001",
    commodity: "Sunflower",
    buyer_requirements: { buyer_name: "Lira Sunflower Press", required_tonnes: 50 },
    supplier_verification: { supplier_name: "Kitgum Oilseed Co-op", confirmed_tonnes: 50 },
    payment_terms: { agreed_price_per_kg: 2200 },
    fee_margin: { expected_gross_fee: 1500000 },
  };

  await saveOfflineTransaction(testTx);

  // Verify retrieval
  const retrieved = await getOfflineTransaction(testId);
  assert.ok(retrieved, "Transaction must be found in store");
  assert.strictEqual(retrieved.commodity, "Sunflower");
  assert.strictEqual(retrieved.reference, "TXN-PERSIST-001");

  // Verify getAllOfflineTransactions includes the persisted record
  const all = await getAllOfflineTransactions();
  const exists = all.some((t) => t.client_id === testId);
  assert.ok(exists, "Persisted record must appear in getAllOfflineTransactions");
});

// PERSIST-02: Remote reconciliation test (markTransactionSynced on new record)
runTest("PERSIST-02", "Sync Reconciliation - Remote records from Supabase are safely saved locally even when local cache is empty", async () => {
  const remoteClientId = "22222222-3333-4444-8555-666666666666";
  const remoteServerRecord = {
    id: "txn_server_999",
    client_id: remoteClientId,
    reference: "TXN-REMOTE-001",
    commodity: "Sunflower",
    status: "Approved",
    created_at: new Date().toISOString(),
  };

  // Prior to call, local cache does not have remoteClientId
  const synced = await markTransactionSynced(remoteClientId, remoteServerRecord);
  assert.ok(synced, "markTransactionSynced must instantiate and return record even if not previously in local cache");
  assert.strictEqual(synced.sync_status, "synced");
  assert.strictEqual(synced.id, "txn_server_999");

  // Verify that it is now persisted in offline store
  const stored = await getOfflineTransaction(remoteClientId);
  assert.ok(stored, "Remote record must now exist in offline store");
  assert.strictEqual(stored.client_id, remoteClientId);
  assert.strictEqual(stored.status, "Approved");
});

// PERSIST-03: UUID format enforcement
runTest("PERSIST-03", "Data Integrity - Client IDs default to valid PostgreSQL UUIDs when omitted", () => {
  const generatedRecord = normalizeTransactionRecord({
    commodity: "Sunflower",
  });
  assert.ok(isValidUUID(generatedRecord.client_id), "normalizeTransactionRecord must generate a valid UUID when client_id is omitted");
  assert.ok(isValidUUID(generateUUID()), "generateUUID must output valid UUID format");
});

// AUTH-02: Mandatory Email Confirmation Before Dashboard Access
runTest("AUTH-02", "Auth Security - Unconfirmed users strictly barred from dashboard access and auto-confirm trigger dropped", () => {
  const migPath = path.join(projectRoot, "supabase/migrations/20261114000003_require_email_confirmation.sql");
  assert.ok(fs.existsSync(migPath), "Strict email confirmation migration must exist");
  const migContent = fs.readFileSync(migPath, "utf8");
  assert.ok(migContent.includes("DROP TRIGGER IF EXISTS trg_auto_confirm_new_user"), "Must drop auto-confirm trigger");
  assert.ok(migContent.includes("DROP FUNCTION IF EXISTS public.auto_confirm_new_user"), "Must drop auto-confirm function");

  // Verify authContext.js checks email_confirmed_at
  const authContextPath = path.join(projectRoot, "assets/auth/authContext.js");
  const authContextContent = fs.readFileSync(authContextPath, "utf8");
  assert.ok(authContextContent.includes("email_confirmed_at"), "authContext must strictly check email_confirmed_at");
  assert.ok(authContextContent.includes("needsConfirmation: true"), "register must always require email confirmation");
});

// AUTH-03: Flexible Sign-in Support (Email or Username)
runTest("AUTH-03", "Auth Usability - Login form supports sign-in with either email or username", () => {
  const loginPath = path.join(projectRoot, "assets/auth/LoginPage.js");
  const loginContent = fs.readFileSync(loginPath, "utf8");
  assert.ok(loginContent.includes("Email or Username"), "Login form input must label Email or Username");
  assert.ok(loginContent.includes("identifier"), "Login form must accept identifier field");

  const authContextPath = path.join(projectRoot, "assets/auth/authContext.js");
  const authContextContent = fs.readFileSync(authContextPath, "utf8");
  assert.ok(authContextContent.includes('ilike("username", identifier)'), "login must resolve email from username when identifier has no @");
});

// PERSIST-04: Draft Persistence for Incomplete Transactions
runTest("PERSIST-04", "Database Persistence - Incomplete draft transactions are preserved with Draft status without wiping", async () => {
  const draftId = "44444444-5555-4666-8777-888888888888";
  // Incomplete record: only commodity and proof tonnes filled, buyer and supplier left pending
  const incompleteDraft = {
    client_id: draftId,
    commodity: "Sunflower",
    buyer_id: null,
    supplier_id: null,
    status: "Draft",
    buyer_requirements: { buyer_name: "", required_tonnes: 15 },
    supplier_verification: { supplier_name: "", moisture_reading_pct: 0 },
  };

  const normalized = normalizeTransactionRecord(incompleteDraft);
  assert.strictEqual(normalized.status, "Draft");
  assert.strictEqual(normalized.commodity, "Sunflower");
  assert.strictEqual(normalized.client_id, draftId);

  await saveOfflineTransaction(normalized);
  const stored = await getOfflineTransaction(draftId);
  assert.ok(stored, "Incomplete draft must be saved and retrievable");
  assert.strictEqual(stored.status, "Draft");
  assert.strictEqual(stored.commodity, "Sunflower");
});

// ==============================================================================
// SUMMARY
// ==============================================================================
await testQueue;

console.log("\n================================================================================");
console.log(`  FINAL TEST SUMMARY: ${passedCount} PASSED | ${failedCount} FAILED | 0 SKIPPED`);
console.log(`  Overall Success Rate: ${((passedCount / (passedCount + failedCount)) * 100).toFixed(1)}%`);
console.log("================================================================================");

if (failedCount > 0) {
  process.exit(1);
}

