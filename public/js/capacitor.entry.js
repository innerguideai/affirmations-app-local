//
//  capacitor.entry.js — AI Affirm
//
//  ES-module entry point bundled by esbuild into capacitor.bundle.js.
//  Exposes Capacitor plugins on window.IG so plain JS can access them.
//
//  Build: npx esbuild public/js/capacitor.entry.js --bundle
//           --outfile=public/js/capacitor.bundle.js
//           --format=iife --platform=browser
//

"use strict";

import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

window.IG = window.IG || {};
window.IG.LocalNotifications    = LocalNotifications;
window.IG.FirebaseAuthentication = FirebaseAuthentication;

console.log("[cap-bundle] FirebaseAuthentication loaded:", !!window.IG.FirebaseAuthentication);

// ── Cold-start / resume routing ─────────────────────────────────────────────
// Consume a pending route stored before the app was suspended, then navigate.

function consumePendingRouteOnce() {
  try {
    const route   = localStorage.getItem("ig_pending_route");
    const routeAt = localStorage.getItem("ig_pending_route_at");

    if (!route) return;

    localStorage.removeItem("ig_pending_route");

    // Expire after 60 s to avoid stale navigations
    if (routeAt && Date.now() - Number(routeAt) > 60_000) {
      localStorage.removeItem("ig_pending_route_at");
      return;
    }

    const current = window.location.href;
    console.log("[IG][ROUTE] consuming pending route ->", route);
    if (current !== route) window.location.replace(route);
  } catch (e) {
    console.log("[IG][ROUTE] consumePendingRouteOnce error:", e);
  }
}
consumePendingRouteOnce();

// ── Notification tap router ─────────────────────────────────────────────────
// Stores a pending route when a local notification is tapped, then navigates.

(function installNotifyTapRouter() {
  try {
    if (!window.IG?.LocalNotifications) {
      console.log("[IG][NOTIFY] tap router skipped: LocalNotifications missing");
      return;
    }

    window.IG.__notifyTapRouterInstalled = window.IG.__notifyTapRouterInstalled || false;
    if (window.IG.__notifyTapRouterInstalled) {
      console.log("[IG][NOTIFY] tap router already installed, skipping");
      return;
    }
    window.IG.__notifyTapRouterInstalled = true;

    console.log("[IG][NOTIFY] tap router installed");

    window.IG.LocalNotifications.addListener(
      "localNotificationActionPerformed",
      function (event) {
        try {
          const route = event?.notification?.extra?.ig_route || "/profile.html";
          console.log("[IG][NOTIFY] tapped → route:", route);

          localStorage.setItem("ig_pending_route",    route);
          localStorage.setItem("ig_pending_route_at", String(Date.now()));

          window.location.replace(route);
        } catch (e) {
          console.log("[IG][NOTIFY] handler error:", e);
          localStorage.setItem("ig_pending_route",    "/profile.html");
          localStorage.setItem("ig_pending_route_at", String(Date.now()));
          window.location.replace("/profile.html");
        }
      }
    );
  } catch (e) {
    console.log("[IG][NOTIFY] tap router install error:", e);
  }
})();

// ── Universal Link handler ──────────────────────────────────────────────────
// Handles password-reset deep links only.
// Google Sign-In is handled via @capacitor-firebase/authentication natively
// and never goes through a deep link redirect.

(function installUniversalLinkHandler() {
  try {
    if (!App) {
      console.log("[IG][DEEPLINK] App plugin not available");
      return;
    }

    console.log("[IG][DEEPLINK] installing appUrlOpen listener");

    App.addListener("appUrlOpen", function (event) {
      if (window.__IG_DEEPLINK_HANDLED__) return;
      window.__IG_DEEPLINK_HANDLED__ = true;

      try {
        const url = event?.url;
        if (!url) return;
        console.log("[IG][DEEPLINK] opened with url:", url);

        const parsed = new URL(url);

        // Email reset link: com.innerguideai.app://reset?token=...&email=...
        if (parsed.pathname.includes("reset.html")) {
          const token = parsed.searchParams.get("token") || "";
          const email = parsed.searchParams.get("email") || "";
          const route = "/reset.html?token=" + encodeURIComponent(token) +
                        "&email="            + encodeURIComponent(email);
          console.log("[IG][DEEPLINK] routing to reset page:", route);
          window.location.href = route;
        }

      } catch (e) {
        console.log("[IG][DEEPLINK] handler error:", e);
      }
    });
  } catch (e) {
    console.log("[IG][DEEPLINK] install error:", e);
  }
})();
