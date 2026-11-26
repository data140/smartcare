#!/usr/bin/env node
/* 앱 종료·뒤로가기 시험: 로그인 화면의 [앱 종료], 내 설정의 [로그아웃하고 앱 종료], 로그아웃 뒤 뒤로가기로 앱을 벗어남 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8986, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  const login = async (ctx) => {
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101'); await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().tap();
    await p.waitForFunction(() => /오늘/.test(document.body.innerText) && !document.querySelector('input[autocomplete="username"]'), null, { timeout: 25000 }); await sleep(1200);
    return p;
  };
  const tab = (p, n) => p.evaluate((t) => [...document.querySelectorAll('.sc-dock .sc-tab')].find(b => b.offsetParent && b.innerText.trim() === t).click(), n);
  try {
    // ① 로그아웃 뒤 뒤로가기 한 번으로 앱을 벗어남
    let ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, userAgent: UA });
    let p = await login(ctx);
    for (const t of ['일지', '검수', '운영일지', '내 설정', '오늘']) { await tab(p, t); await sleep(250); }
    await p.locator('button:has-text("로그아웃")').first().evaluate(e => e.scrollIntoView({ block: 'center' })).catch(() => {});
    await p.evaluate(() => [...document.querySelectorAll('.sc-dock .sc-tab')].find(b => b.innerText.trim() === '내 설정').click()); await sleep(500);
    await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find(b => b.offsetParent && b.querySelector('.ph-x') && /브리핑/.test((b.parentElement || {}).innerText || '')); if (x) x.click(); });
    await p.locator('button:has-text("로그아웃")').filter({ hasNotText: '앱 종료' }).last().evaluate(e => e.scrollIntoView({ block: 'center' })); await sleep(300);
    await p.locator('button:has-text("로그아웃")').filter({ hasNotText: '앱 종료' }).last().tap();
    await p.waitForSelector('input[autocomplete="username"]', { timeout: 20000 }); await sleep(1500);
    check('로그아웃하면 로그인 화면이 나오고 [앱 종료] 단추가 있음', (await p.locator('[data-exit-app]').count()) === 1);
    await p.goBack().catch(() => {}); await sleep(2500);
    check('로그아웃 뒤 뒤로가기 한 번이면 앱 화면을 벗어남 (로그인 화면이 계속 남지 않음)', p.url() === 'about:blank', p.url());
    await ctx.close();
    // ② 로그인 화면의 [앱 종료]
    ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, userAgent: UA });
    p = await ctx.newPage(); await p.goto(BASE + '/'); await p.waitForSelector('[data-exit-app]', { timeout: 60000 });
    await p.locator('[data-exit-app]').tap(); await sleep(1500);
    check('로그인 화면 [앱 종료]: 창이 닫히거나 종료 안내 화면이 나옴', p.isClosed() || (await p.locator('[data-exited]').count()) === 1);
    await ctx.close();
    // ③ 내 설정 [로그아웃하고 앱 종료]
    ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, userAgent: UA });
    p = await login(ctx);
    await tab(p, '내 설정'); await sleep(600);
    await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find(b => b.offsetParent && b.querySelector('.ph-x') && /브리핑/.test((b.parentElement || {}).innerText || '')); if (x) x.click(); });
    await p.locator('[data-logout-exit]').evaluate(e => e.scrollIntoView({ block: 'center' })); await sleep(300);
    await p.locator('[data-logout-exit]').tap(); await sleep(5000);
    const closed = p.isClosed();
    check('내 설정 [로그아웃하고 앱 종료]: 로그아웃되고 창이 닫히거나 종료 안내 화면이 나옴', closed || (await p.locator('[data-exited]').count()) === 1);
    if (!closed) check('종료 안내 화면에 [다시 시작] 단추가 있음', /다시 시작/.test(await p.evaluate(() => document.body.innerText)));
    await ctx.close();
  } catch (e) { check('시험 진행', false, e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log('스마트케어 앱 종료·뒤로가기 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
