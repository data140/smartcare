#!/usr/bin/env node
/* 전체 화면 순회 점검: 관리자·담당자 계정으로 사이드바의 모든 화면(PC)과 하단 메뉴 화면(휴대폰·태블릿)을 열어
 * 화면 오류(pageerror·console error)와 깨진 표시([object Object]·undefined·NaN)가 없는지 확인 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8960, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BAD = /\[object Object\]|\bundefined\b|\bNaN\b|\{\{|\}\}/;
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  const login = async (ctx, id, pw) => {
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/.test(m.text())) p.errs.push('console: ' + m.text().slice(0, 160)); });
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill(id); await p.locator('input[autocomplete="current-password"]').first().fill(pw);
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 25000 }).catch(() => {}); await sleep(1200);
    return p;
  };
  try {
    // ── PC: 사이드바의 모든 메뉴 항목을 차례로 열기 (관리자 · 담당자)
    for (const [who, id, pw] of [['관리자', '100101', '1234'], ['담당자', '100102', '1234']]) {
      const p = await login(await browser.newContext({ viewport: { width: 1440, height: 1000 } }), id, pw);
      await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find(b => b.offsetParent && b.querySelector('.ph-x') && /브리핑/.test((b.parentElement || {}).innerText || '')); if (x) x.click(); });
      const uniq = ['환자 등록 관리', '서면 동의서 관리', '캘린더', '일지 목록', '출석부', '앨범 (아카이브)', '프로그램 운영일지', '전체 보기', '운영 지표', '병동별 프로그램', '월별 · 병동별', '프로그램 구성', '프로그램 진행', '병동별 건수'];
      let opened = 0; const bad = [];
      for (const t of uniq) {
        const el = p.locator('aside').getByText(t, { exact: false }).first();
        if (!(await el.isVisible().catch(() => false))) continue;
        await el.click({ timeout: 4000 }).catch(() => {}); await sleep(500); opened++;
        const txt = await p.evaluate(() => document.body.innerText);
        const m = BAD.exec(txt); if (m) bad.push(t + ' → ' + txt.slice(Math.max(0, m.index - 20), m.index + 25).replace(/\s+/g, ' '));
        await p.keyboard.press('Escape').catch(() => {});
      }
      check('PC(' + who + '): 사이드바 화면 ' + opened + '곳을 열어도 깨진 표시가 없음', opened >= 10 && bad.length === 0, 'opened ' + opened + (bad.length ? ' · ' + bad.slice(0, 3).join(' | ') : ''));
      check('PC(' + who + '): 화면 순회 중 오류 없음', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
      // 설정 탭 순회
      if (who === '관리자') {
        await p.locator('aside button:has-text("담당자 명단 및 권한")').first().click().catch(() => {}); await sleep(500);
        const tabs = await p.evaluate(() => [...document.querySelectorAll('button[role=tab]')].filter(b => b.offsetParent).map(b => b.innerText.trim()));
        const badT = []; let n = 0;
        for (const t of tabs) { await p.locator('button[role=tab]').filter({ hasText: t }).first().click().catch(() => {}); await sleep(450); n++;
          const sub = await p.evaluate(() => [...document.querySelectorAll('.sc-subtab')].filter(b => b.offsetParent).map(b => b.innerText.trim()));
          for (const st of sub) { await p.locator('.sc-subtab').filter({ hasText: st }).first().click().catch(() => {}); await sleep(350); n++; const x = BAD.exec(await p.evaluate(() => document.body.innerText)); if (x) badT.push(t + '/' + st); }
          const x = BAD.exec(await p.evaluate(() => document.body.innerText)); if (x) badT.push(t); }
        check('설정: 탭·하위 메뉴 ' + n + '곳을 열어도 깨진 표시가 없음', n >= 6 && badT.length === 0, 'n ' + n + (badT.length ? ' · ' + badT.join(', ') : ''));
        check('설정 순회 중 오류 없음', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
      }
      await p.context().close();
    }
    // ── 휴대폰·태블릿: 하단 메뉴 6개 화면
    for (const [dev, vp, ua] of [['휴대폰', { width: 390, height: 780 }, 'iPhone; CPU iPhone OS 17_0 like Mac OS X'], ['태블릿', { width: 820, height: 1180 }, 'iPad; CPU OS 17_0 like Mac OS X']]) {
      const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (' + ua + ') AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
      const q = await ctx.newPage(); q.errs = []; q.on('pageerror', e => q.errs.push('pageerror: ' + e.message)); q.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/.test(m.text())) q.errs.push('console: ' + m.text().slice(0, 160)); });
      await q.goto(BASE + '/'); await q.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
      await q.locator('input[autocomplete="username"]').first().fill('100101'); await q.locator('input[autocomplete="current-password"]').first().fill('1234');
      await q.locator('button:has-text("로그인")').last().tap(); await q.waitForFunction(() => /오늘/.test(document.body.innerText) && !document.querySelector('input[autocomplete="username"]'), null, { timeout: 25000 }); await sleep(1500);
      const tabs = ['오늘', '일지', '검수', '운영일지', '동의서', '내 설정']; const bad = [];
      for (const t of tabs) {
        await q.evaluate((n) => [...document.querySelectorAll('.sc-dock .sc-tab')].find(b => b.offsetParent && b.innerText.trim() === n).click(), t); await sleep(600);
        const m = BAD.exec(await q.evaluate(() => document.body.innerText)); if (m) bad.push(t);
      }
      check(dev + ': 하단 메뉴 6개 화면에 깨진 표시가 없음', bad.length === 0, bad.join(', '));
      check(dev + ': 화면 순회 중 오류 없음', q.errs.length === 0, q.errs.slice(0, 3).join(' | '));
      await ctx.close();
    }
  } catch (e) { check('시험 진행', false, e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log('스마트케어 전체 화면 순회 점검\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
