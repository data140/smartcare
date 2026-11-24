#!/usr/bin/env node
/* 운영 데이터 초기화 시험 (시스템 관리자 전용)
 *   python3 tools/build.py local-staff && node tests/reset.js
 * 일정·일지·동의서·사진을 서버에서 지우고, 환자 명부는 남기며 동의 상태만 '확인전'으로 되돌리는지 확인 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 8962, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    // 일반(기관 관리자) 계정에는 이 메뉴가 보이지 않음
    const c0 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const a = await c0.newPage(); await a.goto(BASE + '/'); await a.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await a.locator('input[autocomplete="username"]').first().fill('100101'); await a.locator('input[autocomplete="current-password"]').first().fill('1234');
    await a.locator('button:has-text("로그인")').last().click(); await a.waitForSelector('text=가상환자1', { timeout: 20000 });
    await a.locator('aside button:has-text("계정 · 권한") >> visible=true').first().click(); await sleep(700);
    check('기관 관리자에게는 "운영 데이터 초기화" 탭이 없음', (await a.locator('button:has-text("운영 데이터 초기화") >> visible=true').count()) === 0);
    await c0.close();

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.click('button:has-text("시스템 관리자")');
    await p.locator('input[autocomplete="username"]').first().fill('admin'); await p.locator('input[autocomplete="current-password"]').first().fill('demo1234');
    await p.locator('button:has-text("로그인")').last().click(); await sleep(4500);
    if (!(await p.locator('text=계정 · 권한 >> visible=true').count())) { await p.getByText('설정', { exact: true }).first().click().catch(() => {}); await sleep(600); }
    // 다른 기기(오래된 사본을 가진 휴대폰 역할): 같은 계정으로 로그인해 두고, 초기화 뒤 새로고침했을 때 옛 데이터가 지워지는지 확인
    const c2 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const q = await c2.newPage(); await q.goto(BASE + '/'); await q.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await q.locator('input[autocomplete="username"]').first().fill('100101'); await q.locator('input[autocomplete="current-password"]').first().fill('1234');
    await q.locator('button:has-text("로그인")').last().click(); await q.waitForSelector('text=가상환자1', { timeout: 20000 });
    // 시험용 운영 데이터를 서버에 올려 둠 (일정·운영일지·동의서)
    await p.evaluate(() => {
      localStorage.setItem('smartcare.journals.v1', JSON.stringify({ '2026-01-01|시험': { f: { content: '시험' } } }));
      localStorage.setItem('smartcare.wsess.' + encodeURIComponent('2026-01-01|시험'), JSON.stringify({ review: [], photos: [] }));
      localStorage.setItem('smartcare.cfiles.v1', JSON.stringify({ files: { 'PT-D001': [{ name: 'a.pdf' }] } }));
    });
    await sleep(2500);
    await p.locator('text=계정 · 권한 >> visible=true').first().click(); await sleep(700);
    await p.locator('button:has-text("운영 데이터 초기화") >> visible=true').first().click(); await sleep(500);
    check('시스템 관리자에게 "운영 데이터 초기화" 탭이 보임', (await p.locator('text=되돌릴 수 없습니다 >> visible=true').count()) >= 1);
    check('처음에는 실행 단추가 잠겨 있음', await p.locator('button:has-text("운영 데이터 초기화 실행")').isDisabled());
    await p.locator('button:has-text("삭제될 항목 확인")').click(); await sleep(1500);
    const cnt = await p.evaluate(() => [...document.querySelectorAll('button[aria-pressed] span')].map(x => x.innerText).filter(t => /^\d+건$/.test(t)));
    check('삭제될 항목 개수가 보임 (일정·일지, 동의서 파일 1건 이상)', cnt.length >= 2 && cnt.some(t => parseInt(t) >= 1), cnt.join(','));
    await p.locator('input[aria-label="확인 문구"]').fill('운영 데이터 초기화'); await sleep(200);
    check('백업 전에는 확인 문구를 써도 실행 단추가 잠겨 있음', await p.locator('button:has-text("운영 데이터 초기화 실행")').isDisabled());
    const dl = p.waitForEvent('download', { timeout: 15000 });
    await p.locator('button:has-text("백업 파일 내려받기")').click(); const d = await dl;
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rs-')), 'b.json'); await d.saveAs(f);
    const bj = JSON.parse(fs.readFileSync(f, 'utf8'));
    check('백업 파일에 일정·운영일지·환자 명부가 들어 있음', Array.isArray(bj.rows) && bj.rows.some(r => /patients\.v1$/.test(r.k)) && bj.rows.some(r => /journals\.v1$/.test(r.k)), bj.rows.map(r => r.k.split(':')[1]).join(','));
    await sleep(300);
    check('백업 후 확인 문구가 맞으면 실행할 수 있음', !(await p.locator('button:has-text("운영 데이터 초기화 실행")').isDisabled()));
    await p.locator('button:has-text("운영 데이터 초기화 실행")').click();
    await p.waitForSelector('text=초기화가 끝났습니다', { timeout: 15000 }).then(() => check('초기화가 끝났다는 안내', true), () => check('초기화가 끝났다는 안내', false));
    // 오래된 사본을 가진 다른 기기에 옛 데이터를 넣어 두었다가, 새로고침하면 지워지는지
    await q.evaluate(() => { localStorage.setItem('smartcare.plans.v1', JSON.stringify([{ id: 'old1', date: '2026-01-01', start: '10:00', end: '11:00', program: '옛일정', place: 'x', ward: '전체', staff: [], status: '예정', capacity: 5 }])); localStorage.setItem('smartcare.journals.v1', JSON.stringify({ 'k|옛': { f: { content: '옛' } } })); });
    await q.reload(); await sleep(6000);
    const stale = await q.evaluate(() => ({ j: localStorage.getItem('smartcare.journals.v1'), p: localStorage.getItem('smartcare.plans.v1') || '' }));
    check('초기화 뒤 다른 기기를 새로고침하면 옛 일정·운영일지 사본이 지워짐', !stale.j && !/옛일정/.test(stale.p), JSON.stringify(stale).slice(0, 80));
    await sleep(4500);   // 자동 새로고침
    await p.waitForSelector('input[autocomplete="username"]', { timeout: 30000 });
    // 서버 상태 확인: 다시 로그인해 같은 탭에서 개수를 세어 봄
    await p.click('button:has-text("시스템 관리자")');
    await p.locator('input[autocomplete="username"]').first().fill('admin'); await p.locator('input[autocomplete="current-password"]').first().fill('demo1234');
    await p.locator('button:has-text("로그인")').last().click(); await sleep(4500);
    if (!(await p.locator('text=계정 · 권한 >> visible=true').count())) { await p.getByText('설정', { exact: true }).first().click().catch(() => {}); await sleep(600); }
    await p.locator('text=계정 · 권한 >> visible=true').first().click(); await sleep(700);
    await p.locator('button:has-text("운영 데이터 초기화") >> visible=true').first().click(); await sleep(500);
    await p.locator('button:has-text("삭제될 항목 확인")').click(); await sleep(1500);
    const cnt2 = await p.evaluate(() => [...document.querySelectorAll('button[aria-pressed] span')].map(x => x.innerText).filter(t => /^\d+건$/.test(t)));
    check('초기화 뒤에는 삭제할 항목이 모두 0건', cnt2.length >= 2 && cnt2.every(t => parseInt(t) === 0), cnt2.join(','));
    const pv = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('smartcare.patients.v1') || '[]'); } catch (e) { return []; } });
    check("환자의 동의 상태가 모두 '확인전'으로 돌아가고 이름은 유지", pv.length > 0 && pv.every(x => x.consent === '확인전' && x.face === '확인전' && x.name), pv.length + '명 · ' + [...new Set(pv.map(x => x.consent))].join('/'));
    check('환자 명부는 그대로 유지', /유지되는 환자 명부: [1-9]\d*명/.test(await p.evaluate(() => document.body.innerText)));
    // 환자 명부까지 지우는 선택: 따로 켜야 하고, 다른 확인 문구가 필요
    await p.locator('button:has-text("환자 명부 전체 삭제")').click(); await sleep(300);
    await p.locator('button:has-text("삭제될 항목 확인")').click(); await sleep(1200);
    check('환자 명부 삭제를 켜면 확인 문구가 "환자 포함 운영 데이터 초기화"로 바뀜', (await p.locator('input[aria-label="확인 문구"]').getAttribute('placeholder')) === '환자 포함 운영 데이터 초기화');
    const dl2 = p.waitForEvent('download', { timeout: 15000 }); await p.locator('button:has-text("백업 파일 내려받기")').click(); await dl2;
    await p.locator('input[aria-label="확인 문구"]').fill('운영 데이터 초기화'); await sleep(200);
    check('일반 문구로는 환자 포함 초기화를 실행할 수 없음', await p.locator('button:has-text("운영 데이터 초기화 실행")').isDisabled());
    await p.locator('input[aria-label="확인 문구"]').fill('환자 포함 운영 데이터 초기화'); await sleep(200);
    await p.locator('button:has-text("운영 데이터 초기화 실행")').click();
    await p.waitForSelector('text=초기화가 끝났습니다', { timeout: 15000 }).then(() => check('환자 포함 초기화가 끝남', true), () => check('환자 포함 초기화가 끝남', false));
    await sleep(4500); await p.waitForSelector('input[autocomplete="username"]', { timeout: 30000 });
    await p.click('button:has-text("시스템 관리자")');
    await p.locator('input[autocomplete="username"]').first().fill('admin'); await p.locator('input[autocomplete="current-password"]').first().fill('demo1234');
    await p.locator('button:has-text("로그인")').last().click(); await sleep(4500);
    const pv2 = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('smartcare.patients.v1') || '[]'); } catch (e) { return ['x']; } });
    check('환자 명부가 비어 있음(0명)', Array.isArray(pv2) && pv2.length === 0, pv2.length + '명');
    check('화면 오류 없음', errs.length === 0, errs.slice(0, 2).join('|'));
  } catch (e) { check('시험 진행', false, e.message.split('\n')[0]); }
  console.log('스마트케어 운영 데이터 초기화 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
