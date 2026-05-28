// public/js/guest.trial.js
"use strict";

function igMake24HexId() {
  const bytes = new Uint8Array(12);
  if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function igStartGuestTrial() {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  // Reuse existing 24-hex id if present; generate one otherwise
  let id = String(localStorage.getItem("currentUserId") || "").trim();
  if (!/^[a-f0-9]{24}$/i.test(id)) id = igMake24HexId();

  localStorage.setItem("currentUserId", id);
  localStorage.setItem("ig_auth_mode", "guest");

  const displayName = String(localStorage.getItem("ig_display_name") || "").trim();
  const userObj = {
    _id: id,
    id: id,
    isGuest: true,
    firstName: displayName || "there",
  };
  localStorage.setItem("currentUser", JSON.stringify(userObj));

  const expiresAt = now + sevenDays;
  localStorage.setItem("ig_guest_start", String(now));
  localStorage.setItem("ig_guest_expiry", String(expiresAt));

  igScheduleGuestExpiryNotification(expiresAt);

  return { id, expiresAt };
}

function igIsGuestTrialActiveAndValid() {
  const exp = parseInt(localStorage.getItem("ig_guest_expiry") || "0", 10);
  if (!exp) return false;
  return Date.now() <= exp;
}

// Returns structured info about the current guest trial.
// expiresAt is epoch ms (number) or null if no trial exists.
function igGetGuestTrialInfo() {
  const exp = parseInt(localStorage.getItem("ig_guest_expiry") || "0", 10);
  const isActive = exp > 0;
  const nowMs = Date.now();
  const isValid = isActive && nowMs <= exp;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = isActive ? Math.max(0, Math.ceil((exp - nowMs) / msPerDay)) : 0;

  return {
    isActive,
    isValid,
    expiresAt: isActive ? exp : null,
    daysLeft,
  };
}

// Best-effort: schedule one local notification at trial expiry + 2h grace.
// Only fires if LocalNotifications permission is already granted.
// Does not request permission. Silently no-ops on web or if unavailable.
async function igScheduleGuestExpiryNotification(expiresAtMs) {
  try {
    const LN = window.IG && window.IG.LocalNotifications;
    if (!LN || typeof LN.checkPermissions !== "function" || typeof LN.schedule !== "function") return;

    const perm = await LN.checkPermissions();
    if (!perm || perm.display !== "granted") return;

    // Cancel any stale version before replacing
    try { await LN.cancel({ notifications: [{ id: 3001 }] }); } catch (_) {}

    const fireAt = new Date(expiresAtMs + 2 * 60 * 60 * 1000);

    await LN.schedule({
      notifications: [
        {
          id: 3001,
          title: "Your AI Affirm guest trial has ended",
          body: "Create a free account to keep your affirmations and progress.",
          schedule: { at: fireAt, allowWhileIdle: true },
          sound: "notification.aiff",
          extra: {
            ig_route: "/login.html?source=guest_expiry",
          },
        },
      ],
    });
  } catch (_) {}
}

window.igStartGuestTrial = igStartGuestTrial;
window.igIsGuestTrialActiveAndValid = igIsGuestTrialActiveAndValid;
window.igGetGuestTrialInfo = igGetGuestTrialInfo;
window.igScheduleGuestExpiryNotification = igScheduleGuestExpiryNotification;
