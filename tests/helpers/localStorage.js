// tests/helpers/localStorage.js
// Executes localStorage reads/writes via the Capacitor WebView context.
// Always switches back to NATIVE_APP after execution.

async function withWebView(driver, fn) {
  let contexts;
  try {
    contexts = await driver.getContexts();
  } catch (e) {
    throw new Error(`getContexts failed: ${e.message}`);
  }

  const wv = contexts.find(c => c !== 'NATIVE_APP');
  if (!wv) throw new Error('No WebView context found — is the app fully loaded?');

  await driver.switchContext(wv);
  try {
    return await fn(driver);
  } finally {
    await driver.switchContext('NATIVE_APP');
  }
}

async function getItem(driver, key) {
  return withWebView(driver, d =>
    d.execute(`return localStorage.getItem(${JSON.stringify(key)})`)
  );
}

async function setItem(driver, key, value) {
  return withWebView(driver, d =>
    d.execute(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(String(value))})`)
  );
}

async function removeItem(driver, key) {
  return withWebView(driver, d =>
    d.execute(`localStorage.removeItem(${JSON.stringify(key)})`)
  );
}

async function getAll(driver, keys) {
  return withWebView(driver, d =>
    d.execute(`
      var out = {};
      var keys = ${JSON.stringify(keys)};
      for (var i = 0; i < keys.length; i++) {
        out[keys[i]] = localStorage.getItem(keys[i]);
      }
      return out;
    `)
  );
}

async function navigateTo(driver, path) {
  await withWebView(driver, d =>
    d.execute(`window.location.href = ${JSON.stringify(path)}`)
  );
}

async function executeScript(driver, script) {
  return withWebView(driver, d => d.execute(script));
}

module.exports = { getItem, setItem, removeItem, getAll, navigateTo, executeScript, withWebView };
