/**
 * Company comments — a live, shared notes thread per company, requested so
 * the team can leave running commentary on a company card without it being
 * trapped in one person's browser.
 *
 * Storage: a "Comments" tab in the SAME Google Sheet workbook that already
 * backs the rest of the app (see Config.gs's SHEET_ID) — one row per
 * comment: CompanyId | Timestamp | WhoName | WhoEmail | Role | Comment.
 * Nothing is ever written to localStorage; every add/read goes through this
 * server-side Apps Script function against the Sheet, so every viewer sees
 * the same thread in real time (on next read — see the note in the client
 * about polling, since Apps Script has no push/websocket channel).
 *
 * Any signed-in administrator may add a comment or read a company's thread
 * (there is no other role). Comments are NOT included in shares/exports/
 * downloads (those already exclude everything except the fields CLAUDE.md
 * allows, and comments aren't on that allow-list either) — they're an
 * internal working thread, not client-facing content.
 */

function readAllComments_() {
  var sh = findSheet_(TAB_COMMENTS);
  if (!sh) return [];
  var t = readTable_(sh);
  return t.rows.map(function (r) {
    return { companyId: get_(r, 'CompanyId'), ts: get_(r, 'Timestamp'), who: get_(r, 'WhoName'), email: get_(r, 'WhoEmail'), role: get_(r, 'Role'), text: get_(r, 'Comment') };
  });
}

/** {companyId: count} for every company with at least one comment — cheap
 * enough to include in api_bootstrap so cards can show a comment badge
 * without fetching each company's full thread. */
function getCommentCounts_() {
  var counts = {};
  readAllComments_().forEach(function (c) { counts[c.companyId] = (counts[c.companyId] || 0) + 1; });
  return counts;
}

function api_getComments(token, companyId) {
  requireAuth_(token);
  return readAllComments_().filter(function (c) { return c.companyId === companyId; });
}

function api_addComment(token, companyId, text) {
  var auth = requireAuth_(token);
  text = String(text || '').trim();
  if (!text) throw new Error('Comment text is required.');
  if (!companyId) throw new Error('Missing company id.');
  sheet_(TAB_COMMENTS).appendRow([companyId, nowIso_(), auth.name || auth.email, auth.email, auth.role, text]);
  logActivity_(auth, 'Commented', companyId);
  return { ok: true, comments: api_getComments(token, companyId), commentCounts: getCommentCounts_() };
}
