// public/js/login-guest.js
// Guest entry: start guest trial + capture first name (optional) + redirect

"use strict";

document.addEventListener("DOMContentLoaded", function () {
  // 1) Auto-redirect if an existing guest trial is still valid
  try {
    if (typeof igIsGuestTrialActiveAndValid === "function") {
      const guestValid = igIsGuestTrialActiveAndValid();
      if (guestValid) {
        console.log("[guest] existing guest trial valid → redirecting to profile");
        window.location.href = "/profile.html";
        return;
      }
    }
  } catch (e) {
    console.warn("[guest] auto-redirect check failed:", e);
  }

  // 2) Wire up the "Continue as guest" button
  const guestButton = document.getElementById("guestLoginButton");
  if (!guestButton) {
    console.warn("[guest] guestLoginButton not found on page");
    return;
  }

  guestButton.addEventListener("click", function (event) {
    event.preventDefault();

    // Start the 7-day guest trial (if helper exists)
    try {
      if (typeof igStartGuestTrial === "function") {
        const guestInfo = igStartGuestTrial();
        console.log("[guest] Guest trial started:", guestInfo);
      } else {
        console.warn("[guest] igStartGuestTrial is not available on this page");
      }
    } catch (e) {
      console.warn("[guest] igStartGuestTrial threw an error:", e);
    }

    // Ask first name (optional) RIGHT AFTER guest click (frictionless, one prompt)
    try {
      const raw = window.prompt("What’s your first name? (optional)", "") || "";
      const name = raw.trim().slice(0, 30); // simple cap
      if (name) {
        localStorage.setItem("ig-first-name", name);
        console.log("[guest] saved first name:", name);
      } else {
        // If they cancel/blank, remove any old value so we don't show stale names
        localStorage.removeItem("ig-first-name");
        console.log("[guest] no name provided");
      }
    } catch (e) {
      console.warn("[guest] name prompt/storage failed:", e);
    }

    // Always redirect
    window.location.href = "/profile.html";
  });
});
