/**
 * "Assessment History" tab — the live source for previousAssessments, the
 * data that powers the "Current — [date] / [prior date] / [prior date]"
 * tab bar in a company's detail card, and the "Changes since last
 * assessment" summary at the top of the current view.
 *
 * Before this, previousAssessments only existed as an opaque JSON blob in
 * "App Overrides" with no admin UI to add to it — the tab bar rendered, but
 * there was no real way to get a company's assessment history into it. This
 * tab fixes that: one row per historical assessment, editable directly in
 * Sheets or via the drawer's "Add previous assessment" composer (admin
 * only), matched to a company the same way Master Spreadsheet is (through
 * the alias table in SheetData.gs, so "Citi"/"Citigroup" resolve together).
 *
 * Columns: Company | Date | Overall Classification | Summary |
 * Readiness Score | Sources | Categories JSON.
 * Only Company, Date, and Overall Classification are really needed for an
 * entry to show up; Summary/Readiness Score add the "Score change" and
 * reasoning text; Sources (one URL per line, or "|"-separated) lets [n]
 * citations in that entry's Summary resolve; Categories JSON is an ADVANCED,
 * sheet-only field (not exposed in the app's composer) — paste a JSON object
 * shaped like { "laborMarket": {"cls":"...", "why":"..."}, ... } (see
 * CATEGORY_KEYS in Config.gs for the six keys) if you want the per-dimension
 * "Changes since" diff for that historical entry too.
 */

function parseSources_(raw) {
  if (!raw) return [];
  return String(raw).split(/\r?\n|\|/).map(function (s) { return s.trim(); }).filter(Boolean);
}

/** {companyId: [{date, classification, summary, score, sources, categories}]},
 * sorted oldest-first (the shape the client's assessment-tab bar expects). */
function readAssessmentHistoryByCompanyId_() {
  var sh = findSheet_(TAB_ASSESSMENT_HISTORY);
  var out = {};
  if (!sh) return out;
  var t = readTable_(sh);
  t.rows.forEach(function (r) {
    var company = get_(r, 'Company');
    if (!company) return;
    var id = slugify_(canonicalName_(company));
    var scoreStr = get_(r, 'Readiness Score');
    var entry = {
      date: get_(r, 'Date'),
      classification: normStage_(get_(r, 'Overall Classification')),
      summary: get_(r, 'Summary'),
      score: scoreStr ? parseFloat(scoreStr) : null,
      sources: parseSources_(get_(r, 'Sources')),
      categories: safeJsonParse_(get_(r, 'Categories JSON'), null),
      __row: r.__row,
    };
    if (!out[id]) out[id] = [];
    out[id].push(entry);
  });
  Object.keys(out).forEach(function (id) {
    out[id].sort(function (a, b) {
      var da = Date.parse(a.date), db = Date.parse(b.date);
      if (!isNaN(da) && !isNaN(db)) return da - db;
      return a.__row - b.__row; // fall back to sheet order if dates don't parse
    });
    out[id].forEach(function (e) { delete e.__row; });
  });
  return out;
}

function api_addAssessmentHistory(token, companyName, date, classification, summary, score) {
  requireAdmin_(token);
  companyName = String(companyName || '').trim();
  date = String(date || '').trim();
  if (!companyName || !date || !classification) throw new Error('Company, date, and classification are required.');
  var sh = sheet_(TAB_ASSESSMENT_HISTORY);
  sh.appendRow([companyName, date, normStage_(classification), summary || '', score != null && score !== '' ? parseFloat(score) : '', '', '']);
  var id = slugify_(canonicalName_(companyName));
  return { ok: true, previousAssessments: readAssessmentHistoryByCompanyId_()[id] || [] };
}
