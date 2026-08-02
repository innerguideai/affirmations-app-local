// tests/specs/support.spec.js
// UAT Area: Support page
// BUG-0024: Stale reminder notification from a prior account opens support in
// fallback mode when the affirmationId belongs to a different (former) user.

const Spec = require('../framework/spec');
const { assert, softAssert } = require('../helpers/assertions');
const { ensureLoggedIn, clearAuthState } = require('../helpers/auth');
const ls = require('../helpers/localStorage');
const { NAV_WAIT_MS, PAGE_TIMEOUT_MS } = require('../data/testConfig');
const TEST_USERS = require('../data/testUser');

const suite = new Spec('Support');

suite.beforeAll(async driver => {
  await ensureLoggedIn(driver, TEST_USERS.JOHN);
});

// BUG-0024: Tapping a stale notification (baked with a foreign/non-existent
// affirmationId) while a different user is logged in must not silently render
// fallback content. The page should either display a graceful "not found" state
// or load a fresh affirmation for the current user — not silently show
// "Quick reset (guest mode)" fallback as if no session exists.
//
// This test simulates the exact route a Capacitor local notification would
// navigate to: /support.html?affirmationId=<stale_id>&source=daytime
// The stale ID is a syntactically valid but non-existent ObjectId that does
// not belong to the currently logged-in user (JOHN).
suite.test('BUG-0024: Stale affirmationId from prior account does not silently render guest fallback', async driver => {
  const staleAffirmationId = '000000000000000000000099'; // valid ObjectId format, non-existent

  await ls.navigateTo(driver, `/support.html?affirmationId=${staleAffirmationId}&source=daytime`);
  await driver.pause(PAGE_TIMEOUT_MS + 2000); // allow /api/me + daytime-reset calls to settle

  // Support page should recognise a valid logged-in session
  const supportWhy = await ls.executeScript(driver,
    "return document.getElementById('supportWhy')?.textContent?.trim() || ''"
  );

  // A silently-degraded guest fallback shows "Quick reset (guest mode)" — this
  // should NOT appear for a logged-in user arriving via a stale notification.
  assert(
    !supportWhy.includes('guest mode'),
    `BUG-0024: Support rendered guest-mode fallback ("${supportWhy}") for a logged-in user — stale affirmationId leaked into fallback path`
  );

  // The affirmation text line must be non-empty — either a fresh one for JOHN
  // or a graceful "not found" message, not a blank/empty render.
  const supportLine = await ls.executeScript(driver,
    "return document.getElementById('supportLine')?.textContent?.trim() || ''"
  );
  softAssert(
    supportLine.length > 0,
    'BUG-0024: supportLine is empty after loading with stale affirmationId — page may be blank'
  );
});

module.exports = suite;
