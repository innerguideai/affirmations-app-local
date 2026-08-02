// tests/specs/onboarding.spec.js
// UAT Area: Onboarding (items 12–17)

const Spec = require('../framework/spec');
const { assert, assertNotBlank, softAssert } = require('../helpers/assertions');
const ls = require('../helpers/localStorage');
const { NAV_WAIT_MS, PAGE_TIMEOUT_MS, LS_TOUR_DONE, LS_FREQUENCY } = require('../data/testConfig');
const OnboardingPage = require('../pages/onboarding.page');
const ProfilePage = require('../pages/profile.page');

const suite = new Spec('Onboarding');

// ── tests ──────────────────────────────────────────────────────────────────

// Item 12: Name screen appears → name saved to localStorage
suite.test('Name screen renders and saves name to localStorage', async driver => {
  await OnboardingPage.navigateToName(driver);

  const visible = await OnboardingPage.isNameScreenVisible(driver);
  assert(visible, 'Name screen did not render (nameContinue button not found)');

  const testName = 'TestUser';
  await OnboardingPage.fillName(driver, testName);
  await OnboardingPage.tapNameContinue(driver);
  await driver.pause(NAV_WAIT_MS);

  // Name should now be in localStorage
  const stored = await OnboardingPage.getStoredName(driver);
  softAssert(stored === testName, `Name not saved as "${testName}"; found: "${stored}"`);
});

// Item 13: Frequency screen renders → selection persists (ig_frequency)
suite.test('Frequency screen renders and saves selection to localStorage', async driver => {
  await OnboardingPage.navigateToFrequency(driver);

  const visible = await OnboardingPage.isFrequencyScreenVisible(driver);
  assert(visible, 'Frequency screen did not render — no [data-frequency] buttons found');

  await OnboardingPage.selectFrequency(driver, 'daily');
  await driver.pause(1000);

  const freq = await OnboardingPage.getStoredFrequency(driver);
  assert(freq === 'daily', `Expected ig_frequency="daily", got: "${freq}"`);
});

// Item 14: Path selection screen renders → tapping "Continue as guest" navigates
suite.test('Path selection screen renders and navigates on selection', async driver => {
  await OnboardingPage.navigateToPathSelection(driver);

  const visible = await OnboardingPage.isPathSelectionVisible(driver);
  assert(visible, 'Path selection screen did not render — chooseGuest button not found');

  // Tap guest to verify navigation happens
  await OnboardingPage.tapContinueAsGuest(driver);
  await driver.pause(NAV_WAIT_MS);

  // Should navigate away from pathselection
  const stillThere = await OnboardingPage.isPathSelectionVisible(driver);
  assert(!stillThere, 'Path selection did not navigate after tapping Continue as Guest');
});

// Item 15: First affirmation screen renders with content
suite.test('First affirmation screen renders with content', async driver => {
  // Set guest state so first affirmation can serve a local affirmation
  await ls.withWebView(driver, async d => {
    await d.execute(`
      localStorage.setItem('ig_auth_mode', 'guest');
      localStorage.setItem('ig_frequency', 'daily');
    `);
  });

  await OnboardingPage.navigateToFirstAffirmation(driver);
  await driver.pause(2000); // extra wait — page runs async emotion loading

  const visible = await OnboardingPage.isFirstAffirmationVisible(driver);
  assert(visible, 'First affirmation screen did not render — faChips element not found');

  // Select an emotion to trigger affirmation
  const chips = await ls.executeScript(driver,
    "return Array.from(document.querySelectorAll('#faChips .emotion-chip')).length"
  );
  assert(chips > 0, 'No emotion chips found on first affirmation screen');

  await ls.executeScript(driver, "document.querySelector('#faChips .emotion-chip')?.click()");
  await driver.pause(2000);

  const text = await OnboardingPage.getFirstAffirmationText(driver);
  softAssert(text.length > 0, 'First affirmation text is empty after emotion selection');
});

// Item 16: Tour overlay fires once on first use → Skip exits → ig_tour_done=1
suite.test('Tour fires on first use, Skip exits cleanly and sets ig_tour_done=1', async driver => {
  // Clear tour done flag to simulate first-time user
  await ls.removeItem(driver, LS_TOUR_DONE);
  await ls.navigateTo(driver, '/profile.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  const isTourVisible = await ProfilePage.isTourVisible(driver);
  softAssert(isTourVisible, 'Tour did not appear for first-time user (ig_tour_done was cleared)');

  if (isTourVisible) {
    await ProfilePage.tapTourSkip(driver);
    await driver.pause(1000);

    const stillVisible = await ProfilePage.isTourVisible(driver);
    assert(!stillVisible, 'Tour did not close after tapping Skip');

    const tourDone = await ls.getItem(driver, LS_TOUR_DONE);
    assert(tourDone === '1', `ig_tour_done should be "1" after Skip; got: "${tourDone}"`);
  }
});

// Item 17: Returning user does NOT see tour again
suite.test('Returning user (ig_tour_done=1) does not see tour', async driver => {
  await ls.setItem(driver, LS_TOUR_DONE, '1');
  await ls.navigateTo(driver, '/profile.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  const isTourVisible = await ProfilePage.isTourVisible(driver);
  assert(!isTourVisible, 'Tour appeared for a returning user (ig_tour_done=1)');
});

module.exports = suite;
