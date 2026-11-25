#!/usr/bin/env node
/* 직원별 계정 방식(새 서버) 시험
 *   python3 tools/build.py local-staff && node tests/smoke-staff.js
 * 개발 서버(--staff)를 띄우고 확인합니다.
 *   - 계정 관리 서버 함수(supabase/functions/smartcare-staff)의 권한: 누가 어떤 계정을 만들고·바꾸고·지울 수 있는지
 *   - 화면: 로그인 화면(서버 로그인 단계 없음) → 직원 로그인 → 주요 메뉴 → 로그아웃
 *   - 중지된 계정 로그인 거부, 임시 비밀번호 로그인 시 비밀번호 변경 강제
 * 실제 Supabase(supabase.co)로 나가는 요청이 하나라도 있으면 실패로 봅니다. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8788, BASE = 'http://localhost:' + PORT;
const MENUS = ['서면 동의서 관리', '캘린더', '일지 목록 · 검수', '출석부', '앨범', '전체 보기', '운영 지표', '환자 등록 관리'];
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };

async function token(mode, org, id, pw) {
  const email = await (await fetch(BASE + '/rest/v1/rpc/smartcare_login_email', { method: 'POST', headers: { apikey: 'k', 'Content-Type': 'application/json' }, body: JSON.stringify({ p_ws: 'smartcare', p_mode: mode, p_org: org, p_id: id }) })).json();
  const r = await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
  return r.ok ? (await r.json()).access_token : null;
}
async function fn(tok, payload) {
  const r = await fetch(BASE + '/functions/v1/smartcare-staff', { method: 'POST', headers: { apikey: 'k', Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ ws: 'smartcare' }, payload)) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const st = (id, org, roles, extra) => Object.assign({ roster_id: id, org, emp_no: 'E' + id, gmail: '', name: '시험' + id, roles, status: '활성' }, extra || {});

async function login(page, id, pw) {
  await page.locator('input[autocomplete="username"]').first().fill(id);
  await page.locator('input[autocomplete="current-password"]').first().fill(pw);
  await page.locator('button:has-text("로그인")').last().click();
}

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('개발 서버 시작 실패 (' + c + ')'))); });
  const browser = await chromium.launch();
  try {
    // ── 서버 함수 권한 ──
    const admin = await token('emp', 'ORG1', '100101', '1234');
    const worker = await token('emp', 'ORG1', '100102', '1234');
    const sys = await token('sys', '', 'admin', 'demo1234');
    check('직원 서버 계정 로그인 (관리자·담당자·시스템 관리자)', !!(admin && worker && sys));
    check('틀린 비밀번호는 로그인 안 됨', (await token('emp', 'ORG1', '100101', 'wrong')) === null);

    let r = await fn(worker, { action: 'sync', create: true, staff: st(50, 'ORG1', ['담당자']), password: 'temp12345' });
    check('담당자는 계정을 만들 수 없음', r.status === 403, r.body.error);
    r = await fn(admin, { action: 'sync', create: true, staff: st(50, 'ORG1', ['담당자']), password: 'temp12345' });
    check('기관 관리자: 자기 기관 계정 만들기', r.status === 200 && r.body.created === true, r.body.error);
    r = await fn(admin, { action: 'sync', create: true, staff: st(50, 'ORG1', ['담당자']), password: 'temp12345' });
    check('같은 직원 번호로 다시 만들기 → 거부', r.status === 409, r.body.error);
    r = await fn(admin, { action: 'sync', create: true, staff: st(51, 'ORG2', ['담당자']), password: 'temp12345' });
    check('기관 관리자: 다른 기관 계정 → 거부', r.status === 403, r.body.error);
    r = await fn(admin, { action: 'sync', staff: st(50, 'ORG1', ['시스템관리자']) });
    check('기관 관리자: 시스템 관리자 권한 부여 → 거부', r.status === 403, r.body.error);
    r = await fn(admin, { action: 'sync', staff: st(1, 'ORG1', ['관리자', '담당자']) });
    check('자기 계정은 관리 화면에서 못 바꿈', r.status === 403, r.body.error);
    r = await fn(admin, { action: 'sync', staff: st(50, 'ORG1', ['담당자']), password: 'short' });
    check('6자 미만 비밀번호 → 거부', r.status === 400, r.body.error);
    r = await fn(admin, { action: 'sync', staff: st(50, 'ORG1', ['담당자']), password: '123456' });
    check('숫자 6자리 비밀번호(123456) 허용', r.status === 200, r.body.error);
    check('숫자 6자리 비밀번호로 로그인', !!(await token('emp', 'ORG1', 'E50', '123456')));
    r = await fn(admin, { action: 'sync', staff: st(50, 'ORG1', ['담당자']), password: 'temp12345' });
    check('새 계정으로 로그인', !!(await token('emp', 'ORG1', 'E50', 'temp12345')));
    r = await fn(sys, { action: 'sync', create: true, staff: st(51, 'ORG2', ['관리자']), password: 'temp12345' });
    check('시스템 관리자: 다른 기관 계정 만들기', r.status === 200, r.body.error);
    r = await fn(admin, { action: 'delete', roster_id: 50 });
    check('기관 관리자: 계정 삭제', r.status === 200 && r.body.deleted === true, r.body.error);
    check('삭제한 계정은 로그인 안 됨', (await token('emp', 'ORG1', 'E50', 'temp12345')) === null);
    r = await fn(admin, { action: 'sync', staff: st(2, 'ORG1', ['담당자'], { emp_no: '100102', name: '박체험', status: '중지' }) });
    check('기관 관리자: 계정 사용 중지', r.status === 200, r.body.error);
    r = await fn(admin, { action: 'sync', staff: st(3, 'ORG1', ['보조'], { emp_no: '100103', name: '최보조' }), password: 'temp-pass-3', must_change: true });
    check('기관 관리자: 임시 비밀번호 지정', r.status === 200, r.body.error);

    // ── 화면 ──
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', q => { if (/supabase\.co/.test(q.request().url())) { external.push(q.request().url()); return q.abort(); } return q.continue(); });
    await page.goto(BASE + '/');
    await page.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    check('서버 로그인 단계 없이 바로 직원 로그인 화면', !(await page.isVisible('#sc-srv-email')));
    await page.waitForTimeout(800);
    check('로그인 화면 기관 목록을 서버에서 받음', await page.locator('option', { hasText: '가상요양병원' }).count() > 0);

    await login(page, '100101', 'wrong');
    await page.waitForSelector('text=계정 정보가 일치하지 않습니다', { timeout: 10000 }).then(() => check('틀린 비밀번호 → 오류', true), () => check('틀린 비밀번호 → 오류', false));
    await login(page, '100102', '1234');
    await page.waitForSelector('text=사용할 수 없는 계정입니다', { timeout: 10000 }).then(() => check('중지된 계정 → 로그인 거부', true), () => check('중지된 계정 → 로그인 거부', false));

    await login(page, '100101', '1234');
    await page.waitForSelector('text=가상환자1', { timeout: 20000 }).then(() => check('관리자 로그인 → 환자 명부', true), () => check('관리자 로그인 → 환자 명부', false));
    for (const m of MENUS) {
      const el = page.locator('text=' + m).first();
      const ok = (await el.count()) > 0 && await el.click().then(() => true, () => false);
      await page.waitForTimeout(400);
      check('메뉴 열기: ' + m, ok);
    }
    // 화면의 계정 관리 → 서버 계정 반영
    const staffRows = async () => (await (await fetch(BASE + '/rest/v1/smartcare_staff?ws=eq.smartcare&select=roster_id,status', { headers: { apikey: 'k', Authorization: 'Bearer dev-service-key' } })).json());
    await page.locator('text=담당자 명단 및 권한').first().click(); await page.waitForTimeout(800);
    const before = (await staffRows()).map(x => x.roster_id);
    await page.click('button:has-text("사용자 추가")');
    await page.waitForSelector('text=/임시 비밀번호 \d{6}/', { timeout: 10000 }).catch(() => {});
    const after = (await staffRows()).map(x => x.roster_id);
    const added = after.filter(x => !before.includes(x));
    check('화면에서 사용자 추가 → 서버 계정 생성', added.length === 1, 'new=' + added.join(','));
    const flashTxt = await page.evaluate(() => document.body.innerText);
    const tmp = (flashTxt.match(/임시 비밀번호\s*(\d{6})/) || [])[1];
    const tr = tmp && added[0] ? await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 's' + added[0] + '.smartcare@smartcare.invalid', password: tmp }) }) : null;
    check('표시된 임시 비밀번호로 새 계정 로그인', !!(tr && tr.ok), tmp ? '' : '화면에서 임시 비밀번호를 찾지 못함');
    await page.locator('button:has-text("삭제"):not([disabled])').first().click();
    await page.locator('.dialog-actions button:has-text("삭제")').click();
    await page.waitForTimeout(1500);
    check('화면에서 계정 삭제 → 서버 계정 삭제', added[0] && !(await staffRows()).some(x => x.roster_id === added[0]));

    await page.locator('button:has-text("로그아웃")').first().click();
    await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 }).then(() => check('로그아웃 → 로그인 화면', true), () => check('로그아웃 → 로그인 화면', false));
    await page.reload(); await page.waitForTimeout(2500);
    check('로그아웃 후 새로고침해도 로그인 화면', await page.isVisible('input[autocomplete="username"]'));

    // 임시 비밀번호 → 비밀번호 변경 강제
    await login(page, '100103', 'temp-pass-3');
    await page.waitForSelector('#sc-pwc-new', { timeout: 20000 }).then(() => check('임시 비밀번호 로그인 → 비밀번호 변경 창', true), () => check('임시 비밀번호 로그인 → 비밀번호 변경 창', false));
    check('강제 변경 창에는 취소 버튼 없음', !(await page.isVisible('[role="dialog"] button:has-text("취소")')));
    await page.fill('#sc-pwc-new', 'new-pass-333'); await page.fill('#sc-pwc-new2', 'new-pass-33X');
    await page.click('button:has-text("비밀번호 바꾸기")');
    await page.waitForSelector('text=두 비밀번호가 같지 않습니다', { timeout: 5000 }).then(() => check('확인 비밀번호 불일치 → 오류', true), () => check('확인 비밀번호 불일치 → 오류', false));
    await page.fill('#sc-pwc-new2', 'new-pass-333');
    await page.click('button:has-text("비밀번호 바꾸기")');
    await page.waitForSelector('#sc-pwc-new', { state: 'detached', timeout: 10000 }).then(() => check('새 비밀번호 저장', true), () => check('새 비밀번호 저장', false));
    check('바꾼 비밀번호로 서버 로그인', !!(await token('emp', 'ORG1', '100103', 'new-pass-333')));
    check('예전 임시 비밀번호는 안 됨', (await token('emp', 'ORG1', '100103', 'temp-pass-3')) === null);

    check('화면 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('실제 서버로 나간 요청 없음', external.length === 0, external.slice(0, 2).join(', '));
  } catch (e) {
    check('시험 진행', false, e.message);
  } finally {
    await browser.close(); srv.kill();
  }
  console.log('스마트케어 직원별 계정 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
