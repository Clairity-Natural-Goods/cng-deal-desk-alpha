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

export function renderRegisterPage(container, { onRegister, onLogin }) {
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
          <p class="auth-card-subhead">Create your Deal Desk account</p>
          <form id="auth-register-form" class="auth-form" novalidate>
            <label>
              <span>Full Name</span>
              <input name="name" autocomplete="name" required placeholder="e.g. Christine Auma">
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" autocomplete="email" required placeholder="name@company.com">
            </label>
            <label>
              <span>Username</span>
              <input name="username" autocomplete="username" required placeholder="e.g. christine">
            </label>
            <label>
              <span>Password</span>
              <div class="auth-password-wrapper">
                <input name="password" type="password" autocomplete="new-password" required placeholder="••••••••••••">
                <button type="button" class="auth-toggle-password" aria-label="Show password"></button>
              </div>
            </label>
            <p class="auth-hint">At least 8 characters with numbers and letters.</p>
            <label>
              <span>Confirm Password</span>
              <div class="auth-password-wrapper">
                <input name="confirmPassword" type="password" autocomplete="new-password" required placeholder="••••••••••••">
                <button type="button" class="auth-toggle-password" aria-label="Show password"></button>
              </div>
            </label>
            <p class="auth-error" role="alert" aria-live="polite"></p>
            <button class="auth-submit-btn auth-submit" type="submit">CREATE ACCOUNT</button>
          </form>
          <p class="auth-switch-text auth-switch">Already registered? <a href="/login" data-auth-nav>Sign in</a></p>
        </main>
      </section>
    </div>`;

  const form = container.querySelector("form");
  setupPasswordToggles(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type='submit']");
    const error = form.querySelector(".auth-error");
    const data = new FormData(form);
    const password = String(data.get("password") || "");
    const confirmPassword = String(data.get("confirmPassword") || "");

    if (password.length < 8) {
      error.style.color = "#fca5a5";
      error.textContent = "Password must be at least 8 characters.";
      return;
    }
    if (password !== confirmPassword) {
      error.style.color = "#fca5a5";
      error.textContent = "Passwords do not match.";
      return;
    }

    button.disabled = true;
    button.textContent = "CREATING ACCOUNT…";
    error.textContent = "";

    try {
      await onRegister({
        name: data.get("name"),
        email: data.get("email"),
        username: data.get("username"),
        password,
        confirmPassword,
      });
    } catch (reason) {
      error.style.color = "#fca5a5";
      error.textContent = reason.message || "Unable to create account.";
      button.disabled = false;
      button.textContent = "CREATE ACCOUNT";
    }
  });

  const navLink = container.querySelector("[data-auth-nav]");
  if (navLink) {
    navLink.addEventListener("click", (event) => {
      event.preventDefault();
      const cardSection = container.querySelector(".auth-card-section");
      if (cardSection) {
        cardSection.classList.remove("auth-slide-diagonal-in");
        cardSection.classList.add("auth-slide-diagonal-out");
        setTimeout(() => {
          onLogin();
        }, 220);
      } else {
        onLogin();
      }
    });
  }
}
