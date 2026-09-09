/**
 * Per-user favorites, shared across devices (an upgrade over the prototype's
 * per-browser localStorage favorites) — one row per (email, companyId).
 */

function getFavorites_(email) {
  var sh = findSheet_(TAB_FAVORITES);
  var out = {};
  if (!sh || !email) return out;
  email = email.toLowerCase();
  var t = readTable_(sh);
  t.rows.forEach(function (r) {
    if (get_(r, 'Email').toLowerCase() === email) out[get_(r, 'CompanyId')] = true;
  });
  return out;
}

function api_toggleFavorite(token, companyId) {
  var auth = requireAuth_(token);
  var sh = sheet_(TAB_FAVORITES);
  var t = readTable_(sh);
  var email = (auth.email || '').toLowerCase();
  var existingRow = null;
  t.rows.forEach(function (r) {
    if (get_(r, 'Email').toLowerCase() === email && get_(r, 'CompanyId') === companyId) existingRow = r.__row;
  });
  if (existingRow) {
    sh.deleteRow(existingRow);
    logActivity_(auth, 'Unfavorited', companyId);
  } else {
    sh.appendRow([auth.email, companyId, nowIso_()]);
    logActivity_(auth, 'Favorited', companyId);
  }
  return { ok: true, favorites: getFavorites_(auth.email) };
}
