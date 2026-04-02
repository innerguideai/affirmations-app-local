/* ============================================================
   public/js/pathselection.js
   Guest selection: hard reset + stable guest identity + 7-day trial
   ============================================================ */
/* Run after DOM is ready so the button exists */
document.addEventListener("DOMContentLoaded", () => {
  /* Find buttons */
  const chooseGuestBtn = document.getElementById("chooseGuest");
  const chooseAccountBtn = document.getElementById("chooseAccount"); // must match HTML id

  /* Debug: prove elements exist */
  console.log("[PATHSELECT] boot", {
    guestBtn: !!chooseGuestBtn,
    accountBtn: !!chooseAccountBtn,
    accountTag: chooseAccountBtn ? chooseAccountBtn.tagName : null,
    accountHref: chooseAccountBtn ? chooseAccountBtn.getAttribute("href") : null
  });

  /* If the page doesn’t have the guest button, do nothing */
  if (chooseGuestBtn) {
    /* Wire the Guest click (UNCHANGED behavior) */
    chooseGuestBtn.addEventListener("click", async (e) => {
      e.preventDefault();
        // Keep onboarding + theme + other UX prefs
        const keepOnboarded = localStorage.getItem("ig_onboarded");
        const keepTheme = localStorage.getItem("ig_theme");

        // Remove only auth/identity keys (guest/account)
        [
          "ig_auth_mode",
          "currentUser",
          "currentUserId",
          "authToken",
          "ig_is_guest",
          "pendingVerify",
          "pendingVerifyEmail",
          "ig_guest_trial_startedAt_v1",
          "ig_guest_trial_expiresAt_v1",
          "ig_guest_trial_days_v1",
          "ig_guest_start",
          "ig_guest_expiry",
          "ig_guest_seed_v1"
        ].forEach((k) => localStorage.removeItem(k));

        // Restore what we keep
        if (keepOnboarded === "1") localStorage.setItem("ig_onboarded", "1");
        if (keepTheme) localStorage.setItem("ig_theme", keepTheme);

      await bootstrapGuestMode();
      window.location.href = `/profile.html?v=${Date.now()}`;
    });
  }

  /* Wire Account click WITHOUT stealing native <a href> behavior */
  if (chooseAccountBtn) {
    chooseAccountBtn.addEventListener("click", (e) => {
      console.log("[PATHSELECT] account click fired");

        /* Path selection = onboarding. Account means "create account" -> go to Signup */
        e.preventDefault();

        /* Optional safety: clear anything that could hijack routing */
        [
          "ig_auth_mode",
          "currentUser",
          "currentUserId",
          "authToken",
          "pendingVerify",
          "pendingVerifyEmail",
          "ig_is_guest"
        ].forEach((k) => localStorage.removeItem(k));

        window.location.href = `/signup.html?v=${Date.now()}`;

    });
  } else {
    console.warn(
      "[PATHSELECT] Missing #chooseAccount. Check pathselection.html id."
    );
  }
});


/* ============================================================
   Guest bootstrap
   ============================================================ */

/* Builds guest identity + 7-day trial and stores required keys */
async function bootstrapGuestMode() {
  /* Get or create the per-device guest seed */
  const seed = getOrCreateGuestSeed();

  /* Derive a stable 24-hex guestId from the seed */
  const guestId = await derive24HexIdFromSeed(seed);

  /* Set the auth mode */
  localStorage.setItem("ig_auth_mode", "guest");

  /* Set current user id */
  localStorage.setItem("currentUserId", guestId);

  /* Build the currentUser object exactly as requested */
  const currentUser = {
    _id: guestId,
    id: guestId,
    isGuest: true,
  };

  /* Store the current user object */
  localStorage.setItem("currentUser", JSON.stringify(currentUser));

  /* Set 7-day trial timestamps (separate from 30-day storage retention) */
  setGuestTrialWindowDays(7);
}

/* ============================================================
   Seed + ID derivation
   ============================================================ */

/* Returns existing seed or creates one and stores it */
function getOrCreateGuestSeed() {
  /* Try to read existing seed */
  const existing = localStorage.getItem("ig_guest_seed_v1");

  /* If present, use it */
  if (existing && typeof existing === "string" && existing.length > 0) {
    return existing;
  }

  /* Create a new seed
     IMPORTANT: use crypto.randomUUID if available (matches what you already have),
     else fall back to random hex.
  */
  let newSeed = "";

  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      newSeed = crypto.randomUUID();
    }
  } catch (e) {
    /* ignore */
  }

  if (!newSeed) {
    newSeed = generateRandomHex(32); // 32 bytes -> 64 hex chars
  }

  /* Persist seed */
  localStorage.setItem("ig_guest_seed_v1", newSeed);

  /* Return it */
  return newSeed;
}

/* Derives a stable 24-hex string from the seed
   - If seed is hex, hash seed-bytes
   - If seed is not hex (UUID), hash UTF-8 bytes of the string
*/
async function derive24HexIdFromSeed(seedRaw) {
  /* Normalize to string */
  const seed = String(seedRaw || "");

  /* Try Web Crypto first (supported in modern WKWebView) */
  try {
    /* Decide how to convert seed to bytes */
    const seedBytes = isHexString(seed)
      ? hexToBytes(seed)              /* hex seed -> bytes */
      : utf8ToBytes(seed);           /* UUID/any string -> UTF-8 bytes */

    /* Hash using SHA-256 */
    const hashBuffer = await crypto.subtle.digest("SHA-256", seedBytes);

    /* Convert hash to hex */
    const hashHex = bytesToHex(new Uint8Array(hashBuffer));

    /* Return first 24 hex chars */
    return hashHex.slice(0, 24);
  } catch (err) {
    /* Fallback: deterministic JS hash -> 24 hex chars */
    return fallback24Hex(seed);
  }
}

/* Checks if a string is hex-only (no dashes/spaces) */
function isHexString(s) {
  if (typeof s !== "string") return false;
  const clean = s.trim();
  if (!clean) return false;
  return /^[0-9a-fA-F]+$/.test(clean);
}

/* Convert a string to UTF-8 bytes (TextEncoder if available; fallback manual) */
function utf8ToBytes(str) {
  try {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(str);
    }
  } catch (e) {
    /* ignore */
  }

  /* Simple fallback: basic UTF-8 encoding (covers standard ASCII + most common chars) */
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let codePoint = str.charCodeAt(i);

    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(0xe0 | (codePoint >> 12));
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    }
  }

  return new Uint8Array(bytes);
}

/* ============================================================
   Trial window
   ============================================================ */

/* Stores trial start/expires timestamps for a given day count */
function setGuestTrialWindowDays(days) {
  /* Current time */
  const now = Date.now();

  /* Trial length in ms */
  const ms = days * 24 * 60 * 60 * 1000;

  /* Compute expiry */
  const expiresAt = now + ms;

  /* Store start + expiry (v1 keys) */
  localStorage.setItem("ig_guest_trial_startedAt_v1", String(now));
  localStorage.setItem("ig_guest_trial_expiresAt_v1", String(expiresAt));

  /* Store the configured duration for debugging */
  localStorage.setItem("ig_guest_trial_days_v1", String(days));

  /* ALSO store legacy keys seen in your current app state
     (some code paths may still read these)
  */
  localStorage.setItem("ig_guest_start", String(now));
  localStorage.setItem("ig_guest_expiry", String(expiresAt));
}

/* ============================================================
   Helpers
   ============================================================ */

/* Generates secure-ish random hex if crypto is present; else Math.random fallback */
function generateRandomHex(byteLen) {
  /* If crypto exists, use strong randomness */
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    /* Create byte array */
    const bytes = new Uint8Array(byteLen);

    /* Fill with random bytes */
    crypto.getRandomValues(bytes);

    /* Convert to hex */
    return bytesToHex(bytes);
  }

  /* Fallback: Math.random (still stable enough for seed creation on older envs) */
  let hex = "";

  /* Build byteLen bytes as hex */
  for (let i = 0; i < byteLen; i++) {
    /* Random byte */
    const b = Math.floor(Math.random() * 256);

    /* Two-digit hex */
    hex += b.toString(16).padStart(2, "0");
  }

  /* Return hex string */
  return hex;
}

/* Convert hex string to Uint8Array */
function hexToBytes(hex) {
  /* Normalize */
  const clean = (hex || "").trim();

  /* If odd length, pad left (defensive) */
  const normalized = clean.length % 2 === 0 ? clean : `0${clean}`;

  /* Allocate bytes */
  const bytes = new Uint8Array(normalized.length / 2);

  /* Parse pairs */
  for (let i = 0; i < bytes.length; i++) {
    /* Two hex chars per byte */
    const pair = normalized.slice(i * 2, i * 2 + 2);

    /* Parse to int */
    bytes[i] = parseInt(pair, 16);
  }

  /* Return bytes */
  return bytes;
}

/* Convert Uint8Array to hex string */
function bytesToHex(bytes) {
  /* Build hex */
  let hex = "";

  /* Convert each byte */
  for (let i = 0; i < bytes.length; i++) {
    /* Two-digit hex */
    hex += bytes[i].toString(16).padStart(2, "0");
  }

  /* Return hex */
  return hex;
}

/* Deterministic fallback to 24-hex (no crypto.subtle) */
function fallback24Hex(input) {
  /* Simple 32-bit hash accumulator */
  let h1 = 0x811c9dc5; // FNV-ish start

  /* Mix characters */
  for (let i = 0; i < input.length; i++) {
    /* XOR */
    h1 ^= input.charCodeAt(i);

    /* Multiply (keep 32-bit) */
    h1 = Math.imul(h1, 0x01000193);
  }

  /* Build 24 hex chars by expanding the 32-bit hash deterministically */
  let out = "";

  /* Expand in 6 chunks of 4 hex chars (6 * 4 = 24) */
  for (let k = 0; k < 6; k++) {
    /* Rotate + mix */
    const x = (h1 >>> (k * 5)) ^ (h1 << (k * 3));

    /* Take 16 bits */
    const part = (x >>> 0) & 0xffff;

    /* Append 4 hex chars */
    out += part.toString(16).padStart(4, "0");
  }

  /* Return exactly 24 hex */
  return out.slice(0, 24);
}
