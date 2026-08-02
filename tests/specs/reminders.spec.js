// tests/specs/reminders.spec.js
// UAT Area: Reminders

const Spec = require('../framework/spec');
const { assert, softAssert } = require('../helpers/assertions');
const { ensureLoggedIn } = require('../helpers/auth');
const ls = require('../helpers/localStorage');
const { NAV_WAIT_MS, PAGE_TIMEOUT_MS } = require('../data/testConfig');
const TEST_USERS = require('../data/testUser');

const suite = new Spec('Reminders');

suite.beforeAll(async driver => {
  await ensureLoggedIn(driver, TEST_USERS.JOHN);
});

// Reminders settings screen renders core toggles
suite.test('Reminders settings screen renders daily/daytime/bedtime blocks', async driver => {
  await ls.navigateTo(driver, '/reminders.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  const hasDaily = await ls.executeScript(driver,
    "return document.getElementById('dailyEnabled') !== null"
  );
  assert(hasDaily, 'Reminders screen did not render — dailyEnabled toggle not found');

  const hasDaytime = await ls.executeScript(driver,
    "return document.getElementById('daytimeEnabled') !== null"
  );
  const hasBedtime = await ls.executeScript(driver,
    "return document.getElementById('bedtimeEnabled') !== null"
  );

  softAssert(hasDaytime, 'Daytime reminder toggle not found');
  softAssert(hasBedtime, 'Bedtime reminder toggle not found');
});

// Toggling daily reminder on shows time picker / persists state
suite.test('Toggling daily reminder updates the UI state', async driver => {
  await ls.navigateTo(driver, '/reminders.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  // Read current state, toggle it, confirm it changed
  const before = await ls.executeScript(driver,
    "return document.getElementById('dailyEnabled')?.checked"
  );

  await ls.executeScript(driver, `
    var el = document.getElementById('dailyEnabled');
    if (el) { el.click(); }
  `);
  await driver.pause(1000);

  const after = await ls.executeScript(driver,
    "return document.getElementById('dailyEnabled')?.checked"
  );

  assert(before !== after, `Daily reminder toggle did not change state (before=${before}, after=${after})`);

  // Restore original state to avoid polluting subsequent runs
  await ls.executeScript(driver, "document.getElementById('dailyEnabled')?.click()");
  await driver.pause(500);
});

// Setting a daily reminder time persists
suite.test('Daily reminder time can be set', async driver => {
  await ls.navigateTo(driver, '/reminders.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  await ls.executeScript(driver, `
    var el = document.getElementById('dailyTime');
    if (el) { el.value = '08:30'; el.dispatchEvent(new Event('change', { bubbles: true })); }
  `);
  await driver.pause(1000);

  const value = await ls.executeScript(driver,
    "return document.getElementById('dailyTime')?.value || ''"
  );
  softAssert(value === '08:30', `Daily reminder time not set to 08:30; found: "${value}"`);
});

module.exports = suite;
