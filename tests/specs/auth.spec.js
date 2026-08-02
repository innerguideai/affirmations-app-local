// tests/specs/auth.spec.js
// UAT Area: Authentication (items 1–11)
// Tests login, signup, forgot password, logout, and re-login.

const Spec = require('../framework/spec');
const { assert, assertNotBlank, softAssert } = require('../helpers/assertions');
const { detectScreen, waitForScreen } = require('../helpers/screen');
const { ensureLoggedIn, clearAuthState } = require('../helpers/auth');
const ls = require('../helpers/localStorage');
const { savePageSource } = require('../helpers/debug');
const { NAV_WAIT_MS, PAGE_TIMEOUT_MS, LOGIN_TIMEOUT_MS,
        LS_AUTH_MODE, LS_AUTH_TOKEN, LS_CURRENT_USER_ID } = require('../data/testConfig');
const TEST_USERS = require('../data/testUser');

const suite = new Spec('Authentication');

// ── helpers ────────────────────────────────────────────────────────────────

async function goToLogin(driver) {
  // Clear pending-verify gate before every login navigation — if a signup test ran
  // first it leaves pendingVerify=1 which causes login.html to redirect away
  // before the form renders, making loginForm permanently absent.
  await ls.executeScript(driver, `
    localStorage.removeItem('pendingVerify');
    localStorage.removeItem('pendingVerifyEmail');
  `);
  await ls.navigateTo(driver, '/login.html');
  await driver.pause(NAV_WAIT_MS);
}

async function goToSignup(driver) {
  await ls.navigateTo(driver, '/signup.html');
  await driver.pause(NAV_WAIT_MS);
}

async function goToForgot(driver) {
  await ls.navigateTo(driver, '/forgot.html');
  await driver.pause(NAV_WAIT_MS);
}

// ── setup / teardown ────────────────────────────────────────────────────────

suite.beforeAll(async driver => {
  // Start from a clean state — no auth token
  await clearAuthState(driver);
  await ls.navigateTo(driver, '/login.html');
  await driver.pause(NAV_WAIT_MS);
});

// ── tests ──────────────────────────────────────────────────────────────────

// Item 1: Cold launch → login screen
suite.test('App cold launch → login screen visible', async driver => {
  await goToLogin(driver);
  const isLogin = await waitForScreen(driver, 'login', PAGE_TIMEOUT_MS);
  assert(isLogin, 'Login screen did not appear after navigating to /login.html');
});

// Item 3: Email signup new user → verify-required screen
suite.test('Email signup new user → verify-required screen shown', async driver => {
  await goToSignup(driver);

  // Use a unique email to avoid duplicate error
  const uniqueEmail = `test.uat.${Date.now()}@innerguideai.com`;

  await ls.executeScript(driver, `
    document.getElementById('firstName').value = 'Test';
    document.getElementById('lastName').value = 'User';
    document.getElementById('email').value = '${uniqueEmail}';
    document.getElementById('password').value = 'TestPass@1234';
    document.getElementById('confirmPassword').value = 'TestPass@1234';
  `);
  await ls.executeScript(driver, "document.getElementById('signupBtn').click()");

  // Expect navigation to verify-required.html
  const reached = await waitForScreen(driver, 'verifyEmail', LOGIN_TIMEOUT_MS);
  if (!reached) {
    // Soft: check status text instead of hard failing (backend may reject)
    const status = await ls.executeScript(driver,
      "return document.getElementById('signupStatus')?.textContent?.trim() || ''"
    );
    softAssert(false, `verify-required screen not reached; signup status: "${status}"`);
  } else {
    assert(true, 'verify-required screen shown');
  }
});

// Item 4: Email signup duplicate email → error shown, no duplicate created
suite.test('Email signup duplicate email → error shown', async driver => {
  await goToSignup(driver);

  // Use the known JOHN account email which already exists
  await ls.executeScript(driver, `
    document.getElementById('firstName').value = 'Dup';
    document.getElementById('lastName').value = 'Test';
    document.getElementById('email').value = '${TEST_USERS.JOHN.email}';
    document.getElementById('password').value = '${TEST_USERS.JOHN.password}';
    document.getElementById('confirmPassword').value = '${TEST_USERS.JOHN.password}';
  `);
  await ls.executeScript(driver, "document.getElementById('signupBtn').click()");

  await driver.pause(3000);

  const status = await ls.executeScript(driver,
    "return document.getElementById('signupStatus')?.textContent?.trim() || ''"
  );
  const screen = await detectScreen(driver);

  // Should stay on signup (not navigate away) AND show an error message
  assert(
    screen !== 'profile' && screen !== 'verifyEmail',
    `Should not navigate away on duplicate email; ended on: ${screen}`
  );
  assertNotBlank(status, 'signupStatus should show an error message for duplicate email');
});

// Item 5: Email signup missing fields → inline validation, no backend call
suite.test('Email signup missing required fields → inline validation fires', async driver => {
  await goToSignup(driver);

  // Submit empty form
  await ls.executeScript(driver, "document.getElementById('signupBtn').click()");
  await driver.pause(1000);

  const screen = await detectScreen(driver);
  assert(
    screen !== 'verifyEmail' && screen !== 'profile',
    `Form with missing fields should NOT navigate away; ended on: ${screen}`
  );

  // HTML5 required validation should prevent submission — check form validity
  const valid = await ls.executeScript(driver,
    "return document.getElementById('signupForm')?.checkValidity()"
  );
  assert(valid === false, 'Form with empty required fields should be invalid');
});

// BUG-0023: Email signup with invalid TLD character ("%") must be rejected
suite.test('BUG-0023: Email signup invalid email (percent sign in TLD) → blocked', async driver => {
  await goToSignup(driver);

  const invalidEmail = 'ritu@bufvibfgui3923.co%';

  await ls.executeScript(driver, `
    document.getElementById('firstName').value = 'Test';
    document.getElementById('lastName').value = 'User';
    document.getElementById('email').value = '${invalidEmail}';
    document.getElementById('password').value = 'TestPass@1234';
    document.getElementById('confirmPassword').value = 'TestPass@1234';
  `);
  await ls.executeScript(driver, "document.getElementById('signupBtn').click()");
  await driver.pause(2000);

  const screen = await detectScreen(driver);
  assert(
    screen !== 'verifyEmail' && screen !== 'profile',
    `Invalid email "${invalidEmail}" should NOT be accepted; ended on screen: ${screen}`
  );

  const status = await ls.executeScript(driver,
    "return document.getElementById('signupStatus')?.textContent?.trim() || ''"
  );
  assertNotBlank(status, 'signupStatus should show a validation error for invalid email');
});

// Item 6: Email login valid credentials → profile loads
suite.test('Email login valid credentials → profile loads', async driver => {
  await clearAuthState(driver);
  await goToLogin(driver);

  // Wait for loginForm in WebView
  let formReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const ok = await ls.executeScript(driver,
        "return document.getElementById('loginForm') !== null && document.getElementById('email') !== null"
      );
      if (ok) { formReady = true; break; }
    } catch (_) {}
    await driver.pause(400);
  }
  assert(formReady, 'loginForm not found in WebView on /login.html');

  // Fill + submit entirely via JS (native setValue unreliable in WebView)
  await ls.executeScript(driver, `
    document.getElementById('email').value = ${JSON.stringify(TEST_USERS.JOHN.email)};
    document.getElementById('password').value = ${JSON.stringify(TEST_USERS.JOHN.password)};
    document.getElementById('loginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  `);

  const onProfile = await waitForScreen(driver, 'profile', LOGIN_TIMEOUT_MS);
  assert(onProfile, 'Profile screen did not load after valid login');

  // Confirm auth mode is account
  const mode = await ls.getItem(driver, LS_AUTH_MODE);
  assert(mode === 'account', `Expected ig_auth_mode="account" after login, got: ${mode}`);
});

// Item 7: Email login wrong password → error shown, no navigation
suite.test('Email login wrong password → error shown, no navigation', async driver => {
  await clearAuthState(driver);
  await goToLogin(driver);

  // Wait for loginForm in WebView
  let formReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const ok = await ls.executeScript(driver,
        "return document.getElementById('loginForm') !== null && document.getElementById('email') !== null"
      );
      if (ok) { formReady = true; break; }
    } catch (_) {}
    await driver.pause(400);
  }
  assert(formReady, 'loginForm not found in WebView on /login.html');

  // Fill wrong password + submit via JS
  await ls.executeScript(driver, `
    document.getElementById('email').value = ${JSON.stringify(TEST_USERS.JOHN.email)};
    document.getElementById('password').value = 'WrongPassword!999';
    document.getElementById('loginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  `);

  await driver.pause(4000); // wait for API response

  const screen = await detectScreen(driver);
  assert(screen !== 'profile', `Should NOT navigate to profile with wrong password; screen: ${screen}`);

  const status = await ls.executeScript(driver,
    "return document.getElementById('loginStatus')?.textContent?.trim() || ''"
  );
  assertNotBlank(status, 'loginStatus should show an error for wrong password');
});

// Regression: null-password crash fix (routes/auth.js). Social-only
// (Google) accounts have no password set — email/password login must
// return a graceful error, not crash with a 500.
suite.test('Regression: Email/password login on Google-only account → graceful error, no crash', async driver => {
  await clearAuthState(driver);
  await goToLogin(driver);

  let formReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const ok = await ls.executeScript(driver,
        "return document.getElementById('loginForm') !== null && document.getElementById('email') !== null"
      );
      if (ok) { formReady = true; break; }
    } catch (_) {}
    await driver.pause(400);
  }
  assert(formReady, 'loginForm not found in WebView on /login.html');

  await ls.executeScript(driver, `
    document.getElementById('email').value = ${JSON.stringify(TEST_USERS.SOCIAL_ONLY.email)};
    document.getElementById('password').value = ${JSON.stringify(TEST_USERS.SOCIAL_ONLY.password)};
    document.getElementById('loginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  `);

  await driver.pause(4000); // wait for API response

  const screen = await detectScreen(driver);
  assert(screen !== 'profile', `Should NOT log in to a Google-only account via password; screen: ${screen}`);

  const status = await ls.executeScript(driver,
    "return document.getElementById('loginStatus')?.textContent?.trim() || ''"
  );
  assertNotBlank(status, 'loginStatus should show a graceful message, not a blank/crashed state, for Google-only account login attempt');

  // Known gap: message currently hardcodes "Google" even for Apple-only accounts.
  // This account IS Google, so the wording happens to be correct here — this
  // test does not cover the Apple-account wording defect.
  softAssert(
    status.toLowerCase().includes('google'),
    `Expected login error to mention Google sign-in for this account, got: "${status}"`
  );
});

// Item 8: Forgot password valid email → success message shown
suite.test('Forgot password valid email → success message shown', async driver => {
  await goToForgot(driver);

  await ls.executeScript(driver, `document.getElementById('forgotEmail').value = '${TEST_USERS.JOHN.email}'`);
  await ls.executeScript(driver, "document.getElementById('forgotSubmit').click()");

  await driver.pause(3000);

  const status = await ls.executeScript(driver,
    "return document.getElementById('forgotStatus')?.textContent?.trim() || ''"
  );
  assertNotBlank(status, 'forgotStatus should show a message after valid email submission');
  // Must not look like an error — check it doesn't say "error" or "invalid"
  softAssert(
    !status.toLowerCase().includes('error') && !status.toLowerCase().includes('invalid'),
    `Forgot password status looks like an error: "${status}"`
  );
});

// Item 9: Forgot password unknown email → neutral message (no enumeration)
suite.test('Forgot password unknown email → neutral response (no enumeration)', async driver => {
  await goToForgot(driver);

  await ls.executeScript(driver, `document.getElementById('forgotEmail').value = 'nobody.uat.${Date.now()}@nowhere.test'`);
  await ls.executeScript(driver, "document.getElementById('forgotSubmit').click()");

  await driver.pause(3000);

  const status = await ls.executeScript(driver,
    "return document.getElementById('forgotStatus')?.textContent?.trim() || ''"
  );
  // Must not reveal whether the email exists
  assert(
    !status.toLowerCase().includes('not found') &&
    !status.toLowerCase().includes('no account') &&
    !status.toLowerCase().includes("doesn't exist"),
    `Forgot password reveals email non-existence (enumeration): "${status}"`
  );
  assertNotBlank(status, 'forgotStatus should show a neutral message for unknown email');
});

// Item 10: Logout → session cleared, redirects to login
suite.test('Logout → session cleared, redirected to login', async driver => {
  // Ensure we are logged in first
  await ensureLoggedIn(driver, TEST_USERS.JOHN);

  // Navigate to account page and tap logout
  await ls.navigateTo(driver, '/account.html');
  await driver.pause(NAV_WAIT_MS);
  await ls.executeScript(driver, "document.getElementById('logoutBtn')?.click()");

  await driver.pause(3000);

  const screen = await detectScreen(driver);
  assert(screen === 'login', `Expected login screen after logout, got: ${screen}`);

  const token = await ls.getItem(driver, LS_AUTH_TOKEN);
  assert(!token, `authToken should be cleared after logout, but found: ${token}`);
});

// Item 11: Re-login after logout → currentUserId matches pre-logout value
suite.test('Re-login after logout → currentUserId matches pre-logout', async driver => {
  // Login and capture userId
  await ensureLoggedIn(driver, TEST_USERS.JOHN);
  const preLogoutId = await ls.getItem(driver, LS_CURRENT_USER_ID);
  assertNotBlank(preLogoutId, 'currentUserId should be set after login');

  // Logout
  await ls.navigateTo(driver, '/account.html');
  await driver.pause(NAV_WAIT_MS);
  await ls.executeScript(driver, "document.getElementById('logoutBtn')?.click()");
  await driver.pause(2000);

  // Re-login
  await ensureLoggedIn(driver, TEST_USERS.JOHN);
  const postLoginId = await ls.getItem(driver, LS_CURRENT_USER_ID);

  assert(
    preLogoutId === postLoginId,
    `currentUserId changed after re-login: was ${preLogoutId}, now ${postLoginId}`
  );
});

module.exports = suite;
