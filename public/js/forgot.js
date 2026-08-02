// /public/js/forgot.js
// Sends password reset email via NEW route: POST /api/password/forgot
console.log("[forgot.js] loaded");
const API = "https://api-b.innerguideai.com";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forgotForm");
  const emailInput = document.getElementById("forgotEmail");
  const submitBtn = document.getElementById("forgotSubmit");
  const statusMsg = document.getElementById("forgotStatus");

  const setStatus = (msg, color = "red") => {
    if (statusMsg) {
      statusMsg.textContent = msg;
      statusMsg.style.color = color;
    } else {
      console.log("[forgot.js]", msg);
    }
  };

  if (!form || !emailInput) {
    console.warn("[forgot.js] missing form/email elements");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = (emailInput.value || "").trim().toLowerCase();

    // Validation
    if (!email) {
      setStatus("Please enter your email.");
      emailInput.focus();
      return;
    }

    try {
      if (submitBtn) submitBtn.disabled = true;

      setStatus("Sending reset link...", "black");

      const r = await fetch(`${API}/api/password/forgot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      // Do not reveal whether account exists
      if (!r.ok) {
        console.warn("[forgot.js] server returned", r.status);
      }

      setStatus("If that email exists, we’ve sent a reset link.", "green");

      if (submitBtn) submitBtn.disabled = false;

    } catch (err) {
      console.error("[forgot.js] error:", err);

      setStatus("Network error. Please try again.");

      if (submitBtn) submitBtn.disabled = false;
    }
  });
});