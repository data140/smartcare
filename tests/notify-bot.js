#!/usr/bin/env node
/* 알림 발송 서버 계정 시험 (설정 › 일정 알림) — 만들기 · 계정 목록에서 숨김 · 로그인 · 비밀번호 다시 만들기 · 삭제
 *   python3 tools/build.py local-staff && node tests/notify-bot.js */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8889, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  const tryLogin = async (id, pw) => {
    const q = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    await q.goto(BASE + '/'); await q.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await q.locator('input[autocomplete="username"]').first().fill(id); await q.locator('input[autocomplete="current-password"]').first().fill(pw);
    await q.locator('button:has-text("로그인")').last().click();
    const ok = await q.waitForFunction(() => !document.querySelector('input[autocomplete="username"]') && /통계 전체 보기|로그아웃/.test(document.body.innerText), null, { timeout: 12000 }).then(() => true, () => false);
    await q.close(); return ok;
  };
  try {
    const p = await browser.newPage({ viewport: { width: 1466, height: 1100 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101'); await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 20000 }); await sleep(800);
    await p.locator('text=계정 · 권한 >> visible=true').first().click(); await sleep(600);
    await p.locator('button:has-text("일정 알림")').first().click(); await sleep(600);
    check('일정 알림에 "알림 발송 서버 계정" 구역이 있음', await p.evaluate(() => document.body.innerText.includes('알림 발송 서버 계정')));
    await p.locator('button:has-text("알림 발송 계정 만들기")').first().click(); await sleep(2500);
    const pw = await p.evaluate(() => { const c = [...document.querySelectorAll('code')].find(e => /^[A-Za-z0-9]{14}$/.test(e.textContent.trim())); return c ? c.textContent.trim() : ''; });
    const emp = await p.evaluate(() => { const b = [...document.querySelectorAll('b')].find(e => /^NOTI\d+$/.test(e.textContent.trim())); return b ? b.textContent.trim() : ''; });
    check('계정이 만들어지고 사번(SB_ID)과 비밀번호가 한 번 표시됨', !!pw && emp === 'NOTI01', 'SB_ID=' + emp + ' · 비밀번호 ' + pw.length + '자');
    // 계정 목록에는 나오지 않음
    await p.locator('text=계정 · 권한 >> visible=true').first().click(); await sleep(900);
    check('만든 계정은 계정 목록에 나오지 않음', !(await p.evaluate(() => document.body.innerText.includes('알림 발송 서버') && /NOTI01/.test(document.body.innerText))));
    // 새 계정으로 로그인 가능 (조회 전용)
    check('알림 발송 계정으로 서버 로그인이 됨', await tryLogin('NOTI01', pw));
    check('틀린 비밀번호로는 로그인되지 않음', !(await tryLogin('NOTI01', 'wrongpassword12')));
    // 다시 만들기
    await p.locator('button:has-text("일정 알림")').first().click(); await sleep(500);
    await p.locator('button:has-text("비밀번호 다시 만들기")').first().click(); await sleep(2000);
    const pw2 = await p.evaluate(() => { const c = [...document.querySelectorAll('code')].find(e => /^[A-Za-z0-9]{14}$/.test(e.textContent.trim())); return c ? c.textContent.trim() : ''; });
    check('비밀번호를 다시 만들면 이전 비밀번호는 못 쓰고 새 비밀번호로 로그인됨', !!pw2 && pw2 !== pw && !(await tryLogin('NOTI01', pw)) && (await tryLogin('NOTI01', pw2)));
    // 삭제
    await p.locator('button:has-text("삭제")').filter({ hasText: /^\s*삭제\s*$/ }).first().click(); await sleep(500);
    await p.locator('.dialog-backdrop button:has-text("삭제")').first().click(); await sleep(2000);
    check('삭제하면 구역이 처음 상태로 돌아가고 로그인도 막힘', (await p.locator('button:has-text("알림 발송 계정 만들기")').count()) >= 1 && !(await tryLogin('NOTI01', pw2)));
    check('화면 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) { check('시험 진행', false, e.message); }
  finally { await browser.close(); srv.kill(); }
  console.log('스마트케어 알림 발송 서버 계정 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
