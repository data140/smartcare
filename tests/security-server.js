#!/usr/bin/env node
/* 보안 경보 2단계 시험: 로그인 실패·접속 IP 서버 감시 + 이메일·문자 알림 (서버 함수 smartcare-security 를 그대로 실행) */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8979, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const FN = BASE + '/functions/v1/smartcare-security';
const call = async (body, ip, token) => {
  const h = { 'Content-Type': 'application/json', apikey: 'dev', Authorization: 'Bearer ' + (token || 'dev') };
  if (ip) h['x-forwarded-for'] = ip;
  const r = await fetch(FN, { method: 'POST', headers: h, body: JSON.stringify(Object.assign({ ws: 'smartcare' }, body)) });
  return Object.assign({ status: r.status }, await r.json().catch(() => ({})));
};
const svcGet = async (p) => (await fetch(BASE + p, { headers: { apikey: 'x', Authorization: 'Bearer dev-service-key' } })).json();
const login = async (email, password) => (await (await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).access_token;
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const admin = await login('s99.smartcare@smartcare.invalid', 'demo1234');
    const staffTok = await login('s2.smartcare@smartcare.invalid', '1234');
    check('시험 준비: 관리자·담당자 토큰', !!admin && !!staffTok);
    // 권한
    check('로그인 없이 설정 조회는 거부(401)', (await call({ action: 'cfg_get' }, null, 'bad')).status === 401);
    check('담당자는 설정 조회 거부(403)', (await call({ action: 'cfg_get' }, null, staffTok)).status === 403);
    // 설정 저장 (잘못된 이메일·번호는 걸러짐)
    let r = await call({ action: 'cfg_set', emails: ['a@example.com', 'bad', 'b@example.com'], phones: ['010-1234-5678', '123'], fail_ip: 10, fail_acct: 5, window_min: 10, new_ip_notify: true }, null, admin);
    check('설정 저장: 올바른 이메일 2개·번호 1개만 남음', r.ok && r.cfg.emails.length === 2 && r.cfg.phones.length === 1 && r.cfg.phones[0] === '01012345678', JSON.stringify(r.cfg));
    r = await call({ action: 'cfg_get' }, null, admin);
    check('설정 조회: 발송 준비 상태 표시', r.ok && r.providers.email && r.providers.sms);
    // 한 계정 5회 실패 → 경고 + 이메일·문자
    for (let i = 0; i < 4; i++) await call({ action: 'login_fail', acct: 's2.smartcare@smartcare.invalid' }, '198.51.100.7');
    let out = await (await fetch(BASE + '/mock/outbox')).json();
    check('실패 4회까지는 알림 없음', out.length === 0, String(out.length));
    await call({ action: 'login_fail', acct: 's2.smartcare@smartcare.invalid' }, '198.51.100.7');
    out = await (await fetch(BASE + '/mock/outbox')).json();
    check('같은 계정 실패 5회 → 이메일 1건 + 문자 1건', out.filter(x => x.kind === 'mail').length === 1 && out.filter(x => x.kind === 'sms').length === 1, out.map(x => x.kind).join(','));
    const mail = out.find(x => x.kind === 'mail');
    check('이메일 내용: 계정·IP 만 있고 받는 사람 2명', !!mail && mail.body.to.length === 2 && /s2\.smartcare/.test(mail.body.text) && /198\.51\.100\.7/.test(mail.body.text));
    await call({ action: 'login_fail', acct: 's2.smartcare@smartcare.invalid' }, '198.51.100.7');
    out = await (await fetch(BASE + '/mock/outbox')).json();
    check('같은 사건은 중복 알림 없음', out.filter(x => x.kind === 'mail').length === 1);
    // 같은 IP 에서 여러 계정을 10회 → IP 경고
    for (let i = 0; i < 10; i++) await call({ action: 'login_fail', acct: 'x' + i }, '203.0.113.50');
    let alerts = await svcGet('/rest/v1/smartcare_sec_events?kind=eq.alert&ws=eq.smartcare');
    check('같은 IP 실패 10회 → IP 경고가 기록됨', alerts.some(a => /같은 IP/.test(a.title) && a.ip === '203.0.113.50' && a.level === 'crit'), alerts.map(a => a.title).join(' | '));
    // 실패 뒤 성공
    await call({ action: 'login_fail', acct: 's2.smartcare@smartcare.invalid' }, '192.0.2.9'); await call({ action: 'login_fail', acct: 's2.smartcare@smartcare.invalid' }, '192.0.2.9'); await call({ action: 'login_fail', acct: 's2.smartcare@smartcare.invalid' }, '192.0.2.9');
    await call({ action: 'login_ok' }, '192.0.2.9', staffTok);
    alerts = await svcGet('/rest/v1/smartcare_sec_events?kind=eq.alert&ws=eq.smartcare');
    check('실패 뒤 로그인 성공 → 경고', alerts.some(a => /실패가 이어진 뒤/.test(a.title)));
    // 처음 보는 IP (주의)
    await call({ action: 'login_ok' }, '192.0.2.77', staffTok); await call({ action: 'login_ok' }, '192.0.2.78', staffTok);
    alerts = await svcGet('/rest/v1/smartcare_sec_events?kind=eq.alert&ws=eq.smartcare');
    check('평소와 다른 IP 로그인 → 주의', alerts.some(a => /평소와 다른 IP/.test(a.title) && a.level === 'warn'));
    // 시험 알림
    const before = (await (await fetch(BASE + '/mock/outbox')).json()).length;
    r = await call({ action: 'test' }, null, admin);
    const after = (await (await fetch(BASE + '/mock/outbox')).json()).length;
    check('시험 알림 보내기', r.ok && r.sent === 2 && after - before === 2, JSON.stringify(r));
    // 화면: 실제 로그인 실패가 서버에 기록되고, 관리자 화면에서 경보·설정 카드가 보임
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    const nBefore = (await svcGet('/rest/v1/smartcare_sec_events?kind=eq.login_fail&ws=eq.smartcare')).length;
    await p.locator('input[autocomplete="username"]').first().fill('100101'); await p.locator('input[autocomplete="current-password"]').first().fill('틀린비번');
    await p.locator('button:has-text("로그인")').last().click(); await sleep(2500);
    const nAfter = (await svcGet('/rest/v1/smartcare_sec_events?kind=eq.login_fail&ws=eq.smartcare')).length;
    check('로그인 화면에서 비밀번호를 틀리면 서버에 실패가 기록됨', nAfter === nBefore + 1, nBefore + ' → ' + nAfter);
    await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 20000 }); await sleep(6000);
    const lamp = await p.evaluate(() => { const b = document.querySelector('button[aria-label="보안 경보"]'); return b ? b.className : ''; });
    check('서버가 잡은 경보로 경보등이 경고(빨강)가 됨', /sc-sec-crit/.test(lamp), lamp);
    await p.locator('button[aria-label="보안 경보"]').click({ force: true }); await sleep(500);
    const txt = await p.evaluate(() => document.body.innerText);
    check('알림 목록에 서버 경보(로그인 실패·IP)가 보임', /로그인 실패 \d+회/.test(txt) && /198\.51\.100\.7|203\.0\.113\.50/.test(txt));
    await p.locator('button[aria-label="닫기"] >> visible=true').first().click().catch(() => {}); await sleep(300);
    await p.locator('aside button:has-text("담당자 명단 및 권한") >> visible=true').first().click(); await sleep(600);
    await p.locator('button[role=tab]:has-text("시스템 관리")').first().click(); await sleep(400);
    await p.locator('button[role=tab]:has-text("보안 알림")').first().click(); await sleep(800);
    const card = await p.evaluate(() => { const c = document.querySelector('[data-sec-srv]'); return c ? { t: c.innerText, ta: [...c.querySelectorAll('textarea')].map(x => x.value) } : null; });
    check('설정 › 보안 알림에 서버 감시·이메일/문자 설정이 보이고 저장값이 채워짐', !!card && /서버 감시/.test(card.t) && card.ta[0].includes('a@example.com') && card.ta[1].includes('01012345678'), JSON.stringify(card && card.ta));
    await p.locator('[data-sec-srv] textarea').first().fill('c@example.com'); await p.locator('[data-sec-srv] textarea').first().blur();
    await p.locator('[data-sec-srv] button:has-text("저장")').click(); await sleep(1200);
    const cfg = await call({ action: 'cfg_get' }, null, admin);
    check('화면에서 이메일을 바꿔 저장하면 서버에 반영됨', cfg.cfg.emails.length === 1 && cfg.cfg.emails[0] === 'c@example.com', JSON.stringify(cfg.cfg.emails));
    // 로그아웃 뒤 로그인 화면에서 한참 머물다 로그인해도(화면을 연 지 4초가 지난 뒤) 곧바로 경보 분석이 돌아 경보등이 켜짐
    await p.locator('button:has-text("로그아웃")').first().click(); await p.waitForSelector('input[autocomplete="username"]', { timeout: 15000 }); await sleep(7000);
    await p.locator('input[autocomplete="username"]').first().fill('100101'); await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 20000 }); await sleep(12000);
    const lamp2 = await p.evaluate(() => { const b = document.querySelector('button[aria-label="보안 경보"]'); return b ? b.className : ''; });
    check('로그인 화면에 오래 머문 뒤 로그인해도 12초 안에 서버 경보로 경보등이 켜짐', /sc-sec-crit/.test(lamp2), lamp2);
    check('화면 오류 없음', errs.length === 0, errs.join(' | '));
  } catch (e) { check('시험 진행', false, e.message.split('\n')[0]); }
  console.log('스마트케어 보안 경보 2단계 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
