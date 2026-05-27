// /public/js/reset.js — v2025-12-19-2 
// // Reset flow for email+token links: 
// /reset.html?email=<email>&token=<token> 
// Validates token, resets password, then shows a success message (no redirect). 

const API = "http://54.221.158.219:3000"; 

document.addEventListener("DOMContentLoaded", () => { 
  const params = new URLSearchParams(location.search); 
  const email = (params.get("email") || "").trim().toLowerCase(); 
  const token = params.get("token"); 

  // DOM hooks 
  const form = document.getElementById("resetForm"); 
  const newPwInput = document.getElementById("newPassword"); 
  const confirmPwInput = document.getElementById("confirmPassword"); 
  const submitBtn = document.getElementById("resetSubmit"); 
  const statusMsg = document.getElementById("resetStatus"); 
  const successBox = document.getElementById("resetSuccess"); 
  const setStatus = (msg, kind = "note") => { 
    if (!statusMsg) return; 
    statusMsg.textContent = msg || ""; 
    statusMsg.className = 'status ${kind}'; 
  }; 
  
  const showSuccess = () => { 
    // Hide form so user can’t submit twice 
    if (form) form.style.display = "none"; 
    // Show success copy 
    if (successBox) successBox.style.display = "block"; 
  }; 
  
  // Guard: need token AND email (server supports email+token) 
  if (!token || !email) { 
    setStatus("Invalid reset link. Please request a new one.", "error"); 
    setTimeout(() => { location.replace("/forgot.html"); }, 1200); 
    return; 
  } 
  // 1) Pre-validate token before allowing submission 
  (async () => {
    try {
      setStatus("Validating reset link…", "note");

      const qs = `email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
      const v = await fetch(`${API}/api/password/validate?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!v.ok) {
        setStatus("This reset link is invalid or expired.", "error");
        setTimeout(() => { location.replace("/forgot.html"); }, 1400);
        return;
      }

      setStatus("Link validated. You can set a new password.", "ok");
      if (newPwInput) newPwInput.focus();
      window.__RESET_TOKEN_OK__ = true;
    } catch (e) {
      console.error("[reset.js] validate error:", e);
      setStatus("Network error during validation. Please try again.", "error");
    }
  })();

  // 2) Handle submit -> POST /api/password/reset
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
        if (!window.__RESET_TOKEN_OK__) {
      setStatus("Reset link not validated. Please request a new link.", "error");
      return;
    }

    const newPassword     = newPwInput?.value || "";
    const confirmPassword = confirmPwInput?.value || "";

    if (!newPassword || newPassword.length < 8) {
      setStatus("Password must be at least 8 characters.", "error");
      if (newPwInput) newPwInput.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus("Passwords do not match.", "error");
      if (confirmPwInput) confirmPwInput.focus();
      return;
    }

    try {
      if (submitBtn) submitBtn.disabled = true;
      setStatus("Updating password…", "note");

      const r = await fetch(`${API}/api/password/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, token, newPassword }),
            });

      let data = null;
      try { data = await r.clone().json(); } catch { /* ignore */ }

      if (!r.ok || !data?.ok) {
        const msg = (data && data.message)
          ? data.message
          : "Reset failed. The link may be expired. Please request a new one.";
        setStatus(msg, "error");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      // ✅ Success: no redirect
      try { localStorage.setItem("resetDone", "1"); } catch {}
      setStatus("Password updated.", "ok");
      showSuccess();

    } catch (err) {
      console.error("[reset.js] submit error:", err);
      setStatus("Network error. Please try again.", "error");
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});