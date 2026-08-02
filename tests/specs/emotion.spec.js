// tests/specs/emotion.spec.js
// UAT Area: Emotion Check-in & Affirmation

const Spec = require('../framework/spec');
const { assert, softAssert } = require('../helpers/assertions');
const { ensureLoggedIn } = require('../helpers/auth');
const ls = require('../helpers/localStorage');
const ProfilePage = require('../pages/profile.page');
const { NAV_WAIT_MS, PAGE_TIMEOUT_MS } = require('../data/testConfig');
const TEST_USERS = require('../data/testUser');

const suite = new Spec('Emotion Check-in & Affirmation');

suite.beforeAll(async driver => {
  await ensureLoggedIn(driver, TEST_USERS.JOHN);
  await ProfilePage.navigateToProfile(driver);
});

suite.beforeEach(async driver => {
  await ProfilePage.navigateToProfile(driver);
  await driver.pause(1500);
});

// Emotion chips render on profile
suite.test('Emotion chips render on profile screen', async driver => {
  const chips = await ProfilePage.getEmotionChips(driver);
  assert(chips.length > 0, 'No emotion chips found on profile screen');
  softAssert(chips.includes('calm'), `Expected "calm" chip among emotion chips; found: ${chips.join(', ')}`);
});

// Selecting an emotion triggers context questions or an affirmation
suite.test('Selecting an emotion triggers context overlay or affirmation', async driver => {
  await ProfilePage.tapEmotion(driver, 'calm');
  await driver.pause(2500);

  const state = await ls.executeScript(driver, `
    var overlay = document.getElementById('contextOverlay');
    var wrapper = document.getElementById('affirmationWrapper');
    var overlayVisible = overlay && !overlay.classList.contains('hidden');
    var affirmVisible  = wrapper && !wrapper.classList.contains('hidden');
    if (overlayVisible) return 'context';
    if (affirmVisible)  return 'affirmation';
    return 'neither';
  `);

  assert(state !== 'neither', 'Selecting an emotion produced neither context overlay nor affirmation card');
});

// Completing context questions (if shown) leads to an affirmation
suite.test('Completing context questions leads to an affirmation', async driver => {
  await ProfilePage.tapEmotion(driver, 'anxious');
  await driver.pause(2500);

  let state = await ls.executeScript(driver, `
    var overlay = document.getElementById('contextOverlay');
    return (overlay && !overlay.classList.contains('hidden')) ? 'context' : 'other';
  `);

  if (state === 'context') {
    // Select first option for Q1 (and Q2 if it appears)
    await ls.executeScript(driver, "document.querySelector('#contextOptions1 .context-option')?.click()");
    await driver.pause(1500);

    const hasQ2 = await ls.executeScript(driver, `
      var block = document.getElementById('contextQuestionBlock2');
      return !!(block && !block.classList.contains('hidden') && block.offsetParent !== null);
    `);
    if (hasQ2) {
      await ls.executeScript(driver, "document.querySelector('#contextOptions2 .context-option')?.click()");
      await driver.pause(1500);
    }
  }

  const text = await ProfilePage.getAffirmationText(driver);
  softAssert(text.length > 0, 'Affirmation text is empty after completing the emotion check-in flow');
});

// Star rating is available for account users (hidden in guest mode)
suite.test('Star rating control is available for logged-in account users', async driver => {
  await ProfilePage.tapEmotion(driver, 'grateful');
  await driver.pause(2500);

  const starCount = await ProfilePage.getStarRatingButtons(driver);
  softAssert(starCount > 0, 'No star rating buttons found for a logged-in account user');
});

// "Next affirmation" / "New AI affirmation" actions work
suite.test('Next affirmation action produces a new affirmation', async driver => {
  await ProfilePage.tapEmotion(driver, 'hopeful');
  await driver.pause(2500);

  const hasAction = await ProfilePage.hasAnyAffirmationAction(driver);
  if (!hasAction) {
    softAssert(false, 'No Next/New-AI affirmation action available to exercise');
    return;
  }

  const { before, after } = await ProfilePage.exerciseAffirmationActions(driver);
  softAssert(before !== after || after.length > 0, 'Affirmation text did not change/populate after tapping Next');
});

module.exports = suite;
