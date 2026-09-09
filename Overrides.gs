/**
 * "App Overrides" tab — the one place the app stores curated extras that the
 * live Master Spreadsheet tab doesn't carry: assessment HISTORY
 * (previousAssessments), an optional manual website URL, and a parentNote
 * like YouTube's "Google is the TTPC partner, not YouTube itself". (Priority
 * prospect engagement ideas live in their OWN tab — see Opportunities.gs —
 * not here, so the team can track status/notes per idea.) Every other field
 * always comes straight from the live sheet on every bootstrap, so Master
 * Spreadsheet stays the single source of truth for current classifications
 * — these are additive, merged on top by companyId.
 *
 * One row per company id: CompanyId | ExtraJSON | UpdatedAt.
 */

var OVERRIDE_KEYS = ['previousAssessments', 'website', 'parentNote'];

function getOverrides_() {
  var sh = findSheet_(TAB_OVERRIDES);
  var out = {};
  if (!sh) return out;
  var t = readTable_(sh);
  t.rows.forEach(function (r) {
    var id = get_(r, 'CompanyId');
    if (!id) return;
    var extra = safeJsonParse_(get_(r, 'ExtraJSON'), {});
    extra.row = r.__row;
    out[id] = extra;
  });
  return out;
}

function setOverride_(companyId, patch) {
  var sh = sheet_(TAB_OVERRIDES);
  var overrides = getOverrides_();
  var cur = overrides[companyId] || {};
  var next = Object.assign({}, cur, patch);
  var row = next.row;
  delete next.row;
  var values = [companyId, JSON.stringify(next), nowIso_()];
  if (row) {
    sh.getRange(row, 1, 1, 3).setValues([values]);
  } else {
    sh.appendRow(values);
  }
  return next;
}

/** Merges override extras onto a sheet-derived company record, keeping only
 * whitelisted keys and never letting overrides clobber live sheet fields. */
function applyOverrides_(company, overrides) {
  var extra = overrides[company.id];
  if (!extra) return company;
  var patch = {};
  OVERRIDE_KEYS.forEach(function (k) { if (extra[k] !== undefined) patch[k] = extra[k]; });
  return Object.assign({}, company, patch);
}
