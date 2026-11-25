#!/usr/bin/env node
/* 개발용 로컬 서버: 화면 + 가짜 데이터 서버(Supabase Auth·REST·서버 함수 흉내, 메모리 저장)
 *
 *   기관 공용 계정 방식 (지금 운영):
 *     python3 tools/build.py local && node tools/dev-server.js [포트=8080]
 *     서버 로그인 dev@smartcare.test / dev1234 → 직원 로그인 100101 / 1234
 *
 *   직원별 계정 방식 (새 서버):
 *     python3 tools/build.py local-staff && node tools/dev-server.js [포트] --staff
 *     직원 로그인 100101 / 1234 (관리자) · 100102 / 1234 (담당자) · 시스템 관리자 admin / demo1234
 *     권한 규칙은 supabase/schema-next.sql 과 같은 규칙을 흉내 내고,
 *     계정 관리는 supabase/functions/smartcare-staff/index.ts 를 그대로 실행합니다.
 *     --empty 를 붙이면 빈 새 서버(시스템 관리자만)로 시작 — 데이터 이전 시험용
 *
 * 실제 Supabase 에는 접속하지 않습니다. 서버를 끄면 데이터는 사라집니다. */
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const STAFF = args.includes('--staff');
const EMPTY = args.includes('--empty');   // 직원별 계정 방식에서 빈 서버로 시작 (시스템 관리자 admin / demo1234 만)
const PORT = +(args.find(a => /^\d+$/.test(a)) || 8080);
const PAGE = path.join(ROOT, 'dist', STAFF ? 'local-staff.html' : 'local.html');
const BASE = 'http://localhost:' + PORT;
const WS = 'smartcare';
const SERVICE_KEY = 'dev-service-key';

// ───── 데이터 ─────
const kv = new Map();
const seed = require('./fake-data.js')();
const now0 = new Date().toISOString();
const users = new Map();      // id → { id, email, password }
const tokens = new Map();     // access token → user id
const refresh = new Map();    // refresh token → user id
const staff = [];             // smartcare_staff 행
const audit = [];

// 공용 계정 방식: 서버 계정 1개
const SHARED_EMAIL = 'dev@smartcare.test', SHARED_PW = 'dev1234', SHARED_TOKEN = 'dev-token';

function newUser(email, password) { const id = crypto.randomUUID(); users.set(id, { id, email, password }); return id; }
const staffEmail = (ws, rid) => 's' + rid + '.' + ws + '@smartcare.invalid';

if (STAFF) {
  // 직원별 계정 방식: 명부의 직원마다 서버 계정 + 직원 정보, 명부에서는 비밀번호를 뺌
  const roster = JSON.parse(seed['smartcare:smartcare.roster.v1']);
  roster.forEach(m => {
    if (EMPTY && m.org !== '*') return;
    const uid = newUser(staffEmail(WS, m.id), m.pw);
    staff.push({ user_id: uid, ws: WS, roster_id: m.id, org: m.org, emp_no: m.empNo || '', gmail: (m.email || '').toLowerCase(), name: m.name, roles: m.roles || [m.role],
      status: m.status, valid_from: null, valid_to: null, must_change: false, last_login: null });
    delete m.pw;
  });
  seed['smartcare:smartcare.roster.v1'] = JSON.stringify(roster);
  seed['smartcare:smartcare.orgs.v1'] = JSON.stringify([{ id: 'ORG1', name: '가상요양병원' }, { id: 'ORG2', name: '나상요양병원' }]);
  if (EMPTY) Object.keys(seed).forEach(k => delete seed[k]);
}
Object.keys(seed).forEach(k => kv.set(k, { k, v: seed[k], updated_at: now0 }));

// ───── 권한 규칙 (schema-next.sql 과 같은 규칙) ─────
const GLOBAL = ['roster.v1', 'orgs.v1', 'viewMode.v1', 'menu.v1', 'menuCollapsed.v1', 'menuMini.v1', 'kpiView.v1', 'sbW.v1', 'flowView.v1', 'ptCols.v1', 'emrCols.v1', 'cformLib.v1', 'approval.v1', 'theme.v1', 'cformMargin.v1', 'appver.v1'].map(g => 'smartcare.' + g);
const keyOrg = rest => rest.startsWith('smartcare.o.') ? rest.split('.')[2] : (rest.startsWith('smartcare.chart.') || GLOBAL.includes(rest)) ? '*' : 'ORG1';
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
function meRow(uid, ws) {
  const r = staff.find(s => s.user_id === uid && s.ws === ws);
  if (!r || r.status !== '활성') return null;
  if (r.valid_from && r.valid_from > today()) return null;
  if (r.valid_to && r.valid_to < today()) return null;
  return r;
}
function canRead(uid, k) {
  if (!STAFF) return uid === 'shared';
  const ws = k.split(':')[0], me = meRow(uid, ws);
  if (!me) return false;
  const org = keyOrg(k.slice(ws.length + 1));
  return org === '*' || me.org === '*' || me.org === org;
}
function canWrite(uid, k) {
  if (!STAFF) return uid === 'shared';
  return canRead(uid, k) && meRow(uid, k.split(':')[0]).roles.some(r => r !== '조회');
}
function logAudit(uid, ws, action, k, size, detail) { audit.push({ id: audit.length + 1, at: new Date().toISOString(), user_id: uid, ws, action, k: k || null, size: size == null ? null : size, detail: detail || null }); }

// ───── PostgREST 필터 일부 ─────
const esc = s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const like = pat => { const re = new RegExp('^' + pat.split('*').map(esc).join('.*') + '$'); return v => re.test(v); };
function cond(expr) {
  const m = expr.match(/^(\w+)\.(not\.)?(like|eq|in|gte|gt)\.(.*)$/); if (!m) return () => true;
  const [, col, neg, op, raw] = m; let f;
  if (op === 'like') f = like(raw); else if (op === 'eq') f = v => String(v) === raw; else if (op === 'gt') f = v => v > raw; else if (op === 'gte') f = v => v >= raw;
  else { const list = raw.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')); f = v => list.includes(String(v)); }
  return r => (neg ? !f(r[col]) : f(r[col]));
}
function splitTop(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; }
const SKIP = ['select', 'order', 'limit', 'offset', 'on_conflict'];
function filters(sp) {
  const fs_ = [];
  for (const [key, val] of sp) {
    if (key === 'or') { const parts = splitTop(val.replace(/^\(|\)$/g, '')).map(cond); fs_.push(r => parts.some(p => p(r))); }
    else if (!SKIP.includes(key)) fs_.push(cond(key + '.' + val));
  }
  return r => fs_.every(f => f(r));
}
const pick = (rows, sel) => (!sel || sel === '*') ? rows : rows.map(r => Object.fromEntries(sel.split(',').map(c => [c, r[c]])));

// ───── 서버 함수 (실제 파일을 그대로 실행) ─────
let fnHandler = null, secHandler = null;
const secEvents = [], secCfg = [], outbox = [];   // 보안 감시 시험용: 기록·설정·'발송한' 메일·문자
function loadFunction() {
  const base = { fetch, Request, Response, Headers, URL, console, Date, JSON, Number, String, Array, Set, Object, Math, encodeURIComponent, Error, Promise, Uint8Array, TextEncoder, crypto: crypto.webcrypto, isFinite: Number.isFinite };
  const run = (name, env, set) => {
    const code = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', name, 'index.ts'), 'utf8');
    vm.runInNewContext(code, Object.assign({ Deno: { env: { get: k => env[k] }, serve: set } }, base), { filename: name + '/index.ts' });
  };
  run('smartcare-staff', { SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY }, h => { fnHandler = h; });
  // 보안 감시: 실제 메일·문자 대신 이 서버의 /mock/* 로 보내 시험에서 확인
  run('smartcare-security', { SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, MAIL_API_URL: BASE + '/mock/mail', SMS_API_URL: BASE + '/mock/sms', RESEND_API_KEY: 'k', MAIL_FROM: 'a@example.com', SOLAPI_KEY: 'k', SOLAPI_SECRET: 's', SMS_FROM: '01000000000' }, h => { secHandler = h; });
}
if (STAFF) loadFunction();

// AI 비서 함수: 실제 파일을 실행하되 Claude SDK 는 가짜로 바꿔 끼움 (실제 AI 에 요청하지 않음)


// ───── HTTP ─────
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' };
const send = (res, s, o, h) => { res.writeHead(s, Object.assign({ 'Content-Type': 'application/json' }, CORS, h || {})); res.end(o === undefined ? '' : JSON.stringify(o)); };
function caller(req) {
  const a = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (a === SERVICE_KEY) return 'service';
  if (!STAFF) return a === SHARED_TOKEN ? 'shared' : null;
  return tokens.get(a) || null;
}
function issue(uid) {
  const t = 'tok-' + crypto.randomUUID(), r = 'ref-' + crypto.randomUUID();
  tokens.set(t, uid); refresh.set(r, uid);
  return { access_token: t, refresh_token: r, expires_in: 3600, user: { id: uid, email: users.get(uid).email } };
}

async function route(req, res, body) {
  const u = new URL(req.url, BASE), p = u.pathname, who = caller(req);
  if (req.method === 'OPTIONS') return send(res, 204);
  if (p === '/' || p === '/index.html') {
    if (!fs.existsSync(PAGE)) { res.writeHead(500); return res.end(path.relative(ROOT, PAGE) + ' 이 없습니다 — python3 tools/build.py ' + (STAFF ? 'local-staff' : 'local') + ' 을 먼저 실행하세요'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return fs.createReadStream(PAGE).pipe(res);
  }
  const J = body ? (() => { try { return JSON.parse(body); } catch (e) { return {}; } })() : {};

  // Auth
  if (p === '/auth/v1/settings') return send(res, 200, {});
  if (p === '/auth/v1/logout') { tokens.delete((req.headers.authorization || '').replace(/^Bearer /, '')); return send(res, 204); }
  if (p === '/auth/v1/token') {
    if (!STAFF) {
      if (u.searchParams.get('grant_type') === 'refresh_token') return send(res, 200, { access_token: SHARED_TOKEN, refresh_token: 'dev-refresh', expires_in: 3600, user: { email: SHARED_EMAIL } });
      return J.email === SHARED_EMAIL && J.password === SHARED_PW ? send(res, 200, { access_token: SHARED_TOKEN, refresh_token: 'dev-refresh', expires_in: 3600, user: { email: SHARED_EMAIL } }) : send(res, 400, { error: 'invalid_grant' });
    }
    if (u.searchParams.get('grant_type') === 'refresh_token') { const uid = refresh.get(J.refresh_token); return uid && users.has(uid) ? send(res, 200, issue(uid)) : send(res, 400, { error: 'invalid_grant' }); }
    const user = [...users.values()].find(x => x.email === J.email && x.password === J.password);
    return user ? send(res, 200, issue(user.id)) : send(res, 400, { error: 'invalid_grant' });
  }
  if (p === '/auth/v1/user') { const uid = tokens.get((req.headers.authorization || '').replace(/^Bearer /, '')); return uid && users.has(uid) ? send(res, 200, { id: uid, email: users.get(uid).email }) : send(res, 401, {}); }
  if (p.startsWith('/auth/v1/admin/users')) {
    if (who !== 'service') return send(res, 403, {});
    const id = p.split('/')[5];
    if (req.method === 'POST') { if ([...users.values()].some(x => x.email === J.email)) return send(res, 422, { msg: 'email exists' }); const nid = newUser(J.email, J.password); return send(res, 200, { id: nid, email: J.email }); }
    if (!users.has(id)) return send(res, 404, {});
    if (req.method === 'PUT') { if (J.password) users.get(id).password = J.password; return send(res, 200, { id }); }
    if (req.method === 'DELETE') { users.delete(id); for (let i = staff.length - 1; i >= 0; i--) if (staff[i].user_id === id) staff.splice(i, 1); for (const [t, v] of tokens) if (v === id) tokens.delete(t); return send(res, 200, {}); }
  }

  // 서버 함수
  if (p === '/functions/v1/smartcare-staff') {
    if (!STAFF) return send(res, 404, {});
    const r = await fnHandler(new Request(BASE + p, { method: req.method, headers: req.headers, body: req.method === 'POST' ? body : undefined }));
    const txt = await r.text();
    res.writeHead(r.status, Object.assign({ 'Content-Type': 'application/json' }, CORS)); return res.end(txt);
  }

  if (p === '/functions/v1/smartcare-security') {
    if (!STAFF) return send(res, 404, {});
    const h = Object.assign({}, req.headers); if (!h['x-forwarded-for'] && !h['cf-connecting-ip']) h['x-forwarded-for'] = (req.socket.remoteAddress || '').replace('::ffff:', '');
    const r = await secHandler(new Request(BASE + p, { method: req.method, headers: h, body: req.method === 'POST' ? body : undefined }));
    const txt = await r.text();
    res.writeHead(r.status, Object.assign({ 'Content-Type': 'application/json' }, CORS)); return res.end(txt);
  }
  if (p === '/mock/mail' || p === '/mock/sms') { outbox.push({ kind: p.slice(6), body: J, at: Date.now() }); return send(res, 200, { id: 'mock' }); }
  if (p === '/mock/outbox') return send(res, 200, outbox);

  // REST
  if (!p.startsWith('/rest/v1/')) return send(res, 404, {});
  if (!who) {
    const anonRpc = ['/rest/v1/rpc/smartcare_login_email', '/rest/v1/rpc/smartcare_login_orgs'];
    if (!(STAFF && anonRpc.includes(p))) return send(res, 401, { message: 'permission denied' });
  }
  const ws = J.p_ws || WS;
  switch (p) {
    case '/rest/v1/rpc/smartcare_is_member': return send(res, 200, STAFF ? !!meRow(who, ws) : who === 'shared');
    case '/rest/v1/rpc/smartcare_login_email': {
      const s = staff.find(r => r.ws === ws && J.p_id && ((J.p_mode === 'sys' && r.org === '*' && r.emp_no === J.p_id) || (J.p_mode === 'emp' && r.org === J.p_org && r.emp_no === J.p_id) || (J.p_mode === 'gmail' && r.org === J.p_org && r.gmail === String(J.p_id).toLowerCase())));
      return send(res, 200, s ? staffEmail(ws, s.roster_id) : 'x' + crypto.createHash('md5').update([ws, J.p_mode, J.p_org, J.p_id].join('|')).digest('hex').slice(0, 16) + '@smartcare.invalid');
    }
    case '/rest/v1/rpc/smartcare_login_orgs': { const row = kv.get(ws + ':smartcare.orgs.v1'); let a = []; try { a = JSON.parse(row.v); } catch (e) {} return send(res, 200, a.map(o => ({ id: o.id, name: o.name }))); }
    case '/rest/v1/rpc/smartcare_sec_names': { const m = meRow(who, ws); return send(res, 200, m && m.roles.some(r => r === '관리자' || r === '시스템관리자') ? staff.filter(x => x.ws === ws).map(x => ({ user_id: x.user_id, name: x.name, org: x.org })) : []); }
    case '/rest/v1/rpc/smartcare_me': { const s = meRow(who, ws); return send(res, 200, s ? { roster_id: s.roster_id, org: s.org, roles: s.roles, name: s.name, must_change: s.must_change } : null); }
    case '/rest/v1/rpc/smartcare_touch_login': { const s = meRow(who, ws); if (s) { s.last_login = new Date().toISOString(); logAudit(who, ws, 'login'); } return send(res, 200, null); }
  }
  if (p === '/rest/v1/smartcare_kv') {
    if (req.method === 'POST') {
      const rows = JSON.parse(body || '[]');
      if (who !== 'service' && rows.some(r => !canWrite(who, r.k))) return send(res, 403, { code: '42501', message: 'new row violates row-level security policy' });
      const t = new Date().toISOString();
      rows.forEach(r => { const had = kv.has(r.k); kv.set(r.k, { k: r.k, v: r.v, updated_at: r.updated_at || t }); logAudit(who, r.k.split(':')[0], had ? 'update' : 'insert', r.k, (r.v || '').length); });
      return send(res, 201);
    }
    let rows = [...kv.values()].filter(filters(u.searchParams));
    if (req.method === 'DELETE') { rows.filter(r => who === 'service' || canWrite(who, r.k)).forEach(r => { kv.delete(r.k); logAudit(who, r.k.split(':')[0], 'delete', r.k, 0); }); return send(res, 204); }
    if (who !== 'service') rows = rows.filter(r => canRead(who, r.k));
    rows.sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
    if (u.searchParams.get('order') === 'k') rows.sort((a, b) => (a.k < b.k ? -1 : 1));
    const off = +u.searchParams.get('offset') || 0, lim = +u.searchParams.get('limit');
    rows = rows.slice(off, lim ? off + lim : undefined);
    return send(res, 200, pick(rows, u.searchParams.get('select') || 'k,v,updated_at'));
  }
  if (p === '/rest/v1/smartcare_staff') {
    if (req.method === 'GET') { let rows = staff.filter(filters(u.searchParams)); if (who !== 'service') rows = rows.filter(r => r.user_id === who); return send(res, 200, pick(rows, u.searchParams.get('select'))); }
    if (who !== 'service') return send(res, 403, { code: '42501' });
    if (req.method === 'POST') { const row = J; if (staff.some(s => s.user_id === row.user_id || (s.ws === row.ws && s.roster_id === row.roster_id))) return send(res, 409, {}); staff.push(Object.assign({ must_change: true, last_login: null }, row)); return send(res, 201); }
    if (req.method === 'PATCH') { staff.filter(filters(u.searchParams)).forEach(s => Object.assign(s, J)); return send(res, 204); }
  }
  if (p === '/rest/v1/smartcare_audit') {
    if (req.method === 'POST' && who === 'service') { logAudit(J.user_id, J.ws, J.action, J.k, J.size, J.detail); return send(res, 201); }
    if (req.method === 'GET') { const rows = audit.filter(filters(u.searchParams)).filter(a => who === 'service' || (STAFF && meRow(who, a.ws) && meRow(who, a.ws).roles.some(r => r === '관리자' || r === '시스템관리자'))); return send(res, 200, rows); }
    return send(res, 403, {});
  }
  if (p === '/rest/v1/smartcare_sec_events' || p === '/rest/v1/smartcare_sec_cfg') {
    const isEv = p.endsWith('events'), T = isEv ? secEvents : secCfg;
    const adminOk = (w) => who === 'service' || (STAFF && meRow(who, w) && meRow(who, w).roles.some(r => r === '관리자' || r === '시스템관리자'));
    if (req.method === 'POST') {
      if (who !== 'service') return send(res, 403, { code: '42501' });
      const rows = [].concat(J);
      rows.forEach(r => { if (isEv) T.push(Object.assign({ id: T.length + 1, at: new Date().toISOString() }, r)); else { const i = T.findIndex(x => x.ws === r.ws); if (i >= 0) Object.assign(T[i], r); else T.push(r); } });
      return send(res, 201);
    }
    if (req.method === 'GET') {
      const rows = T.filter(filters(u.searchParams)).filter(r => adminOk(r.ws));
      const total = rows.length;
      return send(res, 200, pick(rows, u.searchParams.get('select')), (req.headers.prefer || '').includes('count=exact') ? { 'Content-Range': '0-0/' + total } : {});
    }
    return send(res, 403, {});
  }
  return send(res, 404, {});
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => route(req, res, body).catch(e => { console.error(e); send(res, 500, { error: e.message }); }));
}).listen(PORT, () => console.log('개발 서버: ' + BASE + (STAFF ? '  (직원별 계정 · 직원 로그인 100101 / 1234)' : '  (서버 로그인 ' + SHARED_EMAIL + ' / ' + SHARED_PW + ')')));
