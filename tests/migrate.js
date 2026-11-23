#!/usr/bin/env node
/* 데이터 이전 도구 시험 (설정 › 데이터 이전)
 *   python3 tools/build.py local-staff && node tests/migrate.js
 * 가짜 원본 서버(공용 계정 방식 · 가상 데이터)와 빈 새 서버(직원별 계정 방식)를 띄우고
 * 리허설 이전 → 확인 → 비우기 → 최종 이전(원본 저장 멈춤) → 저장 다시 허용을 시험합니다. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const SRC = 8813, DST = 8814, SRC_URL = 'http://localhost:' + SRC, DST_URL = 'http://localhost:' + DST;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const start = (args) => new Promise((ok, fail) => { const p = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js')].concat(args), { stdio: ['ignore', 'pipe', 'inherit'] }); p.stdout.once('data', () => ok(p)); p.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
const svc = { apikey: 'k', Authorization: 'Bearer dev-service-key' };
const kvRows = async (base, sel) => (await (await fetch(base + '/rest/v1/smartcare_kv?select=' + (sel || 'k') + '&k=like.smartcare%3A*', { headers: svc })).json());
const domClick = (page, txt) => page.evaluate((t) => { const el = [...document.querySelectorAll('button, span, div, a')].find(e => e.textContent.trim() === t); if (!el) throw new Error('찾을 수 없음: ' + t); (el.closest('button') || el).click(); }, txt);

(async () => {
  const src = await start([String(SRC)]), dst = await start([String(DST), '--staff', '--empty']);
  const browser = await chromium.launch();
  try {
    const srcKeys = (await kvRows(SRC_URL)).map(r => r.k).filter(k => !/appver|cloud\.v1/.test(k));
    check('시험 준비: 원본에 데이터, 새 서버는 비어 있음', srcKeys.length > 0 && (await kvRows(DST_URL)).length === 0, '원본 ' + srcKeys.length + '개');

    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(DST_URL + '/');
    await page.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await page.click('button:has-text("시스템 관리자")');
    await page.locator('input[autocomplete="username"]').first().fill('admin');
    await page.locator('input[autocomplete="current-password"]').first().fill('demo1234');
    await page.locator('button:has-text("로그인")').last().click();
    await page.waitForTimeout(4000);
    const navItem = page.locator('text=데이터 이전 >> visible=true').first();
    if (!(await navItem.count())) { const st = page.getByText('설정', { exact: true }).first(); await st.scrollIntoViewIfNeeded().catch(() => {}); await st.click().catch(() => {}); await page.waitForTimeout(500); }
    await page.locator('text=데이터 이전').last().scrollIntoViewIfNeeded().catch(() => {});
    await page.locator('text=데이터 이전 >> visible=true').first().click();
    await page.waitForTimeout(800);
    check('설정 › 데이터 이전 화면', await page.isVisible('#sc-mig-url'));

    await page.fill('#sc-mig-url', SRC_URL); await page.fill('#sc-mig-key', 'local-dev-key');
    await page.fill('#sc-mig-email', 'dev@smartcare.test'); await page.fill('#sc-mig-pw', 'wrong');
    await page.click('button:has-text("원본 서버 연결")');
    await page.waitForSelector('text=원본 서버 계정 이메일 또는 비밀번호가 맞지 않습니다', { timeout: 10000 }).then(() => check('원본 비밀번호 틀림 → 오류', true), () => check('원본 비밀번호 틀림 → 오류', false));
    await page.fill('#sc-mig-pw', 'dev1234');
    await page.click('button:has-text("원본 서버 연결")');
    await page.waitForSelector('text=/데이터 \\d+개 항목/', { timeout: 15000 }).then(() => check('원본 연결 → 미리 보기', true), () => check('원본 연결 → 미리 보기', false));

    // 리허설
    await page.click('button:has-text("리허설 이전")');
    await page.waitForSelector('text=리허설 완료', { timeout: 60000 }).then(() => check('리허설 이전 완료', true), () => check('리허설 이전 완료', false));
    const dstRows = await kvRows(DST_URL, 'k,v');
    const dstKeys = dstRows.map(r => r.k);
    check('원본의 모든 항목이 새 서버에', srcKeys.every(k => dstKeys.includes(k)), dstKeys.length + '/' + srcKeys.length);
    const srcRows = await kvRows(SRC_URL, 'k,v');
    const pt = k => (srcRows.find(r => r.k === k) || {}).v === (dstRows.find(r => r.k === k) || {}).v;
    check('환자 명부 내용 동일', pt('smartcare:smartcare.patients.v1'));
    const roster = JSON.parse((dstRows.find(r => r.k === 'smartcare:smartcare.roster.v1') || { v: '[]' }).v);
    check('새 서버 직원 명부에는 비밀번호 없음', roster.length > 0 && roster.every(m => !('pw' in m) && !('tempPw' in m)));
    check('원본은 저장 멈춤 안 됨 (리허설)', !(await kvRows(SRC_URL, 'k,v')).some(r => /appver/.test(r.k) && r.v === '9999999999'));
    const text = await page.evaluate(() => document.body.innerText);
    const m = text.match(/박체험\s+100102\s+([a-z0-9]{10})/);
    check('임시 비밀번호 목록 표시', !!m);
    const email = await (await fetch(DST_URL + '/rest/v1/rpc/smartcare_login_email', { method: 'POST', headers: { apikey: 'k', 'Content-Type': 'application/json' }, body: JSON.stringify({ p_ws: 'smartcare', p_mode: 'emp', p_org: 'ORG1', p_id: '100102' }) })).json();
    const tok = m ? await fetch(DST_URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: m[1] }) }) : null;
    check('표시된 임시 비밀번호로 직원 로그인', !!(tok && tok.ok));

    // 비우기
    await page.click('button:has-text("새 서버 데이터 비우기")');
    await page.locator('.dialog-actions button:has-text("새 서버 데이터 비우기")').click();
    await page.waitForSelector('text=새 서버 데이터를 비웠습니다', { timeout: 10000 }).catch(() => {});
    check('새 서버 데이터 비우기', (await kvRows(DST_URL)).length === 0);

    // 최종 이전
    await page.evaluate(() => { window.__scMigWaitMs = 500; });
    await page.click('button:has-text("최종 이전")');
    await page.locator('.dialog-actions button:has-text("최종 이전 시작")').click();
    await page.waitForSelector('text=최종 이전 완료', { timeout: 60000 }).then(() => check('최종 이전 완료', true), () => check('최종 이전 완료', false));
    const appver = (await kvRows(SRC_URL, 'k,v')).find(r => /appver/.test(r.k));
    check('최종 이전: 원본 저장 멈춤 표시 기록', !!appver && appver.v === '9999999999');
    check('최종 이전: 새 서버에 모든 항목', srcKeys.every(k => (dstKeys.includes(k))) && (await kvRows(DST_URL)).length >= srcKeys.length);
    check('최종 이전: 저장 멈춤 표시는 새 서버로 복사 안 함', !(await kvRows(DST_URL, 'k,v')).some(r => /appver/.test(r.k) && r.v === '9999999999'));
    const text2 = await page.evaluate(() => document.body.innerText);
    const m2 = text2.match(/박체험\s+100102\s+([a-z0-9]{10})/);
    check('최종 이전: 임시 비밀번호 새로 발급', !!m2 && (!m || m2[1] !== m[1]));
    await page.click('button:has-text("원본 서버 저장 다시 허용")');
    await page.waitForTimeout(1000);
    const appver2 = (await kvRows(SRC_URL, 'k,v')).find(r => /appver/.test(r.k));
    check('원본 서버 저장 다시 허용', !appver2 || appver2.v !== '9999999999');
    check('화면 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('시험 진행', false, e.message);
  } finally {
    await browser.close(); src.kill(); dst.kill();
  }
  console.log('스마트케어 데이터 이전 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
