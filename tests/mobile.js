#!/usr/bin/env node
/* 휴대폰·태블릿 화면 시험
 *   python3 tools/build.py local-staff && node tests/mobile.js
 * 실제 기기처럼 접속해 로그인한 뒤 현장 앱 화면(오늘 일정)이 나오는지 확인합니다.
 * (화면 틀의 태그가 하나라도 어긋나면 휴대폰 화면이 통째로 빈 화면이 되기 때문에 따로 점검합니다) */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const PORT = 8885, BASE = 'http://localhost:' + PORT;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };

(async () => {
  // 화면 틀(src/page.html)의 div·sc-if 짝 점검
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'page.html'), 'utf8');
  const cnt = (re) => (html.match(re) || []).length;
  check('화면 틀: <div> 여닫음 짝이 맞음', cnt(/<div\b/g) === cnt(/<\/div>/g), cnt(/<div\b/g) + ' / ' + cnt(/<\/div>/g));
  check('화면 틀: <sc-if> 여닫음 짝이 맞음', cnt(/<sc-if\b/g) === cnt(/<\/sc-if>/g), cnt(/<sc-if\b/g) + ' / ' + cnt(/<\/sc-if>/g));
  check('화면 틀: <sc-for> 여닫음 짝이 맞음', cnt(/<sc-for\b/g) === cnt(/<\/sc-for>/g), cnt(/<sc-for\b/g) + ' / ' + cnt(/<\/sc-for>/g));

  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  const devices = [
    ['휴대폰', { viewport: { width: 390, height: 780 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', isMobile: true }],
    ['태블릿', { viewport: { width: 820, height: 1180 }, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', isMobile: true }]
  ];
  try {
    for (const [name, opt] of devices) {
      const ctx = await browser.newContext(Object.assign({ hasTouch: true, deviceScaleFactor: 2 }, opt));
      const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
      await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
      await p.locator('input[autocomplete="username"]').first().fill('100101');
      await p.locator('input[autocomplete="current-password"]').first().fill('1234');
      await p.locator('button:has-text("로그인")').last().tap();
      await p.waitForFunction(() => /오늘 \d건|오늘/.test(document.body.innerText) && !document.querySelector('input[autocomplete="username"]'), null, { timeout: 20000 }).catch(() => {});
      const txt = await p.evaluate(() => document.body.innerText);
      check(name + ': 로그인 후 현장 앱 화면이 나옴 (빈 화면 아님)', txt.length > 60 && /오늘/.test(txt), '글자 수 ' + txt.length);
      // 하단 탭 막대: 화면 맨 아래에 붙어 있고(위로 뜨지 않음), 아이콘이 충분히 큼
      const tabs = await p.evaluate(() => { const bs = [...document.querySelectorAll('.sc-dock .sc-tab')].filter(b => b.offsetParent); const r = bs.map(b => b.getBoundingClientRect()); const ic = bs[0] && bs[0].querySelector('.sc-tab-ic'); return { n: bs.length, bottom: Math.max(...r.map(x => x.bottom)), vh: window.innerHeight, tile: ic ? ic.getBoundingClientRect().width : 0, icon: ic ? parseFloat(getComputedStyle(ic.querySelector('i')).fontSize) : 0, cur: bs.filter(b => b.getAttribute('aria-current') === 'page').length }; });
      check(name + ': 하단 메뉴(독)가 화면 맨 아래에 붙어 있음 (6개 · 선택 1개)', tabs.n === 6 && tabs.cur === 1 && tabs.vh - tabs.bottom < 30, JSON.stringify(tabs));
      check(name + ': 하단 메뉴 타일 40px 이상 · 아이콘 22px 이상', tabs.tile >= 40 && tabs.icon >= 22, tabs.tile + '/' + tabs.icon);
      // 맨 위 오른쪽 빈 공간에 놓이고, 끌어서 옮길 수 있고, 옮긴 위치를 기억함
      const box0 = await p.locator('button[aria-label="AI 비서 열기"]').boundingBox();
      check(name + ': AI 버튼 기본 위치가 맨 위 오른쪽 (하단 탭·버튼 아님)', box0 && box0.y < 140 && box0.x > (opt.viewport.width - 110), JSON.stringify(box0));
      await p.mouse.move(box0.x + 25, box0.y + 25); await p.mouse.down(); await p.mouse.move(box0.x - 60, box0.y + 200, { steps: 8 }); await p.mouse.move(150, 420, { steps: 6 }); await p.mouse.up();
      await sleep(200);
      const box1 = await p.locator('button[aria-label="AI 비서 열기"]').boundingBox();
      check(name + ': 끌어서 원하는 곳으로 옮길 수 있음', box1 && Math.abs(box1.x - 125) < 30 && Math.abs(box1.y - 395) < 30, JSON.stringify(box1));
      check(name + ': 끌어서 옮긴 뒤 대화창이 저절로 열리지 않음', (await p.locator('[role="dialog"][aria-label="AI 비서"]').count()) === 0);
      await p.reload(); await p.waitForFunction(() => /오늘/.test(document.body.innerText) && !document.querySelector('input[autocomplete="username"]'), null, { timeout: 20000 }).catch(() => {});
      const box2 = await p.locator('button[aria-label="AI 비서 열기"]').boundingBox().catch(() => null);
      check(name + ': 옮긴 위치를 기억함 (새로고침 후에도)', box2 && Math.abs(box2.x - box1.x) < 6 && Math.abs(box2.y - box1.y) < 6, JSON.stringify(box2));
      await p.locator('button[aria-label="AI 비서 열기"]').tap(); await sleep(500);
      check(name + ': 눌러서 대화창 열기', (await p.locator('[role="dialog"][aria-label="AI 비서"]').count()) === 1);
      check(name + ': 화면 오류 없음', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  } catch (e) { check('시험 진행', false, e.message); }
  finally { await browser.close(); srv.kill(); }
  console.log('스마트케어 휴대폰·태블릿 화면 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
