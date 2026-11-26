#!/usr/bin/env node
/* 착오 등록 일지 삭제 시험: 확정 전만 · 사유 필수 · 하루 한도 · 삭제 기록 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8987, BASE = 'http://localhost:' + PORT;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    // 확정 전(검수 필요) 일지 4건을 서버에 미리 넣어 둠
    const dstr = (n) => { const t = new Date(Date.now() - n * 86400000); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
    const rows = ['음악치료', '미술치료', '컬러링북', '원예치료'].map((pg, i) => ({ k: 'smartcare:smartcare.wsess.' + encodeURIComponent(dstr(i + 1) + '|' + pg), v: JSON.stringify({ review: [{ id: 'P' + (i + 1), name: '가상환자' + (i + 1), sim: 95 }], confirmed: false, photos: [] }) }));
    await fetch(BASE + '/rest/v1/smartcare_kv', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'x', Authorization: 'Bearer dev-service-key' }, body: JSON.stringify(rows) });
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100102'); await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().tap();
    await p.waitForFunction(() => /오늘/.test(document.body.innerText) && !document.querySelector('input[autocomplete="username"]'), null, { timeout: 20000 }); await sleep(1500);
    await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find(b => b.offsetParent && b.querySelector('.ph-x') && /브리핑/.test((b.parentElement || {}).innerText || '')); if (x) x.click(); }); await sleep(300);
    const toLogs = async () => { await p.evaluate(() => [...document.querySelectorAll('.sc-dock .sc-tab')].find(b => b.offsetParent && b.innerText.trim() === '일지').click()); await sleep(600); };
    const rowCount = () => p.locator('button:has-text("AI 인식"), button:has-text("확정 "), button:has-text("사진 첨부 전")').count();
    // 삭제 가능한(확정 전 · 내용 있는) 일지 찾기
    const openDeletable = async () => {
      await toLogs();
      const rows = p.locator('button:has-text("AI 인식")'); const n = await rows.count();
      for (let i = 0; i < n; i++) { await toLogs(); await p.locator('button:has-text("AI 인식")').nth(i).tap(); await sleep(700); if (await p.locator('button:has-text("잘못 등록한 일지 삭제")').count()) return true; }
      return false;
    };
    await toLogs();
    const before = await p.locator('button:has-text("AI 인식")').count();
    check('시험 준비: 확정 전(검수 필요) 일지가 있음', before >= 3, String(before));
    let deleted = 0;
    for (let n = 1; n <= 4; n++) {
      if (!(await openDeletable())) { check('삭제 가능한 일지 ' + n + '번째', false, '없음'); break; }
      await p.locator('button:has-text("잘못 등록한 일지 삭제")').tap(); await sleep(400);
      if (n === 1) check('사유를 고르기 전에는 삭제 단추가 잠겨 있음', await p.locator('.dialog-actions button:has-text("삭제")').isDisabled());
      await p.locator('button:has-text("착오로 등록했어요")').tap(); await sleep(200);
      if (n === 1) check('남은 삭제 횟수가 보임 (담당자 하루 3회)', /남은 삭제 횟수 3회/.test(await p.evaluate(() => document.body.innerText)));
      if (n === 4) { check('4번째 삭제는 하루 한도로 막힘(삭제 단추 잠김, 남은 0회)', (await p.locator('.dialog-actions button:has-text("삭제")').isDisabled()) && /남은 삭제 횟수 0회/.test(await p.evaluate(() => document.body.innerText))); break; }
      await p.locator('.dialog-actions button:has-text("삭제")').tap(); await sleep(900); deleted++;
    }
    await toLogs();
    const after = await p.locator('button:has-text("AI 인식")').count();
    check('3건 삭제 뒤 목록에서 3건 줄어듦', before - after === 3, before + ' → ' + after);
    const log = await p.evaluate(() => JSON.parse(localStorage.getItem('smartcare.logDel.v1') || '[]'));
    check('삭제 기록 3건(누가·사유 포함)', log.length === 3 && log.every(x => x.by && x.reason && x.key), JSON.stringify(log.map(x => x.reason)));
    const bak = await p.evaluate(() => Object.keys(localStorage).filter(k => k.indexOf('smartcare.wsessbak.') === 0).length);
    check('삭제 전 내용이 백업으로 남음', bak >= 3, String(bak));
    // 사진·판독 결과가 하나도 없는 빈 일지(검수 화면)에서도 삭제 단추가 보임
    await p.evaluate(() => [...document.querySelectorAll('.sc-dock .sc-tab')].find(b => b.offsetParent && b.innerText.trim() === '검수').click()); await sleep(700);
    check('빈 일지(사진 0 · 판독 0)에서도 삭제 단추가 보임', (await p.locator('button:has-text("잘못 등록한 일지 삭제")').count()) >= 1);
    check('화면 오류 없음', errs.length === 0, errs.join(' | '));
  } catch (e) { check('시험 진행', false, e.message.split('\n').slice(0, 12).join(' | ')); }
  console.log('스마트케어 일지 삭제 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
