// 스마트케어 계정 관리 서버 함수 (Supabase Edge Function: smartcare-staff)
//
// 직원 서버 계정을 만들고, 비밀번호를 바꾸고, 기관·역할·사용 여부를 서버의 직원 정보(smartcare_staff)에 맞춥니다.
// 서버 키(service role)는 Supabase가 함수 환경변수로 넣어 주며, 화면 코드에는 들어가지 않습니다.
//
// 요청: POST { action, ws, ... }  (Authorization: Bearer <로그인한 직원 토큰>)
//   self_password  { password }                              본인 비밀번호 변경
//   sync           { staff: {...}, password?, must_change?, create? } 계정 만들기·고치기 (관리자)
//   delete         { roster_id }                             계정 삭제 (관리자)
//
// 이 파일은 타입 표기 없이 작성해 Node 시험 환경에서도 그대로 실행됩니다 (tools/dev-server.js).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const DOMAIN = 'smartcare.invalid';
const ROLES = ['관리자', '담당자', '보조', '조회', '시스템관리자'];
const MIN_PW = 8;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (status, message) => reply(status, { ok: false, error: message });

const svc = (path, init = {}) => fetch(SUPABASE_URL + path, {
  ...init,
  headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
});
const staffEmail = (ws, rosterId) => 's' + rosterId + '.' + ws + '@' + DOMAIN;
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const isDate = (v) => v == null || v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);

function activeRow(row) {
  if (!row || row.status !== '활성') return false;
  const d = today();
  if (row.valid_from && row.valid_from > d) return false;
  if (row.valid_to && row.valid_to < d) return false;
  return true;
}

async function getStaff(ws, filter) {
  const r = await svc('/rest/v1/smartcare_staff?ws=eq.' + encodeURIComponent(ws) + '&' + filter + '&select=*');
  if (!r.ok) throw new Error('직원 정보 조회 실패 (' + r.status + ')');
  const rows = await r.json();
  return rows[0] || null;
}

async function audit(ws, uid, action, detail) {
  await svc('/rest/v1/smartcare_audit', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ws, user_id: uid, action, detail }) });
}

function cleanStaff(s) {
  const roles = Array.isArray(s.roles) ? s.roles.filter((r) => ROLES.includes(r)) : [];
  return {
    roster_id: Number(s.roster_id),
    org: str(s.org, 40),
    emp_no: str(s.emp_no, 40),
    gmail: str(s.gmail, 200).toLowerCase(),
    name: str(s.name, 100),
    roles: [...new Set(roles)],
    status: s.status === '활성' ? '활성' : '중지',
    valid_from: s.valid_from || null,
    valid_to: s.valid_to || null,
  };
}

async function handle(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail(405, 'POST 만 가능합니다');
  if (!SUPABASE_URL || !SERVICE_KEY) return fail(500, '서버 함수 환경변수가 없습니다');

  // 1) 호출한 직원 확인
  const auth = req.headers.get('authorization') || '';
  const ur = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SERVICE_KEY, Authorization: auth } });
  if (!ur.ok) return fail(401, '로그인이 필요합니다');
  const uid = (await ur.json()).id;

  let body;
  try { body = await req.json(); } catch (e) { return fail(400, '요청 형식이 잘못되었습니다'); }
  const ws = str(body.ws, 40);
  if (!ws) return fail(400, '작업공간이 없습니다');
  const me = await getStaff(ws, 'user_id=eq.' + uid);
  if (!activeRow(me)) return fail(403, '사용할 수 없는 계정입니다');
  const isSys = me.org === '*' && me.roles.includes('시스템관리자');
  const isAdmin = isSys || me.roles.includes('관리자');

  // 2) 본인 비밀번호 변경
  if (body.action === 'self_password') {
    const pw = str(body.password, 200);
    if (pw.length < MIN_PW) return fail(400, '비밀번호는 ' + MIN_PW + '자 이상이어야 합니다');
    const r = await svc('/auth/v1/admin/users/' + uid, { method: 'PUT', body: JSON.stringify({ password: pw }) });
    if (!r.ok) return fail(500, '비밀번호를 바꾸지 못했습니다 (' + r.status + ')');
    await svc('/rest/v1/smartcare_staff?user_id=eq.' + uid, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ must_change: false, updated_at: new Date().toISOString() }) });
    await audit(ws, uid, 'staff.self_password', { roster_id: me.roster_id });
    return reply(200, { ok: true });
  }

  if (!isAdmin) return fail(403, '계정 관리는 관리자만 할 수 있습니다');

  // 관리자가 다룰 수 있는 계정인지: 시스템 관리자는 전부, 기관 관리자는 자기 기관의 일반 계정만, 자기 자신은 제외
  const canManage = (row) => {
    if (!row) return true;
    if (row.user_id === uid) return false;
    if (isSys) return true;
    return row.org === me.org && !row.roles.includes('시스템관리자');
  };

  // 3) 계정 만들기·고치기
  if (body.action === 'sync') {
    const s = cleanStaff(body.staff || {});
    if (!Number.isInteger(s.roster_id) || s.roster_id <= 0) return fail(400, '직원 번호가 잘못되었습니다');
    if (!s.org) return fail(400, '소속 기관이 없습니다');
    if (!isDate(s.valid_from) || !isDate(s.valid_to)) return fail(400, '사용 기간 형식이 잘못되었습니다');
    if (!isSys && (s.org !== me.org || s.roles.includes('시스템관리자'))) return fail(403, '다른 기관 계정이나 시스템 관리자 권한은 다룰 수 없습니다');
    if (s.org === '*' && !isSys) return fail(403, '시스템 관리자 계정은 시스템 관리자만 다룰 수 있습니다');
    const existing = await getStaff(ws, 'roster_id=eq.' + s.roster_id);
    if (existing && body.create === true) return fail(409, '이미 사용 중인 직원 번호입니다 — 화면을 새로고침한 뒤 다시 추가하세요');
    if (!canManage(existing)) return fail(403, '이 계정은 바꿀 수 없습니다');
    const pw = body.password == null ? null : str(body.password, 200);
    if (pw != null && pw.length < MIN_PW) return fail(400, '비밀번호는 ' + MIN_PW + '자 이상이어야 합니다');
    const fields = { ...s, ws, updated_at: new Date().toISOString() };
    if (typeof body.must_change === 'boolean') fields.must_change = body.must_change;

    if (!existing) {
      if (pw == null) return fail(400, '새 계정에는 비밀번호가 필요합니다');
      const cr = await svc('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: staffEmail(ws, s.roster_id), password: pw, email_confirm: true }) });
      if (!cr.ok) return fail(500, '서버 계정을 만들지 못했습니다 (' + cr.status + ')');
      const user = await cr.json();
      const ins = await svc('/rest/v1/smartcare_staff', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...fields, user_id: user.id, must_change: fields.must_change !== false }) });
      if (!ins.ok) {
        await svc('/auth/v1/admin/users/' + user.id, { method: 'DELETE' });
        return fail(500, '직원 정보를 저장하지 못했습니다 (' + ins.status + ')');
      }
      await audit(ws, uid, 'staff.create', { roster_id: s.roster_id, org: s.org, roles: s.roles });
      return reply(200, { ok: true, created: true });
    }

    if (pw != null) {
      const pr = await svc('/auth/v1/admin/users/' + existing.user_id, { method: 'PUT', body: JSON.stringify({ password: pw }) });
      if (!pr.ok) return fail(500, '비밀번호를 바꾸지 못했습니다 (' + pr.status + ')');
    }
    const up = await svc('/rest/v1/smartcare_staff?user_id=eq.' + existing.user_id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(fields) });
    if (!up.ok) return fail(500, '직원 정보를 저장하지 못했습니다 (' + up.status + ')');
    await audit(ws, uid, pw != null ? 'staff.update+password' : 'staff.update', { roster_id: s.roster_id, org: s.org, roles: s.roles, status: s.status });
    return reply(200, { ok: true, created: false });
  }

  // 4) 계정 삭제
  if (body.action === 'delete') {
    const rid = Number(body.roster_id);
    const existing = await getStaff(ws, 'roster_id=eq.' + rid);
    if (!existing) return reply(200, { ok: true, deleted: false });
    if (!canManage(existing)) return fail(403, '이 계정은 삭제할 수 없습니다');
    const dr = await svc('/auth/v1/admin/users/' + existing.user_id, { method: 'DELETE' });
    if (!dr.ok) return fail(500, '서버 계정을 삭제하지 못했습니다 (' + dr.status + ')');
    await audit(ws, uid, 'staff.delete', { roster_id: rid });
    return reply(200, { ok: true, deleted: true });
  }

  return fail(400, '알 수 없는 요청입니다');
}

Deno.serve(async (req) => {
  try { return await handle(req); } catch (e) { return fail(500, '서버 함수 오류: ' + (e && e.message ? e.message : e)); }
});
