//
//  name.js
//  
//
//  Created by Ritu Sharma on 1/8/26.
//


"use strict";

document.addEventListener("DOMContentLoaded", () => {
  localStorage.setItem("ig_onboarding_step", "name");

  const input = document.getElementById("displayName");
  const btn = document.getElementById("nameContinue");
  if (!input || !btn) return;

  // Prefill if already saved
  try {
    const saved = localStorage.getItem("ig_display_name");
    if (saved) input.value = saved;
  } catch (_) {}

  btn.addEventListener("click", () => {
    const name = String(input.value || "").trim();
    if (name) localStorage.setItem("ig_display_name", name);

    // next step
    window.location.href = "/reminders.html";
  });
});
