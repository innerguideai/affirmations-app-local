//
//  secure.store.js
//  
//
//  Created by Ritu Potnis on 11/13/25.
//


// /js/secure.store.js
// Simple secureStore wrapper:
// - On native iOS (Capacitor) tries SecureStoragePlugin
// - Else falls back to localStorage

"use strict";

(function initSecureStore() {
  const hasCapacitor = typeof window !== "undefined" && !!window.Capacitor;
  const plugins = hasCapacitor ? (window.Capacitor.Plugins || {}) : {};

  // Try common plugin names (Capawesome / other)
  const NativeSecure =
    plugins.SecureStoragePlugin ||
    plugins.SecureStorage ||
    null;

  if (NativeSecure) {
    console.log("[secure] backend: native");
  } else {
    console.log("[secure] backend: localStorage");
  }

  async function lsGet(key) {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? v : null;
    } catch {
      return null;
    }
  }

  async function lsSet(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // ignore quota errors
    }
  }

  async function lsRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  async function nativeGet(key) {
    try {
      if (!NativeSecure || !NativeSecure.get) return null;
      const res = await NativeSecure.get({ key });
      return (res && typeof res.value !== "undefined") ? res.value : null;
    } catch {
      return null;
    }
  }

  async function nativeSet(key, value) {
    try {
      if (!NativeSecure || !NativeSecure.set) return;
      await NativeSecure.set({ key, value: String(value) });
    } catch {
      // ignore
    }
  }

  async function nativeRemove(key) {
    try {
      if (!NativeSecure || !NativeSecure.remove) return;
      await NativeSecure.remove({ key });
    } catch {
      // ignore
    }
  }

  window.secureStore = {
    async get(key) {
      if (NativeSecure) return nativeGet(key);
      return lsGet(key);
    },
    async set(key, value) {
      if (NativeSecure) return nativeSet(key, value);
      return lsSet(key, value);
    },
    async remove(key) {
      if (NativeSecure) return nativeRemove(key);
      return lsRemove(key);
    }
  };

  // quick self-test (non-blocking)
  (async () => {
    try {
      const probeKey = "__secure_probe__";
      await window.secureStore.set(probeKey, "1");
      const v = await window.secureStore.get(probeKey);
      await window.secureStore.remove(probeKey);
      console.log("[secure] probe ok:", v === "1");
    } catch (e) {
      console.warn("[secure] probe failed:", e);
    }
  })();
})();
