// tests/specs/smoke.spec.js
// Smoke: app launches, WDA is responsive, and either profile or login renders.
// Run first — if this fails, nothing else in the suite is meaningful.

const Spec = require('../framework/spec');
const { assert, assertNoBlankScreen } = require('../helpers/assertions');
const { detectScreen } = require('../helpers/screen');
const { savePageSource } = require('../helpers/debug');
const { APP_LOAD_MS, PAGE_TIMEOUT_MS } = require('../data/testConfig');

const suite = new Spec('Smoke');

// WDA can occasionally hand back its own runner window right after session
// start instead of the app. Retry detectScreen briefly instead of failing fast.
async function waitForWDA(driver, timeoutMs = PAGE_TIMEOUT_MS) {
  const start = Date.now();
  let lastScreen = 'unknown';

  while (Date.now() - start < timeoutMs) {
    lastScreen = await detectScreen(driver);
    if (lastScreen === 'profile' || lastScreen === 'login' || lastScreen === 'welcome') return lastScreen;
    await driver.pause(800);
  }
  return lastScreen;
}

suite.test('App launches and shows profile, login, or welcome screen', async driver => {
  await driver.pause(APP_LOAD_MS);

  const screen = await waitForWDA(driver, PAGE_TIMEOUT_MS);

  if (screen !== 'profile' && screen !== 'login' && screen !== 'welcome') {
    await savePageSource(driver, 'smoke-unknown-screen.xml');
  }

  assert(
    screen === 'profile' || screen === 'login' || screen === 'welcome',
    `App did not land on profile, login, or welcome after launch — detected: "${screen}"`
  );
});

suite.test('WebView context is reachable and renders visible content', async driver => {
  await assertNoBlankScreen(driver);
});

module.exports = suite;
