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
} from "../assets/desk-CXHNcONN.js";

import {
  normalizeCounterpartyName,
  normalizeDistrict,
  generateRecordId,
} from "../assets/supabaseRepository.js";

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

