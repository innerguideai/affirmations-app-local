// /public/js/social-auth.js
// Shared Google + Apple sign-in handlers (Firebase native plugin).
// Used by login.html and account-entry.html.
//
// Requires on the page:
//   - <button id="btn-google-login">...</button>  (optional)
//   - <button id="btn-apple-login">...</button>   (optional)
//   - <p id="loginStatus"></p>                    (optional, for status messages)
//
// Behavior and storage are unchanged from the original login.html
// implementation — extracted here only to avoid duplicating this
// logic across pages.

document.addEventListener("DOMContentLoaded", function () {

  /* ── Google Sign-In via Firebase native plugin ─────────────────────────
     Requires ENABLE_FIREBASE_GOOGLE_LOGIN=true on the backend.
     Button is shown/hidden by the server; this is the client handler. ── */
  document.getElementById("btn-google-login")?.addEventListener("click", async function () {
    const statusEl     = document.getElementById("loginStatus");
    const googleBtn    = document.getElementById("btn-google-login");
    const firebaseAuth = window.IG?.FirebaseAuthentication;
    const originalText = googleBtn.textContent;

    function setStatus(msg, cls) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.className   = "status " + cls;
    }

    if (!firebaseAuth) {
      setStatus("Google sign-in requires the native app.", "note");
      return;
    }

    googleBtn.disabled = true;
    googleBtn.textContent = "Signing in…";

    try {
      /* 1. Native Google sign-in sheet */
      const result = await firebaseAuth.signInWithGoogle();

      /* 2. Get Firebase Auth ID token (not the Google OAuth credential token) */
      const tokenResult = await firebaseAuth.getIdToken({ forceRefresh: true });
      const idToken = tokenResult?.token;

      if (!idToken) {
        setStatus("Google sign-in did not return a Firebase token. Please try again.", "error");
        return;
      }

      /* 3. Exchange with AI Affirm backend → innerguide-auth */
      const res  = await fetch("https://api-b.innerguideai.com/api/auth/firebase", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ idToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Sign-in failed. Please try again.", "error");
        return;
      }

      /* 3. Persist session
         data.token              — JWT signed by innerguide-auth
         data.user.globalUserId  — canonical user ID
         data.user.appUserId     — AI Affirm local _id (key for all app data)
         data.user.*             — email, name, avatarUrl, plan, etc.       */
      const user = data.user || {};

      localStorage.setItem("authToken",      data.token);
      localStorage.setItem("currentUserId",  user.appUserId  || "");
      localStorage.setItem("currentUser",    JSON.stringify({
        ...user,
        _id: user.appUserId,   // app code reads ._id in some places
        id:  user.appUserId,
      }));
      localStorage.setItem("ig_auth_mode",   "account");
      localStorage.setItem("ig_guest_start", "");
      localStorage.setItem("ig_guest_expiry","");

      window.location.replace("/profile.html");

    } catch (err) {
      console.error("[google login]", err);
      // User cancelled the native sheet — no error banner needed
      if (!err?.message?.includes("cancel")) {
        setStatus("Google sign-in failed. Please try again.", "error");
      }
    } finally {
      googleBtn.disabled = false;
      googleBtn.textContent = originalText;
    }
  });

  /* ── Apple Sign-In via Firebase native plugin ──────────────────────────
     Requires ENABLE_FIREBASE_APPLE_LOGIN=true on the backend.
     Uses same session storage pattern as Google Sign-In. ── */
  (function () {
    const appleBtn0      = document.getElementById("btn-apple-login");
    const APPLE_BTN_HTML = appleBtn0 ? appleBtn0.innerHTML : "";

    appleBtn0?.addEventListener("click", async function () {
      const statusEl     = document.getElementById("loginStatus");
      const appleBtn     = document.getElementById("btn-apple-login");
      const firebaseAuth = window.IG?.FirebaseAuthentication;

      function setStatus(msg, cls) {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className   = "status " + cls;
      }

      if (!firebaseAuth) {
        setStatus("Apple sign-in requires the native app.", "note");
        return;
      }

      appleBtn.disabled    = true;
      appleBtn.textContent = "Signing in…";

      try {
        /* 1. Native Apple sign-in sheet */
        await firebaseAuth.signInWithApple();

        /* 2. Get Firebase Auth ID token */
        const tokenResult = await firebaseAuth.getIdToken({ forceRefresh: true });
        const idToken     = tokenResult?.token;

        if (!idToken) {
          setStatus("Apple sign-in did not return a token. Please try again.", "error");
          return;
        }

        /* 3. Exchange with AI Affirm backend → innerguide-auth */
        const res  = await fetch("https://api-b.innerguideai.com/api/auth/firebase", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ idToken }),
        });

        const data = await res.json();

        if (!res.ok) {
          setStatus(data.error || "Sign-in failed. Please try again.", "error");
          return;
        }

        /* 4. Persist session — mirrors Google Sign-In storage exactly */
        const user = data.user || {};

        localStorage.setItem("authToken",       data.token);
        localStorage.setItem("currentUserId",   user.appUserId  || "");
        localStorage.setItem("currentUser",     JSON.stringify({
          ...user,
          _id: user.appUserId,
          id:  user.appUserId,
        }));
        localStorage.setItem("ig_auth_mode",    "account");
        localStorage.setItem("ig_guest_start",  "");
        localStorage.setItem("ig_guest_expiry", "");

        window.location.replace("/profile.html");

      } catch (err) {
        console.error("[apple login]", err);
        /* User cancelled the native sheet — no error banner needed */
        if (!err?.message?.includes("cancel")) {
          setStatus("Apple sign-in failed. Please try again.", "error");
        }
      } finally {
        appleBtn.disabled = false;
        if (APPLE_BTN_HTML) appleBtn.innerHTML = APPLE_BTN_HTML;
      }
    });
  })();

});
