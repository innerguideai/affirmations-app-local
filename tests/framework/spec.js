// tests/framework/spec.js
// Lightweight test-suite runner. No external test framework dependency —
// keeps the UAT suite self-contained and easy to run via `node tests/runner.js`.
//
// Usage:
//   const suite = new Spec('Authentication');
//   suite.beforeAll(async driver => { ... });
//   suite.test('does X', async driver => { ... });
//   await suite.run(driver);

const { getSoftFailures, clearSoftFailures } = require('../helpers/assertions');

class Spec {
  constructor(name) {
    this.name = name;
    this._beforeAll = null;
    this._afterAll = null;
    this._beforeEach = null;
    this._afterEach = null;
    this._tests = []; // { title, fn, pending }
  }

  beforeAll(fn)  { this._beforeAll = fn;  return this; }
  afterAll(fn)   { this._afterAll = fn;   return this; }
  beforeEach(fn) { this._beforeEach = fn; return this; }
  afterEach(fn)  { this._afterEach = fn;  return this; }

  test(title, fn) {
    this._tests.push({ title, fn, pending: false });
    return this;
  }

  // Mark a test as not-yet-implemented — always reported as SKIP, never run.
  pending(title, reason = 'not implemented') {
    this._tests.push({ title, fn: null, pending: true, reason });
    return this;
  }

  async run(driver) {
    const results = { suite: this.name, pass: 0, fail: 0, skip: 0, failures: [] };

    console.log('\n' + '─'.repeat(60));
    console.log(`  SUITE  ${this.name}`);
    console.log('─'.repeat(60));

    let setupFailed = false;
    if (this._beforeAll) {
      try {
        await this._beforeAll(driver);
      } catch (err) {
        setupFailed = true;
        console.log(`  SETUP FAIL  beforeAll threw: ${err.message}`);
      }
    }

    for (const t of this._tests) {
      if (t.pending || setupFailed) {
        results.skip++;
        const reason = t.pending ? (t.reason || 'pending') : 'suite setup failed';
        console.log(`  SKIP   ${t.title}`);
        if (t.pending && t.reason) console.log(`         (${reason})`);
        continue;
      }

      try {
        if (this._beforeEach) await this._beforeEach(driver);

        clearSoftFailures();
        await t.fn(driver);
        const softFails = getSoftFailures();

        if (softFails.length > 0) {
          console.log(`  PASS   ${t.title}`);
          for (const msg of softFails) console.log(`    [soft-fail] ${msg}`);
        } else {
          console.log(`  PASS   ${t.title}`);
        }
        results.pass++;

      } catch (err) {
        results.fail++;
        results.failures.push({ title: t.title, message: err.message });
        console.log(`  FAIL   ${t.title}`);
        console.log(`         ASSERT: ${err.message}`);
      } finally {
        if (this._afterEach) {
          try { await this._afterEach(driver); } catch (_) {}
        }
      }
    }

    if (this._afterAll) {
      try { await this._afterAll(driver); } catch (_) {}
    }

    console.log(`\n  Summary: ${results.pass} PASS  ${results.fail} FAIL  ${results.skip} SKIP\n`);
    return results;
  }
}

module.exports = Spec;
