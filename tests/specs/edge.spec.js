// tests/specs/edge.spec.js
// UAT Area: Edge Cases (items 55–57)

const Spec = require('../framework/spec');
const { assert, softAssert, assertNoBlankScreen } = require('../helpers/assertions');
const { ensureLoggedIn, clearAuthState } = require('../helpers/auth');
const ls = require('../helpers/localStorage');
const { detectScreen, waitForScreen } = require('../helpers/screen');
const { savePageSource } = require('../helpers/debug');
const {
  PAGE_TIMEOUT_MS, NAV_WAIT_MS, BUNDLE_ID,
  LS_AUTH_TOKEN, LS_AUTH_MODE
} = require('../data/testConfig');
const TEST_USERS = require('../data/testUser');

const suite = new Spec('Edge Cases');

suite.beforeAll(async driver => {
  await ensureLoggedIn(driver, TEST_USERS.JOHN);
});

// Test 56 deliberately leaves an invalid authToken + ig_auth_mode='account' in
// localStorage to exercise token-expiry handling. With noReset:true/autoLaunch:false,
// that corrupted state (and the "Account Not Found" error screen it produces)
// persists into the NEXT `npm test` invocation's app launch — causing Smoke to
// detect "signup" (the error screen has a "Sign Up" link). Clean up here so the
// next run starts from a known-good /login.html screen.
suite.afterAll(async driver => {
  await clearAuthState(driver);
  await ls.navigateTo(driver, '/login.html?allowLogin=1');
  await driver.pause(NAV_WAIT_MS);
});

// Item 55: Background then foreground → no blank screen, no re-login
suite.test('App returns from background without blank screen or forced re-login', async driver => {
  // Ensure we are on profile first
  await ls.navigateTo(driver, '/profile.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  // Send app to background for 3 seconds
  await driver.background(3);

  // App comes back (background() auto-restores)
  await driver.pause(1500);

  await assertNoBlankScreen(driver);

  const screen = await detectScreen(driver);
  // Acceptable: profile (best), login (acceptable), unknown (log and warn)
  if (screen === 'login') {
    softAssert(false, 'App forced re-login after background/foreground — expected to stay on profile');
  } else if (screen === 'unknown') {
    await savePageSource(driver, 'edge-background-unknown.xml');
    softAssert(false, `App shows unknown screen after background/foreground`);
  } else {
    assert(true, 'App returned from background without blank screen');
  }
});

// Item 56: Token expiry → /api/me 401 → clean redirect to login
suite.test('Expired/invalid token causes clean redirect to login', async driver => {
  // Inject an invalid token so /api/me returns 401
  await ls.withWebView(driver, async d => {
    await d.execute(`
      localStorage.setItem('authToken', 'invalid.expired.token.xyz');
      localStorage.setItem('ig_auth_mode', 'account');
    `);
    await d.execute("window.location.href = '/profile.html'");
  });

  await driver.pause(PAGE_TIMEOUT_MS + 2000);

  const screen = await detectScreen(driver);

  if (screen === 'profile') {
    // Profile might still render from cache — check if /api/me was called
    // Soft check: if it stayed on profile with invalid token that's acceptable for offline mode
    softAssert(false, 'App stayed on profile with invalid token — token expiry not handled via redirect');
  } else if (screen === 'login') {
    assert(true, 'App correctly redirected to login on token expiry');
  } else {
    softAssert(false, `Unexpected screen after token expiry: "${screen}"`);
  }
});

// Item 57: Bad route → /error.html not blank
suite.test('/error.html renders (not blank white screen)', async driver => {
  await ls.navigateTo(driver, '/error.html');
  await driver.pause(NAV_WAIT_MS);

  await assertNoBlankScreen(driver);

  // error.html should have more than just boilerplate
  const bodyText = await ls.executeScript(driver,
    "return document.body?.innerText?.trim() || ''"
  );
  softAssert(bodyText.length > 10, `error.html body text too short: "${bodyText.substring(0, 100)}"`);
});

module.exports = suite;
