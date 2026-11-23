#!/usr/bin/env node
/* 개인정보 보호 시험 (직원별 계정 방식)
 *   python3 tools/build.py local-staff && node tests/privacy.js
 * 1) 로그아웃하면 이 기기(브라우저)에 남은 환자·직원 데이터가 지워지고, 화면 설정만 남는지
 * 2) 일정 시간 사용이 없으면 경고 후 자동 로그아웃되고 같은 방식으로 지워지는지 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8887, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const keysOf = (p) => p.evaluate(() => { const o = []; for (let i = 0; i < localStorage.length; i++) o.push(localStorage.key(i)); return o; });
const PII = ['smartcare.patients.v1', 'smartcare.roster.v1', 'smartcare.plans.v1', 'sc.auth.v1'];

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  const login = async (p) => {
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101');
    await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click();
    await p.waitForSelector('text=가상환자1', { timeout: 20000 }); await p.waitForTimeout(800);
  };
  try {
    // 1) 로그아웃
    let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
    await login(p);
    await p.evaluate(() => { localStorage.setItem('sc.uiScale', '1.1'); });
    const before = await keysOf(p);
    check('로그인하면 이 기기에 환자·직원 데이터가 보관됨 (비교 기준)', PII.slice(0, 3).every(k => before.includes(k)), before.filter(k => PII.includes(k)).join(', '));
    await p.locator('button:has-text("로그아웃")').first().click();
    await p.waitForSelector('input[autocomplete="username"]', { timeout: 15000 });
    await p.waitForTimeout(800);
    const after = await keysOf(p);
    check('로그아웃하면 환자·직원 데이터와 로그인 정보가 이 기기에서 지워짐', PII.every(k => !after.includes(k)), after.filter(k => PII.includes(k)).join(', ') || '남은 항목 없음');
    check('로그아웃해도 화면 설정(배율 등)은 남음', after.includes('sc.uiScale'));
    check('로그아웃 후 화면에 환자 이름이 남지 않음', !(await p.evaluate(() => document.body.innerText)).includes('가상환자'));
    await ctx.close();

    // 2) 자동 로그아웃
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.clock.install();
    await login(p);
    await p.clock.fastForward('14:20');
    await p.waitForTimeout(300);
    check('사용이 없으면 1분 전에 경고가 뜸', await p.evaluate(() => document.body.innerText.includes('곧 자동 로그아웃')));
    await p.clock.fastForward('00:50');
    await p.waitForSelector('input[autocomplete="username"]', { timeout: 15000 });
    await p.waitForTimeout(2200);
    const after2 = await keysOf(p);
    check('15분 사용이 없으면 자동 로그아웃되고 이 기기의 데이터가 지워짐', PII.every(k => !after2.includes(k)), after2.filter(k => PII.includes(k)).join(', ') || '남은 항목 없음');
    check('자동 로그아웃 안내가 표시됨', await p.evaluate(() => document.body.innerText.includes('자동 로그아웃되었습니다')));
    await ctx.close();

    // 3) 경고 중 화면을 누르면 계속 사용
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.clock.install();
    await login(p);
    await p.clock.fastForward('14:20'); await p.waitForTimeout(300);
    await p.mouse.click(700, 450); await p.waitForTimeout(300);
    await p.clock.fastForward('01:30'); await p.waitForTimeout(500);
    check('경고 중에 화면을 누르면 로그아웃되지 않고 계속 사용', await p.locator('text=가상환자1').first().isVisible().catch(() => false));
    await ctx.close();
    check('화면 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) { check('시험 진행', false, e.message); }
  finally { await browser.close(); srv.kill(); }
  console.log('스마트케어 개인정보 보호 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
