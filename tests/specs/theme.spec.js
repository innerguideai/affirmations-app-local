// tests/specs/theme.spec.js
// UAT Area: Theme (covers theme picker, persistence, and apply-on-profile)

const Spec = require('../framework/spec');
const { assert, softAssert } = require('../helpers/assertions');
const { ensureLoggedIn } = require('../helpers/auth');
const { waitForScreen } = require('../helpers/screen');
const ls = require('../helpers/localStorage');
const { NAV_WAIT_MS, PAGE_TIMEOUT_MS } = require('../data/testConfig');
const TEST_USERS = require('../data/testUser');

const suite = new Spec('Theme');

suite.beforeAll(async driver => {
  await ensureLoggedIn(driver, TEST_USERS.JOHN);
});

// Theme picker renders tiles
suite.test('Theme picker renders available theme tiles', async driver => {
  await ls.navigateTo(driver, '/theme.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  const tileCount = await ls.executeScript(driver,
    "return document.querySelectorAll('.theme-tile[data-theme]').length"
  );
  assert(tileCount > 0, 'No theme tiles found on /theme.html');
});

// Selecting a theme persists to localStorage (ig_theme) and applies on profile
suite.test('Selecting a theme saves to localStorage and persists on profile', async driver => {
  // Clear any previously saved theme so the test starts clean
  await ls.executeScript(driver, "localStorage.removeItem('ig_theme')");

  await ls.navigateTo(driver, '/theme.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  // Click the "Use" button inside the winter tile.
  // theme.html uses event delegation on document for `.theme-action[data-use]` buttons
  // (NOT `.theme-tile[data-theme]`). Clicking the tile article is silently ignored.
  // After saving, the handler auto-navigates to /profile.html in 120ms.
  await ls.executeScript(driver,
    "document.querySelector('.theme-action[data-use=\"ig-theme-winter\"]')?.click()"
  );

  // Wait for the auto-navigation to profile (120ms delay in theme.html)
  const onProfile = await waitForScreen(driver, 'profile', PAGE_TIMEOUT_MS);
  softAssert(onProfile, 'Did not navigate to profile after selecting theme');

  // Verify localStorage saved the right theme
  const stored = await ls.getItem(driver, 'ig_theme');
  assert(stored === 'ig-theme-winter', `Expected ig_theme="ig-theme-winter", got: "${stored}"`);

  // Confirm the theme class is applied to <body> or <html>
  const applied = await ls.executeScript(driver, `
    var b = document.body, h = document.documentElement;
    return (b && b.className.includes('ig-theme-winter')) ||
           (h && h.className.includes('ig-theme-winter'));
  `);
  softAssert(applied, 'ig-theme-winter class not applied to <body>/<html> on profile after selection');

  // Reset back to default so other tests aren't affected
  await ls.navigateTo(driver, '/theme.html');
  await driver.pause(PAGE_TIMEOUT_MS);
  await ls.executeScript(driver,
    "document.querySelector('.theme-action[data-use=\"ig-theme-default\"]')?.click()"
  );
  await driver.pause(1500);
});

module.exports = suite;
