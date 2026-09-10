/**
 * Reads and writes the live "Master Spreadsheet" tab — this is the heart of
 * "Google Sheets stays the database" (see chats/chat3.md). Company data is
 * never cached in the app or written to companies.js; every bootstrap reads
 * this tab fresh, and every admin edit/add/delete/CSV-import writes straight
 * back to it, so the Sheet and the app can never drift out of sync the way
 * the old client-side CSV-fetch sync sometimes did.
 *
 * Column mapping mirrors the prototype's syncFromGoogleSheet() 1:1 (see
 * chats/chat3.md and the old SkillsFirstJourney.dc.html) so this drop-in
 * replaces it without requiring any change to the workbook itself.
 */

// Canonical app field -> live sheet column header. Both readCompanies_() and
// upsertCompany_() key off this map so read/write stay symmetric.
var MASTER_COLUMNS = {
  logo: 'Logo',
  industry: 'Industry',
  doneTogether: "What We've Done Together",
  owner: 'Account Owner (Salesforce)',
  assessmentDate: 'Assessment Date',
  overallWhy: 'Overall Classification Reasoning',
  international: 'International Context',
  edgeFlags: 'Edge Case Flags',
  top10Notes: 'Top 10 Notes',
  lastChangeDirection: 'Last Change Direction',
  latestChangeSummary: 'Latest Change Summary',
};
var COL_COMPANY_NAME = 'Company name';
var COL_TTPC = 'TTPC Member';
var COL_AD_COUNCIL = 'Ad Council Board member';
var COL_OVERALL = 'Overall Journey Classification';
var COL_READINESS = 'Internal Readiness Average score';
var COL_TOP10 = 'Top 10';
// Differentiates the current assessment row from historical ones when a
// company has more than one row (a re-assessment). Yes/No. When a company
// has no row flagged Yes (including every company that only has one row —
// the normal case), the richest row is treated as current, same as before
// this column existed, so nothing has to change for companies with only one
// row on file yet.
var COL_IS_CURRENT = 'Is Current Assessment';
// The assessment team's own re-assessment tracking tab actually uses a
// different column/value convention for the same concept: a
// "Skills-First Journey Assessment" column reading "Current Assessment"
// vs. "Previous (Archived) Assessment" (rather than "Is Current
// Assessment" Yes/No). Recognize both — see isCurrentAssessment_ below.
var COL_IS_CURRENT_ALT = 'Skills-First Journey Assessment';
var SOURCE_LINK_COUNT = 17;
var POC_SLOT_COUNT = 5;

// Name variants that should be treated as the same company as their
// canonical form (see chats/chat2.md + chat3.md's long dedup history).
var NAME_ALIASES = {
  'sephora usa inc': 'Sephora', 'citigroup': 'Citi', 'salesforce.org': 'Salesforce',
  'axciom corporation': 'Acxiom', 'bbdo worldwide': 'BBDO', 'hello products llc': 'Hello Products',
  'kargo global, inc.': 'Kargo', 'm+c saatchi group': 'M&C Saatchi',
  'mckinsey and company': 'McKinsey & Company', 'mckinsey & company (us)': 'McKinsey & Company',
  'skydeo inc.': 'Skydeo', 'tbwa\\chiat\\day new york': 'TBWA\\Chiat\\Day',
  'the new york times company': 'The New York Times', 'comcast nbcuniversal': 'Comcast Advertising',
};

function canonicalName_(raw) {
  var alias = NAME_ALIASES[String(raw || '').toLowerCase()];
  return alias || raw;
}

function parsePOC_(s) {
  if (!s) return null;
  s = String(s).replace(/\n/g, ', ').trim();
  if (!s) return null;
  var name = s, title = '';
  var seps = [' — ', ' - ', ', '];
  for (var i = 0; i < seps.length; i++) {
    var idx = s.indexOf(seps[i]);
    if (idx > 0) { name = s.slice(0, idx).trim(); title = s.slice(idx + seps[i].length).trim(); break; }
  }
  return { name: name, title: title };
}

function formatPOC_(p) {
  if (!p || !p.name) return '';
  return p.title ? p.name + ' — ' + p.title : p.name;
}

/** True if this row is explicitly flagged current, under either
 * convention: COL_IS_CURRENT ("Is Current Assessment" / Yes-No) or
 * COL_IS_CURRENT_ALT ("Skills-First Journey Assessment" / "Current
 * Assessment" vs. "Previous (Archived) Assessment"). Returns null (not
 * false) when neither column has a value on this row, so the caller can
 * tell "explicitly not current" apart from "no flag at all" — the latter
 * is what falls back to the richness heuristic. */
function isCurrentAssessment_(r) {
  var raw = get_(r, COL_IS_CURRENT);
  if (raw) return yes_(raw);
  var alt = get_(r, COL_IS_CURRENT_ALT);
  if (alt) return /^current/i.test(alt.trim());
  return null;
}

function richness_(c) {
  var s = (c.sources || []).length + (c.board || []).length + (c.pointsOfContact || []).length;
  if (c.overall) s += 2;
  if (c.doneTogether) s++;
  if (c.owner) s++;
  return s;
}

function normCompany_(c) {
  var cats = c.categories || {};
  CATEGORY_KEYS.forEach(function (k) { if (!cats[k.key]) cats[k.key] = { cls: STAGES[0], why: '' }; });
  return Object.assign({
    id: c.id || slugify_(c.company || Utilities.getUuid()),
    company: '', logo: '', ttpc: false, adCouncil: false,
    overall: '', overallWhy: '', doneTogether: '', owner: '',
    international: '', edgeFlags: '', assessmentDate: '', sources: [], readinessScore: null,
    top10: false, top10Notes: '', pointsOfContact: [], engagementIdeas: [],
    lastChangeDirection: '', lastReassessed: '', latestChangeSummary: '', previousAssessments: [],
    board: [], industry: '', website: '', parentNote: '',
  }, c, { categories: cats });
}

/** Reads the whole Master Spreadsheet tab. A company may have MULTIPLE rows
 * — one per assessment, for companies that have been re-assessed — grouped
 * by canonical id. Within a group, the row flagged Yes in COL_IS_CURRENT
 * (or, if none is flagged, the richest row — the old single-row-per-company
 * heuristic) supplies the company's live fields; every OTHER row in the
 * group becomes a previousAssessments entry, so "Current — [date] / [prior
 * date] / [prior date]" in the detail card and the Website Engagement
 * page's assessment history both come straight from Master Spreadsheet —
 * no separate history tab. Also merges in curated overrides/opportunities. */
function readCompanies_() {
  var sh = sheet_(TAB_MASTER);
  var table = readTable_(sh);
  var groups = {}; // id -> [{ cand, isCurrentFlag }]
  table.rows.forEach(function (r) {
    var rawName = get_(r, COL_COMPANY_NAME);
    if (!rawName) return;
    var company = canonicalName_(rawName);
    var cats = {};
    CATEGORY_KEYS.forEach(function (k) {
      var cls = get_(r, k.label + ' — Classification') || get_(r, k.label + ' - Classification');
      var why = get_(r, k.label + ' — Reasoning') || get_(r, k.label + ' - Reasoning');
      if (cls || why) cats[k.key] = { cls: normStage_(cls) || STAGES[0], why: why };
    });
    var sources = [];
    for (var i = 1; i <= SOURCE_LINK_COUNT; i++) {
      var v = get_(r, 'Source Link ' + i) || get_(r, 'Link Source ' + i);
      if (v) sources.push(v);
    }
    var board = [];
    if (get_(r, 'Board Member Full Name')) {
      board.push({ name: get_(r, 'Board Member Full Name'), title: get_(r, 'Job Title'), role: get_(r, 'Ad Council Officer or Director') || 'Director', ec: yes_(get_(r, 'EC Member')), website: '' });
    }
    if (get_(r, 'Second Board Member Full Name')) {
      board.push({ name: get_(r, 'Second Board Member Full Name'), title: get_(r, 'Second Board Member Job Title'), role: get_(r, 'Second Board Member Ad Council Officer or Director') || 'Director', ec: yes_(get_(r, 'Second Board Member EC Member')), website: '' });
    }
    var poc = [];
    for (var n = 1; n <= POC_SLOT_COUNT; n++) {
      var p = parsePOC_(get_(r, 'Opportunity@Work Point of Contact ' + n + ' (Name & Job Title)'));
      if (p) poc.push(p);
    }
    var id = slugify_(company);
    var scoreStr = get_(r, COL_READINESS);
    var cand = normCompany_({
      id: id, company: company, logo: get_(r, 'Logo'), industry: get_(r, 'Industry'),
      ttpc: yes_(get_(r, COL_TTPC)), adCouncil: yes_(get_(r, COL_AD_COUNCIL)),
      doneTogether: get_(r, "What We've Done Together"), owner: get_(r, 'Account Owner (Salesforce)'),
      assessmentDate: get_(r, 'Assessment Date'), readinessScore: scoreStr ? parseFloat(scoreStr) : null,
      overall: normStage_(get_(r, COL_OVERALL)) || '', overallWhy: get_(r, 'Overall Classification Reasoning'),
      categories: cats, international: get_(r, 'International Context'), edgeFlags: get_(r, 'Edge Case Flags'),
      sources: sources, board: board, pointsOfContact: poc,
      top10: get_(r, COL_TOP10) === '1' || yes_(get_(r, COL_TOP10)), top10Notes: get_(r, 'Top 10 Notes'),
      lastChangeDirection: get_(r, 'Last Change Direction'), latestChangeSummary: get_(r, 'Latest Change Summary'),
    });
    var entry = { cand: cand, isCurrentFlag: !!isCurrentAssessment_(r), row: r.__row };
    if (!groups[id]) groups[id] = [];
    groups[id].push(entry);
  });

  var overrides = getOverrides_();
  var opportunities = readOpportunitiesByCompanyId_();

  return Object.keys(groups).map(function (id) {
    var entries = groups[id];
    var flagged = entries.filter(function (e) { return e.isCurrentFlag; });
    var pool = flagged.length ? flagged : entries;
    // Among the pool, prefer the richest row; ties broken by sheet order
    // (later row wins), matching the old single-row-per-company behavior.
    var chosen = pool.reduce(function (best, e) { return (!best || richness_(e.cand) >= richness_(best.cand)) ? e : best; }, null);
    var previousAssessments = entries
      .filter(function (e) { return e !== chosen; })
      .map(function (e) {
        var c = e.cand;
        return { date: c.assessmentDate, classification: c.overall, summary: c.overallWhy, score: c.readinessScore, sources: c.sources, categories: c.categories };
      })
      .sort(function (a, b) {
        var da = Date.parse(a.date), db = Date.parse(b.date);
        if (!isNaN(da) && !isNaN(db)) return da - db;
        return 0; // leave sheet order in place if dates don't parse
      });

    var c = applyOverrides_(chosen.cand, overrides);
    if (opportunities[id]) c = Object.assign({}, c, { engagementIdeas: opportunities[id] });
    if (previousAssessments.length) c = Object.assign({}, c, { previousAssessments: previousAssessments });
    return c;
  });
}

/** Finds the CURRENT-assessment row for a company id (recomputing canonical
 * ids from the Company name column so it stays correct even if rows get
 * reordered) — the row flagged Yes in COL_IS_CURRENT, or, among companies
 * with no flag set yet, the richest matching row. Returns 0 if the company
 * has no row yet. Historical (non-current) rows are never a target for
 * admin edits/CSV-import — those always act on the current assessment. */
function findRowForId_(sh, companyId) {
  var table = readTable_(sh);
  var matches = table.rows.filter(function (r) {
    var rawName = get_(r, COL_COMPANY_NAME);
    return rawName && slugify_(canonicalName_(rawName)) === companyId;
  });
  if (!matches.length) return 0;
  var flagged = matches.filter(function (r) { return isCurrentAssessment_(r); });
  var pool = flagged.length ? flagged : matches;
  return pool[pool.length - 1].__row; // last (most recently edited) match in the pool
}

/** All sheet rows for a company id, current + historical alike — used by
 * deleteCompany_ so deleting a company removes its whole assessment
 * history, not just the current row. */
function findAllRowsForId_(sh, companyId) {
  var table = readTable_(sh);
  return table.rows
    .filter(function (r) { var rawName = get_(r, COL_COMPANY_NAME); return rawName && slugify_(canonicalName_(rawName)) === companyId; })
    .map(function (r) { return r.__row; });
}

function setCell_(sh, row, headers, headerName, value) {
  var col = headerIndex_(headers, headerName);
  if (col < 0) return; // header not present in this workbook; skip silently
  sh.getRange(row, col).setValue(value == null ? '' : value);
}

/** Upserts a normalized company object into Master Spreadsheet, writing only
 * columns that already exist as headers (so it never reshapes the analyst
 * team's sheet). Returns the row number written. */
function upsertCompany_(company) {
  var c = normCompany_(company);
  if (!c.company || !c.company.trim()) throw new Error('Company name is required.');
  c.id = slugify_(c.company);
  var sh = sheet_(TAB_MASTER);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h || '').trim(); });
  var row = findRowForId_(sh, c.id);
  var isNewRow = !row;
  if (isNewRow) {
    sh.appendRow(new Array(headers.length).fill(''));
    row = sh.getLastRow();
  }
  setCell_(sh, row, headers, COL_COMPANY_NAME, c.company);
  // Only stamp the flag on a brand-new row (a new company). Editing an
  // EXISTING row never touches it, so it doesn't accidentally flip a
  // historical row to current or a current row to historical.
  if (isNewRow) setCell_(sh, row, headers, COL_IS_CURRENT, 'Yes');
  setCell_(sh, row, headers, COL_TTPC, c.ttpc ? 'Yes' : 'No');
  setCell_(sh, row, headers, COL_AD_COUNCIL, c.adCouncil ? 'Yes' : 'No');
  setCell_(sh, row, headers, COL_OVERALL, c.overall);
  setCell_(sh, row, headers, COL_READINESS, c.readinessScore != null ? c.readinessScore : '');
  setCell_(sh, row, headers, COL_TOP10, c.top10 ? 'Yes' : 'No');
  Object.keys(MASTER_COLUMNS).forEach(function (field) { setCell_(sh, row, headers, MASTER_COLUMNS[field], c[field]); });
  CATEGORY_KEYS.forEach(function (k) {
    var cc = c.categories[k.key] || {};
    setCell_(sh, row, headers, k.label + ' — Classification', cc.cls || '');
    setCell_(sh, row, headers, k.label + ' — Reasoning', cc.why || '');
  });
  for (var i = 1; i <= SOURCE_LINK_COUNT; i++) setCell_(sh, row, headers, 'Source Link ' + i, (c.sources || [])[i - 1] || '');
  var b0 = (c.board || [])[0], b1 = (c.board || [])[1];
  setCell_(sh, row, headers, 'Board Member Full Name', b0 ? b0.name : '');
  setCell_(sh, row, headers, 'Job Title', b0 ? b0.title : '');
  setCell_(sh, row, headers, 'Ad Council Officer or Director', b0 ? (b0.role || 'Director') : '');
  setCell_(sh, row, headers, 'EC Member', b0 ? (b0.ec ? 'Yes' : 'No') : '');
  setCell_(sh, row, headers, 'Second Board Member Full Name', b1 ? b1.name : '');
  setCell_(sh, row, headers, 'Second Board Member Job Title', b1 ? b1.title : '');
  setCell_(sh, row, headers, 'Second Board Member Ad Council Officer or Director', b1 ? (b1.role || 'Director') : '');
  setCell_(sh, row, headers, 'Second Board Member EC Member', b1 ? (b1.ec ? 'Yes' : 'No') : '');
  for (var n = 1; n <= POC_SLOT_COUNT; n++) {
    setCell_(sh, row, headers, 'Opportunity@Work Point of Contact ' + n + ' (Name & Job Title)', formatPOC_((c.pointsOfContact || [])[n - 1]));
  }
  // Curated-only fields never touch the live sheet; they persist in App Overrides.
  setOverride_(c.id, { website: c.website || '', parentNote: c.parentNote || '' });
  // Engagement ideas live in their own tab (Priority Prospect Opportunities),
  // one row per idea with its own status/notes. Only touch it if the form's
  // idea LIST actually changed content — otherwise leave rows alone so an
  // unrelated save (e.g. fixing a classification) doesn't wipe out status/
  // notes the team set directly in Sheets on existing opportunity rows.
  var before = (readOpportunitiesByCompanyId_()[c.id] || []).join('');
  var after = (c.engagementIdeas || []).join('');
  if (before !== after) replaceOpportunities_(c.id, c.company, c.engagementIdeas || []);
  return c.id;
}

/** Replaces every opportunity row for a company (used by the edit form's
 * "Engagement ideas" textarea) — a full-replace, not a merge, so editing
 * there doesn't fight with rows the team added by hand in Sheets beyond
 * what's shown in the form. Only called when the idea list actually
 * changed (see upsertCompany_) so it never runs on an unrelated save. */
function replaceOpportunities_(companyId, companyName, ideas) {
  var sh = findSheet_(TAB_OPPORTUNITIES);
  if (!sh) return; // tab not set up yet (run oneTimeSetup)
  var t = readTable_(sh);
  var toDelete = t.rows.filter(function (r) { return slugify_(canonicalName_(get_(r, 'Company'))) === companyId; }).map(function (r) { return r.__row; });
  toDelete.sort(function (a, b) { return b - a; }).forEach(function (row) { sh.deleteRow(row); });
  ideas.forEach(function (idea) { if (idea) sh.appendRow([companyName, idea, 'Idea', '', '', nowIso_()]); });
}

/** Deletes EVERY row for a company — current assessment and all history —
 * so "Delete" actually removes the company, rather than leaving orphaned
 * historical rows that would just become the new "current" on next read. */
function deleteCompany_(companyId) {
  var sh = sheet_(TAB_MASTER);
  var rows = findAllRowsForId_(sh, companyId);
  rows.sort(function (a, b) { return b - a; }).forEach(function (row) { sh.deleteRow(row); });
}

function api_saveCompany(token, company) {
  var auth = requireAdmin_(token);
  var id = upsertCompany_(company);
  logActivity_(auth, 'Edited app database', company.company);
  return { ok: true, companies: readCompanies_(), savedId: id };
}

function api_deleteCompany(token, companyId) {
  var auth = requireAdmin_(token);
  var list = readCompanies_();
  var target = list.find(function (c) { return c.id === companyId; });
  deleteCompany_(companyId);
  logActivity_(auth, 'Deleted company', target ? target.company : companyId);
  return { ok: true, companies: readCompanies_() };
}

/** CSV rows already parsed client-side (see JavaScript.html's parseCSV, kept
 * identical to the prototype) into the app's canonical field names. Upserts
 * each as its own company. Admin only. */
function api_importCompanies(token, rows) {
  var auth = requireAdmin_(token);
  var count = 0;
  (rows || []).forEach(function (r) {
    if (!r || !r.company) return;
    upsertCompany_(r);
    count++;
  });
  logActivity_(auth, 'Imported CSV', count + ' companies');
  return { ok: true, companies: readCompanies_(), count: count };
}
