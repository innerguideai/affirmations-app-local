// /public/js/login.js — v2026-01-19-verify-gate
// - iOS verify gate: keep user on verify-required until verified
// - allowLogin=1 lets user attempt login after tapping "I already verified"
// - 403 EMAIL_NOT_VERIFIED routes back to verify-required

const API = "https://api.innerguideai.com";

// Helper: fetch /api/me with cookie (kept from your older stable file)
async function fetchMeOnce() {
  try {
    const r = await fetch(`${API}/api/me`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (r.ok) return r.json();
  } catch (_) {}
  return null;
}

// --- Verify gate helpers (iOS-only behavior lives on the client) ---
function setPendingVerify(email) {
  try {
    localStorage.setItem("pendingVerify", "1");
    if (email) localStorage.setItem("pendingVerifyEmail", String(email).trim().toLowerCase());
  } catch (e) {
    console.log("[login] pendingVerify storage failed:", e);
  }
}

function clearPendingVerify() {
  try {
    localStorage.removeItem("pendingVerify");
    localStorage.removeItem("pendingVerifyEmail");
  } catch (e) {
    console.log("[login] clear pendingVerify failed:", e);
  }
}

function getPendingVerifyEmail() {
  try {
    return (localStorage.getItem("pendingVerifyEmail") || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

// If we know the user is pending verification, keep them on the verify-required page
function routeToVerifyRequiredIfPending() {
  // If user explicitly chose "I already verified", allow them to attempt login
  try {
    const params = new URLSearchParams(location.search);
    if (params.get("allowLogin") === "1") {
      console.log("[login] allowLogin=1 -> skipping verify gate once");
      return false;
    }
  } catch {}

  let pending = false;
  try {
    pending = localStorage.getItem("pendingVerify") === "1";
  } catch {}
  if (!pending) return false;

  // Avoid redirect loops if we are already there
  if (location.pathname.endsWith("/verify-required.html")) return true;

  const email = getPendingVerifyEmail();
  const next = email
    ? `/verify-required.html?email=${encodeURIComponent(email)}`
    : `/verify-required.html`;

  console.log("[login] pendingVerify=1 -> routing to:", next);
  window.location.replace(next);
  return true;
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("login.js loaded v2026-01-19-verify-gate");

  const form = document.getElementById("loginForm");
  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");
  const btn = document.getElementById("loginBtn");
  const statusEl = document.getElementById("loginStatus");
  const successBanner = document.getElementById("signupSuccess");

  const setStatus = (msg, kind = "note") => {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.className = `status ${kind}`;
  };

  // ✅ If allowLogin=1, clear pending verify so user can try signing in
  try {
    const params = new URLSearchParams(location.search);
    if (params.get("allowLogin") === "1") clearPendingVerify();
  } catch {}

  // ✅ If user is pending verification, keep them on verify-required
  if (routeToVerifyRequiredIfPending()) return;
    // ✅ Auto-resume: if token is valid, skip login and go to profile/admin
    (async function autoResumeIfLoggedIn() {
      try {
        const token = localStorage.getItem("authToken") || "";
        if (!token) return;

        // show a quiet status so page doesn't look stuck
        setStatus("Resuming…", "note");

        const r = await fetch(`${API}/api/me`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Accept": "application/json",
            "Authorization": `Bearer ${token}`,
          },
        });

        if (!r.ok) return;

        const me = await r.json();

        // cache user for the rest of the app
        try {
          const user = { ...me };
          if (user.id && !user._id) user._id = user.id;
          localStorage.setItem("currentUser", JSON.stringify(user));
          localStorage.setItem("currentUserId", user._id || user.id || "");
            // ✅ Mark as logged-in mode (account)
            try {
              localStorage.setItem("ig_auth_mode", "account");

              // ✅ Clear guest markers (clear = set blank)
              localStorage.setItem("ig_guest_start", "");
              localStorage.setItem("ig_guest_expiry", "");
            } catch (e) {
              console.log("[login] set ig_auth_mode(account) failed:", e);
            }

        } catch {}

        // redirect by role
        const role = me?.role || "user";
        window.location.replace(role === "admin" ? "/admin.html?v=7" : "/profile.html?v=7");
      } catch (e) {
        // ignore and let user log in normally
        console.log("[login] autoResume skipped:", e);
      }
    })();

  // ✅ Reset-password redirect notice
  if (new URLSearchParams(location.search).get("reset") === "1") {
    setStatus("Password updated. Please login.", "ok");
  }

  // ✅ Handle signup success banner + email prefill
  (function handleSignupSuccess() {
    try {
      const params = new URLSearchParams(location.search);
      const qpEmail = params.get("email")?.trim() || "";
      const storedEmail = (() => {
        try {
          return localStorage.getItem("signupEmail") || "";
        } catch {
          return "";
        }
      })();

      const useEmail = qpEmail || storedEmail;
      if (useEmail && emailEl && !emailEl.value) {
        emailEl.value = useEmail;
      }

      if (qpEmail && successBanner) {
        console.log("🔔 Showing signup success banner for:", qpEmail);
        successBanner.style.display = "block";

        // Clean URL
        const url = new URL(window.location.href);
        url.searchParams.delete("email");
        window.history.replaceState(null, "", url.origin + url.pathname);

        try {
          localStorage.removeItem("signupEmail");
        } catch {}

        setTimeout(() => {
          successBanner.style.display = "none";
        }, 2000);
      }
    } catch (e) {
      console.warn("login.js: signup success handling failed:", e);
    }
  })();

  // 🧠 Login form submission
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = (emailEl?.value || "").trim().toLowerCase();
    const password = passEl?.value || "";

    if (!email || !password) {
      setStatus("Email and password are required.", "error");
      return;
    }

    try {
      btn && (btn.disabled = true);
      setStatus("Signing in…", "note");

      const res = await fetch(`${API}/api/login`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      let data = null;
      try {
        data = await res.clone().json();
      } catch {}

      if (!res.ok) {
        // ✅ If backend says email isn't verified, keep user in verify-required flow
        if (res.status === 403 && data && data.code === "EMAIL_NOT_VERIFIED") {
          setPendingVerify(email);
          btn && (btn.disabled = false); // prevent UI feeling stuck
          window.location.replace(`/verify-required.html?email=${encodeURIComponent(email)}`);
          return;
        }

        const msg = (data && data.message) || `Login failed (HTTP ${res.status})`;
        setStatus(msg, "error");
        btn && (btn.disabled = false);
        return;
      }

      console.log("[login] POST /api/login success:", data);
        // ✅ Save token for iOS (cookie may not persist in WKWebView)
        try {
          if (data?.token) {
            localStorage.setItem("authToken", data.token);
            console.log("[login] saved authToken len:", data.token.length);
          } else {
            console.log("[login] no token returned");
          }
        } catch (e) {
          console.log("[login] token storage failed:", e);
        }

        // ✅ If login succeeds → clear verify gate
        clearPendingVerify();

        // ✅ Cache FULL user profile (prefer /api/me so we get lastName, dob, etc.)
        try {
          const baseUser = (data && data.user) ? { ...data.user } : {};

          // Pull full profile (Bearer first, cookies also included)
          let me = null;
          try {
            const token = localStorage.getItem("authToken") || "";
            const meRes = await fetch(`${API}/api/me`, {
              method: "GET",
              credentials: "include",
              cache: "no-store",
              headers: {
                "Accept": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {}),
              },
            });
            if (meRes.ok) me = await meRes.json();
          } catch (e) {
            console.log("[login] /api/me fetch failed:", e);
          }

          // Merge (me wins because it’s the source of truth)
          const user = me ? { ...baseUser, ...me } : baseUser;

          // Normalize ids for every page
          if (user.id && !user._id) user._id = user.id;

          // Save
          localStorage.setItem("currentUser", JSON.stringify(user));
          localStorage.setItem("currentUserId", user._id || user.id || "");

            // ✅ Mark as logged-in mode (account)
            try {
              localStorage.setItem("ig_auth_mode", "account");

              // ✅ Clear guest markers (clear = set blank)
              localStorage.setItem("ig_guest_start", "");
              localStorage.setItem("ig_guest_expiry", "");
            } catch (e) {
              console.log("[login] set ig_auth_mode(account) failed:", e);
            }

            
          console.log("[login] cached user keys:", Object.keys(user));
        } catch (e) {
          console.log("[login] cache user failed:", e);
        }


      // ✅ Redirect based on role
      const role = (data?.user?.role) || "user";
      window.location.href = role === "admin" ? "/admin.html?v=7" : "/profile.html?v=7";
    } catch (err) {
      console.error("❌ Login error:", err);
      setStatus("Something went wrong. Please try again.", "error");
      btn && (btn.disabled = false);
    }
  });
});
