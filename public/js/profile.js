// profile.js — iOS + EC2 aligned (guards + JWT + no double-bind)
"use strict";

/* =============== 0) Small helpers =============== */

const API = "https://api-b.innerguideai.com";

// JWT-aware fetch wrapper: works for iOS (Bearer) + Web (cookies)
const apiFetch = (path, options = {}) => {
  const headers = new Headers(options.headers || {});
  try {
    const token = localStorage.getItem("authToken");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  } catch { /* ignore */ }

  return fetch(`${API}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers,
  });
};

// --- Double-call hard guards (shared) ---
let __fetchAffirmationsInFlight = false; // (reserved in case you want to guard fetchAffirmations too)
let __nextInFlight = false;              // guards "Next" button path
let __newAIInFlight = false;             // guards "New AI" button path

// Welcome name from cache (non-intrusive)
function applyWelcomeFromCache() {
  try {
    const raw = localStorage.getItem("currentUser");
    if (!raw) return;
    const u = JSON.parse(raw);
    const base = (u.firstName || (u.email || "").split("@")[0] || "Friend").trim();
    const name = base ? base.charAt(0).toUpperCase() + base.slice(1) : "Friend";
    const el = document.getElementById("welcomeName");
    if (el && name && name.toLowerCase() !== "friend") {
      el.textContent = name;
    }
  } catch (e) {
    console.warn("[profile] welcome cache failed:", e?.message || e);
  }
}
document.addEventListener("DOMContentLoaded", applyWelcomeFromCache);

// Local cache helpers
function getCachedUser() {
  try {
    const raw = localStorage.getItem("currentUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function setCachedUser(u) {
  localStorage.setItem("currentUser", JSON.stringify(u));
}

// Ask API for /api/me, normalize {id}->{_id}, cache
async function fetchAndCacheCurrentUser() {
  const res = await apiFetch("/api/me");
  let raw = await res.text();
  raw = raw.replace(/^\uFEFF/, "").trim();
  let user = null;
  try { user = JSON.parse(raw); } catch { user = null; }
  if (user && user.id && !user._id) user._id = user.id;
  if (user && user._id) {
    setCachedUser(user);
    return user;
  }
  return null;
}

// getCurrentUser(): cache → id fallback → /api/me (web only)
async function getCurrentUser() {
  // 1) cache
  const cached = getCachedUser();
  if (cached && (cached._id || cached.id)) {
    if (cached.id && !cached._id) cached._id = cached.id;
    return cached;
  }
  // 2) fallback to stored id (login.js sets currentUserId)
  try {
    const cid = localStorage.getItem("currentUserId");
    if (cid) {
      const nameEl = document.getElementById("welcomeName");
      const firstName = (nameEl && nameEl.textContent && nameEl.textContent.trim().toLowerCase() !== "friend")
        ? nameEl.textContent.trim()
        : "";
      const minimal = { _id: cid, id: cid, firstName };
      setCachedUser(minimal);
      return minimal;
    }
  } catch { /* ignore */ }
  // 3) web/EC2 only: /api/me
  if (!location.origin.startsWith("capacitor://")) {
    return await fetchAndCacheCurrentUser();
  }
  // 4) iOS no cache/id
  console.warn("[profile] iOS mode: no cached user or id.");
  return null;
}

/* =============== 1) Minimal state =============== */

let currentAffirmation = null;
let currentFeeling = "";
let shownIds = [];

/* =============== 2) UI helpers =============== */

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

// Show/hide buttons based on DB count
async function updateButtonStateByCount() {
  try {
    if (!currentFeeling) {
      return;
    }
    const user = await getCurrentUser();
    if (!user?._id) {
      console.warn("[profile] session expired → redirecting to login");
      location.href = "login.html";
      return;
    }
    const res = await apiFetch(
      `/api/affirmations/count?emotion=${encodeURIComponent(currentFeeling)}&userId=${encodeURIComponent(user._id)}`
    );
    const { count = 0 } = await res.json();

    const nextBtn = document.getElementById("nextBtn");
    const newBtn  = document.getElementById("newBtn");
    if (!nextBtn || !newBtn) return;

    if (count <= 2) {
      nextBtn.classList.add("hidden");
      newBtn.classList.add("hidden");
    } else {
      nextBtn.classList.remove("hidden");
      newBtn.classList.add("hidden");
    }
  } catch (err) {
    console.error("❌ Error fetching affirmation count:", err);
  }
}

/* =============== 3) Fetch current affirmation =============== */
/*
  Reads #feelingInput, ensures currentUser exists,
  decides GPT vs DB based on count,
  fills #affirmationCard and reveals #starRating.
*/
async function fetchAffirmations() {
  const input = document.getElementById("feelingInput");
  const card  = document.getElementById("affirmationCard");
  const starsWrap = document.getElementById("starRating");

  const feeling = (input?.value || "").trim().toLowerCase();
  if (!feeling) {
    return;
  }

  const user = await getCurrentUser();
if (!user?._id) {
  console.warn("[profile] session expired → redirecting to login");
  location.href = "login.html";
  return;
}

  currentFeeling = feeling;
  shownIds = [];

  try {
    // 1) Count existing affirmations
    const countRes = await apiFetch(
      `/api/affirmations/count?emotion=${encodeURIComponent(feeling)}&userId=${encodeURIComponent(user._id)}`
    );
    const { count = 0 } = (await countRes.json()) || {};

    // 2) Choose endpoint
    const useGPT = count <= 2;
    const res = await apiFetch(useGPT ? "/api/affirmations/gpt" : "/api/affirmations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emotion: feeling,
        userId: user._id,
        ...(useGPT ? { shouldLog: true } : {}),
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${txt ? ` - ${txt}` : ""}`);
    }

    const data = await res.json();
    if (data?.affirmation) {
      currentAffirmation = data.affirmation;
      shownIds.push(currentAffirmation._id || "");

      if (card) {
        card.innerText = currentAffirmation.text || "No text.";
        card.classList?.remove("hidden");
      }

      if (typeof updateButtonStateByCount === "function") {
        await updateButtonStateByCount();
      }
      if (starsWrap) starsWrap.classList.remove("hidden");
      if (typeof updateStarDisplay === "function") {
        const savedRating = Number(currentAffirmation.rating) || 0;
        updateStarDisplay(savedRating);
      }
    } else {
      if (card) card.innerText = "No affirmation found.";
    }
  } catch (e) {
    console.error("❌ Error in fetchAffirmations:", e);
    if (card) card.innerText = "Error fetching affirmation.";
  }
}

/* =============== 4) Next (DB) =============== */

async function getNextAffirmation() {
  if (__nextInFlight) {
    return;
  }
  __nextInFlight = true;

  try {

    if (!currentFeeling) {
      console.warn("[next] no currentFeeling; ignoring");
      return;
    }
    const user = await getCurrentUser();
    if (!user?._id) {
      console.warn("[next] no user; redirecting");
      location.href = "login.html";
      return;
    }


    const res = await apiFetch("/api/affirmations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emotion: currentFeeling,
        userId: user._id,
        excludeIds: shownIds,
      }),
    });

    if (res.status === 404) {
      const card = document.getElementById("affirmationCard");
      card && (card.innerText = "You’ve seen all saved affirmations for this feeling.");
      document.getElementById("starRating")?.classList.add("hidden");
      document.getElementById("nextBtn")?.classList.add("hidden");
      document.getElementById("newBtn")?.classList.remove("hidden");
      return;
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${txt ? ` - ${txt}` : ""}`);
    }

    const data = await res.json();

    if (data?.affirmation?.text) {
      currentAffirmation = data.affirmation;
      if (currentAffirmation._id) shownIds.push(currentAffirmation._id);

      const card = document.getElementById("affirmationCard");
      card && (card.innerText = currentAffirmation.text);

      const starWrap = document.getElementById("starRating");
      starWrap?.classList.remove("hidden");

      document.querySelectorAll(".star").forEach((s) => s.classList.remove("active"));
      updateStarDisplay(Number(currentAffirmation.rating) || 0);

      document.getElementById("nextBtn")?.classList.remove("hidden");
      document.getElementById("newBtn")?.classList.add("hidden");

    } else {
      const card = document.getElementById("affirmationCard");
      card && (card.innerText = "You’ve seen all saved affirmations for this feeling.");
      document.getElementById("starRating")?.classList.add("hidden");
      document.getElementById("nextBtn")?.classList.add("hidden");
      document.getElementById("newBtn")?.classList.remove("hidden");
    }
  } catch (err) {
    console.error("❌ Error in getNextAffirmation:", err);
  } finally {
    setTimeout(() => { __nextInFlight = false; }, 250);
  }
}

// expose for inline onclick parity
window.getNextAffirmation = getNextAffirmation;

/* =============== 5) New AI (GPT) =============== */

async function fetchGPTAffirmation() {
  if (__newAIInFlight) {
    return;
  }
  __newAIInFlight = true;

  try {
    if (!currentFeeling) return;
    const user = await getCurrentUser();
    if (!user?._id) return;

    const res = await apiFetch("/api/affirmations/gpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emotion: currentFeeling,
        userId: user._id,
        excludeIds: shownIds,
        shouldLog: false,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data?.affirmation) {
      const card     = document.getElementById("affirmationCard");
      const starsBox = document.getElementById("starRating");
      const nextBtn  = document.getElementById("nextBtn");
      const newBtn   = document.getElementById("newBtn");

      currentAffirmation = data.affirmation;

      // Reset the DB cycle so Next starts from DB again
      shownIds = [];

      if (card) card.innerText = currentAffirmation.text || "No text.";
      if (starsBox) starsBox.classList.remove("hidden");
      document.querySelectorAll(".star").forEach(s => s.classList.remove("active"));
      updateStarDisplay(Number(currentAffirmation.rating) || 0);

      if (nextBtn) nextBtn.classList.remove("hidden");
      if (newBtn)  newBtn.classList.add("hidden");

      if (typeof updateButtonStateByCount === "function") {
        await updateButtonStateByCount();
      }

    }
  } catch (err) {
    console.error("❌ GPT fetch failed in fetchGPTAffirmation()", err);
  } finally {
    setTimeout(() => { __newAIInFlight = false; }, 250);
  }
}

// expose for inline onclick parity
window.fetchGPTAffirmation = fetchGPTAffirmation;

/* =============== 6) Rating =============== */

async function rateAffirmation(stars) {
  const starsElems = document.querySelectorAll(".star");

  // 1) Clear all stars first
  starsElems.forEach((el) => el.classList.remove("active", "hover", "unselected"));

  // 2) Highlight up to chosen rating
  starsElems.forEach((el, i) => {
    if (i < stars) el.classList.add("active");
    else el.classList.add("unselected");
  });

  // 3) Guard state
  if (!currentAffirmation?._id) {
    console.warn("⚠️ No current affirmation loaded. Aborting rating.");
    return;
  }

  const user = await getCurrentUser();
  if (!user?._id) {
    console.error("❌ No user ID found. Cannot rate.");
    return;
  }

  const payload = {
    userId: user._id,
    affirmationId: currentAffirmation._id,
    rating: stars,
  };

  try {
    const res = await apiFetch("/api/affirmations/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const txt = await res.text();
    if (!res.ok) throw new Error(`Failed to rate: ${res.status} ${txt}`);

    let data = {};
    try { data = txt ? JSON.parse(txt) : {}; } catch {}
  } catch (err) {
    console.error("[rate] error:", err);
  }
}

// keep global for inline onclick="rateAffirmation(n)"
window.rateAffirmation = rateAffirmation;

/* =============== 7) Top emotions carousel =============== */

function updateCarouselIndicators() {
  const carousel = document.getElementById("carousel");
  const indicatorContainer = document.getElementById("carouselIndicators");
  if (!carousel || !indicatorContainer) return;

  const cards = [...carousel.querySelectorAll(".carousel-card")];
  indicatorContainer.innerHTML = "";
  if (!cards.length) return;

  cards.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.className = "dot" + (i === 0 ? " active" : "");
    indicatorContainer.appendChild(dot);
  });

  const offsets = cards.map((c) => c.offsetLeft);

  const onScroll = () => {
    const x = carousel.scrollLeft;
    let idx = 0, best = Infinity;
    for (let i = 0; i < offsets.length; i++) {
      const d = Math.abs(offsets[i] - x);
      if (d < best) { best = d; idx = i; }
    }
    const dots = indicatorContainer.querySelectorAll(".dot");
    dots.forEach((d, i) => d.classList.toggle("active", i === idx));
  };

  const onResize = () => {
    const newOffsets = [...carousel.querySelectorAll(".carousel-card")].map((c) => c.offsetLeft);
    for (let i = 0; i < newOffsets.length; i++) offsets[i] = newOffsets[i] ?? offsets[i];
    onScroll();
  };

  carousel.removeEventListener("scroll", onScroll);
  window.removeEventListener("resize", onResize);
  carousel.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  onScroll();
}

async function loadTopEmotions() {
  try {
    const user = await getCurrentUser();
    if (!user?._id) return;

    const container  = document.getElementById("topEmotionsContainer");
    const label      = document.getElementById("topemotlabel");
    const carousel   = document.getElementById("carousel");
    const indicators = document.getElementById("carouselIndicators");
    if (!container || !carousel || !indicators) return;

    container.classList.add("hidden");
    label?.classList.add("hidden");
    carousel.innerHTML = "";
    indicators.innerHTML = "";

    const res = await apiFetch(`/api/emotions/top?userId=${encodeURIComponent(user._id)}`);
    if (!res.ok) {
      console.warn("topEmotions request failed:", res.status);
      return;
    }
    const { topEmotions = [] } = await res.json();
    if (!topEmotions.length) {
      return;
    }

    for (const { emotion } of topEmotions) {
      const affRes = await apiFetch("/api/affirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emotion, userId: user._id }),
      });
      if (!affRes.ok) {
        continue;
      }
      const { affirmation: aff } = await affRes.json();
      if (!aff) continue;

      const card = document.createElement("div");
      card.classList.add("carousel-card");
      card.innerHTML = `
        <div class="emotion-label">Emotion: ${emotion}</div>
        <p>${aff.text}</p>
        <div class="stars">⭐️ ${aff.rating?.toFixed?.(1) ?? "N/A"}</div>
      `;
      card.addEventListener("click", () => {
        document.querySelectorAll(".carousel-card").forEach(el => el.classList.remove("highlight"));
        card.classList.add("highlight");
      });
      carousel.appendChild(card);
    }

    if (carousel.children.length) {
      container.classList.remove("hidden");
      label?.classList.remove("hidden");
      updateCarouselIndicators();
    }
  } catch (err) {
    console.error("Top emotions fetch failed", err);
  }
}

/* =============== 8) Wiring (no double-fire) =============== */

window.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", (e) => {
    const pick = (sel) => {
      const el = e.target.closest(sel);
      return el ? { el, hasInline: !!el.getAttribute("onclick") } : { el: null, hasInline: false };
    };

    // "I'm feeling this"
    {
      const { el, hasInline } = pick("#submitEmotion");
      if (el) {
        e.preventDefault();
        if (hasInline) return; // let inline onclick handle it
        fetchAffirmations();
        return;
      }
    }

    // "Next Affirmation"
    {
      const { el, hasInline } = pick("#nextBtn");
      if (el) {
        e.preventDefault();
        if (hasInline) return;
        getNextAffirmation();
        return;
      }
    }

    // "New AI Affirmation"
    {
      const { el, hasInline } = pick("#newBtn");
      if (el) {
        e.preventDefault();
        if (hasInline) return;
        fetchGPTAffirmation();
        return;
      }
    }
  });
});

// Star hover + top emotions on load
window.addEventListener("DOMContentLoaded", () => {
  const stars = document.querySelectorAll("#starRating .star");
  if (stars.length) {
    stars.forEach((star, index) => {
      star.addEventListener("mouseenter", () => {
        stars.forEach((s, i) => s.classList.toggle("hover", i <= index));
      });
      star.addEventListener("mouseleave", () => {
        stars.forEach((s) => s.classList.remove("hover"));
      });
    });
  }
  loadTopEmotions();
});

/* =============== 9) INIT ON LOAD =============== */

document.addEventListener("DOMContentLoaded", async () => {
  const user = await getCurrentUser();
  if (!user?._id) {
    console.warn("No session found. Redirecting to login.");
    location.href = "login.html";
    return;
  }

  setCachedUser(user);
  const raw = (user.firstName || user.email?.split("@")[0] || "Friend").trim();
  const name = raw ? raw[0].toUpperCase() + raw.slice(1) : "Friend";
  const el = document.getElementById("welcomeName");
  if (el) el.textContent = name;
});
