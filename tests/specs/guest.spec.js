// tests/specs/guest.spec.js
// UAT Area: Guest Mode
// Per android/CLAUDE.md guest rules:
//   - Guest if ig_auth_mode === "guest" OR currentUser.isGuest === true
//   - Do NOT call /api/emotions/top in guest mode
//   - Hide star ratings in guest mode
//   - Hide Top 3 UI in guest mode

const Spec = require('../framework/spec');
const { assert, softAssert, assertNotBlank } = require('../helpers/assertions');
const { ensureGuestMode } = require('../helpers/auth');
const { detectScreen } = require('../helpers/screen');
const ls = require('../helpers/localStorage');
const ProfilePage = require('../pages/profile.page');
const { NAV_WAIT_MS, PAGE_TIMEOUT_MS, LS_AUTH_MODE } = require('../data/testConfig');

const suite = new Spec('Guest Mode');

suite.beforeAll(async driver => {
  await ensureGuestMode(driver);
});

suite.beforeEach(async driver => {
  await ProfilePage.navigateToProfile(driver);
  await driver.pause(1500);
});

// Guest mode loads profile without forcing login
suite.test('Guest mode reaches profile without forced login', async driver => {
  const onProfile = await ProfilePage.isVisible(driver, PAGE_TIMEOUT_MS);
  assert(onProfile, 'Guest mode did not reach profile screen');

  const mode = await ls.getItem(driver, LS_AUTH_MODE);
  assert(mode === 'guest', `Expected ig_auth_mode="guest", got: "${mode}"`);
});

// Guest can select an emotion and get an affirmation (local/offline path)
suite.test('Guest can select an emotion and receive an affirmation', async driver => {
  await ProfilePage.tapEmotion(driver, 'calm');
  await driver.pause(2500);

  // Resolve any context overlay first
  const hasOverlay = await ls.executeScript(driver, `
    var o = document.getElementById('contextOverlay');
    return !!(o && !o.classList.contains('hidden'));
  `);
  if (hasOverlay) {
    await ls.executeScript(driver, "document.querySelector('#contextOptions1 .context-option')?.click()");
    await driver.pause(1200);
    const hasQ2 = await ls.executeScript(driver, `
      var b = document.getElementById('contextQuestionBlock2');
      return !!(b && !b.classList.contains('hidden'));
    `);
    if (hasQ2) {
      await ls.executeScript(driver, "document.querySelector('#contextOptions2 .context-option')?.click()");
      await driver.pause(1200);
    }
  }

  const text = await ProfilePage.getAffirmationText(driver);
  softAssert(text.length > 0, 'Guest did not receive affirmation text after selecting an emotion');
});

// Star ratings should be HIDDEN in guest mode
suite.test('Star ratings are hidden in guest mode', async driver => {
  await ProfilePage.tapEmotion(driver, 'sad');
  await driver.pause(2500);

  const starVisible = await ls.executeScript(driver, `
    var sr = document.getElementById('starRating');
    return !!(sr && !sr.classList.contains('hidden') && sr.offsetParent !== null);
  `);

  assert(!starVisible, 'Star rating is visible in guest mode — should be hidden per guest rules');
});

// Top 3 UI should be HIDDEN in guest mode
suite.test('Top 3 emotions UI is hidden in guest mode', async driver => {
  const top3Visible = await ls.executeScript(driver, `
    var el = document.getElementById('topEmotionsContainer') || document.getElementById('topEmotionsSection');
    return !!(el && !el.classList.contains('hidden') && el.offsetParent !== null);
  `);

  assert(!top3Visible, 'Top 3 emotions UI is visible in guest mode — should be hidden per guest rules');
});

// Guest sees a path to create an account / convert
suite.test('Guest sees an option to create an account', async driver => {
  await ls.navigateTo(driver, '/account.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  const hasCreateAccount = await ls.executeScript(driver,
    "return document.getElementById('createOrAccount') !== null || document.getElementById('row-create-or-account') !== null"
  );
  softAssert(hasCreateAccount, '"Create an account" option not found for guest user on account screen');
});

module.exports = suite;
