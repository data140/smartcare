#!/usr/bin/env node
/* 브라우저 저장 공간이 거의 찬 상태에서 서버 데이터가 화면에 반영되는지 시험
 *   python3 tools/build.py local-staff && node tests/quota.js
 * (같은 주소의 운영 화면 캐시 등으로 저장 공간이 부족하면 큰 항목 저장이 실패함 →
 *  예전에는 '이미 받은 항목'으로 처리돼 새로고침 후 환자 명부가 비어 보였음) */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const SRC = +(process.env.QSRC || 8831), DST = +(process.env.QDST || 8832);
const start = (args) => new Promise((ok, fail) => { const p = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js')].concat(args), { stdio: ['ignore', 'pipe', 'inherit'] }); p.stdout.once('data', () => ok(p)); p.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };

(async () => {
  const src = await start([String(SRC)]), dst = await start([String(DST), '--staff', '--empty']);
  const browser = await chromium.launch();
  try {
    // 원본에 큰 환자 명부 (약 150KB)
    const big = [];
    for (let i = 0; i < 456; i++) big.push({ id: 'PT-B' + i, room: '3병동 30' + (i % 9) + '호', name: i === 0 ? '가상환자1' : '가상환자' + i, sex: '여', birth: '1940-01-01', age: 86, consent: '동의', face: '동의', stay: '재원', faceId: '—', last: '참여 이력 없음', photo: false, guardians: [], memo: 'x'.repeat(200) });
    // 전자 동의 10명, 서면 동의서 2명 (첨부 약 3MB — 실제 운영 데이터와 비슷한 크기)
    const mconsent = {}; for (let i = 0; i < 10; i++) mconsent['PT-B' + i] = { at: '2026-11-01', items: { face: true } };
    const file = (pid, n) => ({ id: pid + '-f', name: '동의서' + n + '.jpg', size: 1500000, url: 'data:image/jpeg;base64,' + 'A'.repeat(1500000) });
    const cfiles = { files: { 'PT-B10': [file('PT-B10', 1)], 'PT-B11': [file('PT-B11', 2)] }, via: {}, deleted: {} };
    const now = new Date().toISOString();
    await fetch('http://localhost:' + SRC + '/rest/v1/smartcare_kv?on_conflict=k', { method: 'POST', headers: { apikey: 'k', Authorization: 'Bearer dev-token', 'Content-Type': 'application/json' }, body: JSON.stringify([
      { k: 'smartcare:smartcare.patients.v1', v: JSON.stringify(big), updated_at: now },
      { k: 'smartcare:smartcare.mconsent.v1', v: JSON.stringify(mconsent), updated_at: now },
      { k: 'smartcare:smartcare.cfiles.v1', v: JSON.stringify(cfiles), updated_at: now }]) });

    // ① 저장 공간이 꽉 찬 상태에서 로그인 → 새로고침해도 로그인 유지 (로그인 정보는 반드시 저장)
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const q = await ctx.newPage();
      await q.goto('http://localhost:' + DST + '/'); await q.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
      // 같은 주소의 화면 데이터처럼 'smartcare.' 키로 꽉 채움 (서버에서 다시 받을 수 있는 캐시라 비워도 됨)
      await q.evaluate(() => new Promise(res => { const f = document.createElement('iframe'); f.srcdoc = '<p>x</p>'; f.onload = () => {
        const ls = f.contentWindow.localStorage; let chunk = 'x'.repeat(256 * 1024), i = 0;
        while (chunk.length >= 16) { try { ls.setItem('smartcare.o.ORG2.cache' + (i++), chunk); } catch (e) { chunk = chunk.slice(0, chunk.length / 2); } }
        res(); }; document.body.appendChild(f); }));
      await q.click('button:has-text("시스템 관리자")');
      await q.locator('input[autocomplete="username"]').first().fill('admin'); await q.locator('input[autocomplete="current-password"]').first().fill('demo1234');
      await q.locator('button:has-text("로그인")').last().click(); await q.waitForTimeout(4000);
      await q.reload(); await q.waitForTimeout(5000);
      check('저장 공간이 꽉 차도 새로고침 후 로그인 유지', !(await q.isVisible('input[autocomplete="current-password"]')) && await q.isVisible('text=로그아웃'));
      await ctx.close();
    }

    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    // 느린 환경 재현용: THROTTLE=6 이면 화면 처리 속도를 1/6로 낮춤 (CI에서 간헐 실패 원인 추적)
    if (process.env.THROTTLE) { const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) }); }
    await p.goto('http://localhost:' + DST + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.click('button:has-text("시스템 관리자")');
    await p.locator('input[autocomplete="username"]').first().fill('admin'); await p.locator('input[autocomplete="current-password"]').first().fill('demo1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForTimeout(4000);
    // 같은 주소의 다른 화면이 저장 공간을 거의 다 쓴 상태 (앱이 감싼 저장 함수를 거치지 않도록 별도 틀에서 채움)
    const filled = await p.evaluate(() => new Promise(res => { const f = document.createElement('iframe'); f.srcdoc = '<p>x</p>'; f.onload = () => {
      const ls = f.contentWindow.localStorage; let chunk = 'x'.repeat(256 * 1024), i = 0, total = 0;
      while (chunk.length >= 64) { try { ls.setItem('zz~fill' + (i++), chunk); total += chunk.length; } catch (e) { chunk = chunk.slice(0, chunk.length / 2); } }
      for (let j = 0; j < 4; j++) ls.removeItem('zz~fill' + (i - 1 - j));
      res(total); }; document.body.appendChild(f); }));
    check('저장 공간 거의 채움', filled > 4000000, Math.round(filled / 1024) + 'KB');

    await p.locator('text=데이터 이전').last().scrollIntoViewIfNeeded().catch(() => {});
    await p.locator('text=데이터 이전 >> visible=true').first().click(); await p.waitForTimeout(800);
    await p.fill('#sc-mig-url', 'http://localhost:' + SRC); await p.fill('#sc-mig-key', 'k'); await p.fill('#sc-mig-email', 'dev@smartcare.test'); await p.fill('#sc-mig-pw', 'dev1234');
    await p.click('button:has-text("원본 서버 연결")'); await p.waitForSelector('text=/데이터 \\d+개 항목/', { timeout: 15000 });
    await p.click('button:has-text("리허설 이전")'); await p.waitForSelector('text=리허설 완료', { timeout: 60000 });
    await p.waitForTimeout(20000); // 화면을 둔 동안 15초마다 서버에서 받아 옴 (이때 큰 항목 저장 실패)
    await p.click('button:has-text("새로고침해 데이터 보기")'); await p.waitForTimeout(6000);
    await p.locator('text=환자 등록 관리').first().click().catch(() => {}); await p.waitForTimeout(1500);
    check('새로고침 후 환자 명부 표시 (저장 공간 부족이어도)', await p.isVisible('text=가상환자1'));
    await p.locator('text=서면 동의서 관리').first().click().catch(() => {}); await p.waitForTimeout(2000);
    // 큰 항목이 단계적으로 반영되므로(느린 환경에서는 더 오래), 기대한 값이 될 때까지 최대 25초 기다림
    let none, nofile;
    // 기대한 값이 될 때까지 최대 25초 기다리고, 그래도 다르면 새로고침해서 한 번 더 확인 (간헐적으로 일부 항목만 먼저 반영되는 경우 대비)
    for (let round = 0; round < 2 && !(none === '444' && nofile === '454'); round++) {
      if (round) { await p.reload(); await p.waitForTimeout(6000); await p.locator('text=서면 동의서 관리').first().click().catch(() => {}); await p.waitForTimeout(2000); }
      for (let i = 0; i < 25; i++) {
        const body = await p.evaluate(() => document.body.innerText);
        none = (body.match(/동의 없음\s*(\d+)/) || [])[1]; nofile = (body.match(/서면 파일 없음\s*(\d+)/) || [])[1];
        if (none === '444' && nofile === '454') break;
        await p.waitForTimeout(1000);
      }
    }
    // 값이 다를 때 원인 추적: 목록에서 빠진 환자 이름을 찾아 함께 출력
    if (!(none === '444' && nofile === '454')) {
      try {
        await p.evaluate(() => { const sel = document.querySelector('[aria-label="한 페이지 인원"]'); if (sel) { const real = sel.tagName === 'SELECT' ? sel : sel.querySelector('select'); (real || sel).value = '0'; (real || sel).dispatchEvent(new Event('change', { bubbles: true })); } });
        await p.waitForTimeout(1500);
        const names = await p.evaluate(() => { const t = document.body.innerText; const m = t.match(/가상환자\d+/g) || []; return [...new Set(m)]; });
        const have = new Set(names.map(x => Number(x.replace('가상환자', ''))));
        const missing = []; for (let i = 1; i <= 455; i++) if (!have.has(i)) missing.push(i);
        results.push('  · 진단: 목록에 보이는 환자 ' + have.size + '명, 빠진 번호 ' + missing.slice(0, 10).join(','));
        // 서버(DST)에 저장된 명부와 브라우저에 저장된 명부의 인원도 확인 — 어디서 한 명이 빠졌는지 가름
        const sv = await (await fetch('http://localhost:' + DST + '/rest/v1/smartcare_kv?select=k,v&k=like.*patients.v1', { headers: { apikey: 'x', Authorization: 'Bearer dev-service-key' } })).json();
        results.push('  · 진단: 서버 명부 ' + sv.map(r => r.k.slice(-34) + '=' + (() => { try { return JSON.parse(r.v).length; } catch (e) { return 'x'; } })()).join(' · '));
        const loc = await p.evaluate(() => Object.keys(localStorage).filter(k => /patients\.v1$/.test(k)).map(k => { try { return k.slice(-30) + '=' + JSON.parse(localStorage.getItem(k)).length; } catch (e) { return k.slice(-30) + '=x'; } }));
        results.push('  · 진단: 브라우저 명부 ' + loc.join(' · '));
        const idx = sv.length ? (() => { try { const a = JSON.parse(sv[0].v); const i = a.findIndex(x => x.id === 'PT-B432'); return i; } catch (e) { return -2; } })() : -3;
        results.push('  · 진단: 서버 명부에서 PT-B432 위치 ' + idx);
        results.push('  · 진단: 화면 메모리 명부 ' + JSON.stringify(await p.evaluate(() => window.__scPatientStats && window.__scPatientStats())));
        // 필터별로 432번 환자가 보이는지: 어느 쪽 증빙(전자 동의·서면 파일)이 붙었는지 가름
        for (const f of ['동의 없음', '서면 파일 없음', '동의 항목 미완료', '전체']) {
          await p.locator('button:has-text("' + f + '")').first().click().catch(() => {}); await p.waitForTimeout(700);
          const has = await p.evaluate(() => /가상환자432(?!\d)/.test(document.body.innerText));
          results.push('  · 진단: 필터 [' + f + '] 에 432번 환자 ' + (has ? '있음' : '없음'));
        }
        const row432 = await p.evaluate(() => { const t = document.body.innerText; const i = t.search(/가상환자432(?!\d)/); return i < 0 ? '(안 보임)' : t.slice(i, i + 80).replace(/\s+/g, ' '); });
        results.push('  · 진단: 432번 행 ' + row432);
      } catch (e) { results.push('  · 진단 실패: ' + e.message); }
    }
    check('전자 동의·서면 동의서 반영 (동의 없음 444 · 서면 파일 없음 454)', none === '444' && nofile === '454', '동의 없음 ' + none + ' · 서면 파일 없음 ' + nofile);
    check('화면 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('시험 진행', false, e.message);
  } finally {
    await browser.close(); src.kill(); dst.kill();
  }
  console.log('스마트케어 저장 공간 부족 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
