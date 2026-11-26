#!/usr/bin/env node
/* 동의서 관리: 서면 파일을 지우면 '취득 방식'이 '서면 첨부'로 남지 않고 '미취득'으로 돌아옴 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8997, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
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
    // 동의 상태는 '동의'인데 서면 파일·전자 동의 기록이 없는 환자(가상환자1): 보관됨·모바일 전자서명이라고 거짓 표시하지 않음
    await p.locator('text=가상환자1').first().click(); await sleep(1200);
    const tile = (label) => p.evaluate((l) => { const t = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === l); return t ? (t.parentElement.innerText.trim() === l ? t.parentElement.parentElement : t.parentElement).innerText.replace(/\s+/g, ' ') : ''; }, label);
    check('증빙이 없으면 동의서 칸이 [PDF 보관됨]이 아니라 [증빙 없음]', /증빙 없음/.test(await tile('동의서')) && !/보관됨/.test(await tile('동의서')), await tile('동의서'));
    check('증빙이 없으면 취득 방식이 [모바일 전자서명]이 아니라 [증빙 없음]', /증빙 없음/.test(await tile('취득 방식')) && !/전자서명/.test(await tile('취득 방식')), await tile('취득 방식'));
    await p.locator('button[aria-label="닫기"] >> visible=true').first().click().catch(() => {}); await sleep(600);
    // 동의 없음(PT-D003 가상환자3: 보류) 환자를 골라 연다
    await p.locator('text=가상환자3').first().click(); await sleep(1200);
    const via = async () => p.evaluate(() => { const t = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === '취득 방식'); return t ? (t.parentElement.innerText.trim() === '취득 방식' ? t.parentElement.parentElement : t.parentElement).innerText.replace(/\s+/g, ' ') : ''; });
    check('처음에는 취득 방식이 [미취득]', /미취득/.test(await via()), await via());
    await p.locator('input[type=file]').first().setInputFiles({ name: 'consent.png', mimeType: 'image/png', buffer: PNG }); await sleep(1200);
    check('서면 파일을 첨부하면 [서면 첨부]', /서면 첨부/.test(await via()), await via());
    await p.locator('button[aria-label="첨부 삭제"]').first().click(); await sleep(600);
    const dlg = p.locator('.dialog-actions button:has-text("삭제")'); if (await dlg.count()) { await dlg.first().click(); await sleep(800); }
    check('파일을 모두 지우면 취득 방식이 [미취득]으로 돌아옴 (예전 값이 남지 않음)', /미취득/.test(await via()) && !/서면 첨부/.test(await via()), await via());
    check('화면 오류 없음', errs.length === 0, errs.join(' | '));
  } catch (e) { check('시험 진행', false, e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log('스마트케어 동의서 취득 방식 표시 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
