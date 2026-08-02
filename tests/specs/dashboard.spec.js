// tests/specs/dashboard.spec.js
// UAT Area: Dashboard & History (emotion dashboard, streaks)

const Spec = require('../framework/spec');
const { assert, softAssert, assertNoBlankScreen } = require('../helpers/assertions');
const { ensureLoggedIn } = require('../helpers/auth');
const ls = require('../helpers/localStorage');
const { NAV_WAIT_MS, PAGE_TIMEOUT_MS } = require('../data/testConfig');
const TEST_USERS = require('../data/testUser');

const suite = new Spec('Dashboard & History');

suite.beforeAll(async driver => {
  await ensureLoggedIn(driver, TEST_USERS.JOHN);
});

// Emotion dashboard renders content (or a graceful loading/error state)
suite.test('Emotion dashboard renders content for logged-in user', async driver => {
  await ls.navigateTo(driver, '/emotion-dashboard.html');
  await driver.pause(PAGE_TIMEOUT_MS + 2000); // dashboard does async data loading

  const state = await ls.executeScript(driver, `
    var content = document.getElementById('emotionDashboardContent');
    var loading = document.getElementById('emotionDashboardLoadingCard');
    var error   = document.getElementById('emotionDashboardErrorCard');
    if (content && !content.classList.contains('hidden')) return 'content';
    if (error && !error.classList.contains('hidden')) return 'error';
    if (loading && !loading.classList.contains('hidden')) return 'loading';
    return 'unknown';
  `);

  assert(state !== 'unknown', 'Emotion dashboard rendered no recognizable state (content/loading/error)');
  softAssert(state === 'content', `Emotion dashboard did not reach "content" state — stuck at: "${state}"`);
});

// KPI tiles populate with data (most-felt emotion, range, peak)
suite.test('Emotion dashboard KPI tiles populate', async driver => {
  await ls.navigateTo(driver, '/emotion-dashboard.html');
  await driver.pause(PAGE_TIMEOUT_MS + 2000);

  const mostFelt = await ls.executeScript(driver,
    "return document.getElementById('kpiMostFeltValue')?.textContent?.trim() || ''"
  );
  softAssert(mostFelt.length > 0 && mostFelt !== '—', `kpiMostFeltValue looks empty/placeholder: "${mostFelt}"`);
});

// My Streaks page renders streak values
suite.test('My Streaks page renders streak values for logged-in user', async driver => {
  await ls.navigateTo(driver, '/my-streaks.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  const hasCard = await ls.executeScript(driver,
    "return document.getElementById('streaksCard') !== null"
  );
  assert(hasCard, 'Streaks card not found on /my-streaks.html');

  const dailyVal = await ls.executeScript(driver,
    "return document.getElementById('dailyStreakVal')?.textContent?.trim() || ''"
  );
  softAssert(dailyVal.length > 0, 'dailyStreakVal is empty');
});

// Calendar navigation (prev/next month) works without error
suite.test('Streak calendar month navigation works', async driver => {
  await ls.navigateTo(driver, '/my-streaks.html');
  await driver.pause(PAGE_TIMEOUT_MS);

  const before = await ls.executeScript(driver,
    "return document.getElementById('monthTitle')?.textContent?.trim() || ''"
  );

  await ls.executeScript(driver, "document.getElementById('prevMonthBtn')?.click()");
  await driver.pause(800);

  const after = await ls.executeScript(driver,
    "return document.getElementById('monthTitle')?.textContent?.trim() || ''"
  );

  softAssert(before !== after, `Month title did not change after tapping prev (before="${before}", after="${after}")`);
});

// BUG-0025: Monthly insight card must show a saved affirmation even when
// the backend monthlyInsight.affirmation is null — client-side fallback via
// /api/affirmations should fill the gap.
suite.test('BUG-0025: Monthly insight card shows affirmation via fallback when backend returns null', async driver => {
  await ls.navigateTo(driver, '/emotion-dashboard.html');
  await driver.pause(PAGE_TIMEOUT_MS + 3000); // allow async data + fallback fetch

  // Check monthly insight card is present
  const cardPresent = await ls.executeScript(driver,
    "return document.getElementById('monthlyInsightCard') !== null && " +
    "!document.getElementById('monthlyInsightCard').classList.contains('hidden')"
  );

  if (!cardPresent) {
    // Card may be hidden for users with no monthly data — soft fail
    softAssert(false, 'BUG-0025: monthlyInsightCard not visible — user may have no monthly data; skip affirmation check');
    return;
  }

  // Expand the card if collapsed
  await ls.executeScript(driver, `
    var collapsed = document.getElementById('monthlyInsightCollapsed');
    if (collapsed && !collapsed.classList.contains('hidden')) {
      var card = document.getElementById('monthlyInsightCard');
      if (card) card.click();
    }
  `);
  await driver.pause(800);

  // The affirmation text element should be non-empty (either from backend or fallback)
  const resetText = await ls.executeScript(driver,
    "return document.getElementById('monthlyInsightReset')?.textContent?.trim() || ''"
  );

  softAssert(
    resetText.length > 0 && resetText !== 'No saved reset found for this pattern yet',
    `BUG-0025: Monthly insight shows no affirmation (text: "${resetText}") — fallback did not fire or JOHN has no saved affirmations`
  );
});

// BUG-0045 Issue 1: opening Insights repeatedly must not silently inflate
// the top emotion's check-in count. Root cause was routes/affirmations.js
// logging an emotion whenever the monthly-insight fallback fetch fired.
suite.test('BUG-0045 Issue 1: repeated Insights loads do not inflate top-emotion count', async driver => {
  await ls.navigateTo(driver, '/emotion-dashboard.html');
  await driver.pause(PAGE_TIMEOUT_MS + 3000);

  const before = await ls.executeScript(driver,
    "return document.getElementById('kpiMostFeltMeta')?.textContent?.trim() || ''"
  );

  // Reload Insights 3 more times with no emotion selection in between —
  // this is exactly the sequence that used to add +1 per load.
  for (let i = 0; i < 3; i++) {
    await ls.navigateTo(driver, '/emotion-dashboard.html');
    await driver.pause(PAGE_TIMEOUT_MS + 3000);
  }

  const after = await ls.executeScript(driver,
    "return document.getElementById('kpiMostFeltMeta')?.textContent?.trim() || ''"
  );

  assert(
    before === after,
    `BUG-0045: top-emotion check-in count changed after repeated Insights loads with no emotion selection (before="${before}", after="${after}")`
  );
});

// BUG-0045 Issue 2: positive top emotion shows reinforcement copy and hides
// the Practice button; negative/neutral emotions keep the original behavior.
// Self-adapting — checks whichever emotion is actually top for this account.
suite.test('BUG-0045 Issue 2: positive vs negative top emotion renders correct Insights copy', async driver => {
  await ls.navigateTo(driver, '/emotion-dashboard.html');
  await driver.pause(PAGE_TIMEOUT_MS + 3000);

  const POSITIVE_EMOTIONS = new Set([
    'calm', 'grateful', 'hopeful', 'focused', 'excited',
    'happy', 'joyful', 'peaceful', 'relaxed', 'confident',
    'proud', 'content', 'optimistic', 'motivated', 'inspired',
    'energized', 'connected', 'loved', 'supported', 'accomplished'
  ]);

  const topEmotion = (await ls.executeScript(driver,
    "return document.getElementById('kpiMostFeltValue')?.textContent?.trim().toLowerCase() || ''"
  ));

  if (!topEmotion || topEmotion === '—') {
    softAssert(false, 'BUG-0045 Issue 2: no top emotion available this run — skip positive/negative branch check');
    return;
  }

  const practiceHidden = await ls.executeScript(driver,
    "return document.getElementById('monthlyInsightPracticeBtn')?.hidden === true"
  );
  const tipsLabel = await ls.executeScript(driver,
    "return document.getElementById('monthlyInsightTipsLabel')?.textContent?.trim() || ''"
  );
  const affirmationText = await ls.executeScript(driver,
    "return document.getElementById('monthlyInsightReset')?.textContent?.trim() || ''"
  );

  if (POSITIVE_EMOTIONS.has(topEmotion)) {
    assert(practiceHidden, `Practice button should be hidden for positive top emotion "${topEmotion}"`);
    assert(tipsLabel === 'Build on this', `Tips label should read "Build on this" for positive emotion, got "${tipsLabel}"`);
    assert(
      affirmationText === `"I can create more moments that help me feel ${topEmotion}."`,
      `Affirmation text should match the fixed positive template, got: ${affirmationText}`
    );
  } else {
    assert(!practiceHidden, `Practice button should be visible for negative/neutral top emotion "${topEmotion}"`);
    assert(tipsLabel === 'Try this:', `Tips label should read "Try this:" for non-positive emotion, got "${tipsLabel}"`);
  }
});

module.exports = suite;
