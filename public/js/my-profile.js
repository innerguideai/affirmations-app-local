// /js/my-profile.js
// Read-only My Profile page (Option A)
// - Does NOT call /api/me (Capacitor cookie auth is unreliable)
// - Uses localStorage currentUser/currentUserId as the source for display
// - Blocks guests and users with no cached profile
"use strict";

(function () {
  function log() {
    try { console.log("[my-profile]", ...arguments); } catch (_) {}
  }

  // -----------------------------
  // DOM helpers
  // -----------------------------
  function $(id) {
    return document.getElementById(id);
  }

  function show(el) {
    if (!el) return;
    el.hidden = false;
  }

  function hide(el) {
    if (!el) return;
    el.hidden = true;
  }

  function setText(id, value) {
    var el = $(id);
    if (!el) return;
    el.textContent = (value && String(value).trim()) ? String(value).trim() : "—";
  }

  // -----------------------------
  // Auth + user helpers (local-only)
  // -----------------------------
  function safeParse(json) {
    try { return JSON.parse(json); } catch (e) { return null; }
  }

  function isGuestUser(u) {
    try {
      if (u && u.role) return String(u.role).toLowerCase() === "guest";
      if (localStorage.getItem("ig_is_guest") === "true") return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function getCachedUser() {
    // Prefer currentUser JSON; fall back to null
    var raw = null;
    try { raw = localStorage.getItem("currentUser"); } catch (_) {}

    var u = raw ? safeParse(raw) : null;

    // Normalize id fields if present
    if (u && u.id && !u._id) u._id = u.id;

    // If we have a currentUserId but no user object, return a minimal stub
    // (still not enough to show profile fields, but helps gating messages)
    var id = null;
    try { id = localStorage.getItem("currentUserId"); } catch (_) {}
    if (!u && id) u = { _id: id };

    return u;
  }

  function isLoggedInLocal() {
    try {
      // Logged-in for this release means:
      // - not guest
      // - has a cached user object OR user id
      var u = getCachedUser();
      if (!u) return false;
      if (isGuestUser(u)) return false;

      var hasId = !!(u._id || u.id);
      var hasUserJson = !!localStorage.getItem("currentUser");
      var hasUserId = !!localStorage.getItem("currentUserId");

      return hasId || hasUserJson || hasUserId;
    } catch (e) {
      return false;
    }
  }

  // -----------------------------
  // Navigation
  // -----------------------------
  function goLogin() {
    try { window.location.replace("/login.html"); } catch (_) { window.location.href = "/login.html"; }
  }

  function goBack() {
    // Prefer history back if available; fallback to account
    try {
      if (window.history && window.history.length > 1) {
        window.history.back();
        return;
      }
    } catch (_) {}
    window.location.href = "/account.html";
  }

  // -----------------------------
  // Main
  // -----------------------------
    document.addEventListener("DOMContentLoaded", async function () {
    log("loaded");

    var authGateCard = $("authGateCard");
    var profileCard = $("profileCard");
    var statusLine = $("statusLine");

    var backBtn = $("backBtn");
    if (backBtn) backBtn.addEventListener("click", function (e) { e.preventDefault(); goBack(); });

    var goLoginBtn = $("goLoginBtn");
    if (goLoginBtn) goLoginBtn.addEventListener("click", function (e) { e.preventDefault(); goLogin(); });

    // Show a tiny loading line briefly (optional)
    if (statusLine) {
      statusLine.textContent = "Loading…";
      show(statusLine);
    }

    // Gate: local-only logged-in check
    if (!isLoggedInLocal()) {
      log("gate: not logged in (local)");
      hide(profileCard);
      show(authGateCard);

      if (statusLine) {
        statusLine.textContent = "Sign in required.";
        show(statusLine);
      }
      return;
    }

    // Block guest explicitly, even if guest has currentUserId
    var u = getCachedUser();
    if (isGuestUser(u)) {
      log("gate: guest user blocked");
      hide(profileCard);
      show(authGateCard);

      if (statusLine) {
        statusLine.textContent = "Sign in required.";
        show(statusLine);
      }
      return;
    }

        // ✅ Prefer API as source of truth for My Profile (logged-in users only)
        try {
          if (typeof window.apiFetch !== "function") {
            log("apiFetch missing on page");
            goLogin();
            return;
          }

          const r = await window.apiFetch("/api/me", { method: "GET" });

          if (!r.ok) {
            const t = await r.text();
            log("api/me failed:", r.status, t);
            goLogin();
            return;
          }

          const fresh = await r.json();

          if (fresh && fresh.id && !fresh._id) fresh._id = fresh.id;

          // Cache for other pages (optional, but helpful)
          try {
            localStorage.setItem("currentUser", JSON.stringify(fresh));
            localStorage.setItem("currentUserId", fresh._id || fresh.id || "");
          } catch (_) {}

          // Render with API data
          setText("emailVal", fresh.email);
          setText("firstNameVal", fresh.firstName);
          setText("lastNameVal", fresh.lastName);
          setText("dobVal", fresh.dob || fresh.dateOfBirth);
          setText("genderVal", fresh.gender);

          log("rendered from /api/me");
        } catch (e) {
          log("api/me error:", e);
          goLogin();
          return;
        }
    // Render read-only fields
    setText("emailVal", u.email);
    setText("firstNameVal", u.firstName);
    setText("lastNameVal", u.lastName);
        (function () {
          const raw = (u.dob || u.dateOfBirth || "").trim();
          if (!raw) { setText("dobVal", "Not set"); return; }

          // If it's already YYYY-MM-DD, format it
          const d = new Date(raw);
          if (isNaN(d.getTime())) { setText("dobVal", raw); return; }

          setText("dobVal", d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }));
        })();
        setText("genderVal", (u.gender && String(u.gender).trim()) ? u.gender : "Not set");

    hide(authGateCard);
    show(profileCard);

    if (statusLine) hide(statusLine);

    log("rendered", { hasEmail: !!u.email, hasFirstName: !!u.firstName, hasId: !!(u._id || u.id) });
  });
})();
