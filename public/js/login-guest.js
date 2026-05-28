// public/js/login-guest.js
// Guest entry: start guest trial + redirect to profile.
"use strict";

document.addEventListener("DOMContentLoaded", function () {
  // Auto-redirect if an existing guest trial is still valid
  try {
    if (typeof igIsGuestTrialActiveAndValid === "function" && igIsGuestTrialActiveAndValid()) {
      window.location.href = "/profile.html";
      return;
    }
  } catch (e) {}

  const guestButton = document.getElementById("guestLoginButton");
  if (!guestButton) return;

  guestButton.addEventListener("click", function (event) {
    event.preventDefault();

    try {
      if (typeof igStartGuestTrial === "function") igStartGuestTrial();
    } catch (e) {}

    window.location.href = "/profile.html";
  });
});
