import {
  deleteCurrentAccount,
  fetchCurrentSessionUser,
  getCurrentUser,
  login,
  logout,
  register,
} from "./authContext.js";
import { renderLoginPage } from "./LoginPage.js";
import { renderRegisterPage } from "./RegisterPage.js";
import { requireAuthenticatedUser } from "./ProtectedRoute.js";
import { createSupabaseDatabaseAdapter } from "../supabaseRepository.js";
import { checkMigrationNeeded, migrateLocalStorageToSupabase } from "../migrationUtility.js";

const ROOT_ID = "root";
const AUTH_ID = "cng-auth-root";
const AUTH_PATHS = new Set(["/login", "/register", "/logout"]);
let reactAppPromise = null;

// Ensure the React application bundle is loaded
function ensureReactBundle() {
  if (!reactAppPromise) {
    reactAppPromise = import("../index-A159RRyL.js").catch((err) => {
      console.error("Failed to load React bundle:", err);
      throw err;
    });
  }
  return reactAppPromise;
}

// Install the production Supabase database adapter on globalThis.__B44_DB__
function installSupabaseAdapter() {
  const adapter = createSupabaseDatabaseAdapter();
  // Override auth methods to sync with our authContext session cache
  adapter.auth.isAuthenticated = async () => Boolean(getCurrentUser() || (await fetchCurrentSessionUser()));
  adapter.auth.me = async () => getCurrentUser() || (await fetchCurrentSessionUser());
  adapter.auth.login = login;
  adapter.auth.register = register;
  adapter.auth.logout = () => {
    logout().then(() => window.location.assign("/login"));
  };
  adapter.auth.redirectToLogin = () => {
    if (!AUTH_PATHS.has(window.location.pathname)) {
      window.location.assign("/login");
    }
  };
  adapter.auth.deleteAccount = async () => ({
    success: await deleteCurrentAccount(),
  });

  globalThis.__B44_DB__ = adapter;
}

function addStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #${AUTH_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 24px 16px;
      box-sizing: border-box;
      background: #090e17 url('/assets/auth-bg.jpg') center center / cover no-repeat fixed;
      color: #ffffff;
      font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    #${AUTH_ID}[hidden] { display: none; }

    /* Main two-column responsive layout */
    #${AUTH_ID} .auth-layout-container {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      max-width: 1120px;
      margin: auto;
      gap: 48px;
      min-height: calc(100vh - 48px);
      box-sizing: border-box;
      padding: 16px;
    }

    /* Left Hero Section */
    #${AUTH_ID} .auth-hero-section {
      flex: 1;
      max-width: 540px;
      color: #ffffff;
      user-select: none;
    }
    #${AUTH_ID} .auth-hero-title {
      display: flex;
      flex-direction: column;
      font-weight: 900;
      font-size: clamp(48px, 6.5vw, 84px);
      line-height: 0.92;
      letter-spacing: -0.035em;
      color: #ffffff;
      text-transform: uppercase;
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.55);
    }
    #${AUTH_ID} .auth-hero-tagline {
      margin: 22px 0 0 0;
      font-size: clamp(17px, 2.2vw, 24px);
      line-height: 1.35;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.94);
      max-width: 380px;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.65);
    }

    /* Right Glassmorphic Card Container */
    #${AUTH_ID} .auth-card-section {
      flex: 1;
      max-width: 440px;
      width: 100%;
      display: flex;
      justify-content: flex-end;
      perspective: 1000px;
    }

    /* Frosted Glass Card */
    #${AUTH_ID} .auth-glass-card {
      box-sizing: border-box;
      width: 100%;
      padding: 36px 32px 30px;
      border-radius: 26px;
      background: rgba(255, 255, 255, 0.16);
      backdrop-filter: blur(28px) saturate(140%);
      -webkit-backdrop-filter: blur(28px) saturate(140%);
      border: 1.5px solid rgba(255, 255, 255, 0.42);
      box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.18) inset;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    /* Card Header */
    #${AUTH_ID} .auth-card-brand {
      margin: 0 0 20px;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.015em;
      text-align: center;
      color: #0b1329;
      text-transform: uppercase;
      text-shadow: 0 1px 2px rgba(255, 255, 255, 0.35);
    }
    #${AUTH_ID} .auth-card-subhead {
      margin: -14px 0 18px;
      font-size: 13.5px;
      font-weight: 600;
      text-align: center;
      color: #1e293b;
    }

    /* Form Fields & Labels */
    #${AUTH_ID} .auth-form {
      display: grid;
      gap: 13px;
    }
    #${AUTH_ID} .auth-form label {
      display: grid;
      gap: 6px;
      font-size: 13.5px;
      font-weight: 700;
      color: #ffffff;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
    }
    #${AUTH_ID} .auth-form label span {
      display: block;
      color: #ffffff;
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    #${AUTH_ID} .auth-form input {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      padding: 10px 14px;
      border-radius: 12px;
      border: 1.5px solid rgba(255, 255, 255, 0.55);
      background: rgba(255, 255, 255, 0.18);
      color: #ffffff;
      font: 500 14.5px system-ui, -apple-system, sans-serif;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15) inset;
    }
    #${AUTH_ID} .auth-form input::placeholder {
      color: rgba(255, 255, 255, 0.75);
      font-weight: 400;
    }
    #${AUTH_ID} .auth-form input:focus {
      outline: none;
      border-color: #3b82f6;
      background: rgba(255, 255, 255, 0.28);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.4), 0 2px 6px rgba(0, 0, 0, 0.1) inset;
    }

    /* Password Input Wrapper & Toggle */
    #${AUTH_ID} .auth-password-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
    }
    #${AUTH_ID} .auth-password-wrapper input {
      padding-right: 44px;
    }
    #${AUTH_ID} .auth-toggle-password {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      padding: 6px;
      cursor: pointer;
      color: rgba(255, 255, 255, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      transition: color 0.15s ease, background-color 0.15s ease;
    }
    #${AUTH_ID} .auth-toggle-password:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.2);
    }
    #${AUTH_ID} .auth-toggle-password:focus-visible {
      outline: 2px solid #3b82f6;
      outline-offset: 1px;
    }

    /* Forgot Password Link */
    #${AUTH_ID} .auth-forgot-link {
      font-size: 12.5px;
      color: rgba(255, 255, 255, 0.92);
      text-decoration: none;
      font-weight: 600;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      transition: color 0.15s ease;
    }
    #${AUTH_ID} .auth-forgot-link:hover {
      color: #ffffff;
      text-decoration: underline;
    }

    /* Primary Submit Button (Electric Blue) */
    #${AUTH_ID} .auth-submit-btn,
    #${AUTH_ID} .auth-submit {
      box-sizing: border-box;
      width: 100%;
      min-height: 46px;
      margin-top: 4px;
      border: none;
      border-radius: 12px;
      background: #0047ff;
      color: #ffffff;
      font: 700 14px system-ui, -apple-system, sans-serif;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      cursor: pointer;
      box-shadow: 0 8px 22px rgba(0, 71, 255, 0.45);
      transition: background-color 0.15s ease, transform 0.12s ease, box-shadow 0.15s ease;
    }
    #${AUTH_ID} .auth-submit-btn:hover,
    #${AUTH_ID} .auth-submit:hover {
      background: #003cd4;
      box-shadow: 0 10px 26px rgba(0, 71, 255, 0.6);
      transform: translateY(-1px);
    }
    #${AUTH_ID} .auth-submit-btn:active,
    #${AUTH_ID} .auth-submit:active {
      transform: translateY(0);
    }
    #${AUTH_ID} .auth-submit-btn:disabled,
    #${AUTH_ID} .auth-submit:disabled {
      cursor: wait;
      opacity: 0.72;
      transform: none;
    }

    /* Hints & Errors */
    #${AUTH_ID} .auth-hint {
      margin: -4px 0 0;
      color: rgba(255, 255, 255, 0.85);
      font-size: 12px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    }
    #${AUTH_ID} .auth-error {
      min-height: 20px;
      margin: 0;
      color: #fca5a5;
      font-size: 13px;
      font-weight: 600;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
    }

    /* Switch Nav Link */
    #${AUTH_ID} .auth-switch-text,
    #${AUTH_ID} .auth-switch {
      margin: 18px 0 0;
      text-align: center;
      font-size: 13.5px;
      color: rgba(255, 255, 255, 0.94);
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    }
    #${AUTH_ID} .auth-switch-text a,
    #${AUTH_ID} .auth-switch a {
      color: #ffffff;
      font-weight: 700;
      text-decoration: underline;
      margin-left: 4px;
      cursor: pointer;
    }

    /* Smooth Diagonal Slide Keyframes & Classes */
    @keyframes authSlideDiagonalIn {
      0% {
        opacity: 0;
        transform: translate(32px, -32px) scale(0.96);
      }
      100% {
        opacity: 1;
        transform: translate(0, 0) scale(1);
      }
    }
    @keyframes authSlideDiagonalOut {
      0% {
        opacity: 1;
        transform: translate(0, 0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate(-32px, 32px) scale(0.96);
      }
    }
    #${AUTH_ID} .auth-slide-diagonal-in {
      animation: authSlideDiagonalIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    #${AUTH_ID} .auth-slide-diagonal-out {
      animation: authSlideDiagonalOut 0.22s cubic-bezier(0.7, 0, 0.84, 0) forwards;
    }

    /* Responsive Mobile Breakpoint */
    @media (max-width: 880px) {
      #${AUTH_ID} {
        padding: 20px 12px;
        align-items: flex-start;
      }
      #${AUTH_ID} .auth-layout-container {
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 20px;
        min-height: auto;
        padding: 12px 4px 28px;
      }
      #${AUTH_ID} .auth-hero-section {
        max-width: 100%;
        text-align: center;
        margin-top: 8px;
      }
      #${AUTH_ID} .auth-hero-title {
        font-size: clamp(34px, 8.5vw, 48px);
        line-height: 1.05;
      }
      #${AUTH_ID} .auth-hero-tagline {
        margin: 10px auto 0;
        font-size: 15px;
        max-width: 100%;
      }
      #${AUTH_ID} .auth-card-section {
        justify-content: center;
        max-width: 420px;
      }
      #${AUTH_ID} .auth-glass-card {
        padding: 26px 20px 22px;
        border-radius: 20px;
      }
      #${AUTH_ID} .auth-card-brand {
        font-size: 23px;
        margin-bottom: 16px;
      }
    }
  `;
  document.head.append(style);
}

function navigate(path) {
  window.history.pushState({}, "", path);
  renderCurrentPath();
}

async function onLogin(credentials) {
  const user = await login(credentials);
  if (user) {
    if (await checkMigrationNeeded()) {
      migrateLocalStorageToSupabase(user).catch((err) => {
        console.warn("Background migration encountered notice:", err);
      });
    }
    const returnTo = sessionStorage.getItem("cng_return_to") || "/";
    sessionStorage.removeItem("cng_return_to");
    window.location.replace(returnTo);
  }
}

async function onRegister(userData) {
  const result = await register(userData);
  const authRoot = document.getElementById(AUTH_ID);
  if (authRoot) {
    authRoot.innerHTML = `
      <div class="auth-layout-container">
        <!-- Left Hero Branding -->
        <section class="auth-hero-section">
          <div class="auth-hero-title">
            <span>CNG</span>
            <span>GLOBAL</span>
          </div>
          <p class="auth-hero-tagline">Buy, sell commodity at affordable price.</p>
        </section>

        <!-- Right Glassmorphic Verification Card -->
        <section class="auth-card-section auth-slide-diagonal-in">
          <main class="auth-glass-card auth-card" style="text-align: center;" aria-labelledby="auth-title">
            <h1 class="auth-card-brand">CNG GLOBAL</h1>
            <div style="margin: 14px auto 16px; display: inline-flex; padding: 14px; background: rgba(59, 130, 246, 0.25); border: 1.5px solid rgba(255, 255, 255, 0.4); border-radius: 50%; color: #ffffff;">
              <svg style="width: 36px; height: 36px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            </div>
            <h2 id="auth-title" style="font-size: 22px; font-weight: 700; color: #0b1329; margin: 0 0 10px; text-shadow: 0 1px 2px rgba(255,255,255,0.3);">Verify your email</h2>
            <p style="color: #ffffff; font-size: 13.5px; line-height: 1.55; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7); margin: 0 0 22px;">
              Account created successfully! We've sent a verification link to <strong style="color: #93c5fd;">${userData.email}</strong>.<br><br>
              Please check your Gmail or email inbox and click the confirmation link to activate your account before accessing the Deal Desk dashboard.
            </p>
            <a href="/login" class="auth-submit-btn auth-submit" style="display: flex; align-items: center; justify-content: center; text-decoration: none;">PROCEED TO SIGN IN</a>
          </main>
        </section>
      </div>
    `;
    authRoot.querySelector("a").addEventListener("click", (e) => {
      e.preventDefault();
      navigate("/login");
    });
  }
}

async function renderCurrentPath() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const root = document.getElementById(ROOT_ID);
  const authRoot = document.getElementById(AUTH_ID);
  const user = await fetchCurrentSessionUser();
  const loggedIn = Boolean(user);

  if (path === "/logout") {
    await logout();
    window.location.replace("/login");
    return;
  }

  if (AUTH_PATHS.has(path)) {
    if (loggedIn) {
      window.location.replace("/");
      return;
    }
    if (root) root.hidden = true;
    if (authRoot) {
      authRoot.hidden = false;
      if (path === "/register") {
        renderRegisterPage(authRoot, {
          onRegister,
          onLogin: () => navigate("/login"),
        });
      } else {
        renderLoginPage(authRoot, {
          onLogin,
          onRegister: () => navigate("/register"),
        });
      }
    }
    return;
  }

  if (authRoot) authRoot.hidden = true;

  if (!loggedIn) {
    if (root) root.hidden = true;
    if (authRoot) {
      authRoot.hidden = false;
      sessionStorage.setItem("cng_return_to", path);
      if (window.location.pathname !== "/login" && window.location.pathname !== "/register") {
        window.history.replaceState({ redirectedFrom: path }, "", "/login");
      }
      renderLoginPage(authRoot, {
        onLogin,
        onRegister: () => navigate("/register"),
      });
    }
    return;
  }

  // User is authenticated: ensure React bundle is mounted
  await ensureReactBundle();
  if (root) root.hidden = false;
}

async function initialize() {
  installSupabaseAdapter();

  const root = document.getElementById(ROOT_ID);
  if (root) root.hidden = true;

  const authRoot = document.createElement("div");
  authRoot.id = AUTH_ID;
  authRoot.hidden = true;
  document.body.append(authRoot);
  addStyles();

  window.addEventListener("popstate", renderCurrentPath);

  // Pre-load React bundle in background
  ensureReactBundle().catch((e) => {
    console.warn("React bundle preload notice:", e.message);
  });

  await renderCurrentPath();
}

initialize().catch((error) => {
  console.error("Authentication initialization failed.", {
    code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    message: error?.message,
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: Date.now(),
  });
  const root = document.getElementById(ROOT_ID);
  if (root) {
    root.hidden = false;
    root.innerHTML = `<div style="padding: 40px; font-family: system-ui, sans-serif; text-align: center; color: #0f172a;">
      <div style="display: inline-block; padding: 12px; background: #fee2e2; border-radius: 50%; color: #b91c1c; margin-bottom: 16px;">
        <svg style="width: 32px; height: 32px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
      </div>
      <h2 style="font-size: 20px; font-weight: 700; margin: 0 0 8px;">Initialization Notice</h2>
      <p style="color: #64748b; font-size: 14px; max-width: 440px; margin: 0 auto 20px;">${error?.message || "Please reload to reconnect."}</p>
      <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
        <button onclick="window.location.reload(true)" style="background: #047857; color: white; border: 0; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Fresh Reload</button>
        <button onclick="localStorage.clear(); sessionStorage.clear(); window.location.href='/login'" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Clear Cache & Go to Login</button>
      </div>
    </div>`;
  }
});
