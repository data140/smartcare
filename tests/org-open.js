#!/usr/bin/env node
/* 시스템 관리자가 다른 기관을 열어도(이 기관 열기 · 상단 기관 선택) 로그아웃되지 않고 그 기관 화면이 열리는지 시험 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8985, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.click('button:has-text("시스템 관리자")');
    await p.locator('input[autocomplete="username"]').first().fill('admin'); await p.locator('input[autocomplete="current-password"]').first().fill('demo1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=로그아웃', { timeout: 20000 }); await sleep(2500);
    const logged = async () => !(await p.$('input[autocomplete="current-password"]')) && (await p.locator('text=로그아웃').count()) > 0;
    const orgNow = () => p.evaluate(() => window.__scOrg);
    check('시스템 관리자로 로그인됨', await logged());
    // ① 설정 › 기관 관리 › [이 기관 열기]
    await p.locator('aside button:has-text("담당자 명단 및 권한")').first().click(); await sleep(600);
    await p.locator('button[role=tab]:has-text("기관 관리")').first().click(); await sleep(800);
    await p.locator('button:has-text("이 기관 열기")').first().click();
    await p.waitForTimeout(6000); await p.waitForSelector('text=로그아웃', { timeout: 20000 }).catch(() => {});
    check('[이 기관 열기] 뒤에도 로그인 상태가 유지됨 (로그인 화면으로 돌아가지 않음)', await logged());
    check('열린 기관이 다른 기관(ORG2)으로 바뀜', (await orgNow()) === 'ORG2', await orgNow());
    // ② 상단 기관 선택으로 되돌리기
    const sel = p.locator('select[aria-label*="기관"], sc-raw-select[aria-label*="기관"]').first();
    if (await sel.count()) {
      await p.evaluate(() => { const s = document.querySelector('select[aria-label*="기관"]') || (document.querySelector('sc-raw-select[aria-label*="기관"]') || {}).querySelector && document.querySelector('sc-raw-select[aria-label*="기관"]').querySelector('select'); if (s) { s.value = 'ORG1'; s.dispatchEvent(new Event('change', { bubbles: true })); } });
      await p.waitForTimeout(6000); await p.waitForSelector('text=로그아웃', { timeout: 20000 }).catch(() => {});
      check('상단 기관 선택으로 전환해도 로그인 상태가 유지됨', await logged());
      check('다시 첫 번째 기관(ORG1)으로 돌아옴', (await orgNow()) === 'ORG1', await orgNow());
    }
    check('화면 오류 없음', errs.length === 0, errs.join(' | '));
  } catch (e) { check('시험 진행', false, e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log('스마트케어 시스템 관리자 기관 전환 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
