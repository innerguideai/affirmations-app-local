// tests/helpers/assertions.js
// Minimal assertion helpers for the UAT suite.
//
// assert(cond, msg)        — hard fail: throws, marks the test FAIL
// assertNotBlank(val, msg) — hard fail if val is empty/whitespace
// softAssert(cond, msg)    — records a non-fatal issue; test still PASSes
//                            but the message is printed under the result
// assertNoBlankScreen(driver) — checks the WebView body isn't empty

const ls = require('./localStorage');

let _softFailures = [];

function clearSoftFailures() {
  _softFailures = [];
}

function getSoftFailures() {
  return _softFailures.slice();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertNotBlank(value, msg) {
  const str = (value == null) ? '' : String(value).trim();
  if (str.length === 0) {
    throw new Error(msg || `Expected non-blank value, got: "${value}"`);
  }
}

function softAssert(cond, msg) {
  if (!cond) {
    _softFailures.push(msg || 'Soft assertion failed');
  }
}

async function assertNoBlankScreen(driver) {
  let bodyText = '';
  try {
    bodyText = await ls.executeScript(driver,
      "return document.body?.innerText?.trim() || ''"
    );
  } catch (_) {
    // If we can't reach the WebView at all, treat as blank
    bodyText = '';
  }
  assert(bodyText.length > 0, 'Screen appears blank — document.body has no visible text');
  return bodyText;
}

module.exports = {
  assert,
  assertNotBlank,
  softAssert,
  assertNoBlankScreen,
  clearSoftFailures,
  getSoftFailures
};
