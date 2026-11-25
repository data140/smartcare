// 스마트케어 보안 감시 서버 함수 (Supabase Edge Function: smartcare-security)
//
// 로그인 화면에서 일어난 로그인 실패·성공을 접속 IP 와 함께 기록하고, 기준을 넘으면 경보를 만들어
// 관리자에게 이메일·문자로 알립니다. 환자 정보는 받지도 저장하지도 않습니다(계정 주소 앞부분과 IP 만).
//
// 요청: POST { action, ws, ... }
//   login_fail  { acct }                       로그인 실패 보고 (로그인 전이라 토큰 없이 호출)
//   login_ok                                   로그인 성공 보고 (Authorization: Bearer <직원 토큰>)
//   cfg_get                                    알림 설정 조회 (관리자)
//   cfg_set     { emails, phones, fail_ip, fail_acct, window_min, new_ip_notify }  (관리자)
//   test                                       시험 알림 보내기 (관리자)
//
// 알림 보내는 곳(서버 비밀값, Supabase › Edge Functions › Secrets): 
//   이메일  RESEND_API_KEY, MAIL_FROM            (resend.com)
//   문자    SOLAPI_KEY, SOLAPI_SECRET, SMS_FROM  (solapi.com, 발신번호 사전 등록 필요)
// 비밀값이 없으면 기록·경보등만 동작하고 이메일·문자는 보내지 않습니다.
//
// 이 파일은 타입 표기 없이 작성해 Node 시험 환경에서도 그대로 실행됩니다 (tools/dev-server.js).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const MAIL_API = Deno.env.get('MAIL_API_URL') || 'https://api.resend.com/emails';
const SMS_API = Deno.env.get('SMS_API_URL') || 'https://api.solapi.com/messages/v4/send';
const DEF = { fail_ip: 10, fail_acct: 5, window_min: 10, new_ip_notify: false };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (status, message) => reply(status, { ok: false, error: message });
const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const num = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

const svc = (path, init = {}) => fetch(SUPABASE_URL + path, {
  ...init,
  headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
});
const sinceIso = (min) => new Date(Date.now() - min * 60000).toISOString();
const enc = encodeURIComponent;

function clientIp(req) {
  const h = (n) => (req.headers.get(n) || '').split(',')[0].trim();
  return str(h('cf-connecting-ip') || h('x-real-ip') || h('x-forwarded-for') || 'unknown', 64);
}

async function count(ws, q) {
  const r = await svc('/rest/v1/smartcare_sec_events?ws=eq.' + enc(ws) + '&' + q + '&select=id', { headers: { Prefer: 'count=exact', Range: '0-0' } });
  if (!r.ok) return 0;
  const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
  return m ? Number(m[1]) : 0;
}
async function insertEvent(row) {
  await svc('/rest/v1/smartcare_sec_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
}
async function getCfg(ws) {
  const r = await svc('/rest/v1/smartcare_sec_cfg?ws=eq.' + enc(ws) + '&select=*');
  const rows = r.ok ? await r.json() : [];
  return { ...DEF, emails: [], phones: [], ...(rows[0] || {}), ws };
}

// ───── 알림 보내기 ─────
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sendMail(to, subject, text) {
  const key = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('MAIL_FROM');
  if (!key || !from) return { ok: false, why: '이메일 발송 설정(RESEND_API_KEY·MAIL_FROM)이 없습니다' };
  const r = await fetch(MAIL_API, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, subject, text }) });
  return r.ok ? { ok: true } : { ok: false, why: '이메일 발송 실패 (HTTP ' + r.status + ')' };
}
async function sendSms(to, text) {
  const key = Deno.env.get('SOLAPI_KEY'), secret = Deno.env.get('SOLAPI_SECRET'), from = Deno.env.get('SMS_FROM');
  if (!key || !secret || !from) return { ok: false, why: '문자 발송 설정(SOLAPI_KEY·SOLAPI_SECRET·SMS_FROM)이 없습니다' };
  const date = new Date().toISOString(), salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(date + salt)));
  const auth = 'HMAC-SHA256 apiKey=' + key + ', date=' + date + ', salt=' + salt + ', signature=' + sig;
  const r = await fetch(SMS_API, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { to, from, text } }) });
  return r.ok ? { ok: true } : { ok: false, why: '문자 발송 실패 (HTTP ' + r.status + ')' };
}
async function notify(cfg, title, detail) {
  const out = { mail: [], sms: [] };
  const text = '[스마트케어 보안 경보] ' + title + '\n' + detail + '\n\n스마트케어에 접속해 상단 경보등에서 내용을 확인하세요.';
  if (cfg.emails && cfg.emails.length) out.mail.push(await sendMail(cfg.emails, '[스마트케어] 보안 경보: ' + title, text).catch((e) => ({ ok: false, why: String(e && e.message || e) })));
  for (const p of (cfg.phones || [])) out.sms.push(await sendSms(p.replace(/[^0-9]/g, ''), text.slice(0, 80)).catch((e) => ({ ok: false, why: String(e && e.message || e) })));
  return out;
}
// 같은 사건은 한 번만(window 안에서), 한 시간에 경보는 너무 많이 만들지 않음 (가짜 신고로 알림이 쏟아지는 것 방지)
async function raise(ws, cfg, key, level, title, detail, ip, userId) {
  const w = cfg.window_min;
  if (await count(ws, 'kind=eq.alert&acct=eq.' + enc(key) + '&at=gte.' + enc(sinceIso(w)))) return false;
  const recent = await count(ws, 'kind=eq.alert&at=gte.' + enc(sinceIso(60)));
  await insertEvent({ ws, kind: 'alert', level, ip, acct: key, user_id: userId || null, title, detail });
  if (recent < 10 && (level === 'crit' || cfg.new_ip_notify)) await notify(cfg, title, detail);
  return true;
}

async function whoAmI(req) {
  const auth = req.headers.get('authorization') || '';
  const ur = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SERVICE_KEY, Authorization: auth } });
  return ur.ok ? (await ur.json()).id : null;
}
async function adminOf(ws, uid) {
  if (!uid) return null;
  const r = await svc('/rest/v1/smartcare_staff?ws=eq.' + enc(ws) + '&user_id=eq.' + enc(uid) + '&select=*');
  const row = r.ok ? (await r.json())[0] : null;
  if (!row || row.status !== '활성') return null;
  return (row.roles || []).some((x) => x === '관리자' || x === '시스템관리자') ? row : null;
}
const providers = () => ({ email: !!(Deno.env.get('RESEND_API_KEY') && Deno.env.get('MAIL_FROM')), sms: !!(Deno.env.get('SOLAPI_KEY') && Deno.env.get('SOLAPI_SECRET') && Deno.env.get('SMS_FROM')) });

async function handle(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail(405, 'POST 만 가능합니다');
  if (!SUPABASE_URL || !SERVICE_KEY) return fail(500, '서버 함수 환경변수가 없습니다');
  let body;
  try { body = await req.json(); } catch (e) { return fail(400, '요청 형식이 잘못되었습니다'); }
  const ws = str(body.ws, 40);
  if (!ws) return fail(400, '작업공간이 없습니다');
  const ip = clientIp(req);

  // 1) 로그인 실패 (로그인 전)
  if (body.action === 'login_fail') {
    const acct = str(body.acct, 80).replace(/@.*$/, '');
    if (await count(ws, 'ip=eq.' + enc(ip) + '&at=gte.' + enc(sinceIso(10))) >= 300) return reply(200, { ok: true });   // 한 IP 의 폭주는 더 쌓지 않음
    await insertEvent({ ws, kind: 'login_fail', ip, acct });
    const cfg = await getCfg(ws), w = sinceIso(cfg.window_min);
    const nIp = await count(ws, 'kind=eq.login_fail&ip=eq.' + enc(ip) + '&at=gte.' + enc(w));
    if (nIp >= cfg.fail_ip) await raise(ws, cfg, 'ipfail:' + ip, 'crit', '같은 IP 에서 로그인 실패 ' + nIp + '회', 'IP ' + ip + ' · 최근 ' + cfg.window_min + '분 · 비밀번호를 알아내려는 시도일 수 있습니다', ip);
    const nAcct = await count(ws, 'kind=eq.login_fail&acct=eq.' + enc(acct) + '&at=gte.' + enc(w));
    if (nAcct >= cfg.fail_acct) await raise(ws, cfg, 'acctfail:' + acct, 'crit', '한 계정에 로그인 실패 ' + nAcct + '회', '계정 ' + acct + ' · 최근 ' + cfg.window_min + '분 · 마지막 시도 IP ' + ip, ip);
    return reply(200, { ok: true });
  }

  // 2) 로그인 성공 (토큰 필요) — 접속 IP 기록, 실패 직후 성공·처음 보는 IP 는 경보
  if (body.action === 'login_ok') {
    const uid = await whoAmI(req);
    if (!uid) return fail(401, '로그인이 필요합니다');
    const cfg = await getCfg(ws);
    const failsFromIp = await count(ws, 'kind=eq.login_fail&ip=eq.' + enc(ip) + '&at=gte.' + enc(sinceIso(cfg.window_min)));
    const seenIp = await count(ws, 'kind=eq.login_ok&user_id=eq.' + enc(uid) + '&ip=eq.' + enc(ip));
    const seenAny = await count(ws, 'kind=eq.login_ok&user_id=eq.' + enc(uid));
    await insertEvent({ ws, kind: 'login_ok', ip, user_id: uid });
    if (failsFromIp >= 3) await raise(ws, cfg, 'okafterfail:' + uid + ':' + ip, 'crit', '로그인 실패가 이어진 뒤 로그인에 성공했습니다', 'IP ' + ip + ' · 직전 실패 ' + failsFromIp + '회 — 본인이 아니면 해당 계정 비밀번호를 바로 바꾸세요', ip, uid);
    else if (seenAny > 0 && seenIp === 0) await raise(ws, cfg, 'newip:' + uid + ':' + ip, 'warn', '평소와 다른 IP 에서 로그인했습니다', 'IP ' + ip + ' · 이 계정의 첫 접속 IP 가 아닙니다', ip, uid);
    return reply(200, { ok: true });
  }

  // 3) 관리자 기능
  const uid = await whoAmI(req);
  if (!uid) return fail(401, '로그인이 필요합니다');
  if (!(await adminOf(ws, uid))) return fail(403, '관리자만 할 수 있습니다');

  if (body.action === 'cfg_get') {
    const c = await getCfg(ws);
    return reply(200, { ok: true, cfg: { emails: c.emails, phones: c.phones, fail_ip: c.fail_ip, fail_acct: c.fail_acct, window_min: c.window_min, new_ip_notify: c.new_ip_notify }, providers: providers() });
  }
  if (body.action === 'cfg_set') {
    const emails = (Array.isArray(body.emails) ? body.emails : []).map((x) => str(x, 200).trim()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)).slice(0, 10);
    const phones = (Array.isArray(body.phones) ? body.phones : []).map((x) => str(x, 20).replace(/[^0-9]/g, '')).filter((x) => /^01[0-9]{8,9}$/.test(x)).slice(0, 10);
    const row = { ws, emails, phones, fail_ip: num(body.fail_ip, 3, 200, DEF.fail_ip), fail_acct: num(body.fail_acct, 3, 100, DEF.fail_acct), window_min: num(body.window_min, 1, 120, DEF.window_min), new_ip_notify: body.new_ip_notify === true, updated_at: new Date().toISOString() };
    const r = await svc('/rest/v1/smartcare_sec_cfg?on_conflict=ws', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    if (!r.ok) return fail(500, '설정을 저장하지 못했습니다 (' + r.status + ')');
    await svc('/rest/v1/smartcare_audit', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ws, user_id: uid, action: 'security.cfg', detail: { emails: emails.length, phones: phones.length } }) });
    return reply(200, { ok: true, cfg: { emails, phones, fail_ip: row.fail_ip, fail_acct: row.fail_acct, window_min: row.window_min, new_ip_notify: row.new_ip_notify } });
  }
  if (body.action === 'test') {
    const c = await getCfg(ws);
    if (!c.emails.length && !c.phones.length) return fail(400, '받을 이메일이나 휴대폰 번호를 먼저 저장하세요');
    const res = await notify(c, '시험 알림입니다 — 실제 위협이 아닙니다', '설정한 알림이 정상으로 도착하는지 확인하는 시험입니다.');
    const all = [...res.mail, ...res.sms];
    return reply(200, { ok: true, sent: all.filter((x) => x.ok).length, failed: all.filter((x) => !x.ok).map((x) => x.why), providers: providers() });
  }
  return fail(400, '알 수 없는 요청입니다');
}

Deno.serve(async (req) => {
  try { return await handle(req); } catch (e) { return fail(500, '서버 함수 오류: ' + (e && e.message ? e.message : e)); }
});
