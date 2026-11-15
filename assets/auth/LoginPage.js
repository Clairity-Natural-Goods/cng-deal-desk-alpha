import { resetPassword, resendConfirmationEmail } from "./authContext.js";

const EYE_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function setupPasswordToggles(container) {
  container.querySelectorAll(".auth-toggle-password").forEach((btn) => {
    btn.innerHTML = EYE_ICON;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const input = btn.parentElement?.querySelector("input");
      if (!input) return;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.innerHTML = isPassword ? EYE_OFF_ICON : EYE_ICON;
      btn.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
      btn.style.color = isPassword ? "#60a5fa" : "rgba(255, 255, 255, 0.85)";
    });
  });
}

export function renderLoginPage(container, { onLogin, onRegister }) {
  container.innerHTML = `
    <div class="auth-layout-container">
      <!-- Left Hero Branding -->
      <section class="auth-hero-section">
        <div class="auth-hero-title">
          <span>CNG</span>
          <span>GLOBAL</span>
        </div>
        <p class="auth-hero-tagline">Buy, sell commodity at affordable price.</p>
      </section>

      <!-- Right Glassmorphic Card -->
      <section class="auth-card-section auth-slide-diagonal-in">
        <main class="auth-glass-card auth-card" aria-labelledby="auth-title">
          <h1 id="auth-title" class="auth-card-brand">CNG GLOBAL</h1>
          <form id="auth-login-form" class="auth-form" novalidate>
            <label>
              <span title="Email or Username" aria-label="Email or Username">Email</span>
              <input name="identifier" type="text" autocomplete="username" required placeholder="Enter your email">
            </label>
            <label>
              <span>Password</span>
              <div class="auth-password-wrapper">
                <input name="password" type="password" autocomplete="current-password" required placeholder="••••••••••••">
                <button type="button" class="auth-toggle-password" aria-label="Show password"></button>
              </div>
            </label>
            <div style="display: flex; justify-content: flex-end; margin-top: -4px;">
              <a href="#" id="auth-forgot-password" class="auth-forgot-link">Forgot Password</a>
            </div>
            <p class="auth-error" role="alert" aria-live="polite"></p>
            <button class="auth-submit-btn auth-submit" type="submit">SIGN IN</button>
          </form>
          <p class="auth-switch-text auth-switch">New here? <a href="/register" data-auth-nav>Register</a></p>
        </main>
      </section>
    </div>`;

  const form = container.querySelector("form");
  const button = form.querySelector("button[type='submit']");
  const error = form.querySelector(".auth-error");

  setupPasswordToggles(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    button.disabled = true;
    button.textContent = "SIGNING IN…";
    error.textContent = "";

    const oldResend = form.querySelector("#auth-resend-confirm");
    if (oldResend) oldResend.remove();

    try {
      const identifier = data.get("identifier") || data.get("email");
      await onLogin({ identifier, email: identifier, password: data.get("password") });
    } catch (reason) {
      error.style.color = "#fca5a5";
      error.textContent = reason.message || "Unable to sign in.";
      button.disabled = false;
      button.textContent = "SIGN IN";

      if (reason.code === "email_not_confirmed" || reason.message?.includes("Email not confirmed")) {
        const resendBtn = document.createElement("button");
        resendBtn.id = "auth-resend-confirm";
        resendBtn.type = "button";
        resendBtn.textContent = "Resend confirmation email";
        resendBtn.style.cssText = "margin-top: 10px; width: 100%; min-height: 40px; background: rgba(59, 130, 246, 0.2); border: 1.5px solid rgba(59, 130, 246, 0.5); color: #ffffff; border-radius: 12px; font: 700 13px system-ui, sans-serif; cursor: pointer; text-shadow: 0 1px 2px rgba(0,0,0,0.5);";
        resendBtn.addEventListener("click", async () => {
          const emailInput = form.querySelector("input[name='identifier']") || form.querySelector("input[name='email']");
          const emailVal = emailInput ? emailInput.value : "";
          resendBtn.disabled = true;
          resendBtn.textContent = "Sending confirmation link…";
          try {
            await resendConfirmationEmail(emailVal);
            error.style.color = "#6ee7b7";
            error.textContent = "Confirmation link resent! Check your inbox.";
            resendBtn.remove();
          } catch (err) {
            error.style.color = "#fca5a5";
            error.textContent = err.message || "Failed to resend confirmation email.";
            resendBtn.disabled = false;
            resendBtn.textContent = "Resend confirmation email";
          }
        });
        error.after(resendBtn);
      }
    }
  });

  const forgotBtn = container.querySelector("#auth-forgot-password");
  if (forgotBtn) {
    forgotBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      const emailInput = form.querySelector("input[name='identifier']") || form.querySelector("input[name='email']");
      const email = emailInput ? emailInput.value : "";
      if (!email || !email.includes("@")) {
        error.style.color = "#fca5a5";
        error.textContent = "Please enter your email address above first, then click Forgot Password.";
        return;
      }
      try {
        await resetPassword(email);
        error.style.color = "#6ee7b7";
        error.textContent = "Password reset email sent. Check your inbox.";
      } catch (err) {
        error.style.color = "#fca5a5";
        error.textContent = err.message || "Could not send reset email.";
      }
    });
  }

  const navLink = container.querySelector("[data-auth-nav]");
  if (navLink) {
    navLink.addEventListener("click", (event) => {
      event.preventDefault();
      const cardSection = container.querySelector(".auth-card-section");
      if (cardSection) {
        cardSection.classList.remove("auth-slide-diagonal-in");
        cardSection.classList.add("auth-slide-diagonal-out");
        setTimeout(() => {
          onRegister();
        }, 220);
      } else {
        onRegister();
      }
    });
  }
}
