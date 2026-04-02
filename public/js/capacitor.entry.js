//
//  capacitor.entry.js
//
//  Created by Ritu Sharma on 1/9/26.
//

// public/js/capacitor.entry.js
"use strict";

// Import the plugin the “Capacitor v7+” way (bundled)
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";

// Put it somewhere your plain JS can access
window.IG = window.IG || {};
window.IG.LocalNotifications = LocalNotifications;

// Optional log so you can confirm the bundle loaded
console.log("[cap-bundle] LocalNotifications loaded:", !!window.IG.LocalNotifications);

// ------------------------------
// 1) Cold-start / resume routing (consume pending route once)
// ------------------------------
function consumePendingRouteOnce() {
  try {
    const route = localStorage.getItem("ig_pending_route");
    const routeAt = localStorage.getItem("ig_pending_route_at");

    console.log("[IG][ROUTE] consumePendingRouteOnce:start", {
      route,
      routeAt,
      href: window.location.href,
      pathname: window.location.pathname,
      ig_auth_mode: localStorage.getItem("ig_auth_mode"),
      currentUserRaw: localStorage.getItem("currentUser"),
      ts: new Date().toISOString()
    });

    if (!route) return;

    localStorage.removeItem("ig_pending_route");
    const current = window.location.href;

    console.log("[IG][ROUTE] consumePendingRouteOnce:after-remove", {
      route,
      current,
      ig_auth_mode: localStorage.getItem("ig_auth_mode"),
      currentUserRaw: localStorage.getItem("currentUser"),
      ts: new Date().toISOString()
    });

    if (current === route) return;

    console.log("[IG][ROUTE] consuming pending route ->", route, {
      ig_auth_mode: localStorage.getItem("ig_auth_mode"),
      currentUserRaw: localStorage.getItem("currentUser"),
      ts: new Date().toISOString()
    });

    window.location.replace(route);
  } catch (e) {
    console.log("[IG][ROUTE] consumePendingRouteOnce error:", e);
  }
}
consumePendingRouteOnce();

// ------------------------------
// 2) Notification tap router (persist route + attempt immediate redirect)
// ------------------------------
(function installNotifyTapRouter() {
  try {
    if (!window.IG || !window.IG.LocalNotifications) {
      console.log("[IG][NOTIFY] tap router skipped: LocalNotifications missing");
      return;
    }

    // Strong guard: survives multiple page scripts in same webview session
    window.IG = window.IG || {};
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

          console.log("[IG][NOTIFY] tapped:event", {
            event,
            derivedRoute: route,
            hrefBefore: window.location.href,
            pathnameBefore: window.location.pathname,
            ig_auth_mode: localStorage.getItem("ig_auth_mode"),
            currentUserRaw: localStorage.getItem("currentUser"),
            ts: new Date().toISOString()
          });

          localStorage.setItem("ig_pending_route", route);
          localStorage.setItem("ig_pending_route_at", String(Date.now()));

          console.log("[IG][NOTIFY] tapped:after-store", {
            pendingRoute: localStorage.getItem("ig_pending_route"),
            pendingRouteAt: localStorage.getItem("ig_pending_route_at"),
            ig_auth_mode: localStorage.getItem("ig_auth_mode"),
            currentUserRaw: localStorage.getItem("currentUser"),
            ts: new Date().toISOString()
          });

          window.location.replace(route);
        } catch (e) {
          console.log("[IG][NOTIFY] handler error:", e, {
            ig_auth_mode: localStorage.getItem("ig_auth_mode"),
            currentUserRaw: localStorage.getItem("currentUser"),
            ts: new Date().toISOString()
          });

          localStorage.setItem("ig_pending_route", "/profile.html");
          localStorage.setItem("ig_pending_route_at", String(Date.now()));

          console.log("[IG][NOTIFY] fallback route stored", {
            pendingRoute: localStorage.getItem("ig_pending_route"),
            pendingRouteAt: localStorage.getItem("ig_pending_route_at"),
            ig_auth_mode: localStorage.getItem("ig_auth_mode"),
            currentUserRaw: localStorage.getItem("currentUser"),
            ts: new Date().toISOString()
          });

          window.location.replace("/profile.html");
        }
      }
    );
  } catch (e) {
    console.log("[IG][NOTIFY] tap router install error:", e);
  }
})();

// ------------------------------
// 3) Universal link handler (password reset)
// ------------------------------
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

        // Match reset link
        if (parsed.pathname.includes("reset.html")) {

          const token = parsed.searchParams.get("token") || "";
          const email = parsed.searchParams.get("email") || "";

          const route =
            "/reset.html?token=" +
            encodeURIComponent(token) +
            "&email=" +
            encodeURIComponent(email);

          console.log("[IG][DEEPLINK] routing to local reset page:", route);
          // IMPORTANT: do NOT use router or pending route storage
          // directly navigate the WebView to the server page

          window.location.href = route;

          return;
        }

      } catch (e) {
        console.log("[IG][DEEPLINK] handler error:", e);
      }
    });
  } catch (e) {
    console.log("[IG][DEEPLINK] install error:", e);
  }
})();