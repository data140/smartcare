#!/usr/bin/env node
/* 서버 전환 시험: 예전 서버(공용 계정 방식) 데이터가 남은 브라우저에서 새 서버 화면을 처음 열 때
 *   python3 tools/build.py local-staff && node tests/server-switch.js
 * 예전 화면 데이터·로그인은 비우고 화면 설정은 남기며, 두 번째부터는 비우지 않는지 확인합니다. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8841, BASE = 'http://localhost:' + PORT + '/';
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const raw = (p) => p.evaluate(() => new Promise(res => { const f = document.createElement('iframe'); f.srcdoc = '<p>x</p>'; f.onload = () => { const ls = f.contentWindow.localStorage, o = {}; for (let i = 0; i < ls.length; i++) o[ls.key(i)] = ls.getItem(ls.key(i)); f.remove(); res(o); }; document.body.appendChild(f); }));

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    // 예전 서버 시절 브라우저 상태 (화면이 열리기 전에 심어 둠)
    await ctx.addInitScript(() => {
      if (sessionStorage.getItem('planted')) return;
      sessionStorage.setItem('planted', '1');
      localStorage.setItem('smartcare.patients.v1', JSON.stringify([{ id: 'OLD-1', name: '예전서버환자', room: '1병동 101호', stay: '재원' }]));
      localStorage.setItem('smartcare.roster.v1', JSON.stringify([{ id: 1, name: '예전직원', org: 'ORG1', empNo: '100101', pw: 'p1$abc', status: '활성', roles: ['관리자'] }]));
      localStorage.setItem('sc.kvSeen.v1', JSON.stringify({ 'smartcare.patients.v1': '2099-01-01T00:00:00Z' }));
      localStorage.setItem('sc.auth.v1', JSON.stringify({ url: 'https://old.example', access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 3600e3 }));
      localStorage.setItem('sc.lastView.v1', JSON.stringify({ logged: true, userId: 1, orgId: 'ORG1', at: Date.now() }));
      localStorage.setItem('sc.theme', JSON.stringify({ theme: 'light', accent: '#9184d9' }));
    });
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 }); await p.waitForTimeout(1000);
    const s1 = await raw(p);
    check('예전 화면 데이터 비움 (환자·직원 명부·받은 기록)', !s1['smartcare.patients.v1'] && !(s1['smartcare.roster.v1'] || '').includes('예전직원') && !(s1['sc.kvSeen.v1'] || '').includes('2099'));
    check('예전 로그인 정보 비움 → 로그인 화면', !(s1['sc.auth.v1'] || '').includes('old.example') && await p.isVisible('input[autocomplete="current-password"]'));
    check('화면 설정(테마)은 남김', (s1['sc.theme'] || '').includes('light'));
    check('서버 기록 남김', !!s1['sc.server.v1'], s1['sc.server.v1']);

    await p.locator('input[autocomplete="username"]').first().fill('100101');
    await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click();
    await p.waitForSelector('text=가상환자1', { timeout: 20000 }).then(() => check('새 서버 데이터로 로그인', true), () => check('새 서버 데이터로 로그인', false));
    check('예전 서버 환자는 보이지 않음', !(await p.isVisible('text=예전서버환자')));
    await p.reload(); await p.waitForTimeout(5000);
    check('두 번째부터는 비우지 않음 (로그인 유지)', await p.isVisible('text=로그아웃'));
    check('화면 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('시험 진행', false, e.message);
  } finally {
    await browser.close(); srv.kill();
  }
  console.log('스마트케어 서버 전환 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
