// tests/specs/profile.spec.js
// UAT Area: Profile / Home

const Spec = require('../framework/spec');
const { assert, assertNotBlank, softAssert } = require('../helpers/assertions');
const { ensureLoggedIn } = require('../helpers/auth');
const { waitForScreen } = require('../helpers/screen');
const ls = require('../helpers/localStorage');
const ProfilePage = require('../pages/profile.page');
const { NAV_WAIT_MS, PAGE_TIMEOUT_MS } = require('../data/testConfig');
const TEST_USERS = require('../data/testUser');

const suite = new Spec('Profile / Home');

suite.beforeAll(async driver => {
  await ensureLoggedIn(driver, TEST_USERS.JOHN);
});

suite.beforeEach(async driver => {
  await ProfilePage.navigateToProfile(driver);
  await driver.pause(1500);
});

// Profile renders greeting + emotion grid for a logged-in user
suite.test('Profile screen renders greeting and emotion grid', async driver => {
  const onProfile = await ProfilePage.isVisible(driver, PAGE_TIMEOUT_MS);
  assert(onProfile, 'Profile screen did not render (URL did not reach /profile.html)');

  const greeting = await ProfilePage.getGreeting(driver);
  assertNotBlank(greeting, 'Greeting line is empty on profile screen');

  const chips = await ProfilePage.getEmotionChips(driver);
  assert(chips.length > 0, 'No emotion chips rendered on profile screen');
});

// Streak value renders for logged-in user
suite.test('Streak value renders on profile for logged-in user', async driver => {
  const streak = await ProfilePage.getStreakValue(driver);
  softAssert(streak.length > 0, 'Streak value is empty on profile screen');
});

// Profile menu button opens navigation (account/menu)
suite.test('Profile menu button opens navigation menu', async driver => {
  const before = await ls.executeScript(driver,
    "return document.querySelectorAll('.profile-menu-button, .menu-open, [aria-expanded=\"true\"]').length"
  );

  await ls.executeScript(driver, "document.getElementById('profile-menu-btn')?.click()");
  await driver.pause(1000);

  const after = await ls.executeScript(driver, `
    return document.body.innerText.toLowerCase().includes('account') ||
           document.body.innerText.toLowerCase().includes('settings') ||
           document.body.innerText.toLowerCase().includes('logout') ||
           window.location.pathname.includes('account');
  `);

  softAssert(after, 'Tapping the profile menu button did not surface a recognizable menu/navigation');
});

// Support banner can be dismissed
suite.test('Support banner can be dismissed if shown', async driver => {
  const visible = await ProfilePage.isSupportBannerVisible(driver);
  if (!visible) {
    softAssert(true, 'Support banner not shown — nothing to dismiss (acceptable)');
    return;
  }

  await ProfilePage.dismissSupportBanner(driver);
  await driver.pause(800);

  const stillVisible = await ProfilePage.isSupportBannerVisible(driver);
  assert(!stillVisible, 'Support banner did not dismiss after tapping close');
});

// Theme toggle button is present and tappable
suite.test('Theme toggle is present on profile screen', async driver => {
  const exists = await ls.executeScript(driver,
    "return document.getElementById('themeToggleButton') !== null"
  );
  softAssert(exists, 'themeToggleButton not found on profile screen');
});

module.exports = suite;
