// tests/specs/account.spec.js
// UAT Area: Account & Support

const Spec = require('../framework/spec');
const { assert, assertNotBlank, softAssert, assertNoBlankScreen } = require('../helpers/assertions');
const { ensureLoggedIn } = require('../helpers/auth');
const { detectScreen } = require('../helpers/screen');
const ls = require('../helpers/localStorage');
const { NAV_WAIT_MS, PAGE_TIMEOUT_MS } = require('../data/testConfig');
const TEST_USERS = require('../data/testUser');

const suite = new Spec('Account & Support');

suite.beforeAll(async driver => {
  await ensureLoggedIn(driver, TEST_USERS.JOHN);
});

// Account screen renders core settings rows
suite.test('Account screen renders settings rows', async driver => {
  await ls.navigateTo(driver, '/account.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  const hasLogout = await ls.executeScript(driver,
    "return document.getElementById('logoutBtn') !== null"
  );
  assert(hasLogout, 'Account screen did not render — logoutBtn not found');

  const hasStreaks = await ls.executeScript(driver,
    "return document.getElementById('row-streaks') !== null"
  );
  softAssert(hasStreaks, 'Streaks row not found on account screen');
});

// Tapping "My Streaks" navigates to streak/calendar view
suite.test('My Streaks row navigates to streak calendar', async driver => {
  await ls.navigateTo(driver, '/account.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  await ls.executeScript(driver, "document.getElementById('row-streaks')?.click()");
  await driver.pause(NAV_WAIT_MS);

  const hasStreakCard = await ls.executeScript(driver,
    "return document.getElementById('dailyStreakVal') !== null || document.getElementById('streaksCard') !== null"
  );
  softAssert(hasStreakCard, 'Streak calendar elements not found after tapping My Streaks');
});

// Help screen → Contact support
suite.test('Help screen renders and Contact Support is reachable', async driver => {
  await ls.navigateTo(driver, '/help.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  const hasContact = await ls.executeScript(driver,
    "return document.getElementById('contactSupportBtn') !== null"
  );
  assert(hasContact, 'Help screen did not render — contactSupportBtn not found');
});

// Privacy/Terms links present (not validating destination — just presence)
suite.test('Legal links (Privacy, Terms) are present on account screen', async driver => {
  await ls.navigateTo(driver, '/account.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  const hasPrivacy = await ls.executeScript(driver,
    "return document.getElementById('privacyLink') !== null"
  );
  const hasTerms = await ls.executeScript(driver,
    "return document.getElementById('termsLink') !== null"
  );

  assert(hasPrivacy, 'Privacy link not found on account screen');
  assert(hasTerms, 'Terms link not found on account screen');
});

// Delete account → confirmation modal appears (do NOT confirm deletion)
suite.test('Delete account shows confirmation modal (not executed)', async driver => {
  await ls.navigateTo(driver, '/account.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  await ls.executeScript(driver, "document.getElementById('deleteAccountBtn')?.click()");
  await driver.pause(1000);

  const modalVisible = await ls.executeScript(driver, `
    var m = document.getElementById('deleteAccountModal');
    if (!m) return false;
    var cs = window.getComputedStyle(m);
    return m.style.display !== 'none' && cs.display !== 'none';
  `);
  softAssert(modalVisible, 'Delete account modal did not appear');

  // Cancel — never confirm deletion in automated tests
  if (modalVisible) {
    await ls.executeScript(driver, "document.getElementById('cancelDeleteBtn')?.click()");
    await driver.pause(500);
  }
});

module.exports = suite;
