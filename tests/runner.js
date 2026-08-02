// tests/runner.js
// Entry point for the UAT suite. Boots one Appium/WebDriverIO session,
// runs the requested suites against it, and prints a final summary table.
//
// Usage:
//   node tests/runner.js              → run all suites
//   node tests/runner.js auth         → run just the Authentication suite
//   node tests/runner.js auth onboarding → run multiple named suites
//
// Suite name → spec file mapping is derived from tests/specs/<name>.spec.js

const path = require('path');
const { remote } = require('webdriverio');
const cfg = require('./data/testConfig');

// Order matters — auth must run before suites that depend on a logged-in session,
// and onboarding/guest before suites that assume fresh localStorage state.
const SUITE_ORDER = [
  'smoke',
  'auth',
  'onboarding',
  'profile',
  'emotion',
  'dashboard',
  'my-affirmations',
  'reminders',
  'theme',
  'account',
  'guest',
  'support',
  'edge'
];

function loadSuite(name) {
  try {
    return require(path.join(__dirname, 'specs', `${name}.spec.js`));
  } catch (err) {
    console.log(`  (skipping "${name}" — no spec file found: ${err.message})`);
    return null;
  }
}

function resolveSuiteNames(argv) {
  const requested = argv.slice(2).map(s => s.toLowerCase());
  if (requested.length === 0) return SUITE_ORDER;
  return SUITE_ORDER.filter(name => requested.includes(name));
}

async function buildDriver() {
  const opts = {
    hostname: cfg.APPIUM_HOST,
    port: cfg.APPIUM_PORT,
    path: '/',
    logLevel: 'warn',
    capabilities: cfg.capabilities
  };

  console.log('Starting Appium session…');
  console.log(`  Device: ${cfg.DEVICE_NAME}`);
  console.log(`  Bundle: ${cfg.BUNDLE_ID}`);

  const driver = await remote(opts);

  // autoLaunch is false (avoids WDA crash on relaunch) — activate explicitly.
  console.log(`  Activating app: ${cfg.BUNDLE_ID}`);
  await driver.activateApp(cfg.BUNDLE_ID);
  await driver.pause(cfg.APP_LOAD_MS);

  return driver;
}

function printSummaryTable(results) {
  const line = '─'.repeat(70);
  console.log('\n' + '═'.repeat(70));
  console.log('  UAT RESULTS SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  ${'Suite'.padEnd(45)} PASS  FAIL  SKIP`);
  console.log('  ' + line);

  let totalPass = 0, totalFail = 0, totalSkip = 0;

  for (const r of results) {
    const marker = r.fail > 0 ? ' ✗' : '';
    const label = `${r.suite}${marker}`.padEnd(45);
    console.log(`  ${label} ${String(r.pass).padStart(4)}  ${String(r.fail).padStart(4)}  ${String(r.skip).padStart(4)}`);

    for (const f of r.failures) {
      console.log(`  ${''.padEnd(45)} ↳ FAIL: ${f.title}`);
    }

    totalPass += r.pass;
    totalFail += r.fail;
    totalSkip += r.skip;
  }

  console.log('  ' + line);
  console.log(`  ${'TOTAL'.padEnd(45)} ${String(totalPass).padStart(4)}  ${String(totalFail).padStart(4)}  ${String(totalSkip).padStart(4)}`);
  console.log('═'.repeat(70) + '\n');
}

async function main() {
  const suiteNames = resolveSuiteNames(process.argv);
  console.log(`  Suites: ${suiteNames.join(', ')}\n`);

  let driver;
  const results = [];

  try {
    driver = await buildDriver();

    for (const name of suiteNames) {
      const suite = loadSuite(name);
      if (!suite) continue;
      const result = await suite.run(driver);
      results.push(result);
    }

  } catch (err) {
    console.error('\nFATAL: Appium session error:', err.message);
    process.exitCode = 1;
  } finally {
    if (driver) {
      try {
        await driver.deleteSession();
        console.log('\nAppium session ended.');
      } catch (_) {}
    }
  }

  if (results.length > 0) {
    printSummaryTable(results);
    const anyFail = results.some(r => r.fail > 0);
    if (anyFail) process.exitCode = 1;
  }
}

main();
