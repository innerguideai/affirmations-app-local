;
//  welcome.s
//  
//
//  Created by Ritu Sharma on 1/8/26.
//


// /public/js/welcome.js
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    // If user is logged in, do not run onboarding redirects
    try {
      const token = localStorage.getItem("authToken") || "";
      if (token) {
        console.log("[onboarding] authToken present -> skipping onboarding");
        return;
      }
    } catch (_) {}

  const btn = document.getElementById("welcomeContinue");
  if (!btn) return;

  btn.addEventListener("click", () => {
    window.location.href = "/name.html";
  });
});
