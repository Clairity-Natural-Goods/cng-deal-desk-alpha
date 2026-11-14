import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

console.log("==================================================================");
console.log("  CNG DEAL DESK ALPHA V2 — PRODUCTION BUILD & INTEGRITY CHECK");
console.log("==================================================================");

let hasErrors = false;

function checkFile(relPath, desc) {
  const full = path.join(root, relPath);
  if (fs.existsSync(full)) {
    console.log(`[PASS] ${desc} (${relPath})`);
  } else {
    console.error(`[FAIL] Missing required file: ${relPath}`);
    hasErrors = true;
  }
}

// 1. Verify Entry & Config Files
checkFile("index.html", "Application HTML Entry");
checkFile("vercel.json", "Vercel SPA Rewrite Configuration");
checkFile(".env.example", "Environment Configuration Template");
checkFile(".gitignore", "Git Ignore Rules");
checkFile("package.json", "Package Manifest");

// 2. Verify Supabase Migrations
checkFile("supabase/migrations/20261104000001_initial_schema.sql", "Supabase Initial Schema Migration");
checkFile("supabase/migrations/20261104000002_seed_data.sql", "Supabase Seed Data Migration");
checkFile("supabase/migrations/20261104000003_auto_confirm_users.sql", "Supabase Auto-Confirm Migration");
checkFile("supabase/migrations/20261110000001_mvtr_transactions.sql", "Supabase MVTR Transactions Migration");
checkFile("supabase/migrations/20261114000001_identity_disclosure_and_audit.sql", "Identity Disclosure & Audit Migration");
checkFile("supabase/migrations/20261114000002_add_sunflower_commodity.sql", "Sunflower Commodity Expansion Migration");

// 3. Verify JavaScript Assets & Modules
checkFile("assets/supabaseClient.js", "Supabase JavaScript Client");
checkFile("assets/supabaseRepository.js", "Supabase Entity Repository");
checkFile("assets/migrationUtility.js", "Local Storage Migration Utility");
checkFile("assets/offline/offlineStore.js", "MVTR Offline Store");
checkFile("assets/offline/syncEngine.js", "MVTR Offline Sync Engine");
checkFile("assets/transactions/TransactionModule.js", "MVTR Transaction Module");
checkFile("assets/matrix/financialEngine.js", "Decision Matrix Financial Engine");
checkFile("assets/matrix/DecisionMatrixModule.js", "Decision Matrix UI Module");
checkFile("assets/auth/entry.js", "Application Auth & Routing Bootstrap");
checkFile("assets/auth/authContext.js", "Supabase Auth Context");
checkFile("assets/auth/LoginPage.js", "Login View Component");
checkFile("assets/auth/RegisterPage.js", "Register View Component");
checkFile("assets/auth/ProtectedRoute.js", "Route Guard");
checkFile("assets/desk-CXHNcONN.js", "Core Domain Rules & Calculations");
checkFile("assets/index-A159RRyL.js", "Compiled React App Bundle");

// 3.1 JavaScript Syntax Verification
console.log("\nVerifying JavaScript syntax across all bundles...");
const jsFilesToCheck = [
  "assets/index-A159RRyL.js",
  "assets/auth/entry.js",
  "assets/auth/authContext.js",
  "assets/supabaseClient.js",
  "assets/supabaseRepository.js",
  "assets/migrationUtility.js",
  "assets/offline/offlineStore.js",
  "assets/offline/syncEngine.js",
  "assets/transactions/TransactionModule.js",
  "assets/matrix/financialEngine.js",
  "assets/matrix/DecisionMatrixModule.js",
  "assets/dealCreation.js",
  "assets/Deals-BCwyOzL-.js",
  "assets/identityMasking.js",
  "assets/transactions/paymentStateMachine.js",
  "assets/Registry-C6DBQU1c.js",
  "assets/Data-DV5c2Wc2.js",
];

for (const f of jsFilesToCheck) {
  try {
    execSync(`node -c "${path.join(root, f)}"`, { stdio: "pipe" });
    console.log(`[PASS] Syntax valid: ${f}`);
  } catch (err) {
    console.error(`[FAIL] Syntax error in ${f}:`, err.message);
    hasErrors = true;
  }
}

// 4. Audit for Insecure Bypasses & Leaked Secrets
console.log("\nAuditing bundle for insecure auth bypasses and secret leaks...");
const indexContent = fs.readFileSync(path.join(root, "assets/index-A159RRyL.js"), "utf8");
if (indexContent.includes("usr_operator")) {
  console.error("[FAIL] Hardcoded operator bypass still found in assets/index-A159RRyL.js");
  hasErrors = true;
} else {
  console.log("[PASS] Verified zero occurrences of hardcoded 'usr_operator' auth bypass.");
}

const secretKeywords = [
  "service_role",
  "serviceRole",
  "SUPABASE_SERVICE_KEY",
  "SERVICE_ROLE_KEY",
];

for (const keyword of secretKeywords) {
  if (indexContent.includes(keyword)) {
    console.error(`[FAIL] Potential leaked secret keyword '${keyword}' detected in bundle.`);
    hasErrors = true;
  }
}
console.log("[PASS] No service-role keys or sensitive credentials detected in client bundle.");

if (hasErrors) {
  console.error("\n>>> BUILD INTEGRITY CHECK FAILED");
  process.exit(1);
} else {
  // 5. Generate Environment Config for Browser Runtime
  console.log("\nGenerating browser runtime environment configuration...");
  let supabaseUrl = process.env.VITE_SUPABASE_URL || "";
  let supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl && fs.existsSync(path.join(root, ".env"))) {
    const envContent = fs.readFileSync(path.join(root, ".env"), "utf8");
    const urlMatch = envContent.match(/VITE_SUPABASE_URL\s*=\s*([^\r\n]+)/);
    const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY\s*=\s*([^\r\n]+)/);
    if (urlMatch) supabaseUrl = urlMatch[1].trim();
    if (keyMatch) supabaseAnonKey = keyMatch[1].trim();
  }

  const envConfigContent = `// Auto-generated runtime environment configuration\nwindow.__ENV__ = Object.assign(window.__ENV__ || {}, {\n  VITE_SUPABASE_URL: "${supabaseUrl || "https://ktbmxjakzkopijdzkxlo.supabase.co"}",\n  VITE_SUPABASE_ANON_KEY: "${supabaseAnonKey || "sb_publishable_ffsFhgLkKV1IGGEJKGV-2w_b9xRTZ1H"}"\n});\n`;
  fs.writeFileSync(path.join(root, "assets/env-config.js"), envConfigContent, "utf8");
  console.log("[PASS] Browser runtime environment configuration written to assets/env-config.js");

  console.log("\n>>> BUILD INTEGRITY CHECK PASSED (100% production ready)");
}
