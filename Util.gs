/**
 * Small shared helpers used across the backend.
 */

function slugify_(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function yes_(v) {
  return /^(yes|true|1|y)$/i.test(String(v || '').trim());
}

function normStage_(v) {
  if (!v) return '';
  var s = String(v).trim().toLowerCase();
  for (var i = 0; i < STAGES.length; i++) {
    if (STAGES[i].toLowerCase() === s) return STAGES[i];
  }
  return String(v).trim();
}

/** Reads a sheet into { headers, rows: [{header: value, ...}] }, trimming strings. */
function readTable_(sh) {
  var values = sh.getDataRange().getValues();
  if (!values.length) return { headers: [], rows: [] };
  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var obj = {};
    var blank = true;
    for (var c = 0; c < headers.length; c++) {
      var v = row[c];
      if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      else if (typeof v === 'string') v = v.trim();
      obj[headers[c]] = v == null ? '' : v;
      if (obj[headers[c]] !== '') blank = false;
    }
    if (!blank) { obj.__row = r + 1; rows.push(obj); }
  }
  return { headers: headers, rows: rows };
}

/** Column letter/index lookup by header name (case-insensitive), 1-based. */
function headerIndex_(headers, name) {
  var lower = name.toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toLowerCase() === lower) return i + 1;
  }
  return -1;
}

function get_(row, name) {
  var v = row[name];
  if (v == null) return '';
  return String(v).trim();
}

/** SHA-256 hex digest with a per-account salt, for admin passwords. Not meant
 * to be bank-grade (Apps Script has no bcrypt), but is far better than the
 * prototype's client-side hash-and-compare-in-the-browser approach: the
 * check now happens only on the server, using a per-account random salt. */
function hashPassword_(password, salt) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password);
  return raw.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function randomSalt_() {
  return Utilities.getUuid();
}

function randomToken_() {
  return Utilities.getUuid() + Utilities.getUuid();
}

function nowIso_() {
  return new Date().toISOString();
}

function safeJsonParse_(s, fallback) {
  try {
    var v = JSON.parse(s);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

/**
 * Shared "Label | URL" convention for any cell that holds a link a viewer
 * should see as a readable name instead of the raw address — Google Sheets'
 * own rich-text hyperlinks (Insert > Link) can't be read back through
 * SpreadsheetApp as separate display-text + URL, so this plain-text
 * convention is the workaround: type `Employer Hub | tearthepaperceiling.org/employers`
 * and get both a friendly label and the real link. A bare URL with no `|`
 * still works — the label just comes out empty, and callers fall back to
 * showing the URL itself. Returns null for a blank cell, or
 * { label, url } (label may be '').
 */
function parseLabeledUrl_(raw) {
  raw = String(raw || '').trim();
  if (!raw) return null;
  var i = raw.indexOf('|');
  if (i === -1) return { label: '', url: raw };
  var label = raw.slice(0, i).trim();
  var url = raw.slice(i + 1).trim();
  return url ? { label: label, url: url } : null;
}
