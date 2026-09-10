/**
 * Run ONCE from the Apps Script editor (select oneTimeSetup in the function
 * dropdown, then Run) after this project is bound/deployed against SHEET_ID.
 * Safe to re-run: every step is additive and skips tabs/rows that already
 * exist, so re-running after adding a column by hand won't clobber anything.
 *
 * What it does:
 *  1. Creates the app-managed tabs (Admins, Activity Log, Settings,
 *     Favorites, App Overrides, Definitions, Resources) if missing, with
 *     header rows.
 *  2. Seeds Definitions + Resources from the prototype's shipped content
 *     (Seed.gs) — ONLY if those tabs are empty, so it never overwrites
 *     wording an admin has already edited in Sheets.
 *  3. Seeds Settings with the default title/accent if empty.
 *  4. Creates the default administrator ONLY if the Admins tab is empty.
 *     CHANGE THIS PASSWORD IMMEDIATELY: sign in as admin@opportunityatwork.org
 *     / paperceiling, add your own admin account (Admin & data ->
 *     Administrators), then remove the default one.
 *
 * Does NOT touch "Master Spreadsheet" — that tab is owned by the assessment
 * team and must already exist with the columns SheetData.gs expects.
 */
function oneTimeSetup() {
  var ss = ss_();
  if (!ss.getSheetByName(TAB_MASTER)) {
    throw new Error('"' + TAB_MASTER + '" tab not found in this workbook. This setup only creates app-managed tabs; the Master Spreadsheet tab must already exist with the assessment data.');
  }

  ensureTab_(ss, TAB_ADMINS, ['Name', 'Email', 'PasswordHash', 'Salt', 'CreatedAt']);
  ensureTab_(ss, TAB_ACTIVITY, ['Timestamp', 'WhoName', 'WhoEmail', 'Role', 'Action', 'Target']);
  ensureTab_(ss, TAB_SETTINGS, ['Key', 'Value']);
  ensureTab_(ss, TAB_FAVORITES, ['Email', 'CompanyId', 'CreatedAt']);
  ensureTab_(ss, TAB_OVERRIDES, ['CompanyId', 'ExtraJSON', 'UpdatedAt']);
  ensureTab_(ss, TAB_DEFINITIONS, ['id', 'defType', 'category', 'type', 'definition', 'evidence']);
  ensureTab_(ss, TAB_RESOURCES, ['Section', 'Title', 'Body', 'Link']);
  ensureTab_(ss, TAB_COMMENTS, ['CompanyId', 'Timestamp', 'WhoName', 'WhoEmail', 'Role', 'Comment']);
  ensureTab_(ss, TAB_ENGAGEMENT, engagementHeaders_());
  ensureTab_(ss, TAB_OPPORTUNITIES, OPPORTUNITY_HEADERS);

  seedDefinitionsIfEmpty_(ss);
  seedResourcesIfEmpty_(ss);
  seedEngagementIfEmpty_(ss);
  seedSettingsIfEmpty_(ss);
  seedDefaultAdminIfEmpty_(ss);

  Logger.log('oneTimeSetup complete.');
}

function ensureTab_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function seedDefinitionsIfEmpty_(ss) {
  var sh = ss.getSheetByName(TAB_DEFINITIONS);
  if (sh.getLastRow() > 1) return;
  var rows = DEFINITIONS_SEED.map(function (d) { return [d.id, d.defType, d.category, d.type, d.definition, d.evidence || '']; });
  if (rows.length) sh.getRange(2, 1, rows.length, 6).setValues(rows);
}

function seedResourcesIfEmpty_(ss) {
  var sh = ss.getSheetByName(TAB_RESOURCES);
  if (sh.getLastRow() > 1) return;
  var labels = { universalMenu: 'Universal menu', turnkey: 'Turnkey (before joining TTPC)', exclusive: 'Board-only (exclusive)' };
  var rows = [];
  ['universalMenu', 'turnkey', 'exclusive'].forEach(function (section) {
    (RESOURCES_SEED[section] || []).forEach(function (item) { rows.push([labels[section], item.title, item.body, item.link || '']); });
  });
  if (rows.length) sh.getRange(2, 1, rows.length, 4).setValues(rows);
}

/** Header shape Engagement.gs's readEngagement_() expects (Config.gs's
 * TAB_ENGAGEMENT). Created + seeded here so website-engagement data lives
 * in the spreadsheet from day one, same as everything else the app reads —
 * nothing in this app ships as a static file the client has to trust. */
function engagementHeaders_() {
  var headers = ['Company', 'Total Visits', 'Unique Pages', 'O&W Visits', 'TTPC Visits', 'Most Recent Week', 'Logo'];
  for (var i = 1; i <= 5; i++) headers.push('Top Page ' + i + ' URL', 'Top Page ' + i + ' Visits');
  return headers;
}

function seedEngagementIfEmpty_(ss) {
  var sh = ss.getSheetByName(TAB_ENGAGEMENT);
  if (sh.getLastRow() > 1) return;
  var headers = engagementHeaders_();
  var rows = ENGAGEMENT_SEED.map(function (e) {
    var row = [e.company, e.total || 0, e.unique || 0, e.oaw || 0, e.ttpc || 0, e.recentWeek || '', e.logo || ''];
    for (var i = 0; i < 5; i++) {
      var p = (e.topPages || [])[i];
      row.push(p ? p.url : '', p && p.visits != null ? p.visits : '');
    }
    return row;
  });
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function seedSettingsIfEmpty_(ss) {
  var sh = ss.getSheetByName(TAB_SETTINGS);
  if (sh.getLastRow() > 1) return;
  var rows = Object.keys(SETTINGS_DEFAULTS).map(function (k) { return [k, SETTINGS_DEFAULTS[k]]; });
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
}

function seedDefaultAdminIfEmpty_(ss) {
  var sh = ss.getSheetByName(TAB_ADMINS);
  if (sh.getLastRow() > 1) return;
  var salt = randomSalt_();
  var hash = hashPassword_(DEFAULT_ADMIN_PASSWORD, salt);
  sh.appendRow([DEFAULT_ADMIN_NAME, DEFAULT_ADMIN_EMAIL, hash, salt, nowIso_()]);
  Logger.log('Default admin created: ' + DEFAULT_ADMIN_EMAIL + ' / ' + DEFAULT_ADMIN_PASSWORD + ' — change this immediately after first login.');
}
