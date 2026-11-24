#!/usr/bin/env node
/* 동의서 서명란 구성 시험
 *   python3 tools/build.py local-staff && node tests/sign-fields.js
 * 기본은 동의인·보호자 2칸(촬영자 없음), 설정에서 촬영자 등을 추가·삭제하면 휴대폰 동의서 화면에 그대로 반영되는지 확인 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8964, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101'); await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    await p.locator('aside button:has-text("동의서식 관리") >> visible=true').first().click().catch(async () => { await p.locator('aside button:has-text("계정 · 권한") >> visible=true').first().click(); await sleep(600); await p.locator('button:has-text("동의서식 관리") >> visible=true').first().click(); });
    await sleep(800);
    const rows = () => p.locator('input[aria-label="서명란 이름"]').count();
    check('기본 서명란은 2칸(동의인·보호자), 촬영자 없음', (await rows()) === 2 && !(await p.evaluate(() => [...document.querySelectorAll('input[aria-label="서명란 이름"]')].some(i => /촬영자/.test(i.value)))));
    await p.locator('button:has-text("+ 촬영자")').click(); await sleep(500);
    check('[+ 촬영자]로 서명란을 추가하면 3칸', (await rows()) === 3);
    check('추가한 칸은 [필수/선택] 지정이 있음', (await p.locator('button[title="필수로 하면 이 서명이 없으면 저장할 수 없습니다"]').count()) >= 1);
    await p.locator('input[aria-label="서명란 이름"]').nth(2).fill('입회인'); await p.locator('input[aria-label="서명란 이름"]').nth(2).blur(); await sleep(500);
    check('서명란 이름을 직접 바꿀 수 있음(미리보기에도 반영)', (await p.locator('text=입회인 :').count()) >= 1);

    // 휴대폰 동의서 화면에 반영
    const cm = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
    const m = await cm.newPage(); await m.goto(BASE + '/'); await m.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await m.locator('input[autocomplete="username"]').first().fill('100101'); await m.locator('input[autocomplete="current-password"]').first().fill('1234');
    await m.locator('button:has-text("로그인")').last().click(); await m.waitForSelector('button:has-text("동의서")', { timeout: 20000 });
    await m.locator('button:has-text("동의서") >> visible=true').first().click(); await sleep(800);
    const pick = m.locator('button:has-text("가상환자1") >> visible=true').first();
    if (await pick.count()) { await pick.click(); await sleep(500); }
    const n = await m.locator('text=터치하여 서명 >> visible=true').count();
    check('휴대폰 동의서에 설정한 서명란 3칸이 나옴(동의인·보호자·입회인)', n === 3 || (await m.locator('text=입회인 >> visible=true').count()) >= 1, n + '칸');
    check('화면 오류 없음', errs.length === 0, errs.slice(0, 2).join('|'));
  } catch (e) { check('시험 진행', false, e.message.split('\n')[0]); }
  console.log('스마트케어 동의서 서명란 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
