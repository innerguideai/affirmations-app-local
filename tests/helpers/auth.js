// tests/helpers/auth.js
// Canonical auth state helpers.
// call ensureLoggedIn / ensureGuestMode at the top of any spec that needs auth.

const ls = require('./localStorage');
const { detectScreen, waitForScreen, getCurrentPath } = require('./screen');
const { savePageSource } = require('./debug');
const { NAV_WAIT_MS, LOGIN_TIMEOUT_MS, LS_AUTH_MODE, LS_AUTH_TOKEN,
        LS_CURRENT_USER, LS_CURRENT_USER_ID, SHORT_PAUSE_MS } = require('../data/testConfig');
const TEST_USERS = require('../data/testUser');

// A stable 24-hex guest ID used across all guest-mode tests.
const GUEST_ID = 'bbbbbb000000000000000001';

async function ensureLoggedIn(driver, user = TEST_USERS.JOHN) {
  // Check the actual auth state directly via localStorage FIRST — independent
  // of which page we're currently on. This matters for two reasons:
  //  1. Some logged-in pages (e.g. /my-streaks.html) aren't recognized by
  //     detectScreen() as 'profile' (it returns 'unknown'), so a screen-only
  //     check misses an already-authenticated session.
  //  2. login.html redirects an already-authenticated account-mode user
  //     straight back to /profile.html (even with ?allowLogin=1). If we
  //     navigate there anyway, the loginForm-wait below times out because
  //     the app bounces us right back to /profile.html.
  const existingMode = await ls.getItem(driver, LS_AUTH_MODE);
  const existingToken = await ls.getItem(driver, LS_AUTH_TOKEN);
  if (existingMode === 'account' && existingToken) {
    const screen = await detectScreen(driver);
    if (screen !== 'profile') {
      await ls.navigateTo(driver, '/profile.html');
      await driver.pause(NAV_WAIT_MS);
    }
    return;
  }

  // Not authenticated — navigate to login if not already there.
  // Use ?allowLogin=1 — login.js calls clearPendingVerify() on this param,
  // which bypasses the pendingVerify redirect gate left by signup tests.
  const screen = await detectScreen(driver);
  if (screen !== 'login') {
    await ls.navigateTo(driver, '/login.html?allowLogin=1');
    await driver.pause(NAV_WAIT_MS);
  }

  // Wait for loginForm to be present in the WebView DOM (~8 s max)
  let formReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const exists = await ls.executeScript(driver,
        "return document.getElementById('loginForm') !== null && document.getElementById('email') !== null"
      );
      if (exists) { formReady = true; break; }
    } catch (_) {}
    await driver.pause(400);
  }
  if (!formReady) {
    const actualScreen = await detectScreen(driver);
    const path = await getCurrentPath(driver);
    await savePageSource(driver, 'ensureLoggedIn-loginform-not-found.xml');
    throw new Error(
      `ensureLoggedIn: loginForm not found in WebView after waiting ` +
      `(screen: ${actualScreen}, path: ${path})`
    );
  }

  // Fill credentials and submit entirely via JS — native setValue on WebView inputs
  // is unreliable because XCUITest events don't always reach the WebView DOM value.
  // login.js reads emailEl.value / passEl.value at submit time, so setting .value
  // before dispatching the submit event is the correct approach.
  await ls.executeScript(driver, `
    var emailEl = document.getElementById('email');
    var passEl  = document.getElementById('password');
    if (emailEl) emailEl.value = ${JSON.stringify(user.email)};
    if (passEl)  passEl.value  = ${JSON.stringify(user.password)};
    var form = document.getElementById('loginForm');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  `);

  // Wait up to 30 s — dev backend can be slow and login.js also calls /api/me after login
  const loaded = await waitForScreen(driver, 'profile', 30000);
  if (!loaded) {
    const actual = await detectScreen(driver);
    // Check loginStatus for a server-side error message
    let statusMsg = '';
    try {
      statusMsg = await ls.executeScript(driver,
        "return document.getElementById('loginStatus')?.textContent?.trim() || ''"
      );
    } catch (_) {}
    throw new Error(
      `ensureLoggedIn: profile not reached for ${user.email} ` +
      `(screen: ${actual}${statusMsg ? ', status: ' + statusMsg : ''})`
    );
  }
}

async function ensureGuestMode(driver) {
  // Inject minimal guest state into localStorage, then navigate to profile.
  const guestUser = JSON.stringify({ isGuest: true, _id: GUEST_ID });

  await ls.withWebView(driver, async d => {
    await d.execute(`
      localStorage.setItem('ig_auth_mode', 'guest');
      localStorage.setItem('currentUserId', '${GUEST_ID}');
      localStorage.setItem('currentUser', '${guestUser.replace(/'/g, "\\'")}');
      localStorage.removeItem('authToken');
    `);
    await d.execute("window.location.href = '/profile.html'");
  });

  await driver.pause(NAV_WAIT_MS);
}

async function clearAuthState(driver) {
  // Clear auth keys AND pending-verify gate — signup tests leave pendingVerify=1
  // which causes login.html to redirect away before the form renders.
  const keys = [
    LS_AUTH_TOKEN, LS_AUTH_MODE, LS_CURRENT_USER, LS_CURRENT_USER_ID,
    'pendingVerify', 'pendingVerifyEmail'
  ];
  for (const key of keys) {
    await ls.removeItem(driver, key);
  }
}

async function getAuthToken(driver) {
  return ls.getItem(driver, LS_AUTH_TOKEN);
}

module.exports = { ensureLoggedIn, ensureGuestMode, clearAuthState, getAuthToken, GUEST_ID };
