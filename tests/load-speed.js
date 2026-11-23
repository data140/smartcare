#!/usr/bin/env node
/* 새로고침 로딩 속도 시험
 *   python3 tools/build.py local-staff && node tests/load-speed.js
 * 서버에 증명사진이 많고 사진 받기가 느려도, 환자 목록은 사진을 기다리지 않고 먼저 나오는지 확인합니다. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8886, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1466, height: 900 } });
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
    const login = async () => {
      await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
      await p.locator('input[autocomplete="username"]').first().fill('100101');
      await p.locator('input[autocomplete="current-password"]').first().fill('1234');
      await p.locator('button:has-text("로그인")').last().click();
    };
    await p.goto(BASE + '/'); await login(); await p.waitForSelector('text=가상환자1', { timeout: 20000 }); await sleep(1500);
    // 서버에 증명사진 24장(각 약 200KB)을 올림
    const png = 'data:image/png;base64,' + 'A'.repeat(200000);
    await p.evaluate((png) => { for (let i = 0; i < 24; i++) window.__scCloudPush('smartcare.idph.' + (9000 + i), png); }, png);
    await sleep(4000);
    // 새로고침 + 증명사진 받기를 일부러 3초씩 늦춤
    let photoReqs = 0;
    await ctx.route('**/rest/v1/smartcare_kv*', async (route) => {
      if (decodeURIComponent(route.request().url()).includes('smartcare.idph.')) { photoReqs++; await sleep(3000); }
      route.continue();
    });
    // 이 기기에 환자 목록이 없는 상황(브라우저 저장 공간 부족 등)을 만들어, 서버에서 받아야만 환자가 보이게 함
    await p.evaluate(() => { try { localStorage.removeItem('smartcare.patients.v1'); } catch (e) {} try { sessionStorage.clear(); } catch (e) {} });
    const t0 = Date.now();
    await p.reload(); if (await p.locator('input[autocomplete="username"]').first().isVisible({ timeout: 3000 }).catch(() => false)) await login();
    await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    const tList = Date.now() - t0;
    check('새로고침 후 환자 목록이 증명사진을 기다리지 않고 먼저 나옴', tList < 2500, tList + 'ms (사진 요청은 3초씩 지연시킨 상태)');
    await sleep(9000);
    const got = await p.evaluate(() => { try { return Object.keys(window.__scApp ? window.__scApp._idphCache : {}).length; } catch (e) { return -1; } });
    check('증명사진은 뒤에서 이어서 받음 (요청 발생)', photoReqs > 0, '사진 요청 ' + photoReqs + '건');
    check('화면 오류 없음', errors.length === 0, errors.join(' | '));
  } catch (e) { check('시험 진행', false, e.message); }
  finally { await browser.close(); srv.kill(); }
  console.log('스마트케어 로딩 속도 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
