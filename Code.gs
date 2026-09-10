/**
 * Entry point + the "read everything" endpoints that don't belong in a more
 * specific file. Auth.gs / SheetData.gs / Activity.gs / Settings.gs /
 * Favorites.gs / Overrides.gs hold the rest of the api_* functions the
 * client calls via google.script.run.
 */

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Skills-First Journey Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Used by Index.html's <?!= include('Stylesheet') ?> / <?!= include('JavaScript') ?>. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Single call the client makes on load (and after entering/login) to fetch
 * everything it needs to render. Company/engagement/etc. data is withheld
 * entirely for anonymous callers (no valid session) — access to the site
 * is restricted to ALLOWED_EMAIL_DOMAINS (Config.gs), enforced by api_enter
 * (Auth.gs), so an unauthenticated bootstrap only gets enough to render the
 * entry gate (branding/settings), never the actual data. Once entered,
 * everyone gets the full company/engagement/etc. payload; only the admin
 * list and activity log stay admin-only. Keeping this as one round trip
 * avoids a waterfall of separate google.script.run calls on startup.
 */
function api_bootstrap(token) {
  var auth = getSession_(token);
  if (!auth) {
    return { auth: null, settings: getSettings_(), logoDataUri: getLogoDataUri() };
  }
  var isAdmin = auth.role === 'admin';
  return {
    auth: auth,
    companies: readCompanies_(),
    engagement: readEngagement_(),
    definitions: readDefinitions_(),
    resources: readResources_(),
    settings: getSettings_(),
    stages: STAGES,
    categoryKeys: CATEGORY_KEYS,
    favorites: isAdmin ? getFavorites_(auth.email) : {},
    admins: isAdmin ? admins_().map(function (a) { return { name: a.name, email: a.email }; }) : [],
    activity: isAdmin ? api_getActivity(token) : [],
    commentCounts: getCommentCounts_(),
    logoDataUri: getLogoDataUri(),
  };
}

/** Re-reads company/engagement data without a full bootstrap (e.g. the nav
 * bar's "Refresh from Sheet" button, or after a save/import/delete).
 * Requires a valid session — same access restriction as api_bootstrap, so
 * this can't be used to read data without passing the entry gate first. */
function api_refresh(token) {
  requireAuth_(token);
  return { companies: readCompanies_(), engagement: readEngagement_() };
}

// api_sendEmail (real server-side send via MailApp) was removed — this
// deployment has no actual email-sending connection set up, so offering a
// "Send email" button that silently depended on Apps Script's MailApp
// quota was misleading. Sharing a company now only ever happens
// client-side: "Copy" or "Open draft" (a mailto: link), both in
// JavaScript.html, neither of which touches the server at all.
