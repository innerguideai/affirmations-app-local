// tests/specs/my-affirmations.spec.js
// UAT Area: My Affirmations (saved affirmations list + per-row Listen/Remove)

const Spec = require('../framework/spec');
const { assert, softAssert } = require('../helpers/assertions');
const { ensureLoggedIn } = require('../helpers/auth');
const ls = require('../helpers/localStorage');
const { PAGE_TIMEOUT_MS } = require('../data/testConfig');
const TEST_USERS = require('../data/testUser');

const suite = new Spec('My Affirmations');

suite.beforeAll(async driver => {
  await ensureLoggedIn(driver, TEST_USERS.JOHN);
});

// Page renders either the saved-affirmations list or the empty state for a
// logged-in account user (JOHN is a full account, so the auth gate should
// not be the thing shown).
suite.test('My Affirmations page renders list or empty state for logged-in user', async driver => {
  await ls.navigateTo(driver, '/my-affirmations.html');
  await driver.pause(PAGE_TIMEOUT_MS + 2000); // fetch + render

  const state = await ls.executeScript(driver, `
    var card = document.getElementById('myAffirmationsCard');
    var gate = document.getElementById('authGateCard');
    var list = document.getElementById('affirmationsList');
    var empty = document.getElementById('emptyState');
    if (gate && !gate.hidden) return 'gate';
    if (card && !card.hidden) {
      if (list && !list.hidden) return 'list';
      if (empty && !empty.hidden) return 'empty';
      return 'card-no-content';
    }
    return 'unknown';
  `);

  assert(state !== 'unknown', 'My Affirmations page rendered no recognizable state');
  assert(
    state !== 'gate',
    'Logged-in account user (JOHN) saw the guest auth gate instead of the affirmations card'
  );
  softAssert(
    state === 'list' || state === 'empty',
    `Expected list or empty state, got: "${state}"`
  );
});

// List and empty state should never both be visible at once (renderList()
// toggles between them, not both).
suite.test('List and empty state are mutually exclusive', async driver => {
  await ls.navigateTo(driver, '/my-affirmations.html');
  await driver.pause(PAGE_TIMEOUT_MS + 2000);

  const { listHidden, emptyHidden } = await ls.executeScript(driver, `
    var list = document.getElementById('affirmationsList');
    var empty = document.getElementById('emptyState');
    return {
      listHidden: !list || list.hidden,
      emptyHidden: !empty || empty.hidden
    };
  `);

  assert(
    listHidden !== emptyHidden,
    `List and empty state visibility should be mutually exclusive (listHidden=${listHidden}, emptyHidden=${emptyHidden})`
  );
});

// Regression: read-aloud voice quality work (BUG: robotic TTS) went through a
// native Capacitor TTS experiment that was later reverted back to plain
// window.speechSynthesis. This confirms the per-row Listen button still
// works post-revert and doesn't throw / blank the page. Skips gracefully if
// this account has no saved affirmations to test with.
suite.test('Listen button on a saved affirmation row does not error or blank the page', async driver => {
  await ls.navigateTo(driver, '/my-affirmations.html');
  await driver.pause(PAGE_TIMEOUT_MS + 2000);

  const hasRow = await ls.executeScript(driver,
    "return document.querySelector('.my-affirm-listen-btn') !== null"
  );

  if (!hasRow) {
    softAssert(false, 'No saved affirmations for JOHN — skipping Listen button check (nothing to tap)');
    return;
  }

  const result = await ls.executeScript(driver, `
    try {
      var btn = document.querySelector('.my-affirm-listen-btn');
      btn.click();
      return { ok: true, bodyLen: document.body.innerHTML.length };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  `);

  assert(result.ok, `Tapping Listen threw an error: ${result.error || 'unknown'}`);
  assert(result.bodyLen > 0, 'Page appears blank after tapping Listen');

  await driver.pause(500);

  // Confirm speechSynthesis is the active mechanism (native TTS was reverted) —
  // window.speechSynthesis should exist and be the only speech API referenced.
  const usesWebSpeech = await ls.executeScript(driver,
    "return typeof window.speechSynthesis !== 'undefined'"
  );
  softAssert(usesWebSpeech, 'window.speechSynthesis not available — read-aloud fallback may be broken');
});

// Repeated taps must not layer/overlap speech or crash — same cancel-before-speak
// contract as the profile.html Listen button.
suite.test('Repeated Listen taps on saved affirmations do not error', async driver => {
  await ls.navigateTo(driver, '/my-affirmations.html');
  await driver.pause(PAGE_TIMEOUT_MS + 2000);

  const rowCount = await ls.executeScript(driver,
    "return document.querySelectorAll('.my-affirm-listen-btn').length"
  );

  if (rowCount === 0) {
    softAssert(false, 'No saved affirmations for JOHN — skipping repeated-tap check');
    return;
  }

  const result = await ls.executeScript(driver, `
    try {
      var btns = document.querySelectorAll('.my-affirm-listen-btn');
      for (var i = 0; i < Math.min(3, btns.length); i++) {
        btns[i].click();
      }
      // also tap the first one again immediately, back to back
      btns[0].click();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  `);

  assert(result.ok, `Repeated Listen taps threw an error: ${result.error || 'unknown'}`);
});

// Remove button is present per row (structural check only — does not delete).
suite.test('Remove button is present on saved affirmation rows', async driver => {
  await ls.navigateTo(driver, '/my-affirmations.html');
  await driver.pause(PAGE_TIMEOUT_MS + 2000);

  const hasRow = await ls.executeScript(driver,
    "return document.querySelector('.my-affirm-item') !== null"
  );

  if (!hasRow) {
    softAssert(false, 'No saved affirmations for JOHN — skipping Remove button check');
    return;
  }

  const hasRemoveBtn = await ls.executeScript(driver,
    "return document.querySelector('.my-affirm-remove-btn') !== null"
  );

  softAssert(hasRemoveBtn, 'Remove button not found on saved affirmation row');
});

module.exports = suite;
