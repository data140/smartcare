#!/usr/bin/env node
/* 캘린더 색상: 12가지 + 직접 고르기 시험
 *   python3 tools/build.py local-staff && node tests/cal-color.js */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8959, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101');
    await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    await p.locator('aside button:has-text("캘린더") >> visible=true').first().click(); await sleep(900);
    await p.locator('button[aria-label="캘린더 배경색"] >> visible=true').first().click(); await sleep(300);
    const n = await p.locator('button[aria-pressed]:has-text("라벤더") >> visible=true').count();
    check('기본 색이 12가지로 늘어남 (라벤더·틸 등)', n >= 1 && (await p.locator('button[aria-pressed]:has-text("틸") >> visible=true').count()) >= 1);
    check('"직접 고르기" 색상 판과 진하기 막대가 있음', (await p.locator('input[aria-label="캘린더 색상 직접 선택"]').count()) === 1 && (await p.locator('input[aria-label="캘린더 색 진하기"]').count()) === 1);
    const before = await p.evaluate(() => getComputedStyle(document.querySelector('[style*="border-radius: 14px"][style*="overflow: visible"]') || document.body).backgroundImage);
    await p.locator('input[aria-label="캘린더 색상 직접 선택"]').fill('#e0245e'); await sleep(600);
    const after = await p.evaluate(() => getComputedStyle(document.querySelector('[style*="border-radius: 14px"][style*="overflow: visible"]') || document.body).backgroundImage);
    check('직접 고른 색이 캘린더에 바로 반영됨', before !== after, '');
    check('고른 색이 저장됨(새로고침 후에도 유지되는 값)', await p.evaluate(() => localStorage.getItem('smartcare.calBg.v1') === 'custom' && /e0245e/i.test(localStorage.getItem('smartcare.calCustom.v1') || '')));
    check('화면 오류 없음', errs.length === 0, errs.slice(0, 2).join('|'));
  } catch (e) { check('시험 진행', false, e.message.split('\n')[0]); }
  console.log('스마트케어 캘린더 색상 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
