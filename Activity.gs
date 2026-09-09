/**
 * Shared, server-side activity log — replaces the prototype's per-browser
 * localStorage log. The prototype's rule ("only visitor actions are logged,
 * never admin") no longer applies now that every account is an
 * administrator (the general/visitor login was removed) — every sign-in and
 * action is logged here so the log still serves its original purpose: a
 * shared audit trail of who did what. Only admins may read or clear it
 * (enforced here, not just hidden in the UI).
 */

function logActivity_(auth, action, target) {
  if (!auth) return;
  var sh = findSheet_(TAB_ACTIVITY);
  if (!sh) return; // tab not set up yet; fail soft rather than breaking the caller's action
  sh.appendRow([nowIso_(), auth.name || auth.email || '', auth.email || '', auth.role || 'admin', action, target || '']);
}

function api_track(token, action, target) {
  var auth = getSession_(token);
  logActivity_(auth, action, target);
  return { ok: true };
}

function api_getActivity(token) {
  requireAdmin_(token);
  var sh = findSheet_(TAB_ACTIVITY);
  if (!sh) return [];
  var t = readTable_(sh);
  var out = t.rows.map(function (r) {
    return { ts: get_(r, 'Timestamp'), who: get_(r, 'WhoName'), email: get_(r, 'WhoEmail'), role: get_(r, 'Role'), action: get_(r, 'Action'), target: get_(r, 'Target') };
  });
  out.reverse(); // newest first
  return out.slice(0, 2000);
}

function api_clearActivity(token) {
  requireAdmin_(token);
  var sh = sheet_(TAB_ACTIVITY);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, sh.getLastColumn()).clearContent();
  return { ok: true };
}
