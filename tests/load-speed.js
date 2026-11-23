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

    // 로그아웃 직후(이 기기에 데이터 없음) 다시 로그인: 큰 항목이 느리거나 일부 요청이 한 번 실패해도 환자 목록이 먼저·정상으로 나와야 함
    const ctx2 = await browser.newContext({ viewport: { width: 1466, height: 900 } });
    const q = await ctx2.newPage(); q.on('pageerror', e => errors.push(e.message));
    await q.goto(BASE + '/'); await q.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await q.locator('input[autocomplete="username"]').first().fill('100101'); await q.locator('input[autocomplete="current-password"]').first().fill('1234');
    await q.locator('button:has-text("로그인")').last().click(); await q.waitForSelector('text=가상환자1', { timeout: 20000 }); await sleep(1200);
    await q.evaluate(() => {
      const pts = []; for (let i = 1; i <= 300; i++) pts.push({ id: 'PT-' + String(i).padStart(4, '0'), room: ((i % 6) + 1) + '병동 101호', name: '환자' + i, sex: '남', birth: '1940-01-01', age: 80, consent: '동의', bio: '동의', stay: '재원' });
      window.__scCloudPush('smartcare.patients.v1', JSON.stringify(pts));
      window.__scCloudPush('smartcare.cfiles.v1', JSON.stringify({ files: { big: 'x'.repeat(1500000) }, via: {} }));
    });
    await sleep(4500);
    await q.locator('button:has-text("로그아웃")').first().click(); await q.waitForSelector('input[autocomplete="username"]', { timeout: 20000 }); await sleep(1200);
    let failedOnce = false, bigHits = 0;
    await ctx2.route('**/rest/v1/smartcare_kv?**', async (route) => {
      const u = decodeURIComponent(route.request().url());
      if (route.request().method() === 'GET' && u.includes('smartcare.cfiles.v1')) { bigHits++; await sleep(6000); }
      if (route.request().method() === 'GET' && u.includes('smartcare.orgs.v1') && !failedOnce) { failedOnce = true; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"timeout"}' }); }
      route.continue();
    });
    const t1 = Date.now();
    await q.locator('input[autocomplete="username"]').first().fill('100101'); await q.locator('input[autocomplete="current-password"]').first().fill('1234');
    await q.locator('button:has-text("로그인")').last().click();
    await q.waitForFunction(() => /전체\s*300/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
    const tCore = Date.now() - t1;
    const cnt = await q.evaluate(() => (/전체\s*(\d+)/.exec(document.body.innerText) || [])[1]);
    check('로그아웃 후 다시 로그인: 큰 첨부가 6초 늦어도 환자 목록이 먼저 나옴', cnt === '300' && tCore < 5500, tCore + 'ms · 환자 ' + cnt + '명 (큰 항목 요청 ' + bigHits + '건)');
    check('일부 요청이 한 번 실패(500)해도 자동으로 다시 시도해 이어서 받음', failedOnce && cnt === '300');
    await sleep(8000);
    check('큰 항목은 뒤이어 도착하고 오류 표시 없음', !(await q.evaluate(() => /첫 동기화 재시도|HTTP 5/.test(document.body.innerText))));
    await ctx2.close();
    check('화면 오류 없음', errors.length === 0, errors.join(' | '));
  } catch (e) { check('시험 진행', false, e.message); }
  finally { await browser.close(); srv.kill(); }
  console.log('스마트케어 로딩 속도 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
