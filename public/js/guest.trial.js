//
//  guest.trial.js
//  
//
//  Created by Ritu Sharma on 1/8/26.
//


// /public/js/guest.trial.js
"use strict";

// 24-hex generator (Mongo-like id format, not a real ObjectId)
function igMake24HexId() {
  const bytes = new Uint8Array(12);
  if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);

  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

// 7-day guest trial window
function igStartGuestTrial() {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  // Reuse existing 24-hex if present
  let id = String(localStorage.getItem("currentUserId") || "").trim();
  if (!/^[a-f0-9]{24}$/i.test(id)) id = igMake24HexId();

  localStorage.setItem("currentUserId", id);

  // Optional: cache a “user” object for profile.init.js to read
  const displayName = String(localStorage.getItem("ig_display_name") || "").trim();
  const userObj = {
    _id: id,
    id: id,
    isGuest: true,
    firstName: displayName || "there",
  };
  localStorage.setItem("currentUser", JSON.stringify(userObj));

  // trial validity
  localStorage.setItem("ig_guest_start", String(now));
  localStorage.setItem("ig_guest_expiry", String(now + sevenDays));

  return { id, expiresAt: now + sevenDays };
}

function igIsGuestTrialActiveAndValid() {
  const exp = parseInt(localStorage.getItem("ig_guest_expiry") || "0", 10);
  if (!exp) return false;
  return Date.now() <= exp;
}

// Expose globally
window.igStartGuestTrial = igStartGuestTrial;
window.igIsGuestTrialActiveAndValid = igIsGuestTrialActiveAndValid;
