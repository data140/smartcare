#!/usr/bin/env node
/* EMR 재원환자 명부 붙여넣기 시험: '3병동-0301-01' 형식과 '통합면역센터-0458-01'(병동 이름) 형식 모두 읽음 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8994, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101'); await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    await p.locator('button:has-text("EMR 붙여넣기")').first().click(); await sleep(800);
    const T = '\t';
    const text = [
      ['통합면역센터-0458-01', '64', '', '심광웅', '박영미', '00009258', '보험', '49', 'F', '2026-11-19', '8'].join(T),
      '통합면역센터-0458-02', '통합면역센터-0458-03',
      ['통합면역센터-0458-04', '65', '', '심광웅', '최동원', '00009300', '의급', '71', 'M', '2026-11-20', '9'].join(T),
      ['3병동-0301-01', '10', '', '김의사', '정옛날', '00009400', '보험', '80', 'F', '2026-11-21', '3'].join(T)
    ].join('\n');
    const ta = p.locator('textarea').filter({ visible: true }).first();
    await ta.fill(text); await sleep(900);
    const body = await p.evaluate(() => document.body.innerText);
    check('병동 이름 형식(통합면역센터-0458-01) 환자가 읽힘', /박영미/.test(body) && /최동원/.test(body));
    check('기존 형식(3병동-0301-01) 환자도 읽힘', /정옛날/.test(body));
    check('빈 병상 줄(이름 없음)은 건너뜀 — 읽지 못한 줄 안내가 없음', !/읽지 못한 줄\s*[1-9]/.test(body), (body.match(/읽지 못한[^\n]*/) || [''])[0]);
    check('병동 이름이 통합면역센터로 표시됨', /통합면역센터\s*458호/.test(body), (body.match(/통합면역센터[^\n]{0,20}/) || [''])[0]);
    check('화면 오류 없음', errs.length === 0, errs.join(' | '));
  } catch (e) { check('시험 진행', false, e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log('스마트케어 EMR 붙여넣기 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
