/**
 * config.js — Frontend configuration (the only file you must edit to connect the backend).
 */
var APP_CONFIG = {
  APP_NAME: 'Daily Work Tracker Pro',
  COMPANY_NAME: 'Oakcraft Furniture',

  // Paste the Google Apps Script Web App URL here (Deploy > New deployment > Web app > URL).
  // Example: 'https://script.google.com/macros/s/AKfycb.../exec'
  API_URL: 'https://script.google.com/macros/s/AKfycbwD_MAfZxJzw1ffStWGOHWUoQzxFbgnAxmpU1liq1YIgOMNxvWep3ZLDx77ihu3TJF5Zw/exec',

  // When API_URL is empty the app runs in DEMO MODE: the real backend code runs inside the browser
  // with an in-memory spreadsheet (sample data) persisted to localStorage. Set to false to disable.
  ALLOW_DEMO_MODE: true,

  // Country code prepended to 10-digit WhatsApp numbers.
  DEFAULT_COUNTRY_CODE: '91',

  // Auto-save interval for the questionnaire (ms) and timer refresh interval (ms).
  AUTOSAVE_MS: 4000,
  TIMER_TICK_MS: 1000,

  // Request timeout (ms)
  REQUEST_TIMEOUT_MS: 45000,

  STORAGE_KEYS: { TOKEN: 'dwtp_token', USER: 'dwtp_user', DEMO_DB: 'dwtp_demo_db', PREFS: 'dwtp_prefs' }
};
