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
      btn.style.color = isPassword ? "#047857" : "#64748b";
    });
  });
}

export function renderLoginPage(container, { onLogin, onRegister }) {
  container.innerHTML = `
    <main class="auth-card" aria-labelledby="auth-title">
      <div class="auth-brand">CNG Deal Desk</div>
      <h1 id="auth-title">Welcome back</h1>
      <p class="auth-subtitle">Sign in to your CNG Deal Desk account with verified Supabase credentials.</p>
      <form id="auth-login-form" novalidate>
        <label>Email<input name="email" type="email" autocomplete="email" required placeholder="name@company.com"></label>
        <label>Password
          <div class="auth-password-wrapper">
            <input name="password" type="password" autocomplete="current-password" required>
            <button type="button" class="auth-toggle-password" aria-label="Show password"></button>
          </div>
        </label>
        <div style="display: flex; justify-content: flex-end;">
          <a href="#" id="auth-forgot-password" style="font-size: 12px; color: #047857; text-decoration: none;">Forgot password?</a>
        </div>
        <p class="auth-error" role="alert" aria-live="polite"></p>
        <button class="auth-submit" type="submit">Sign in</button>
      </form>
      <p class="auth-switch">New here? <a href="/register" data-auth-nav>Register</a></p>
    </main>`;

  const form = container.querySelector("form");
  const button = form.querySelector("button");
  const error = form.querySelector(".auth-error");

  setupPasswordToggles(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    button.disabled = true;
    button.textContent = "Signing in…";
    error.textContent = "";

    const oldResend = form.querySelector("#auth-resend-confirm");
    if (oldResend) oldResend.remove();

    try {
      await onLogin({ email: data.get("email"), password: data.get("password") });
    } catch (reason) {
      error.style.color = "#b91c1c";
      error.textContent = reason.message || "Unable to sign in.";
      button.disabled = false;
      button.textContent = "Sign in";

      if (reason.code === "email_not_confirmed" || reason.message?.includes("Email not confirmed")) {
        const resendBtn = document.createElement("button");
        resendBtn.id = "auth-resend-confirm";
        resendBtn.type = "button";
        resendBtn.textContent = "Resend confirmation email";
        resendBtn.style.cssText = "margin-top: 8px; width: 100%; min-height: 38px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; border-radius: 8px; font: 600 13px system-ui, sans-serif; cursor: pointer;";
        resendBtn.addEventListener("click", async () => {
          const emailVal = form.querySelector("input[name='email']").value;
          resendBtn.disabled = true;
          resendBtn.textContent = "Sending confirmation link…";
          try {
            await resendConfirmationEmail(emailVal);
            error.style.color = "#047857";
            error.textContent = "Confirmation link resent! Check your inbox.";
            resendBtn.remove();
          } catch (err) {
            error.style.color = "#b91c1c";
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
      const email = form.querySelector("input[name='email']").value;
      if (!email || !email.includes("@")) {
        error.textContent = "Please enter your email above first, then click Forgot password.";
        return;
      }
      try {
        await resetPassword(email);
        error.style.color = "#047857";
        error.textContent = "Password reset email sent. Check your inbox.";
      } catch (err) {
        error.style.color = "#b91c1c";
        error.textContent = err.message || "Could not send reset email.";
      }
    });
  }

  container.querySelector("[data-auth-nav]").addEventListener("click", (event) => {
    event.preventDefault();
    onRegister();
  });
}
