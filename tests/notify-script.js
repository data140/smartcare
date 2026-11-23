#!/usr/bin/env node
/* 일정 알림(Gmail Apps Script) 화면 시험 — 서울(직원 계정) 방식
 *   python3 tools/build.py local-staff && node tests/notify-script.js */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8883, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1466, height: 1100 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101');
    await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click();
    await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    await p.locator('text=계정 · 권한 >> visible=true').first().click(); await p.waitForTimeout(800);
    await p.locator('text=일정 알림 >> visible=true').first().click(); await p.waitForTimeout(1200);
    const body = await p.evaluate(() => document.body.innerText);
    check('안내에 SB_ID(직원 번호)가 나옴', body.includes('SB_ID'));
    check('공용 계정(SB_EMAIL) 안내는 나오지 않음', !body.includes('SB_EMAIL'));
    await p.locator('button:has-text("스크립트 보기")').first().click(); await p.waitForTimeout(500);
    const code = await p.locator('textarea:visible').first().inputValue();
    check('스크립트가 SB_ID로 로그인', code.includes("getProperty('SB_ID')") && code.includes('smartcare_login_email'));
    check('스크립트에 화면 코드 변수(Component)가 섞이지 않음', !/Component\.isStaffMode/.test(code));
    let ok = true; try { new Function(code); } catch (e) { ok = false; check('스크립트 문법 오류 없음', false, e.message); }
    if (ok) check('스크립트 문법 오류 없음', true);
    check('화면 오류 없음', errors.length === 0, errors.join(' | '));
  } catch (e) { check('시험 진행', false, e.message); }
  finally { await browser.close(); srv.kill(); }
  console.log('스마트케어 일정 알림 스크립트 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
