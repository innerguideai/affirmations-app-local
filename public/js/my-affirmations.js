// /public/js/my-affirmations.js
// Purpose: My Affirmations page logic
// - Auth gate (registered users only; guests are gated, matching my-streaks.js pattern)
// - Fetch + render last-30-days affirmations (GET /api/affirmations/saved)
// - Listen (native speechSynthesis) + Remove (POST /api/affirmations/unsave)

"use strict";

function $(id) {
  const el = document.getElementById(id);
  if (!el) console.log("[my-affirmations] missing element:", id);
  return el;
}

// -----------------------------------------
// Icons (inline SVG — no emoji, matches the speaker icon used on the
// affirmation result screen in profile.html)
// -----------------------------------------
const ICON_SPEAKER = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>`;
const ICON_TRASH = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
const ICON_CHECK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L19 7"/></svg>`;

// -----------------------------------------
// Auth: guest vs registered
// Signals per project convention: ig_auth_mode ("guest"/"account"),
// currentUser.isGuest — same check used in account.html.
// -----------------------------------------
function isGuestUser() {
  try {
    const authMode = (localStorage.getItem("ig_auth_mode") || "").trim();
    const raw = localStorage.getItem("currentUser") || "";
    const u = raw ? JSON.parse(raw) : null;
    return authMode === "guest" || u?.isGuest === true;
  } catch (_) {
    return true;
  }
}

// Client-side UX gate only — NOT a security boundary. The backend derives
// the authenticated user independently (session/JWT) and never trusts a
// client-supplied userId; this just decides whether to show the sign-in
// gate or attempt to load the list.
async function canViewMyAffirmations() {
  if (isGuestUser()) return false;
  try {
    const user = await window.getCurrentUser();
    return !!(user && user._id);
  } catch (_) {
    return false;
  }
}

// -----------------------------------------
// Visibility
// -----------------------------------------
function showGate() {
  const gate = $("authGateCard");
  const card = $("myAffirmationsCard");
  if (gate) gate.hidden = false;
  if (card) card.hidden = true;
}

function showList() {
  const gate = $("authGateCard");
  const card = $("myAffirmationsCard");
  if (gate) gate.hidden = true;
  if (card) card.hidden = false;
}

// -----------------------------------------
// Helpers
// -----------------------------------------
function formatDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch (_) {
    return "";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

// Read-aloud voice quality — same pattern as public/js/profile.affirmations.js
// (duplicated intentionally rather than factored into a shared file, to keep
// this a minimal, isolated change with no new <script> includes needed).
function igPickPreferredVoice() {
  try {
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;

    const englishVoices = voices.filter(v => /^en(-|_|$)/i.test(v.lang || ""));
    const pool = englishVoices.length ? englishVoices : voices;

    const enhanced = pool.find(v => /enhanced|premium/i.test(v.name || ""));
    if (enhanced) return enhanced;

    const preferredNames = ["Samantha", "Ava", "Allison", "Susan", "Karen", "Moira", "Daniel"];
    for (const name of preferredNames) {
      const match = pool.find(v => (v.name || "").includes(name));
      if (match) return match;
    }

    const enUS = pool.find(v => /^en-us$/i.test(v.lang || ""));
    if (enUS) return enUS;
    if (englishVoices.length) return englishVoices[0];

    return null;
  } catch (_) {
    return null;
  }
}

function igEnsureVoicesLoaded(callback) {
  if (!window.speechSynthesis) { callback(); return; }
  const existing = window.speechSynthesis.getVoices();
  if (existing && existing.length) { callback(); return; }

  let called = false;
  const done = () => { if (called) return; called = true; callback(); };

  window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
  setTimeout(done, 400);
}

function speak(text) {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  igEnsureVoicesLoaded(() => {
    const utter = new SpeechSynthesisUtterance(text);
    const voice = igPickPreferredVoice();
    if (voice) utter.voice = voice;

    utter.rate = 0.93;
    utter.pitch = 1.0;
    utter.volume = 1.0;

    window.speechSynthesis.speak(utter);
  });
}

// -----------------------------------------
// Rendering
// -----------------------------------------
function renderList(items) {
  const listEl = $("affirmationsList");
  const emptyEl = $("emptyState");
  if (!listEl || !emptyEl) return;

  listEl.innerHTML = "";

  if (!items || items.length === 0) {
    emptyEl.hidden = false;
    listEl.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  listEl.hidden = false;

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "my-affirm-item";
    row.dataset.id = item._id;

    row.innerHTML = `
      <div class="my-affirm-text">${escapeHtml(item.text)}</div>
      <div class="my-affirm-meta">
        <span class="my-affirm-emotion">${escapeHtml(item.emotion)}</span>
        <span class="my-affirm-date">${formatDate(item.createdAt)}</span>
      </div>
      <div class="my-affirm-actions">
        <button type="button" class="my-affirm-listen-btn" aria-label="Listen to affirmation" title="Listen to affirmation">${ICON_SPEAKER}</button>
        <button type="button" class="my-affirm-remove-btn" aria-label="Remove from My Affirmations" title="Remove from My Affirmations">${ICON_TRASH}</button>
      </div>
    `;

    listEl.appendChild(row);
  });
}

// -----------------------------------------
// Remove
// -----------------------------------------
async function removeAffirmation(affirmationId, rowEl) {
  try {
    const res = await window.apiFetch("/api/affirmations/unsave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ affirmationId }),
    });

    if (!res.ok) {
      console.warn("[my-affirmations] remove failed:", res.status);
      return;
    }

    if (rowEl && rowEl.parentNode) rowEl.parentNode.removeChild(rowEl);

    const listEl = $("affirmationsList");
    const emptyEl = $("emptyState");
    if (listEl && emptyEl && listEl.children.length === 0) {
      emptyEl.hidden = false;
      listEl.hidden = true;
    }
  } catch (e) {
    console.warn("[my-affirmations] remove error:", e);
  }
}

// -----------------------------------------
// Fetch
// -----------------------------------------
async function fetchSaved() {
  try {
    const res = await window.apiFetch("/api/affirmations/saved", {
      method: "GET",
      cache: "no-store",
    });

    if (res.status === 401) {
      showGate();
      return [];
    }
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.saved) ? data.saved : [];
  } catch (e) {
    console.warn("[my-affirmations] fetch error:", e);
    return [];
  }
}

// -----------------------------------------
// Wiring
// -----------------------------------------
// Tap-to-confirm state for Remove — reuses the same button (no new modal).
// First tap arms it; a second tap within CONFIRM_TIMEOUT_MS removes it;
// any other click resets it back to the normal trash icon.
const CONFIRM_TIMEOUT_MS = 3500;
let confirmState = { btn: null, timer: null };

function resetConfirmState() {
  if (confirmState.timer) clearTimeout(confirmState.timer);
  if (confirmState.btn) {
    confirmState.btn.classList.remove("is-confirming");
    confirmState.btn.innerHTML = ICON_TRASH;
    confirmState.btn.setAttribute("aria-label", "Remove from My Affirmations");
    confirmState.btn.setAttribute("title", "Remove from My Affirmations");
  }
  confirmState = { btn: null, timer: null };
}

function armConfirmState(btn) {
  resetConfirmState();
  btn.classList.add("is-confirming");
  btn.innerHTML = ICON_CHECK;
  btn.setAttribute("aria-label", "Confirm remove from My Affirmations");
  btn.setAttribute("title", "Confirm remove from My Affirmations");
  confirmState.btn = btn;
  confirmState.timer = setTimeout(resetConfirmState, CONFIRM_TIMEOUT_MS);
}

function wireListEvents() {
  const listEl = $("affirmationsList");
  if (!listEl) return;

  if (listEl.dataset.wired === "true") return;
  listEl.dataset.wired = "true";

  listEl.addEventListener("click", (e) => {
    const row = e.target.closest(".my-affirm-item");
    if (!row) {
      resetConfirmState();
      return;
    }
    const affirmationId = row.dataset.id;
    const removeBtn = e.target.closest(".my-affirm-remove-btn");

    if (e.target.closest(".my-affirm-listen-btn")) {
      resetConfirmState();
      const textEl = row.querySelector(".my-affirm-text");
      speak(textEl ? textEl.textContent : "");
    } else if (removeBtn) {
      if (confirmState.btn === removeBtn) {
        resetConfirmState();
        removeAffirmation(affirmationId, row);
      } else {
        armConfirmState(removeBtn);
      }
    } else {
      resetConfirmState();
    }
  });
}

function wireGateButton() {
  const login = $("goLoginBtn");
  if (login) {
    login.addEventListener("click", () => {
      window.location.href = "/login.html";
    });
  }
}

// -----------------------------------------
// Init
// -----------------------------------------
async function init() {
  wireGateButton();

  const status = $("statusLine");
  if (status) {
    status.hidden = false;
    status.textContent = "Loading…";
  }

  const ok = await canViewMyAffirmations();

  if (status) status.hidden = true;

  if (!ok) {
    showGate();
    return;
  }

  showList();
  wireListEvents();

  const items = await fetchSaved();
  renderList(items);
}

document.addEventListener("DOMContentLoaded", init);
