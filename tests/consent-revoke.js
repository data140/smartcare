#!/usr/bin/env node
/* 동의 철회 시험: 사유 필수 · 동의 상태가 실제로 미동의로 바뀜 · 취득 방식 '철회됨' · 철회 기록 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8998, BASE = 'http://localhost:' + PORT;
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
    await p.locator('aside >> text=환자 등록 관리').first().click(); await sleep(1500);
    await p.locator('text=가상환자1').first().click(); await sleep(1200);
    const tags = () => p.evaluate(() => [...document.querySelectorAll('span.tag')].map(e => e.innerText.trim()));
    const via = () => p.evaluate(() => { const t = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === '취득 방식'); return t ? (t.parentElement.innerText.trim() === '취득 방식' ? t.parentElement.parentElement : t.parentElement).innerText.replace(/\s+/g, ' ') : ''; });
    check('철회 전: 동의 완료', (await tags()).includes('동의 완료'), (await tags()).slice(-6).join('|'));
    await p.locator('button:has-text("동의 철회")').first().click(); await sleep(500);
    check('철회 확인 창: 사유를 고르기 전에는 [동의 철회] 단추가 잠김', await p.locator('.dialog-actions button:has-text("동의 철회")').isDisabled());
    check('철회 안내에 증빙 보존·증명사진 삭제가 적혀 있음', /증빙으로 보존/.test(await p.evaluate(() => document.body.innerText)) && /증명사진이 삭제/.test(await p.evaluate(() => document.body.innerText)));
    await p.locator('[aria-label="동의 철회"] button:has-text("본인 요청")').click(); await sleep(300);
    await p.locator('.dialog-actions button:has-text("동의 철회")').click(); await sleep(1200);
    const t = await tags();
    check('철회 후: 초상권·안면인식이 미동의로 실제 변경됨', t.includes('동의 미동의') || t.some(x => /미동의/.test(x)), t.join('|'));
    check('철회 후: 취득 방식이 [철회됨]', /철회됨/.test(await via()), await via());
    const log = await p.evaluate(() => JSON.parse(localStorage.getItem('smartcare.consentLog.v1') || '[]'));
    check('철회 기록(누가·사유)이 남음', log.length === 1 && log[0].reason === '본인 요청' && !!log[0].by && log[0].name === '가상환자1', JSON.stringify(log).slice(0, 160));
    await p.locator('button[aria-label="닫기"] >> visible=true').first().click().catch(() => {}); await sleep(500); await p.locator('aside button:has-text("담당자 명단 및 권한") >> visible=true').first().click(); await sleep(600);
    await p.locator('button[role=tab]:has-text("시스템 관리")').first().click(); await sleep(400);
    await p.locator('button[role=tab]:has-text("보안 알림")').first().click(); await sleep(600);
    check('설정 › 보안 알림에서 동의 철회 기록을 볼 수 있음', /동의 철회 기록/.test(await p.evaluate(() => document.body.innerText)) && /가상환자1/.test(await p.locator('[data-consent-log]').innerText()));
    check('화면 오류 없음', errs.length === 0, errs.join(' | '));
  } catch (e) { check('시험 진행', false, e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log('스마트케어 동의 철회 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
