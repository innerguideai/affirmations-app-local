// tests/data/testConfig.js
// Shared runtime constants for the UAT suite.

module.exports = {
  // Appium server
  APPIUM_HOST: '127.0.0.1',
  APPIUM_PORT: 4723,

  // iOS target
  BUNDLE_ID: 'com.innerguide.aiaffirm',
  DEVICE_NAME: 'iPhone 17 Pro',
  PLATFORM_VERSION: '26.1',

  // Backend (dev)
  DEV_API: 'http://54.221.158.219:3000',

  // Timing
  APP_LOAD_MS: 5000,
  NAV_WAIT_MS: 4000,
  SHORT_PAUSE_MS: 800,
  LONG_PAUSE_MS: 2500,
  LOGIN_TIMEOUT_MS: 30000,
  PAGE_TIMEOUT_MS: 8000,

  // LocalStorage keys (source of truth — matches profile.init.js)
  LS_AUTH_MODE: 'ig_auth_mode',
  LS_AUTH_TOKEN: 'authToken',
  LS_CURRENT_USER: 'currentUser',
  LS_CURRENT_USER_ID: 'currentUserId',
  LS_TOUR_DONE: 'ig_tour_done',
  LS_FREQUENCY: 'ig_frequency',
  LS_NAME: 'ig_name',

  // Appium capabilities (base — runner merges these)
  capabilities: {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:udid': '35C9B031-B9DE-4343-AECD-BBD38DD00249',
    'appium:deviceName': 'iPhone 17 Pro',
    'appium:platformVersion': '26.5',
    'appium:bundleId': 'com.innerguide.aiaffirm',
    'appium:noReset': true,
    'appium:autoLaunch': false,
    'appium:newCommandTimeout': 300,
    'appium:wdaLaunchTimeout': 120000,
    'appium:wdaConnectionTimeout': 120000
  }
};
