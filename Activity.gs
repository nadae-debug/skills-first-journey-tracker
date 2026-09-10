/**
 * Shared, server-side activity log — replaces the prototype's per-browser
 * localStorage log. Only MEMBER actions are recorded (everyone who enters
 * through the domain-gated front door, see Auth.gs's api_enter) — an
 * administrator's own actions aren't logged, same as the original design
 * intent ("track what information is accessed" by the org's staff/
 * partners, not audit the admins themselves). Only admins may read or
 * clear the log (enforced here, not just hidden in the UI).
 */

function logActivity_(auth, action, target) {
  if (!auth || auth.role === 'admin') return;
  var sh = findSheet_(TAB_ACTIVITY);
  if (!sh) return; // tab not set up yet; fail soft rather than breaking the caller's action
  sh.appendRow([nowIso_(), auth.name || auth.email || '', auth.email || '', auth.role || 'member', action, target || '']);
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
