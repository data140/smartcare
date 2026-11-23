#!/usr/bin/env node
/* 개발용 조작 바(기기 모드 전환 등) 시험
 *   python3 tools/build.py local-staff && node tests/dev-bar.js
 * 운영 빌드에서는 조작 바가 없고 접속 기기에 맞는 화면이 자동 선택되는지, 개발 빌드·?dev=1 에서는 보이는지 확인합니다.
 * (운영 빌드는 개발용 빌드의 표시 설정만 바꿔 흉내냅니다) */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8884, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };

const asProd = async (ctx) => ctx.route('**/*', async (route) => {
  if (route.request().resourceType() !== 'document') return route.continue();
  const r = await route.fetch(); const body = (await r.text()).replace("'1' === '1'", "'0' === '1'");
  route.fulfill({ response: r, body });
});
const hasBar = (p) => p.evaluate(() => /데이터 상태/.test(document.body.innerText) && !!document.querySelector('[aria-label="보기 모드"]'));

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    // 1) 개발 빌드: 조작 바가 보임
    let ctx = await browser.newContext({ viewport: { width: 1466, height: 900 } });
    let p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    check('개발 빌드: 기기 모드 전환 바가 보임', await hasBar(p));
    await ctx.close();

    // 2) 운영 빌드(PC): 바 없음 · 저장된 고정값·주소 지정이 있어도 PC 화면
    ctx = await browser.newContext({ viewport: { width: 1466, height: 900 } }); await asProd(ctx);
    p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(() => { try { localStorage.setItem('smartcare.viewMode.v1', 'tablet'); } catch (e) {} });
    await p.goto(BASE + '/?app=mobile'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    check('운영 빌드(PC): 조작 바 없음', !(await hasBar(p)));
    check('운영 빌드(PC): 저장된 태블릿 고정·?app=mobile 을 무시하고 PC 화면', await p.evaluate(() => !document.querySelector('[aria-label="보기 모드 전환"]')) && (await p.evaluate(() => document.querySelector('input[autocomplete="username"]').getBoundingClientRect().width)) > 0);
    // ?dev=1 로 개발자 확인
    await p.goto(BASE + '/?dev=1'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    check('운영 빌드라도 ?dev=1 이면 조작 바가 보임 (개발자용)', await hasBar(p));
    await p.goto(BASE + '/?dev=0'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    check('?dev=0 으로 다시 숨김', !(await hasBar(p)));
    await ctx.close();

    // 3) 운영 빌드(휴대폰): 휴대폰 화면 자동 선택 · 떠 있는 전환 버튼 없음
    ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    await asProd(ctx);
    p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    check('운영 빌드(휴대폰): 전환 버튼·바 없음', !(await hasBar(p)) && (await p.locator('[aria-label="보기 모드 전환"]').count()) === 0);
    check('운영 빌드(휴대폰): 화면이 휴대폰 폭에 꽉 참(액자 없음)', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await ctx.close();
    check('화면 오류 없음', errors.length === 0, errors.join(' | '));
  } catch (e) { check('시험 진행', false, e.message); }
  finally { await browser.close(); srv.kill(); }
  console.log('스마트케어 개발용 조작 바 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
