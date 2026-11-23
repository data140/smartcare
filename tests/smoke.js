#!/usr/bin/env node
/* 기본 동작 시험 (브라우저 자동 조작)
 *   python3 tools/build.py local && node tests/smoke.js
 * 개발 서버를 띄우고: 서버 로그인(틀린/맞는 비밀번호) → 직원 로그인 → 주요 메뉴 열기를 확인합니다.
 * 실제 Supabase(supabase.co)로 나가는 요청이 하나라도 있으면 실패로 봅니다. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8787, BASE = 'http://localhost:' + PORT + '/';
const MENUS = ['서면 동의서 관리', '캘린더', '일지 목록 · 검수', '출석부', '앨범', '전체 보기', '운영 지표', '환자 등록 관리'];

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('개발 서버 시작 실패 (' + c + ')'))); });
  const results = []; let failed = false;
  const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => { if (/supabase\.co/.test(r.request().url())) { external.push(r.request().url()); return r.abort(); } return r.continue(); });

    await page.goto(BASE);
    await page.waitForSelector('#sc-srv-email', { timeout: 60000 });
    check('서버 로그인 화면 표시', true);

    await page.fill('#sc-srv-email', 'dev@smartcare.test');
    await page.fill('#sc-srv-pw', 'wrong');
    await page.click('button:has-text("서버 로그인")');
    await page.waitForSelector('text=서버 계정 이메일 또는 비밀번호가 맞지 않습니다', { timeout: 10000 }).then(() => check('틀린 비밀번호 → 오류 표시', true), () => check('틀린 비밀번호 → 오류 표시', false));

    await page.fill('#sc-srv-pw', 'dev1234');
    await page.press('#sc-srv-pw', 'Enter');
    await page.waitForSelector('#sc-srv-email', { state: 'detached', timeout: 15000 }).then(() => check('서버 로그인 성공', true), () => check('서버 로그인 성공', false));
    await page.waitForTimeout(2000);

    await page.locator('input[autocomplete="username"]').first().fill('100101');
    await page.locator('input[autocomplete="current-password"]').first().fill('1234');
    await page.locator('button:has-text("로그인")').last().click();
    await page.waitForSelector('text=가상환자1', { timeout: 15000 }).then(() => check('직원 로그인 → 환자 명부 표시', true), () => check('직원 로그인 → 환자 명부 표시', false));

    for (const m of MENUS) {
      const el = page.locator('text=' + m).first();
      const ok = (await el.count()) > 0 && await el.click().then(() => true, () => false);
      await page.waitForTimeout(500);
      check('메뉴 열기: ' + m, ok);
    }
    check('화면 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('실제 서버로 나간 요청 없음', external.length === 0, external.slice(0, 2).join(', '));
  } catch (e) {
    check('시험 진행', false, e.message);
  } finally {
    await browser.close(); srv.kill();
  }
  console.log('스마트케어 기본 동작 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
