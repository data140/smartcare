#!/usr/bin/env node
/* 개발용 로컬 서버: dist/local.html + 가짜 데이터 서버(Supabase Auth·REST 흉내, 메모리 저장)
 *   python3 tools/build.py local && node tools/dev-server.js [포트=8080]
 *   서버 로그인: dev@smartcare.test / dev1234   직원 로그인: 100101 / 1234 (가상 데이터)
 * 실제 Supabase 에는 접속하지 않습니다. 서버를 끄면 데이터는 사라집니다. */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = +process.argv[2] || 8080;
const PAGE = path.join(ROOT, 'dist', 'local.html');
const EMAIL = 'dev@smartcare.test', PW = 'dev1234', TOKEN = 'dev-token';
const kv = new Map();
const seed = require('./fake-data.js')();
const now0 = new Date().toISOString();
Object.keys(seed).forEach(k => kv.set(k, { k, v: seed[k], updated_at: now0 }));

const esc = s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const like = pat => { const re = new RegExp('^' + pat.split('*').map(esc).join('.*') + '$'); return v => re.test(v); };
function cond(expr) { // PostgREST 필터 일부: k.like / k.eq / k.in / k.not.like / updated_at.gt
  const m = expr.match(/^(k|updated_at)\.(not\.)?(like|eq|in|gt)\.(.*)$/); if (!m) return () => true;
  const [, col, neg, op, raw] = m; let f;
  if (op === 'like') f = like(raw); else if (op === 'eq') f = v => v === raw; else if (op === 'gt') f = v => v > raw;
  else { const list = raw.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')); f = v => list.includes(v); }
  return r => (neg ? !f(r[col]) : f(r[col]));
}
function splitTop(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; }
function filters(sp) {
  const fs_ = [];
  for (const [key, val] of sp) {
    if (key === 'k' || key === 'updated_at') fs_.push(cond(key + '.' + val));
    else if (key === 'or') { const parts = splitTop(val.replace(/^\(|\)$/g, '')).map(cond); fs_.push(r => parts.some(p => p(r))); }
  }
  return r => fs_.every(f => f(r));
}
const send = (res, s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(o === undefined ? '' : JSON.stringify(o)); };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const p = u.pathname;
    if (p === '/' || p === '/index.html') {
      if (!fs.existsSync(PAGE)) { res.writeHead(500); return res.end('dist/local.html 이 없습니다 — python3 tools/build.py local 을 먼저 실행하세요'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return fs.createReadStream(PAGE).pipe(res);
    }
    const tok = { access_token: TOKEN, refresh_token: 'dev-refresh', expires_in: 3600, user: { email: EMAIL } };
    if (p === '/auth/v1/settings') return send(res, 200, {});
    if (p === '/auth/v1/logout') return send(res, 204);
    if (p === '/auth/v1/token') {
      if (u.searchParams.get('grant_type') === 'refresh_token') return send(res, 200, tok);
      const j = JSON.parse(body || '{}');
      return j.email === EMAIL && j.password === PW ? send(res, 200, tok) : send(res, 400, { error: 'invalid_grant' });
    }
    if (p.startsWith('/rest/v1/') && (req.headers.authorization || '') !== 'Bearer ' + TOKEN) return send(res, 401, { message: 'permission denied' });
    if (p === '/rest/v1/rpc/smartcare_is_member') return send(res, 200, true);
    if (p === '/rest/v1/smartcare_kv') {
      if (req.method === 'POST') { const t = new Date().toISOString(); JSON.parse(body || '[]').forEach(r => kv.set(r.k, { k: r.k, v: r.v, updated_at: r.updated_at || t })); return send(res, 201); }
      let rows = [...kv.values()].filter(filters(u.searchParams));
      if (req.method === 'DELETE') { rows.forEach(r => kv.delete(r.k)); return send(res, 204); }
      rows.sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
      const lim = +u.searchParams.get('limit'); if (lim) rows = rows.slice(0, lim);
      const sel = (u.searchParams.get('select') || 'k,v,updated_at').split(',');
      return send(res, 200, rows.map(r => Object.fromEntries(sel.map(c => [c, r[c]]))));
    }
    send(res, 404, {});
  });
}).listen(PORT, () => console.log('개발 서버: http://localhost:' + PORT + '  (서버 로그인 ' + EMAIL + ' / ' + PW + ')'));
