//
//  profile.affirmations.js
//
//  Jan 2026: Support banner uses local-only tracking (Option A)
//  - Same negative emotion 5x within 72h
//  - Banner shows when threshold is hit (>=5) and stays until user closes
//
//  NOTE (client-only):
//  - Do NOT put Express routes (app.get/app.post) in this browser file.
//  - If you need /api/affirmations/all, call it via apiFetch().
//

"use strict";

console.log("[affirmations] loaded");

// -------------------------------
// Shared state
// -------------------------------
let currentAffirmation = null;
let currentFeeling = "";
let shownIds = []; // account: list of _id strings | guest: list of text strings

let __fetchAffirmationsInFlight = false;
let __nextInFlight = false;
let __newAIInFlight = false;
let hasSeenDbAffirmation = false;
const IG_DB_AFFIRMATION_LIMIT = 3;
// -------------------------------
// Small DOM-safe helpers
// -------------------------------
function igGetFeelingFromDOM() {
  const feelingInputEl =
    (typeof DOM !== "undefined" && DOM.feelingInput) ? DOM.feelingInput :
      document.getElementById("feelingInput");

  return (feelingInputEl?.value || "").trim().toLowerCase();
}

// Write affirmation text safely without wiping other UI inside the card
function igSetAffirmationText(text) {
  __affirmationAnimToken++;
  if (typeof DOM === "undefined" || !DOM.affirmationCard) return;

  // Clear stray direct text nodes (created by older innerText usage)
  Array.from(DOM.affirmationCard.childNodes).forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) n.textContent = "";
  });

  // Create/reuse a dedicated container
  let txt = DOM.affirmationCard.querySelector("#affirmationText");
  if (!txt) {
    txt = document.createElement("div");
    txt.id = "affirmationText";
    DOM.affirmationCard.appendChild(txt);
  }

  txt.textContent = String(text || "");
}
let __affirmationAnimToken = 0;

function igGetAffirmationTextEl() {
  if (typeof DOM === "undefined" || !DOM.affirmationCard) return null;

  // Clear stray direct text nodes from older render paths
  Array.from(DOM.affirmationCard.childNodes).forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) n.textContent = "";
  });

  let txt = DOM.affirmationCard.querySelector("#affirmationText");
  if (!txt) {
    txt = document.createElement("div");
    txt.id = "affirmationText";
    DOM.affirmationCard.appendChild(txt);
  }

  return txt;
}

function igSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function igReadAiStartColor() {
  try {
    const rootStyles = getComputedStyle(document.documentElement);

    // Prefer a theme-safe soft text start color if available
    const honeydew = rootStyles.getPropertyValue("--honeydew").trim();
    if (honeydew) return honeydew;

    // Fallback to theme accent if honeydew is missing
    const accent = rootStyles.getPropertyValue("--theme-accent").trim();
    if (accent) return accent;

    return "rgb(220, 234, 215)";
  } catch (_) {
    return "rgb(220, 234, 215)";
  }
}

async function igAnimateAiAffirmationText(text) {
  const txt = igGetAffirmationTextEl();
  if (!txt) return;

  const fullText = String(text || "").trim();
  const token = ++__affirmationAnimToken;

  txt.innerHTML = "";

  if (!fullText) {
    txt.textContent = "";
    return;
  }

  const startColor = igReadAiStartColor();

  // Read the normal final text color from the live element
  txt.style.color = "";
  const finalColor = getComputedStyle(txt).color || "rgba(0,0,0,0.85)";

  const words = fullText.split(/\s+/);
  const spans = [];

  for (let i = 0; i < words.length; i++) {
    if (token !== __affirmationAnimToken) return;

    const span = document.createElement("span");
    span.textContent = words[i];
    span.style.color = startColor;
    span.style.opacity = "0.95";
    span.style.transition = "color 420ms ease, opacity 420ms ease";

    txt.appendChild(span);
    spans.push(span);

    if (i < words.length - 1) {
      txt.appendChild(document.createTextNode(" "));
    }

    await igSleep(75);
  }

  if (token !== __affirmationAnimToken) return;

  requestAnimationFrame(() => {
    if (token !== __affirmationAnimToken) return;

    spans.forEach((span) => {
      span.style.color = finalColor;
      span.style.opacity = "1";
    });
  });
}

async function igRenderAffirmationText(text, options = {}) {
  const { animateAi = false } = options;

  if (animateAi) {
    await igAnimateAiAffirmationText(text);
    return;
  }

  igSetAffirmationText(text);
}

function igShowAffirmationCard() {
  DOM?.affirmationWrapper?.classList.remove("hidden");
}

function igHideStars() {
  DOM?.starRating?.classList.add("hidden");
}

function igShowStars() {
  DOM?.starRating?.classList.remove("hidden");
}

function buildEmotionPayload(userId, extra = {}) {

  const payload = {
    emotion: currentFeeling,
    userId: userId,

    ...(window.contextDriver ? { driver: window.contextDriver } : {}),
    ...(window.contextPressure ? { pressure: window.contextPressure } : {}),

    ...extra
  };

  console.log("[affirmations] payload →", payload);

  return payload;
}
// -------------------------------
// Guest local “DB” library (localStorage)
// - Per emotion key: ig_guest_affs_v1_<emotion>
// - Value: [{ text, createdAt }]
// - Cap: 5 per emotion
// - Retention: 30 days
// -------------------------------
const IG_GUEST_AFFS_PREFIX = "ig_guest_affs_v1_";
const IG_GUEST_AFFS_MAX_PER_EMOTION = 5;
const IG_GUEST_RETENTION_DAYS = 30;
const IG_GUEST_RESET_MARKER_KEY = "ig_guest_affs_reset_marker_v1";

// Normalizer (shared)
function igNormalizeEmotionKey(emotion) {
  return String(emotion || "").trim().toLowerCase();
}

// Auth mode (single source of truth)
function igAuthMode() {
  return String(localStorage.getItem("ig_auth_mode") || "guest").toLowerCase();
}

function igIsGuestMode() {
  return igAuthMode() === "guest";
}

function igGuestAffKeyForEmotion(emotion) {
  return IG_GUEST_AFFS_PREFIX + igNormalizeEmotionKey(emotion);
}

function igNowIso() {
  return new Date().toISOString();
}

function igDaysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - Number(days || 0));
  return d.toISOString();
}

function igIsWithinRetention(iso) {
  try {
    const cutoff = new Date(igDaysAgoIso(IG_GUEST_RETENTION_DAYS)).getTime();
    const t = new Date(String(iso || "")).getTime();
    if (!t || Number.isNaN(t)) return false;
    return t >= cutoff;
  } catch (_) {
    return false;
  }
}

// Clears guest library ONCE per onboarding cycle (based on ig_guest_start token)
function igGuestResetLibraryIfNeeded() {
  if (!igIsGuestMode()) return;

  let start = "";
  try { start = String(localStorage.getItem("ig_guest_start") || ""); } catch (_) { }
  if (!start) return;

  let marker = "";
  try { marker = String(localStorage.getItem(IG_GUEST_RESET_MARKER_KEY) || ""); } catch (_) { }

  if (marker === start) return;

  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(IG_GUEST_AFFS_PREFIX))
      .forEach((k) => localStorage.removeItem(k));

    localStorage.setItem(IG_GUEST_RESET_MARKER_KEY, start);
    console.log("[guestLib] reset complete for ig_guest_start:", start);
  } catch (e) {
    console.warn("[guestLib] reset failed:", e);
  }
}

function igReadGuestAffs(emotion) {
  const key = igGuestAffKeyForEmotion(emotion);
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];

    const out = arr
      .map((x) => {
        if (typeof x === "string") return { text: x.trim(), createdAt: igNowIso() };
        if (x && typeof x === "object") {
          return { text: String(x.text || "").trim(), createdAt: String(x.createdAt || "") };
        }
        return null;
      })
      .filter(Boolean)
      .filter((x) => x.text)
      .filter((x) => igIsWithinRetention(x.createdAt));

    try { localStorage.setItem(key, JSON.stringify(out)); } catch (_) { }

    return out;
  } catch (e) {
    console.warn("[guestLib] read failed:", e);
    return [];
  }
}

function igWriteGuestAffs(emotion, list) {
  const key = igGuestAffKeyForEmotion(emotion);
  try {
    localStorage.setItem(key, JSON.stringify(list || []));
  } catch (e) {
    console.warn("[guestLib] write failed:", e);
  }
}

function igSaveGuestAff(emotion, text) {
  const clean = String(text || "").trim();
  if (!clean) return;

  const list = igReadGuestAffs(emotion);
  if (list.some((x) => x.text === clean)) return;

  list.push({ text: clean, createdAt: igNowIso() });

  while (list.length > IG_GUEST_AFFS_MAX_PER_EMOTION) list.shift();

  igWriteGuestAffs(emotion, list);

  console.log("[guestLib] saved", {
    emotion: igNormalizeEmotionKey(emotion),
    count: list.length,
  });
}

function igPickNextGuestAff(emotion, excludeTexts) {
  const list = igReadGuestAffs(emotion);
  const seen = Array.isArray(excludeTexts) ? excludeTexts : [];
  const next = list.find((x) => x && x.text && !seen.includes(x.text));
  return next || null;
}

// -------------------------------
// Prompt hygiene (avoid phrases) — localStorage only
// Per emotion key: ig_avoid_phrases_v1_<emotion>
// Max stored per emotion: 5 | Max sent to GPT: 10
// -------------------------------
function igAvoidKeyForEmotion(emotion) {
  return "ig_avoid_phrases_v1_" + igNormalizeEmotionKey(emotion);
}

function igReadAvoidPhrases(emotion) {
  try {
    const key = igAvoidKeyForEmotion(emotion);
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];

    const normalized = arr
      .map((x) => {
        if (typeof x === "string") return { text: x.trim(), createdAt: igNowIso() };
        if (x && typeof x === "object") return { text: String(x.text || "").trim(), createdAt: String(x.createdAt || "") };
        return null;
      })
      .filter(Boolean)
      .filter((x) => x.text)
      .filter((x) => igIsWithinRetention(x.createdAt));

    try { localStorage.setItem(key, JSON.stringify(normalized)); } catch (_) { }

    return normalized.map((x) => x.text);
  } catch (e) {
    console.warn("[promptHygiene] read avoid phrases failed:", e);
    return [];
  }
}

// Save the full AI text as a phrase (dedupe + cap 5 per emotion, drop oldest)
function igSaveAvoidPhraseFromAi(emotion, aiText) {
  const phrase = String(aiText || "").trim();
  if (!phrase) return;

  const key = igAvoidKeyForEmotion(emotion);
  const list = igReadAvoidPhrases(emotion);

  if (list.includes(phrase)) {
    console.log("CLICK:AVOID_PHRASE_SAVE", { emotion: igNormalizeEmotionKey(emotion), action: "skip-duplicate" });
    return;
  }

  const objects = list.map((t) => ({ text: String(t || "").trim(), createdAt: igNowIso() }));
  objects.push({ text: phrase, createdAt: igNowIso() });

  while (objects.length > 5) objects.shift();

  try { localStorage.setItem(key, JSON.stringify(objects)); } catch (_) { }

  console.log("CLICK:AVOID_PHRASE_SAVE", {
    emotion: igNormalizeEmotionKey(emotion),
    savedCount: objects.length,
    lastSavedPreview: phrase.length > 60 ? phrase.slice(0, 60) + "…" : phrase,
  });
}

function igGetAvoidPhrasesForPrompt(emotion) {
  const list = igReadAvoidPhrases(emotion);
  const newestFirst = list.slice().reverse();
  const capped = newestFirst.slice(0, 10);

  console.log("CLICK:AVOID_PHRASE_PROMPT", {
    emotion: igNormalizeEmotionKey(emotion),
    count: capped.length,
  });

  return capped;
}

// -------------------------------
// GPT daily quota debug (CLICK logs)
// -------------------------------
function igGetGptDailySnapshot() {
  const keys = Object.keys(localStorage).filter((k) => /gpt|quota|daily|limit|usage/i.test(k));
  const raw = {};
  for (const k of keys) raw[k] = localStorage.getItem(k);

  let count = null;
  let allowed = null;

  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (!v) continue;

    try {
      const obj = JSON.parse(v);

      const c =
        typeof obj.count === "number" ? obj.count :
          typeof obj.used === "number" ? obj.used :
            typeof obj.calls === "number" ? obj.calls :
              null;

      const a =
        typeof obj.allowed === "number" ? obj.allowed :
          typeof obj.limit === "number" ? obj.limit :
            typeof obj.max === "number" ? obj.max :
              null;

      if (c !== null) count = c;
      if (a !== null) allowed = a;

      if (count !== null && allowed !== null) break;
    } catch (_) { }
  }

  const remaining = (typeof count === "number" && typeof allowed === "number")
    ? Math.max(0, allowed - count)
    : null;

  return { keys, count, remaining, allowed, raw };
}

function igLogGptDaily(label) {
  const day = new Date().toISOString().slice(0, 10);
  console.log("CLICK:GPT_DAILY", { label, day, ...igGetGptDailySnapshot() });
}

// -------------------------------
// Support banner (Option A: local)
// Same emotion 5x in 72h
// -------------------------------
function igNormalizeEmotion(feeling) {
  return (feeling || "").toString().trim().toLowerCase();
}

function igIsNegativeEmotion(e) {
  const NEG = new Set([
    "sad",
    "stressed",
    "anxious",
    "anxiety",
    "overwhelmed",
    "angry",
    "lonely",
    "tired",
    "depressed",
    "fear"
  ]);
  return NEG.has(e);
}

function igSupportKey(userId, emotion) {
  const uid = (userId || "guest").toString();
  return `ig_support_${uid}_${emotion}`;
}
function igSupportDismissKey(userId, emotion) {
  const uid = String(userId || "guest").trim();
  const emo = igNormalizeEmotion(emotion);
  return `ig_support_dismissed_${uid}_${emo}`;
}

function igIsSupportDismissed(userId, emotion) {
  try {
    return localStorage.getItem(igSupportDismissKey(userId, emotion)) === "1";
  } catch (_) {
    return false;
  }
}

function igDismissSupport(userId, emotion) {
  try {
    localStorage.setItem(igSupportDismissKey(userId, emotion), "1");
  } catch (_) { }
}

function igClearSupportDismissal(userId, emotion) {
  try {
    localStorage.removeItem(igSupportDismissKey(userId, emotion));
  } catch (_) { }
}
function igRecordAndCheckSupport(userId, feeling) {
  const emotion = igNormalizeEmotion(feeling);
  if (!emotion) return { emotion: "", count: 0, hit: false };
  if (!igIsNegativeEmotion(emotion)) return { emotion, count: 0, hit: false };

  const now = Date.now();
  const windowMs = 72 * 60 * 60 * 1000;
  const cutoff = now - windowMs;

  const key = igSupportKey(userId, emotion);

  let arr = [];
  try {
    arr = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(arr)) arr = [];
  } catch (_) {
    arr = [];
  }

  arr = arr.filter((ts) => typeof ts === "number" && ts >= cutoff);
  arr.push(now);
  console.log("Emotion count for support: ", arr.length);
  try {
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (_) {
    return { emotion, count: arr.length, hit: false };
  }

  return { emotion, count: arr.length, hit: arr.length >= 5 };
}

async function updateButtonStateByCount() {
  if (!currentFeeling) return;

  const nextBtn = DOM?.nextBtn;
  const newAiBtn = DOM?.newAiBtn;
  if (!nextBtn || !newAiBtn) return;

  // Guest: local library only
  if (igIsGuestMode()) {
    const list = igReadGuestAffs(currentFeeling);
    const remaining = list.filter((x) => x && x.text && !shownIds.includes(x.text)).length;

    if (remaining > 0) {
      nextBtn.classList.remove("hidden");
      newAiBtn.classList.add("hidden");
    } else {
      nextBtn.classList.add("hidden");
      newAiBtn.classList.remove("hidden");
    }
    return;
  }

  // Account: backend count logic
  const user = await getCurrentUser();
  if (!user?._id) return;

  const params = new URLSearchParams({
    emotion: currentFeeling,
    userId: user._id
  });

  if (window.contextDriver) params.append("driver", window.contextDriver);
  if (window.contextPressure) params.append("pressure", window.contextPressure);

  const res = await apiFetch(`/api/affirmations/count?${params.toString()}`);
  const { count = 0 } = await res.json();

  if (count <= 2) {
    nextBtn.classList.add("hidden");
    newAiBtn.classList.remove("hidden");
  } else {
    nextBtn.classList.remove("hidden");
    newAiBtn.classList.add("hidden");
  }
}
function igShowSupportBanner(emotion, userId) {
  try {
    const overlay = document.getElementById("supportOverlay");
    const msg = document.getElementById("supportOverlayMsg");
    const closeBtn = document.getElementById("supportOverlayClose");

    if (!overlay || !msg) {
      console.warn("[support] overlay elements missing");
      return;
    }

    const cleanEmotion = String(emotion || "").trim();
    const prettyEmotion =
      cleanEmotion ? cleanEmotion.charAt(0).toUpperCase() + cleanEmotion.slice(1) : "This feeling";

    msg.textContent = `${prettyEmotion} has been coming up a lot lately.`;

    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");

    if (closeBtn && !closeBtn.dataset.boundSupportClose) {
      closeBtn.addEventListener("click", () => {
        igDismissSupport(userId, cleanEmotion);
        overlay.classList.add("hidden");
        overlay.setAttribute("aria-hidden", "true");

        console.log("[support] overlay dismissed", {
          emotion: cleanEmotion,
          userId
        });
      });

      closeBtn.dataset.boundSupportClose = "true";
    }

    console.log("[support] overlay shown", {
      emotion: cleanEmotion,
      userId
    });
  } catch (e) {
    console.warn("[support] overlay show failed:", e);
  }
}
async function igTrackEmotionForSupport(feeling) {
  try {
    const user = await getCurrentUser();
    const userId = user?._id || "guest";

    const result = igRecordAndCheckSupport(userId, feeling);

    // If the pattern is no longer active, clear old dismissal
    if (result.count < 5) {
      igClearSupportDismissal(userId, result.emotion);
      return;
    }

    // If user already closed this active cycle, do not show again
    if (igIsSupportDismissed(userId, result.emotion)) {
      console.log("[support] suppressed by dismissal", {
        emotion: result.emotion,
        count: result.count
      });
      return;
    }

    if (result.hit) {
      igShowSupportBanner(result.emotion, userId);
    }
  } catch (e) {
    console.warn("[support] track error:", e);
  }
}

// -------------------------------
// Stars UI
// -------------------------------
function updateStarDisplay(rating) {
  const stars = document.querySelectorAll(".star");
  if (!stars.length) return;

  const r = Math.max(0, Math.floor(Number(rating) || 0));
  stars.forEach((star, index) => {
    const isActive = index < r;
    star.classList.toggle("active", isActive);
    star.classList.remove("hover");
    star.setAttribute("aria-pressed", String(isActive));
  });
}

// -------------------------------
// Buttons state
// -------------------------------
async function updateButtonStateByCount() {
  if (!currentFeeling) return;

  const nextBtn = DOM?.nextBtn;
  const newAiBtn = DOM?.newAiBtn;
  if (!nextBtn || !newAiBtn) return;

  // Guest: local library only
  if (igIsGuestMode()) {
    const list = igReadGuestAffs(currentFeeling);
    const remaining = list.filter((x) => x && x.text && !shownIds.includes(x.text)).length;

    if (remaining > 0) {
      nextBtn.classList.remove("hidden");
      newAiBtn.classList.add("hidden");
    } else {
      nextBtn.classList.add("hidden");
      newAiBtn.classList.remove("hidden");
    }
    console.log("[buttonState] guest result", {
      emotion: currentFeeling,
      remaining,
      nextHidden: nextBtn.classList.contains("hidden"),
      aiHidden: newAiBtn.classList.contains("hidden")
    });

    return;
  }

  // Account: backend count logic
  const user = await getCurrentUser();
  if (!user?._id) return;

  const params = new URLSearchParams({
    emotion: currentFeeling,
    userId: user._id
  });

  if (window.contextDriver) params.append("driver", window.contextDriver);
  if (window.contextPressure) params.append("pressure", window.contextPressure);

  const res = await apiFetch(`/api/affirmations/count?${params.toString()}`);
  const { count = 0 } = await res.json();

  console.log("[buttonState] count response", {
    count,
    emotion: currentFeeling,
    driver: window.contextDriver || "",
    pressure: window.contextPressure || ""
  });

  if (count <= 2) {
    nextBtn.classList.add("hidden");
    newAiBtn.classList.remove("hidden");
  } else {
    nextBtn.classList.remove("hidden");
    newAiBtn.classList.add("hidden");
  }

  console.log("[buttonState] classes after update", {
    count,
    emotion: currentFeeling,
    driver: window.contextDriver || "",
    pressure: window.contextPressure || "",
    nextHidden: nextBtn.classList.contains("hidden"),
    aiHidden: newAiBtn.classList.contains("hidden")
  });
}

// -------------------------------
// GPT daily limit (per device, per user/mode)
// -------------------------------
const IG_GPT_DAILY_KEY_BASE = "ig_gpt_daily_v1";
const IG_GPT_DAILY_MAX_GUEST = 3;
const IG_GPT_DAILY_MAX_ACCOUNT = 10;

function igTodayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Resolve mode using the freshest truth available.
// Priority: explicit user flag -> stored auth_mode -> infer from user id -> guest
function igResolveAuthMode(user) {
  try {
    if (user && user.isGuest === true) return "guest";
    const stored = String(localStorage.getItem("ig_auth_mode") || "").trim();
    if (stored === "guest" || stored === "account") return stored;
    if (user && user._id) return "account";
    return "guest";
  } catch (e) {
    if (user && user.isGuest === true) return "guest";
    if (user && user._id) return "account";
    return "guest";
  }
}

// Resolve uid without accidentally using a guest id for account mode.
// Priority: user._id -> localStorage.currentUserId -> "guest"
function igResolveUserId(user) {
  const fromUser = user && user._id ? String(user._id).trim() : "";
  if (fromUser) return fromUser;

  const fromStorage = String(localStorage.getItem("currentUserId") || "").trim();
  if (fromStorage) return fromStorage;

  return "guest";
}

function igGptDailyKeyForUser(user) {
  const mode = igResolveAuthMode(user);
  const uid = igResolveUserId(user);

  // If mode says "account" but uid is missing, fall back to guest mode key
  // (prevents "account:guest" keys during early boot)
  const safeMode = (mode === "account" && uid !== "guest") ? "account" : "guest";

  return `${IG_GPT_DAILY_KEY_BASE}:${safeMode}:${uid}`;
}

function igGptDailyMaxForUser(user) {
  const mode = igResolveAuthMode(user);
  const uid = igResolveUserId(user);

  // Only give account limit when we truly have an account identity
  if (mode === "account" && uid !== "guest") return IG_GPT_DAILY_MAX_ACCOUNT;
  return IG_GPT_DAILY_MAX_GUEST;
}


function igReadGptDailyForUser(user) {
  const key = igGptDailyKeyForUser(user);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { key, day: igTodayIsoLocal(), count: 0 };

    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return { key, day: igTodayIsoLocal(), count: 0 };

    return {
      key,
      day: String(obj.day || igTodayIsoLocal()),
      count: Number(obj.count || 0) || 0,
    };
  } catch (_) {
    return { key, day: igTodayIsoLocal(), count: 0 };
  }
}

function igWriteGptDailyForUser(user, day, count) {
  const key = igGptDailyKeyForUser(user);
  try { localStorage.setItem(key, JSON.stringify({ day, count })); } catch (_) { }
}

function igGptGateForUser(user) {
  const today = igTodayIsoLocal();
  const max = igGptDailyMaxForUser(user);
  const c = igReadGptDailyForUser(user);

  if (c.day !== today) {
    igWriteGptDailyForUser(user, today, 0);
    return { allowed: true, remaining: max, count: 0, day: today, max, key: c.key };
  }

  const remaining = Math.max(0, max - c.count);
  return { allowed: c.count < max, remaining, count: c.count, day: today, max, key: c.key };
}

function igConsumeGptUseForUser(user, reason) {
  const today = igTodayIsoLocal();
  const max = igGptDailyMaxForUser(user);
  const c = igReadGptDailyForUser(user);

  let count = (c.day === today) ? c.count : 0;
  count += 1;

  igWriteGptDailyForUser(user, today, count);

  const remaining = Math.max(0, max - count);

  console.log("[gptLimit] consume", {
    reason: reason || "unknown",
    day: today,
    count,
    remaining,
    max,
    key: c.key,
  });

  return { count, remaining, day: today, max, key: c.key };
}

function igShowGptLimitMessageForUser(user) {
  const gate = igGptGateForUser(user);
  const msg = `You’ve reached today’s limit for AI-generated affirmations (${gate.max}/day). Come back tomorrow.`;

  console.log("[gptLimit] blocked", gate);

  igSetAffirmationText(msg);
  igShowAffirmationCard();
}

// Guest auto-AI on first submit when local DB is empty (no extra button step)
async function igGuestAutoGPTOnSubmit(feeling, user) {
  const gate = igGptGateForUser(user);
  console.log("[gptLimit] gate (guest auto GPT submit)", gate);

  if (!gate.allowed) {
    igShowGptLimitMessageForUser(user);
    return { ok: false, blocked: true };
  }

  const avoidPhrases = igGetAvoidPhrasesForPrompt(feeling);

  const res = await apiFetch("/api/affirmations/gpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emotion: feeling,
      userId: user._id,
      shouldLog: true,
      avoidPhrases: avoidPhrases
    }),
  });

  const data = await res.json();

  if (!data?.affirmation?.text) {
    return { ok: false, blocked: false };
  }

  igConsumeGptUseForUser(user, "guestAutoGPTOnSubmit");

  return { ok: true, affirmation: data.affirmation };
}

// -------------------------------
// Main: fetch affirmations (emotion submit)
// -------------------------------
async function fetchAffirmations() {
  console.log("FETCH_AFFIRMATIONS_CALLED");
  igLogGptDaily("emotion-submit:fetchAffirmations");

  if (__fetchAffirmationsInFlight) return;
  __fetchAffirmationsInFlight = true;

  const feeling = igGetFeelingFromDOM();
  if (!feeling) {
    __fetchAffirmationsInFlight = false;
    return;
  }

  const user = await getCurrentUser();
  if (!user?._id) {
    __fetchAffirmationsInFlight = false;
    return;
  }

  currentFeeling = feeling;
  shownIds = [];
  hasSeenDbAffirmation = false;

  // Guest library reset once per onboarding cycle
  igGuestResetLibraryIfNeeded();

  // Daily streak: credit once per day on emotion submit (guest + logged-in)
  if (typeof window.incrementDailyStreak === "function") {
    window.incrementDailyStreak();
  }

  try {
    // Support tracking (always)
    await igTrackEmotionForSupport(feeling);

    // -------------------------
    // Guest: DB-first, auto-AI only when DB is empty
    // -------------------------
    if (igIsGuestMode()) {
      igGuestResetLibraryIfNeeded();

      const list = igReadGuestAffs(feeling);
      const next = igPickNextGuestAff(feeling, shownIds);

      // 1) DB-first: show saved
      if (next && next.text) {
        currentAffirmation = { text: next.text, rating: 0, _id: "" };
        shownIds.push(next.text);

        igSetAffirmationText(next.text);
        igShowAffirmationCard();

        if (DOM?.submitEmotion) DOM.submitEmotion.classList.add("hidden");

        // Guest local items: no rating
        igHideStars();

        await updateButtonStateByCount();
        return;
      }

      // 2) If DB is empty: auto-GPT (no user click)
      if (!list.length) {
        const result = await igGuestAutoGPTOnSubmit(feeling, user);

        if (!result.ok) {
          if (!result.blocked) {
            igSetAffirmationText("AI is not available right now. Tap “New AI” to retry.");
            igShowAffirmationCard();
            if (DOM?.submitEmotion) DOM.submitEmotion.classList.add("hidden");
            igHideStars();
            DOM?.nextBtn?.classList.add("hidden");
            DOM?.newAiBtn?.classList.remove("hidden");
          }
          return;
        }

        currentAffirmation = result.affirmation;

        // Save into guest DB
        igSaveGuestAff(feeling, currentAffirmation.text);

        // Save avoid phrase
        igSaveAvoidPhraseFromAi(feeling, currentAffirmation.text);

        // Guest cycling uses text values
        shownIds = [currentAffirmation.text];


        await igRenderAffirmationText(currentAffirmation.text, { animateAi: true });
        igShowAffirmationCard();

        if (DOM?.submitEmotion) DOM.submitEmotion.classList.add("hidden");

        // Keep stars hidden for guest
        igHideStars();

        await updateButtonStateByCount();
        return;
      }

      // 3) DB exists but you’ve seen everything saved: show New AI
      igSetAffirmationText("You’ve seen all saved affirmations for this feeling.");
      igShowAffirmationCard();
      if (DOM?.submitEmotion) DOM.submitEmotion.classList.add("hidden");
      igHideStars();
      DOM?.nextBtn?.classList.add("hidden");
      DOM?.newAiBtn?.classList.remove("hidden");
      return;
    }
    console.log("[affirmations] about to call /api/affirmations/count");
    // -------------------------
    // Account mode: existing behavior
    // -------------------------
    //    const countRes = await apiFetch(
    //      `/api/affirmations/count?emotion=${encodeURIComponent(feeling)}&userId=${encodeURIComponent(user._id)}`
    //    );
    const payload = buildEmotionPayload(user._id, {});
    console.log("[affirmations] url for count:", `/api/affirmations/count?emotion=${encodeURIComponent(payload.emotion)}&userId=${encodeURIComponent(user._id)}&driver=${encodeURIComponent(payload.driver || "")}&pressure=${encodeURIComponent(payload.pressure || "")}`
    );
    const countRes = await apiFetch(
      `/api/affirmations/count?emotion=${encodeURIComponent(payload.emotion)}&userId=${encodeURIComponent(user._id)}&driver=${encodeURIComponent(payload.driver || "")}&pressure=${encodeURIComponent(payload.pressure || "")}`
    );
    const { count = 0 } = await countRes.json();
    console.log("[affirmations] Count is: ", count);

    const useGPT = count <= 2;
    const endpoint = useGPT ? "/api/affirmations/gpt" : "/api/affirmations";

    const avoidPhrases = (endpoint === "/api/affirmations/gpt")
      ? igGetAvoidPhrasesForPrompt(feeling)
      : [];

    if (endpoint === "/api/affirmations/gpt") {
      const gate = igGptGateForUser(user);
      console.log("[gptLimit] gate (fetchAffirmations)", gate);

      if (!gate.allowed) {
        igShowGptLimitMessageForUser(user);
        return;
      }
    }
    console.log("[affirmations] endpoint used", endpoint);
    const res = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildEmotionPayload(user._id, {
          shouldLog: true,
          avoidPhrases: avoidPhrases
        })
      ),
    });
    console.log("[affirmations] apiFetch returned status =", res.status);

    const data = await res.json();
    console.log("AFFIRMATION RESPONSE:", data);
    if (endpoint === "/api/affirmations/gpt" && data?.affirmation) {
      igConsumeGptUseForUser(user, "fetchAffirmations");
    }
    if (endpoint === "/api/affirmations") {
      hasSeenDbAffirmation = true;
    }
    console.log("[ai-anim-debug] fetchAffirmations render decision", {
      endpoint,
      animateAi: endpoint === "/api/affirmations/gpt",
      textPreview: data?.affirmation?.text?.slice?.(0, 80) || "",
      count,
      currentFeeling
    });
    if (data?.affirmation) {
      currentAffirmation = data.affirmation;
      shownIds.push(currentAffirmation._id || "");

      if (endpoint === "/api/affirmations/gpt" && currentAffirmation?.text) {
        igSaveAvoidPhraseFromAi(feeling, currentAffirmation.text);
      }

      await igRenderAffirmationText(
        currentAffirmation.text || "No text.",
        { animateAi: endpoint === "/api/affirmations/gpt" }
      ); igShowAffirmationCard();
      console.log("[profile:affirmation:rendered]", {
        wrapperExists: !!document.getElementById("affirmationWrapper"),
        boxExists: !!document.querySelector(".affirmation-box"),
        textExists: !!document.querySelector(".ig-affirm-text"),
        boxClassName: document.querySelector(".affirmation-box")?.className || null,
        textClassName: document.querySelector(".ig-affirm-text")?.className || null,
        wrapperHTML: document.getElementById("affirmationWrapper")?.innerHTML || null,
        ts: new Date().toISOString()
      });
      console.log("[affirmations] after render before button update", {
        from: endpoint,
        currentFeeling,
        driver: window.contextDriver || "",
        pressure: window.contextPressure || "",
        shownIds: [...shownIds],
        nextHiddenBefore: DOM?.nextBtn?.classList.contains("hidden"),
        aiHiddenBefore: DOM?.newAiBtn?.classList.contains("hidden")
      });
      if (DOM?.submitEmotion) DOM.submitEmotion.classList.add("hidden");

      igShowStars();
      updateStarDisplay(Number(currentAffirmation.rating) || 0);

      await updateButtonStateByCount();
    }
  } catch (err) {
    console.error("fetchAffirmations error:", err);
  } finally {
    __fetchAffirmationsInFlight = false;
  }
}

// -------------------------------
// Next affirmation
// - Guest: DB-first only (NO auto GPT on Next)
// - Account: backend /api/affirmations with excludeIds
// -------------------------------
async function getNextAffirmation() {
  if (__nextInFlight) return;
  __nextInFlight = true;

  try {
    if (!currentFeeling) return;

    const user = await getCurrentUser();
    if (!user?._id) return;

    // Guest path: local DB-first only
    if (igIsGuestMode()) {
      igGuestResetLibraryIfNeeded();

      const list = igReadGuestAffs(currentFeeling);

      // If nothing saved yet, show New AI
      if (!list.length) {
        igSetAffirmationText("No saved affirmations yet. Tap “New AI” to create one.");
        igShowAffirmationCard();
        igHideStars();
        DOM?.nextBtn?.classList.add("hidden");
        DOM?.newAiBtn?.classList.remove("hidden");
        return;
      }

      const next = igPickNextGuestAff(currentFeeling, shownIds);

      if (next && next.text) {
        currentAffirmation = { text: next.text, rating: 0, _id: "" };
        shownIds.push(next.text);

        igSetAffirmationText(next.text);
        igShowAffirmationCard();
        igHideStars();

        await updateButtonStateByCount();
        return;
      }

      // Exhausted saved list -> show New AI
      igSetAffirmationText("You’ve seen all saved affirmations for this feeling.");
      igShowAffirmationCard();
      igHideStars();
      DOM?.nextBtn?.classList.add("hidden");
      DOM?.newAiBtn?.classList.remove("hidden");
      return;
    }

    // Account path: backend next
    const res = await apiFetch("/api/affirmations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildEmotionPayload(user._id, {
          excludeIds: shownIds
        })
      ),
    });
    console.log("[affirmations] 404 received, hasSeenDbAffirmation =", hasSeenDbAffirmation);
    if (res.status === 404) {
      igSetAffirmationText("You’ve seen all saved affirmations for this feeling.");
      igHideStars();
      DOM?.nextBtn?.classList.add("hidden");
      DOM?.newAiBtn?.classList.remove("hidden");
      return;
    }

    const data = await res.json();

    if (data?.affirmation?.text) {
      currentAffirmation = data.affirmation;
      if (currentAffirmation._id) shownIds.push(currentAffirmation._id);

      igSetAffirmationText(currentAffirmation.text);
      igShowAffirmationCard();

      igShowStars();
      updateStarDisplay(Number(currentAffirmation.rating) || 0);

      if (shownIds.length >= IG_DB_AFFIRMATION_LIMIT) {
        DOM?.nextBtn?.classList.add("hidden");
        DOM?.newAiBtn?.classList.remove("hidden");
      } else {
        DOM?.nextBtn?.classList.remove("hidden");
        DOM?.newAiBtn?.classList.add("hidden");
      }
    }
  } catch (err) {
    console.error("getNextAffirmation error:", err);
  } finally {
    setTimeout(() => (__nextInFlight = false), 200);
  }
}

// -------------------------------
// New AI affirmation button
// - Respects daily gate
// - Does NOT log emotion again (shouldLog:false)
// - Guest: saves to local DB + supports cycling
// -------------------------------
async function fetchGPTAffirmation() {
  igLogGptDaily("button:new-ai:fetchGPTAffirmation");
  if (__newAIInFlight) return;
  __newAIInFlight = true;

  try {
    if (!currentFeeling) return;

    const user = await getCurrentUser();
    if (!user?._id) return;

    const gate = igGptGateForUser(user);
    console.log("[gptLimit] gate (fetchGPTAffirmation)", gate);

    if (!gate.allowed) {
      igShowGptLimitMessageForUser(user);
      return;
    }

    const avoidPhrases = igGetAvoidPhrasesForPrompt(currentFeeling);

    const res = await apiFetch("/api/affirmations/gpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildEmotionPayload(user._id, {
          shouldLog: false,
          avoidPhrases: avoidPhrases,
          excludeIds: shownIds
        })
      ),
    });

    const data = await res.json();

    if (data?.affirmation?.text) {
      igConsumeGptUseForUser(user, "fetchGPTAffirmation");

      currentAffirmation = data.affirmation;

      // Save avoid phrase
      igSaveAvoidPhraseFromAi(currentFeeling, currentAffirmation.text);

      // Guest: save to local DB and use text-based shown list
      if (igIsGuestMode()) {
        igSaveGuestAff(currentFeeling, currentAffirmation.text);
        shownIds = [currentAffirmation.text];
        igHideStars();
      } else {
        // Account: reset exclude list (keeps existing behavior)
        shownIds = [];
        igShowStars();
        updateStarDisplay(Number(currentAffirmation.rating) || 0);
      }

      await igRenderAffirmationText(currentAffirmation.text, { animateAi: true });
      igShowAffirmationCard();

      DOM?.nextBtn?.classList.remove("hidden");
      DOM?.newAiBtn?.classList.add("hidden");

      await updateButtonStateByCount();
    }
  } catch (err) {
    console.error("fetchGPTAffirmation error:", err);
  } finally {
    setTimeout(() => (__newAIInFlight = false), 200);
  }
}

// -------------------------------
// Rating (account-only, needs affirmation _id)
// -------------------------------
async function rateAffirmation(stars) {
  const user = await getCurrentUser();
  if (!user?._id || !currentAffirmation?._id) return;

  updateStarDisplay(stars);

  await apiFetch("/api/affirmations/rate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: user._id,
      affirmationId: currentAffirmation._id,
      rating: stars,
    }),
  });
}

// -------------------------------
// My Affirmations page support (client helper)
// Calls backend route: GET /api/affirmations/all?userId=...
// -------------------------------
async function fetchAllAffirmationsForUser(userId) {
  try {
    const uid = String(userId || "").trim();
    if (!uid) return { emotions: [] };

    const res = await apiFetch(`/api/affirmations/all?userId=${encodeURIComponent(uid)}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) return { emotions: [] };
    return await res.json();
  } catch (e) {
    console.warn("[affirmations] fetchAllAffirmationsForUser failed:", e);
    return { emotions: [] };
  }
}

// -------------------------------
// Export globals (single export block)
// -------------------------------
try {
  window.fetchAffirmations = fetchAffirmations;
  window.getNextAffirmation = getNextAffirmation;
  window.fetchGPTAffirmation = fetchGPTAffirmation;
  window.rateAffirmation = rateAffirmation;

  // optional: for My Affirmations page
  window.fetchAllAffirmationsForUser = fetchAllAffirmationsForUser;
} catch (e) {
  console.error("[affirmations] failed to export globals:", e);
}
