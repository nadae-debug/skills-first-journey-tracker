/**
 * Central configuration. Edit SHEET_ID if this project is ever pointed at a
 * different workbook — everything else in the app reads from these constants
 * rather than hardcoding the ID/tab names in multiple places.
 */

// The Ad Council & Opportunity@Work App Database workbook (the "Master
// Spreadsheet" tab is the live source of truth for company/board data).
var SHEET_ID = '1I0gYM_Zy4J9SHuQZBTu-DHISl33B3dCT0-4siSzbPcc';

var TAB_MASTER = 'Master Spreadsheet';

// Optional: point this at a real tab name once the workbook has a dedicated
// website-engagement export (e.g. from Sheet3 of the original workbook, with
// the same columns as ENGAGEMENT_SEED's rows). Until then engagement data
// falls back to ENGAGEMENT_SEED (see Seed.gs).
var TAB_ENGAGEMENT = 'Website Engagement';

// App-managed tabs. Setup.gs creates these in the same workbook if missing.
var TAB_ADMINS = 'Admins';
var TAB_ACTIVITY = 'Activity Log';
var TAB_SETTINGS = 'Settings';
var TAB_FAVORITES = 'Favorites';
var TAB_OVERRIDES = 'App Overrides';
var TAB_DEFINITIONS = 'Definitions';
var TAB_RESOURCES = 'Resources';
var TAB_COMMENTS = 'Comments';
var TAB_OPPORTUNITIES = 'Priority Prospect Opportunities';
var TAB_ASSESSMENT_HISTORY = 'Assessment History';

var STAGES = [
  "Hasn't begun the Journey",
  "Starting the Journey",
  "On the Journey",
  "Leading the Journey",
];

var CATEGORY_KEYS = [
  { key: 'laborMarket', label: 'Labor Market-shaping' },
  { key: 'aiHiring', label: 'AI-driven Hiring' },
  { key: 'riskCompliance', label: 'Risk & Compliance' },
  { key: 'internalMobility', label: 'Internal Mobility & Reskilling' },
  { key: 'vendorEcosystem', label: 'Vendor & Ecosystem Influence' },
  { key: 'narrative', label: 'Narrative Normalization' },
];

// Default admin created by Setup.gs the very first time it runs, ONLY if the
// Admins tab is empty. Change this password immediately after first login
// (Admin & data -> Administrators -> add yourself -> remove this account).
var DEFAULT_ADMIN_EMAIL = 'admin@opportunityatwork.org';
var DEFAULT_ADMIN_PASSWORD = 'paperceiling';
var DEFAULT_ADMIN_NAME = 'Administrator';

// Session tokens live in CacheService, capped at 6 hours (the service max).
var SESSION_TTL_SECONDS = 6 * 60 * 60;

function ss_() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function sheet_(tabName) {
  var sh = ss_().getSheetByName(tabName);
  if (!sh) throw new Error('Sheet tab "' + tabName + '" not found. Run oneTimeSetup() from the Apps Script editor first (see Setup.gs).');
  return sh;
}

function findSheet_(tabName) {
  return ss_().getSheetByName(tabName);
}
