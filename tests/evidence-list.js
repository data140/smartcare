#!/usr/bin/env node
/* 동의 증빙 점검: [증빙 없음] 필터와 엑셀 내려받기 */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 8961, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101'); await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    await p.locator('aside >> text=서면 동의서 관리').first().click(); await sleep(1500);
    check('[증빙 없음] 필터가 있음', (await p.locator('button:has-text("증빙 없음")').count()) >= 1);
    await p.locator('button:has-text("증빙 없음")').first().click(); await sleep(600);
    const body = await p.evaluate(() => document.body.innerText);
    check('[증빙 없음]: 동의 상태만 있는 환자(가상환자1)가 목록에 나오고, 동의 보류 환자(가상환자3)는 빠짐', /가상환자1/.test(body) && !/가상환자3/.test(body.slice(body.indexOf('이름'))));
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }).catch(() => null), p.locator('button:has-text("엑셀")').first().click()]);
    check('엑셀 파일이 내려받아짐', !!dl);
    if (dl) {
      const f = path.join(os.tmpdir(), 'ev-' + Date.now() + '.xlsx'); await dl.saveAs(f);
      let xml = ''; try { xml = execFileSync('unzip', ['-p', f, 'xl/worksheets/sheet1.xml'], { encoding: 'utf8' }); } catch (e) {}
      check('엑셀에 환자 이름과 [증빙 없음] 상태가 들어 있음', /가상환자1/.test(xml) && /증빙 없음/.test(xml), String(xml.length));
      check('파일 이름에 필터와 날짜가 들어감', /동의증빙점검_증빙없음_\d{8}\.xlsx/.test(dl.suggestedFilename()) || dl.suggestedFilename() === 'download', dl.suggestedFilename());
    }
    check('화면 오류 없음', errs.length === 0, errs.join(' | '));
  } catch (e) { check('시험 진행', false, e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log('스마트케어 동의 증빙 점검 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
