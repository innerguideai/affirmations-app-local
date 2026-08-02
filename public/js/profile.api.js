//
//  profile.api.js (global version)
//  Works without <script type="module"> in Capacitor WebView
//
"use strict";

const API = "https://api-b.innerguideai.com";
const __API_DEBUG = false;

(function () {
  // ---- helpers ----
  function safeJSON(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async function readToken() {
    try {
      if (window.secureStore && typeof window.secureStore.get === "function") {
        return await window.secureStore.get("authToken");
      }
      return localStorage.getItem("authToken");
    } catch {
      return null;
    }
  }

  // Helper: get SecureStoragePlugin even in static /public builds
  function getSecureStoragePlugin() {
    const cap = window.Capacitor;
    if (!cap) return null;

    const plugins = cap.Plugins || {};

    // Normal path (already registered)
    if (plugins.SecureStoragePlugin) return plugins.SecureStoragePlugin;

    // Static path: manually register the bridge proxy
    if (typeof cap.registerPlugin === "function") {
      try {
        const p = cap.registerPlugin("SecureStoragePlugin");
        plugins.SecureStoragePlugin = p;
        cap.Plugins = plugins;
        return p;
      } catch (_) {
        return null;
      }
    }

    return null;
  }

  // ---- MAIN FETCH (global) ----
  async function apiFetch(path, options = {}) {
      // ------------------------------------------------------------
      // Device ID (Keychain) — guest + logged-in
      // Uses your existing window.secureStore (Keychain path)
      // Stores under key: "ig-device-id"
      // Adds header: X-IG-Device-Id
      // ------------------------------------------------------------

      function makeDeviceId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
        return String(Date.now()) + "-" + String(Math.random()).slice(2);
      }

      if (!apiFetch.__deviceIdPromise) {
        apiFetch.__deviceIdPromise = (async () => {
          const KEY = "ig-device-id";

          // 1) Keychain via secureStore (preferred)
          try {
            if (window.secureStore && typeof window.secureStore.get === "function") {
              const existing = await window.secureStore.get(KEY);
              if (existing && String(existing).length >= 16) return String(existing);

              const created = makeDeviceId();

              if (typeof window.secureStore.set === "function") {
                await window.secureStore.set(KEY, created);
                return created;
              }

              console.error("[deviceId] secureStore.set missing. Cannot persist device id to Keychain.");
              return null;
            }
          } catch (e) {
            console.error("[deviceId] secureStore get/set failed:", e);
          }

          // 2) TEMP fallback (only if secureStore missing)
          try {
            const LS_KEY = "ig-device-id-temp";
            const existingLS = localStorage.getItem(LS_KEY);
            if (existingLS && existingLS.length >= 16) return existingLS;

            const createdLS = makeDeviceId();
            localStorage.setItem(LS_KEY, createdLS);

            console.warn("[deviceId] Using TEMP localStorage fallback (secureStore unavailable).");
            return createdLS;
          } catch (_) {
            return null;
          }
        })();
      }

      const deviceId = await apiFetch.__deviceIdPromise;


    // ------------------------------------------------------------
    // Existing apiFetch logic (plus header)
    // ------------------------------------------------------------
      // ----------------------------------------------
      // Guest fix: backend 500s when userId=guest-... is sent as query param
      // Do NOT strip userId (count requires it).
      // Rewrite guest userId to a stable 24-hex id.
      // Uses localStorage["currentUserId"] (must be 24 hex chars).
      // ----------------------------------------------
      try {
        if (typeof path === "string" && path.indexOf("userId=") !== -1) {
          const u = new URL(path, API);
          const uid = u.searchParams.get("userId");

          // Only rewrite guest-... userIds
          if (uid && uid.indexOf("guest-") === 0) {
            const cid = (localStorage.getItem("currentUserId") || "").trim();
            const is24Hex = /^[a-f0-9]{24}$/i.test(cid);

            if (is24Hex) {
              u.searchParams.set("userId", cid);
              const rewritten = u.pathname + (u.search || "");
              path = rewritten;
            } else {
              console.warn("[apiFetch] guest userId present but currentUserId is not 24-hex. Keeping original:", uid);
            }
          }
        }
      } catch (_) {}


    const url = `${API}${path}`;
    const headers = new Headers(options.headers || {});
      
      // TEMP device id fallback: reuse existing guest user id if present
      try {
        if (!headers.has("X-IG-Device-Id")) {
          const guestId = localStorage.getItem("currentUserId");
          if (guestId && guestId.startsWith("guest-")) {
            headers.set("X-IG-Device-Id", guestId);
          }
        }
      } catch (_) {}

    const token = await readToken();

    if (token) headers.set("Authorization", `Bearer ${token}`);

  //  if (deviceId) headers.set("X-IG-Device-Id", deviceId);
      
  //  console.log("[deviceId] header set:", headers.has("X-IG-Device-Id"));

    if (__API_DEBUG) {
      console.groupCollapsed(`[api→] ${options.method || "GET"} ${path}`);
      console.log("origin:", location.origin);
      console.log("url:", url);
      console.log("credentials:", options.credentials || "include");
      console.log("hasToken:", !!token, token ? `(len=${String(token).length})` : "");
      console.log("Authorization header:", headers.has("Authorization"));
      console.log("hasDeviceId:", headers.has("X-IG-Device-Id"));
      console.log("Capacitor:", !!window.Capacitor, "cookieEnabled:", navigator.cookieEnabled);
      console.groupEnd();
    }

    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...options,
      headers,
    });

    if (__API_DEBUG) {
      console.groupCollapsed(`[api←] ${res.status} ${path}`);
      console.log("type:", res.type, "redirected:", res.redirected, "ok:", res.ok);
      console.log("responseURL:", res.url);
      console.log("set-cookie readable:", res.headers.get("set-cookie") !== null);
      console.groupEnd();
    }

    return res;
  }

  // ---- CACHE (global) ----
  function getCachedUser() {
    try {
      const raw = localStorage.getItem("currentUser");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setCachedUser(u) {
    try {
      localStorage.setItem("currentUser", JSON.stringify(u));
    } catch {}
  }

  // ---- USER FETCH (global) ----
  async function fetchAndCacheCurrentUser() {
    const res = await apiFetch("/api/me", { method: "GET" });
    const raw = ((await res.text()) || "").replace(/^\uFEFF/, "").trim();

    if (!res.ok) return null;

    const user = safeJSON(raw);
    if (user && user.id && !user._id) user._id = user.id;

    if (user && user._id) {
      setCachedUser(user);
      return user;
    }
    return null;
  }

    async function getCurrentUser() {
      // 1) cache
      const cached = getCachedUser();
      if (cached && (cached._id || cached.id)) {
        if (cached.id && !cached._id) cached._id = cached.id;
        return cached;
      }

      // 2) iOS guest fallback: use a stable 24-hex "device userId"
      // - backend accepts 24-hex IDs (we just tested)
      // - this avoids "guest-..." which causes 500s
      try {
        const cid = localStorage.getItem("currentUserId");
        if (cid && cid.length >= 12) {
          const minimal = { _id: cid, id: cid };
          setCachedUser(minimal);
          return minimal;
        }

        // If we have a deviceId in localStorage (TEMP fallback path), derive 24-hex
        const dev = localStorage.getItem("ig-device-id") || "";
        const hex = dev.replace(/[^a-fA-F0-9]/g, "").toLowerCase();

        // Build exactly 24 hex chars. If not enough, pad with zeros (still deterministic).
        const userId24 = (hex + "000000000000000000000000").slice(0, 24);

        if (userId24.length === 24) {
          localStorage.setItem("currentUserId", userId24);
          const minimal = { _id: userId24, id: userId24, isGuest: true };
          setCachedUser(minimal);
          return minimal;
        }
      } catch (_) {}

      // 3) server for non-iOS browsers
      if (!location.origin.startsWith("capacitor://")) {
        return await fetchAndCacheCurrentUser();
      }

      console.warn("[profile.api] iOS mode: no user found");
      return null;
    }


  // expose globals for non-module scripts
  window.apiFetch = apiFetch;
  window.getCachedUser = getCachedUser;
  window.setCachedUser = setCachedUser;
  window.fetchAndCacheCurrentUser = fetchAndCacheCurrentUser;
  window.getCurrentUser = getCurrentUser;
})();
