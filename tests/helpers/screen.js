// tests/helpers/screen.js
// Screen detection: resolves what page is currently visible.
// Uses native accessibility labels (fast) plus JS URL checks for WebView screens.

const ls = require('./localStorage');
const { NAV_WAIT_MS } = require('../data/testConfig');

// Native accessibility signals for each screen.
// These must match aria-label / button text exposed in the native XCUITest tree.
// For WebView screens where no reliable native signal exists, use JS URL detection.
const SCREEN_SIGNALS = {
  login:         ['Login'],             // XCUIElementTypeButton name="Login"
  signup:        ['Sign Up'],
  forgotPw:      ['Forgot password?'],
  verifyEmail:   ['Resend verification email'],
};

// JS-based URL signals for screens that live entirely in the WebView.
// Checked via window.location.pathname when native signals are inconclusive.
const JS_URL_SIGNALS = {
  welcome:       '/welcome.html',
  profile:       '/profile.html',
  name:          '/name.html',
  frequency:     '/frequency.html',
  pathselection: '/pathselection.html',
  reminders:     '/reminders.html',
  theme:         '/theme.html',
  account:       '/account.html',
  streaks:       '/streaks.html',
  dashboard:     '/dashboard.html',
  firstaffirmation: '/firstaffirmation.html',
  verifyEmail:   '/verify-required.html',
};

async function elementExists(driver, label) {
  try {
    const els = await driver.$$(`~${label}`);
    return els.length > 0;
  } catch (_) {
    return false;
  }
}

// Check current WebView URL path — returns '' on error
async function getCurrentPath(driver) {
  try {
    const path = await ls.executeScript(driver, 'return window.location.pathname');
    return path || '';
  } catch (_) {
    return '';
  }
}

async function detectScreen(driver) {
  // 1. Fast native checks (no context switch needed)
  const priority = ['login', 'signup', 'verifyEmail'];
  for (const name of priority) {
    if (await elementExists(driver, SCREEN_SIGNALS[name][0])) return name;
  }

  // 2. Check remaining native signals
  for (const [name, signals] of Object.entries(SCREEN_SIGNALS)) {
    if (priority.includes(name)) continue;
    if (await elementExists(driver, signals[0])) return name;
  }

  // 3. JS URL check — covers all WebView-only screens
  const path = await getCurrentPath(driver);
  if (path) {
    for (const [name, urlPart] of Object.entries(JS_URL_SIGNALS)) {
      if (path.includes(urlPart.replace('.html', ''))) return name;
    }
  }

  return 'unknown';
}

async function waitForScreen(driver, screenName, timeoutMs = NAV_WAIT_MS) {
  const start = Date.now();

  // Native signal screens (with optional JS URL fallback for WebView
  // screens where the native accessibility label may not match exactly)
  if (SCREEN_SIGNALS[screenName]) {
    const signal = SCREEN_SIGNALS[screenName][0];
    const urlPart = JS_URL_SIGNALS[screenName];
    const pathFragment = urlPart ? urlPart.replace('.html', '') : null;
    while (Date.now() - start < timeoutMs) {
      if (await elementExists(driver, signal)) return true;
      if (pathFragment) {
        const path = await getCurrentPath(driver);
        if (path && path.includes(pathFragment)) return true;
      }
      await driver.pause(400);
    }
    return false;
  }

  // JS URL screens (profile, account, etc.)
  const urlPart = JS_URL_SIGNALS[screenName];
  if (urlPart) {
    const pathFragment = urlPart.replace('.html', '');
    while (Date.now() - start < timeoutMs) {
      const path = await getCurrentPath(driver);
      if (path && path.includes(pathFragment)) return true;
      await driver.pause(500);
    }
    return false;
  }

  throw new Error(`Unknown screen name: ${screenName}`);
}

module.exports = { detectScreen, waitForScreen, elementExists, getCurrentPath };
