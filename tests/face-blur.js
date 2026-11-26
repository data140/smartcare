#!/usr/bin/env node
/* 얼굴 블러(운영일지 내보내기) 시험: 동의한 분만 선명 · 모두 블러 · 블러 안 함(사유·기록) · 원본 보존 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8989, BASE = 'http://localhost:' + PORT;
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
    // 바둑판 무늬 사진(블러되면 무늬가 사라져 구분됨) + 얼굴 위치 3곳: 동의(PT-D001) · 보류(PT-D003) · 미확인
    const orig = await p.evaluate(([k]) => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d');
      for (let i = 0; i < 600; i += 4) for (let j = 0; j < 400; j += 4) { x.fillStyle = ((i + j) / 4) % 2 ? '#000' : '#fff'; x.fillRect(i, j, 4, 4); }
      const url = c.toDataURL('image/png');
      const row = (id, x0) => ({ id: id, name: id, sim: 95, src: { pid: 'p1', w: 600, h: 400, x: x0, y: 100, bw: 100, bh: 100 } });
      localStorage.setItem('smartcare.wsess.' + encodeURIComponent(k), JSON.stringify({ photos: [{ id: 'p1', url: url }], review: [row('PT-D001', 40), row('PT-D003', 240), row('', 440)], confirmed: false }));
      return url;
    }, [today + '|음악치료']);
    await sleep(2000); await p.reload(); await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    await p.evaluate(() => localStorage.removeItem('sc.jrnBlur.v1'));
    await p.locator('aside button:has-text("운영일지") >> visible=true').first().click(); await sleep(1000);
    await p.locator('button:has-text("음악치료") >> visible=true').first().click(); await sleep(500);
    await p.locator('button:has-text("미리보기 · 내보내기") >> visible=true').first().click();
    const imgStats = async () => {
      const src = await p.locator('iframe[title="운영일지 미리보기"]').getAttribute('srcdoc');
      const m = /<img src="(data:image[^"]+)"/.exec(src || ''); if (!m) return null;
      return p.evaluate(async (u) => {
        const im = new Image(); await new Promise(r => { im.onload = r; im.src = u; });
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const k = im.width / 600;
        const sd = (x0) => { const d = x.getImageData(Math.round((x0 + 20) * k), Math.round(120 * k), Math.round(60 * k), Math.round(60 * k)).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i]; s += v; s2 += v * v; n++; } const m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m)); };
        return { a: sd(40), b: sd(240), c: sd(440), outside: (() => { const d = x.getImageData(Math.round(10 * k), Math.round(10 * k), Math.round(60 * k), Math.round(60 * k)).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i]; s += v; s2 += v * v; n++; } const m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m)); })() };
      }, m[1]);
    };
    const waitReady = async () => { for (let i = 0; i < 40; i++) { const t = await p.locator('[data-blur-bar] [role=status]').innerText(); if (/명 중/.test(t) || /실패/.test(t) || /사유/.test(t)) return t; await sleep(300); } return ''; };
    let st = await waitReady(); await sleep(400);
    let r = await imgStats();
    check('기본값은 [동의한 분만 선명] — 상태 문구에 얼굴 3명 중 2명 블러', /얼굴 3명 중 2명 블러/.test(st) && /1명 선명/.test(st), st);
    check('초상권 동의한 환자(PT-D001) 얼굴은 선명(무늬 그대로)', r && r.a > 100, JSON.stringify(r));
    check('동의 보류 환자(PT-D003) 얼굴은 블러(무늬 사라짐)', r && r.b < 40, JSON.stringify(r));
    check('누구인지 모르는 얼굴(미확인)도 블러', r && r.c < 40);
    check('얼굴이 아닌 곳은 그대로', r && r.outside > 100);
    // 모두 블러
    await p.locator('[data-blur-bar] button:has-text("모두 블러")').click(); st = await waitReady(); await sleep(500); r = await imgStats();
    check('[모두 블러]: 동의한 환자 얼굴도 블러', r && r.a < 40 && r.b < 40 && r.c < 40, JSON.stringify(r));
    // 블러 안 함: 사유 전에는 내보내기 잠김
    await p.locator('[data-blur-bar] button:has-text("블러 안 함")').click(); await sleep(500);
    check('[블러 안 함]: 사유를 고르기 전에는 내보내기 단추가 잠김', await p.locator('button:has-text("인쇄 · PDF 저장")').isDisabled());
    await p.locator('[data-blur-bar] button:has-text("본인·보호자에게 제공")').click(); await sleep(500);
    check('사유를 고르면 내보내기 가능', !(await p.locator('button:has-text("인쇄 · PDF 저장")').isDisabled()));
    r = await imgStats(); check('[블러 안 함]: 원본 그대로(모든 얼굴 선명)', r && r.a > 100 && r.b > 100 && r.c > 100, JSON.stringify(r));
    await p.locator('[role=dialog] button:has-text("Word")').click(); await sleep(300);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }).catch(() => null), p.locator('button:has-text("Word 파일 다운로드")').click()]);
    await sleep(800);
    const log = await p.evaluate(() => JSON.parse(localStorage.getItem('smartcare.blurLog.v1') || '[]'));
    check('블러 없이 내보내면 기록(누가·사유)이 남음', log.length === 1 && log[0].reason === '본인·보호자에게 제공' && !!log[0].by, JSON.stringify(log));
    // 원본 보존
    const keep = await p.evaluate((o) => Object.keys(localStorage).filter(k => k.indexOf('smartcare.wsess.') === 0).some(k => { try { return JSON.parse(localStorage.getItem(k)).photos[0].url === o; } catch (e) { return false; } }), orig);
    check('원본 사진은 블러 후에도 그대로 보관됨', keep);
    check('화면 오류 없음', errs.length === 0, errs.join(' | '));
  } catch (e) { check('시험 진행', false, e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log('스마트케어 얼굴 블러 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
