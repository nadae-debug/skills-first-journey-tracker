/**
 * App-wide appearance/behavior settings (title, accent color, optional
 * outbound email endpoint) — a two-column Key/Value tab so admins can also
 * tweak it directly in Sheets if needed.
 */

var SETTINGS_DEFAULTS = { title: 'Skills-First Journey Tracker', accent: '#8c4799' };

function getSettings_() {
  var sh = findSheet_(TAB_SETTINGS);
  var out = Object.assign({}, SETTINGS_DEFAULTS);
  if (!sh) return out;
  var t = readTable_(sh);
  t.rows.forEach(function (r) {
    var k = get_(r, 'Key');
    if (k) out[k] = get_(r, 'Value');
  });
  return out;
}

function api_setSetting(token, patch) {
  requireAdmin_(token);
  var sh = sheet_(TAB_SETTINGS);
  var t = readTable_(sh);
  var byKey = {};
  t.rows.forEach(function (r) { byKey[get_(r, 'Key')] = r.__row; });
  Object.keys(patch || {}).forEach(function (k) {
    var v = patch[k];
    if (byKey[k]) {
      sh.getRange(byKey[k], 2).setValue(v);
    } else {
      sh.appendRow([k, v]);
      byKey[k] = sh.getLastRow();
    }
  });
  return { ok: true, settings: getSettings_() };
}
