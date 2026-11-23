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
      const fab = await p.evaluate(() => { const b = document.querySelector('button[aria-label="AI 비서 열기"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { bottomGap: Math.round(window.innerHeight - r.bottom) }; });
      check(name + ': AI 버튼이 하단 탭 막대(약 80px)를 가리지 않음', !!fab && fab.bottomGap >= 80, fab ? '아래 여백 ' + fab.bottomGap + 'px' : '버튼 없음');
      check(name + ': 화면 오류 없음', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  } catch (e) { check('시험 진행', false, e.message); }
  finally { await browser.close(); srv.kill(); }
  console.log('스마트케어 휴대폰·태블릿 화면 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
