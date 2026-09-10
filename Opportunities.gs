/**
 * "Priority Prospect Opportunities" tab — explicit, spreadsheet-editable
 * engagement ideas for ANY company, not just ones flagged as a priority
 * account. One row per opportunity (a company can have several); matched
 * to a company by name (same alias + slugify logic as Master Spreadsheet,
 * so "Citigroup" and "Citi" resolve to the same company here too).
 *
 * Open to everyone who has entered the site (requireAuth_, not
 * requireAdmin_) — same as Comments.gs: viewing and adding an opportunity
 * needs no administrator account, just a signed-in member. The client
 * gates ADDING one behind an icon click (on the company card preview or
 * within its full detail card) rather than showing an always-open
 * composer, but that's a UI choice, not an access-control one — this
 * endpoint itself doesn't care how the client got the text.
 *
 * Columns: Company | Opportunity | Status | Notes | Added By | Added Date.
 * Only Company + Opportunity are required — Status/Notes/Added By/Added
 * Date are there for the team to track follow-through, but the app doesn't
 * require them to display an opportunity.
 */

var OPPORTUNITY_HEADERS = ['Company', 'Opportunity', 'Status', 'Notes', 'Added By', 'Added Date'];

/** {companyId: [opportunity strings]} — merged onto readCompanies_() as
 * engagementIdeas, same field name/shape the UI already renders. */
function readOpportunitiesByCompanyId_() {
  var sh = findSheet_(TAB_OPPORTUNITIES);
  var out = {};
  if (!sh) return out;
  var t = readTable_(sh);
  t.rows.forEach(function (r) {
    var company = get_(r, 'Company');
    var opp = get_(r, 'Opportunity');
    if (!company || !opp) return;
    var id = slugify_(canonicalName_(company));
    if (!out[id]) out[id] = [];
    out[id].push(opp);
  });
  return out;
}

/** Full rows (with status/notes) for a single company — used by the
 * Priority Prospects admin UI so status/notes are visible, not just text. */
function api_getOpportunities(token, companyId) {
  requireAuth_(token);
  var sh = findSheet_(TAB_OPPORTUNITIES);
  if (!sh) return [];
  var t = readTable_(sh);
  return t.rows
    .filter(function (r) { return slugify_(canonicalName_(get_(r, 'Company'))) === companyId; })
    .map(function (r) { return { opportunity: get_(r, 'Opportunity'), status: get_(r, 'Status'), notes: get_(r, 'Notes'), addedBy: get_(r, 'Added By'), addedDate: get_(r, 'Added Date') }; });
}

function api_addOpportunity(token, companyName, opportunity, status, notes) {
  var auth = requireAuth_(token);
  opportunity = String(opportunity || '').trim();
  if (!companyName || !opportunity) throw new Error('Company and opportunity text are required.');
  var sh = sheet_(TAB_OPPORTUNITIES);
  sh.appendRow([companyName, opportunity, status || 'Idea', notes || '', auth.name || auth.email, nowIso_()]);
  return { ok: true, engagementIdeas: readOpportunitiesByCompanyId_()[slugify_(canonicalName_(companyName))] || [] };
}
