/* Mountain Notes sign-in for Vercel.
   One function answers every /api/... path (vercel.json sends them all here):
     /api/login     -> sends you to Google to sign in
     /api/callback  -> Google sends you back here; keeps your sign-in in a secure cookie
     /api/token     -> gives the app a fresh Google access token for your Drive
     /api/logout    -> signs this device out (or, with ?acct=, removes one connected Google account)
   Settings (Vercel -> Project -> Settings -> Environment Variables):
     GOOGLE_CLIENT_ID      OAuth client ID (Web application)
     GOOGLE_CLIENT_SECRET  its client secret
     SESSION_SECRET        any long random text; keeps the sign-in cookie private
     ALLOWED_EMAILS        optional: comma-separated Google accounts allowed to use this copy
     GOOGLE_API_KEY        optional: lets "Open from Drive" show the Google file picker
*/
import crypto from 'node:crypto';

const AUTH_URL = process.env.OAUTH_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = process.env.OAUTH_TOKEN_URL || 'https://oauth2.googleapis.com/token';
/* drive.appdata: the hidden backup folder. drive: browse your Drive folders under Connections and save annotated copies there. */
const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.appdata', 'https://www.googleapis.com/auth/drive'];
const COOKIE = 'ink_s', STATE = 'ink_st', YEAR = 400 * 24 * 3600;

const env = k => (process.env[k] || '').trim();
const missing = () => ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET'].filter(k => !env(k));
const key = () => crypto.createHash('sha256').update('mountain-notes:' + env('SESSION_SECRET')).digest();
const b64u = b => Buffer.from(b).toString('base64url');

function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return b64u(Buffer.concat([iv, c.getAuthTag(), enc]));
}
function open(s) {
  try {
    const raw = Buffer.from(String(s || ''), 'base64url'); if (raw.length < 29) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12)); d.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
  } catch (e) { return null; }
}
function cookies(req) {
  const out = {}; for (const part of (req.headers.get('cookie') || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function setCookie(name, value, maxAge, secure) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
const origin = (req, u) => env('APP_URL').replace(/\/$/, '') || `${req.headers.get('x-forwarded-proto') || u.protocol.replace(':', '')}://${req.headers.get('x-forwarded-host') || req.headers.get('host') || u.host}`;
const isSecure = (req, u) => (req.headers.get('x-forwarded-proto') || u.protocol.replace(':', '')) === 'https';
const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const redirect = (to, setCookies = []) => { const h = new Headers({ location: to, 'cache-control': 'no-store' }); for (const c of setCookies) h.append('set-cookie', c); return new Response(null, { status: 302, headers: h }); };
const allowed = email => { const list = env('ALLOWED_EMAILS').toLowerCase().split(/[\s,;]+/).filter(Boolean); return !list.length || list.includes(String(email || '').toLowerCase()); };
const userFromIdToken = t => { try { const p = JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString('utf8')); return { sub: p.sub, email: p.email, name: p.name || p.email, picture: p.picture || '' }; } catch (e) { return null; } };

async function google(params) {
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), ...params }) });
  let j = {}; try { j = await r.json(); } catch (e) { }
  return { ok: r.ok, status: r.status, j };
}

async function login(req, u) {
  if (missing().length) return redirect('/?signin=config');
  const st = b64u(crypto.randomBytes(18)), hint = u.searchParams.get('hint') || '', add = u.searchParams.get('add') === '1';
  const q = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: origin(req, u) + '/api/callback', response_type: 'code',
    scope: SCOPES.join(' '), access_type: 'offline', include_granted_scopes: 'true', state: st,
    prompt: hint ? 'consent' : 'consent select_account'
  });
  if (hint) q.set('login_hint', hint);
  return redirect(AUTH_URL + '?' + q, [setCookie(STATE, seal({ st, add }), 900, isSecure(req, u))]);
}

async function callback(req, u) {
  const sec = isSecure(req, u), clearState = setCookie(STATE, '', 0, sec);
  const err = u.searchParams.get('error');
  if (err) return redirect('/?signin=' + (err === 'access_denied' ? 'cancelled' : 'error'), [clearState]);
  const code = u.searchParams.get('code'), st = u.searchParams.get('state'), state = open(cookies(req)[STATE]);
  if (!code || !st || !state || st !== state.st) return redirect('/?signin=error', [clearState]);
  const t = await google({ grant_type: 'authorization_code', code, redirect_uri: origin(req, u) + '/api/callback' });
  if (!t.ok || !t.j.access_token) return redirect('/?signin=error', [clearState]);
  const user = userFromIdToken(t.j.id_token);
  if (!user || !user.email) return redirect('/?signin=error', [clearState]);
  if (!t.j.refresh_token) return redirect('/?signin=error', [clearState]);
  const cur = open(cookies(req)[COOKIE]);
  if (state.add && cur && cur.rt && cur.u) {
    /* another Google account for Connections: kept next to the signed-in one */
    if (user.email.toLowerCase() === String(cur.u.email).toLowerCase()) { cur.rt = t.j.refresh_token; cur.u = user; }
    else { cur.ex = (cur.ex || []).filter(a => a.u.email.toLowerCase() !== user.email.toLowerCase()).concat({ rt: t.j.refresh_token, u: user }).slice(-6); }
    return redirect('/?connected=' + encodeURIComponent(user.email), [clearState, setCookie(COOKIE, seal(cur), YEAR, sec)]);
  }
  if (!allowed(user.email)) return redirect('/?signin=denied&email=' + encodeURIComponent(user.email), [clearState]);
  if (!String(t.j.scope || '').includes('drive.appdata')) return redirect('/?signin=noscope&email=' + encodeURIComponent(user.email), [clearState]);
  const keep = cur && cur.u && cur.u.email === user.email ? (cur.ex || []) : [];
  return redirect('/?signin=ok', [clearState, setCookie(COOKIE, seal({ rt: t.j.refresh_token, u: user, at: Date.now(), ex: keep }), YEAR, sec)]);
}

const accountsOf = s => [{ ...s.u, main: true }, ...(s.ex || []).map(a => a.u)];
async function token(req, u) {
  const miss = missing(); if (miss.length) return json({ error: 'config', missing: miss }, 500);
  const s = open(cookies(req)[COOKIE]); if (!s || !s.rt) return json({ reason: '' }, 401);
  if (!allowed(s.u && s.u.email)) return json({ reason: 'denied', email: s.u && s.u.email }, 401, { 'set-cookie': setCookie(COOKIE, '', 0, isSecure(req, u)) });
  const acct = (u.searchParams.get('acct') || '').toLowerCase();
  if (acct && acct !== String(s.u.email).toLowerCase()) {
    /* a token for one of the other connected accounts */
    const a = (s.ex || []).find(x => x.u.email.toLowerCase() === acct);
    if (!a) return json({ error: 'noacct', accounts: accountsOf(s) }, 409);
    const t2 = await google({ grant_type: 'refresh_token', refresh_token: a.rt });
    if (!t2.ok || !t2.j.access_token) {
      if (t2.j && t2.j.error === 'invalid_grant') { s.ex = s.ex.filter(x => x !== a); return json({ reconnect: true, email: a.u.email, accounts: accountsOf(s) }, 409, { 'set-cookie': setCookie(COOKIE, seal(s), YEAR, isSecure(req, u)) }); }
      return json({ error: 'google', detail: (t2.j && (t2.j.error_description || t2.j.error)) || String(t2.status) }, 502);
    }
    return json({ access_token: t2.j.access_token, expires_in: t2.j.expires_in || 3600, scope: t2.j.scope || '', user: a.u, accounts: accountsOf(s) });
  }
  const t = await google({ grant_type: 'refresh_token', refresh_token: s.rt });
  if (!t.ok || !t.j.access_token) {
    if (t.j && t.j.error === 'invalid_grant') return json({ reason: 'expired', email: s.u && s.u.email }, 401, { 'set-cookie': setCookie(COOKIE, '', 0, isSecure(req, u)) });
    return json({ error: 'google', detail: (t.j && (t.j.error_description || t.j.error)) || String(t.status) }, 502);
  }
  const cid = env('GOOGLE_CLIENT_ID'), out = { access_token: t.j.access_token, expires_in: t.j.expires_in || 3600, scope: t.j.scope || '', user: s.u, accounts: accountsOf(s) };
  if (env('GOOGLE_API_KEY')) out.picker = { key: env('GOOGLE_API_KEY'), appId: cid.split('-')[0] };
  return json(out);
}

async function logout(req, u) {
  const acct = (u.searchParams.get('acct') || '').toLowerCase(), s = open(cookies(req)[COOKIE]);
  if (acct && s && s.u && acct !== String(s.u.email).toLowerCase()) {
    s.ex = (s.ex || []).filter(a => a.u.email.toLowerCase() !== acct);
    return json({ ok: true, accounts: accountsOf(s) }, 200, { 'set-cookie': setCookie(COOKIE, seal(s), YEAR, isSecure(req, u)) });
  }
  return json({ ok: true }, 200, { 'set-cookie': setCookie(COOKIE, '', 0, isSecure(req, u)) });
}

export default {
  async fetch(req) {
    const u = new URL(req.url), p = (u.searchParams.get('route') || u.pathname.replace(/\/+$/, '').split('/').pop()).replace(/^\/+/, '');
    u.searchParams.delete('route');
    try {
      if (p === 'login') return await login(req, u);
      if (p === 'callback') return await callback(req, u);
      if (p === 'token') return await token(req, u);
      if (p === 'logout') return req.method === 'POST' ? await logout(req, u) : json({ error: 'method' }, 405);
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: 'server', detail: String(e && e.message || e).slice(0, 200) }, 500);
    }
  }
};
