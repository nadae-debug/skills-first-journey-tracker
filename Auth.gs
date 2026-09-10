/**
 * Sessions + login. This is the part of the design_handoff spec that matters
 * most: access control is enforced HERE, server-side, not by anything the
 * client claims about itself. Every api_* function that admins should be able
 * to do (in Code.gs) calls requireAdmin_(token) before touching data; a
 * forged client request with role:'admin' in its payload cannot get past it
 * because the role comes from the server-held session, never the client.
 *
 * Sessions live in CacheService (max 6h TTL, see SESSION_TTL_SECONDS) keyed
 * by an opaque random token. The client stores only the token (in
 * localStorage, to survive a page reload) and passes it as the first
 * argument to every google.script.run call.
 */

/**
 * Never include PasswordHash/Salt here. Apps Script has no true "private"
 * server function — every top-level function in the project (in any .gs
 * file) is independently callable from the client via
 * google.script.run.<name>(...), whether or not the client code ever
 * references it. A function that returns password hashes must never be one
 * of those, so admins_() only returns safe fields; api_login reads the
 * hash/salt itself via a closure nested inside it (see below) that isn't a
 * top-level declaration and so isn't reachable that way.
 */
function admins_() {
  var t = readTable_(sheet_(TAB_ADMINS));
  return t.rows.map(function (r) {
    return { name: get_(r, 'Name'), email: get_(r, 'Email').toLowerCase(), row: r.__row };
  });
}

function findAdminByEmail_(email) {
  var list = admins_();
  email = String(email || '').trim().toLowerCase();
  for (var i = 0; i < list.length; i++) if (list[i].email === email) return list[i];
  return null;
}

function putSession_(auth) {
  var token = randomToken_();
  CacheService.getScriptCache().put(token, JSON.stringify(auth), SESSION_TTL_SECONDS);
  return token;
}

function getSession_(token) {
  if (!token) return null;
  var raw = CacheService.getScriptCache().get(token);
  return raw ? safeJsonParse_(raw, null) : null;
}

/** Throws if the token doesn't resolve to a signed-in user; returns the auth object otherwise. */
function requireAuth_(token) {
  var auth = getSession_(token);
  if (!auth) throw new Error('Your session has expired. Please sign in again.');
  return auth;
}

/** Throws unless the token resolves to an administrator. */
function requireAdmin_(token) {
  var auth = requireAuth_(token);
  if (auth.role !== 'admin') throw new Error('This action requires an administrator account.');
  return auth;
}

function emailDomainAllowed_(email) {
  var m = String(email || '').trim().toLowerCase().match(/@([^@]+)$/);
  if (!m) return false;
  var domain = m[1];
  return ALLOWED_EMAIL_DOMAINS.some(function (d) { return domain === d || domain.slice(-(d.length + 1)) === ('.' + d); });
}

/**
 * The site's front gate — no password, just name + email, but the email
 * MUST be at one of ALLOWED_EMAIL_DOMAINS (Config.gs) or entry is refused.
 * This is what actually restricts who can see the site at all; everything
 * else (browsing, comments) is open to anyone who gets past this. Separate
 * from api_login (administrator email + password), which elevates an
 * already-entered session further — reachable from the nav's "Admin login"
 * button once inside.
 */
function api_enter(name, email) {
  name = String(name || '').trim();
  email = String(email || '').trim().toLowerCase();
  if (!name || !email) return { ok: false, error: 'Enter your name and email.' };
  if (!emailDomainAllowed_(email)) {
    // Deliberately vague — this is a domain allow-list, not real
    // authentication, so the rejection message must not confirm that or
    // name the allowed domains; that'd hand anyone the exact rule to get
    // past it. Keep this generic no matter how tempting a more helpful
    // message is.
    return { ok: false, error: "We couldn't verify your access with that email. Double-check it, or reach out to your Opportunity@Work or Ad Council contact for help." };
  }
  var auth = { name: name, email: email, role: 'member' };
  var token = putSession_(auth);
  logActivity_(auth, 'Signed in', '');
  return { ok: true, token: token, auth: auth };
}

/**
 * Administrator sign-in — elevates an entered session (or starts a fresh
 * one) to role 'admin'. Every admin account must exist in the Admins tab
 * (added via api_addAdmin, by another administrator) with an email +
 * password; there's no self-serve admin signup.
 */
function api_login(email, password) {
  email = String(email || '').trim().toLowerCase();
  // Nested on purpose (see admins_()'s comment) — this is the only place
  // PasswordHash/Salt are ever read, and being a closure rather than a
  // top-level function means it can't be invoked independently.
  function findCredentials(targetEmail) {
    var t = readTable_(sheet_(TAB_ADMINS));
    for (var i = 0; i < t.rows.length; i++) {
      var r = t.rows[i];
      if (get_(r, 'Email').toLowerCase() === targetEmail) {
        return { name: get_(r, 'Name'), email: targetEmail, hash: get_(r, 'PasswordHash'), salt: get_(r, 'Salt') };
      }
    }
    return null;
  }
  var adm = findCredentials(email);
  if (!adm || !adm.hash || hashPassword_(password || '', adm.salt) !== adm.hash) {
    return { ok: false, error: 'Incorrect administrator email or password.' };
  }
  var auth = { name: adm.name, email: adm.email, role: 'admin' };
  var token = putSession_(auth);
  logActivity_(auth, 'Signed in', '');
  return { ok: true, token: token, auth: auth };
}

function api_logout(token) {
  var auth = getSession_(token);
  if (auth) logActivity_(auth, 'Signed out', '');
  if (token) CacheService.getScriptCache().remove(token);
  return { ok: true };
}

/** Called on page load if a token is already cached client-side, to restore the session silently. */
function api_whoami(token) {
  var auth = getSession_(token);
  return { ok: !!auth, auth: auth || null };
}

function api_listAdmins(token) {
  requireAdmin_(token);
  return admins_().map(function (a) { return { name: a.name, email: a.email }; });
}

function api_addAdmin(token, name, email, password) {
  requireAdmin_(token);
  name = String(name || '').trim();
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  if (!name || !email || !password) throw new Error('Fill in name, email, and password.');
  if (!emailDomainAllowed_(email)) throw new Error('Administrator accounts must use an @opportunityatwork.org or @adcouncil.org email address.');
  if (findAdminByEmail_(email)) throw new Error('That email is already an administrator.');
  var salt = randomSalt_();
  var hash = hashPassword_(password, salt);
  sheet_(TAB_ADMINS).appendRow([name, email, hash, salt, nowIso_()]);
  return { ok: true, admins: admins_().map(function (a) { return { name: a.name, email: a.email }; }) };
}

function api_removeAdmin(token, email) {
  var auth = requireAdmin_(token);
  email = String(email || '').trim().toLowerCase();
  var list = admins_();
  if (list.length <= 1) throw new Error('At least one administrator is required.');
  if (email === auth.email) throw new Error("You can't remove your own account.");
  var target = findAdminByEmail_(email);
  if (!target) throw new Error('No such administrator.');
  sheet_(TAB_ADMINS).deleteRow(target.row);
  return { ok: true, admins: admins_().map(function (a) { return { name: a.name, email: a.email }; }) };
}
