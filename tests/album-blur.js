#!/usr/bin/env node
/* 앨범 내려받기 얼굴 블러 시험: 동의한 분만 선명 · 블러 안 함(사유·기록) · 화면 사진은 그대로 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 8990, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101'); await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    const today = await p.evaluate(() => { const d = new Date(), q = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); });
    await p.evaluate(([k]) => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d');
      for (let i = 0; i < 600; i += 4) for (let j = 0; j < 400; j += 4) { x.fillStyle = ((i + j) / 4) % 2 ? '#000' : '#fff'; x.fillRect(i, j, 4, 4); }
      const url = c.toDataURL('image/png');
      const row = (id, x0) => ({ id: id, name: id, sim: 95, src: { pid: 'p1', w: 600, h: 400, x: x0, y: 100, bw: 100, bh: 100 } });
      localStorage.setItem('smartcare.wsess.' + encodeURIComponent(k), JSON.stringify({ photos: [{ id: 'p1', url: url }], review: [row('PT-D001', 40), row('PT-D003', 240), row('', 440)], confirmed: false }));
    }, [today + '|음악치료']);
    await sleep(2000); await p.reload(); await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    await p.evaluate(() => { localStorage.removeItem('sc.jrnBlur.v1'); window.__exp = []; window.addEventListener('sc-export', e => window.__exp.push(e.detail)); });
    await p.locator('aside >> text=앨범 (아카이브)').first().click(); await sleep(2500);
    if (process.env.DBG) console.log((await p.evaluate(() => document.body.innerText)).slice(0, 700));
    check('앨범에 [내려받기 얼굴 블러] 선택줄이 있음', (await p.locator('[data-album-blur]').count()) >= 1);
    const stats = async (file) => {
      const b64 = fs.readFileSync(file).toString('base64');
      return p.evaluate(async (u) => {
        const im = new Image(); await new Promise(r => { im.onload = r; im.src = u; });
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const k = im.width / 600;
        const sd = (x0) => { const d = x.getImageData(Math.round((x0 + 20) * k), Math.round(120 * k), Math.round(60 * k), Math.round(60 * k)).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i]; s += v; s2 += v * v; n++; } const m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m)); };
        return { a: sd(40), b: sd(240), c: sd(440) };
      }, 'data:image/jpeg;base64,' + b64);
    };
    const down = async () => { const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 40000 }).catch(() => null), p.locator('button:has-text("그룹 받기") >> visible=true').first().click()]); if (!dl) return null; const f = path.join(os.tmpdir(), 'alb-' + Date.now() + '-' + dl.suggestedFilename()); await dl.saveAs(f); return { f, name: dl.suggestedFilename() }; };
    let d = await down();
    check('기본값: 내려받기가 됨', !!d);
    check('앨범 내려받기가 내보내기 감시(보안 경보)에 집계됨', (await p.evaluate(() => window.__exp)).some(x => /앨범 사진/.test(x)));
    let r = d && await stats(d.f);
    check('기본값: 동의한 환자 얼굴은 선명, 보류·미확인 얼굴은 블러', r && r.a > 100 && r.b < 40 && r.c < 40, JSON.stringify(r));
    // 앨범에서 얼굴 직접 지정: 누구인지 모르던 세 번째 얼굴을 동의한 환자(PT-D001)로 지정 → 내려받은 사진에서 선명
    check('앨범 화면에 [얼굴 지정] 단추가 있음', (await p.locator('[data-album-asg]').count()) >= 1);
    await p.locator('[data-album-asg]').first().click();
    await p.waitForSelector('[data-face-stage]', { timeout: 15000 }); await sleep(500);
    await p.locator('[data-face-stage] button[aria-label]').nth(2).click(); await sleep(300);
    await p.locator('[data-face-pick] input').fill('가상환자1'); await sleep(300);
    await p.locator('[data-face-pick] button:has-text("가상환자1")').first().click(); await sleep(1500);
    await p.locator('[aria-label="얼굴 직접 지정"] button:has-text("완료")').click(); await sleep(500);
    d = await down(); r = d && await stats(d.f);
    check('지정한 얼굴은 내려받은 사진에서 선명, 지정하지 않은 보류 환자 얼굴은 블러', r && r.c > 100 && r.b < 40, JSON.stringify(r));
    // 블러 안 함: 사유 전에는 내려받기 안 됨
    await p.locator('[data-album-blur] button:has-text("블러 안 함")').click(); await sleep(400);
    let none = await down();
    check('[블러 안 함]에서 사유를 고르기 전에는 내려받기가 막힘', none === null);
    await p.locator('[data-album-blur] button:has-text("내부 보관용")').click(); await sleep(300);
    d = await down(); r = d && await stats(d.f);
        check('사유를 고르면 원본 그대로 내려받음(모든 얼굴 선명)', r && r.a > 100 && r.b > 100 && r.c > 100, JSON.stringify(r));
    const log = await p.evaluate(() => JSON.parse(localStorage.getItem('smartcare.blurLog.v1') || '[]'));
    check('블러 없이 내려받으면 기록이 남음', log.length === 1 && log[0].reason === '내부 보관용', JSON.stringify(log));
    check('화면 오류 없음', errs.length === 0, errs.join(' | '));
  } catch (e) { check('시험 진행', false, e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log('스마트케어 앨범 얼굴 블러 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
