#!/usr/bin/env node
/* 개인정보 보호 보기 시험: 켜면 사진이 흐려지고, 누르고 있는 동안만 선명 · 끄면 원래대로 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8992, BASE = 'http://localhost:' + PORT;
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
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    const today = await p.evaluate(() => { const d = new Date(), q = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); });
    await p.evaluate(([k]) => { const c = document.createElement('canvas'); c.width = 300; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 300, 200); localStorage.setItem('smartcare.wsess.' + encodeURIComponent(k), JSON.stringify({ photos: [{ id: 'p1', url: c.toDataURL('image/png') }], review: [], confirmed: false })); }, [today + '|음악치료']);
    await sleep(2000); await p.reload(); await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    check('PC 상단에 [개인정보 보호 보기] 단추가 있음', (await p.locator('button:has-text("개인정보 보호 보기") >> visible=true').count()) >= 1);
    await p.locator('aside >> text=앨범 (아카이브)').first().click(); await sleep(2000);
    const filt = () => p.evaluate(() => { const im = [...document.querySelectorAll('img')].filter(i => i.offsetParent && /^data:image/.test(i.src))[0]; return im ? getComputedStyle(im).filter : null; });
    check('처음에는 사진이 그대로(흐림 없음)', (await filt()) === 'none', await filt());
    await p.locator('button:has-text("개인정보 보호 보기") >> visible=true').first().click(); await sleep(500);
    check('켜면 앨범 사진이 흐려짐', /blur/.test((await filt()) || ''), await filt());
    check('단추가 [보호 보기 켜짐]으로 바뀜', (await p.locator('button:has-text("보호 보기 켜짐") >> visible=true').count()) >= 1);
    const box = await p.evaluate(() => { const im = [...document.querySelectorAll('img')].filter(i => i.offsetParent && /^data:image/.test(i.src))[0]; const r = im.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.mouse.move(box.x, box.y); await p.mouse.down(); await sleep(300);
    check('누르고 있는 동안은 선명', (await filt()) === 'none', await filt());
    await p.mouse.up(); await sleep(300);
    check('손을 떼면 다시 흐려짐', /blur/.test((await filt()) || ''), await filt());
    await p.locator('button:has-text("보호 보기 켜짐") >> visible=true').first().click(); await sleep(400);
    check('끄면 원래대로', (await filt()) === 'none');
    check('화면 오류 없음', errs.length === 0, errs.join(' | '));
  } catch (e) { check('시험 진행', false, e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log('스마트케어 개인정보 보호 보기 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
