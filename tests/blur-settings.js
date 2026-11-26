#!/usr/bin/env node
/* 설정 › 개인정보 표시 › 사진 얼굴 블러 기준 시험: 동의 기준·[블러 안 함] 허용 범위·기본 방식이 내보내기에 반영됨 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8993, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101'); await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    const today = await p.evaluate(() => { const d = new Date(), q = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); });
    await p.evaluate(([k]) => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d');
      for (let i = 0; i < 600; i += 4) for (let j = 0; j < 400; j += 4) { x.fillStyle = ((i + j) / 4) % 2 ? '#000' : '#fff'; x.fillRect(i, j, 4, 4); }
      const url = c.toDataURL('image/png');
      const row = (id, x0) => ({ id: id, name: id, sim: 95, src: { pid: 'p1', w: 600, h: 400, x: x0, y: 100, bw: 100, bh: 100 } });
      localStorage.setItem('smartcare.wsess.' + encodeURIComponent(k), JSON.stringify({ photos: [{ id: 'p1', url: url }], review: [row('PT-D001', 40), row('PT-D005', 240)], confirmed: false }));
    }, [today + '|음악치료']);
    await sleep(2000); await p.reload(); await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    await p.evaluate(() => { localStorage.removeItem('sc.jrnBlur.v1'); localStorage.removeItem('smartcare.blurCfg.v1'); });
    // 설정 › 개인정보 표시
    await p.locator('aside >> text=개인정보 표시').first().click(); await sleep(1000);
    check('개인정보 표시 탭에 [사진 얼굴 블러 기준] 카드가 있음', (await p.locator('[data-blur-cfg]').count()) === 1);
    const stats = async () => {
      const src = await p.locator('iframe[title="운영일지 미리보기"]').getAttribute('srcdoc');
      const m = /<img src="(data:image[^"]+)"/.exec(src || ''); if (!m) return null;
      return p.evaluate(async (u) => {
        const im = new Image(); await new Promise(r => { im.onload = r; im.src = u; });
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const k = im.width / 600;
        const sd = (x0) => { const d = x.getImageData(Math.round((x0 + 20) * k), Math.round(120 * k), Math.round(60 * k), Math.round(60 * k)).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i]; s += v; s2 += v * v; n++; } const m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m)); };
        return { a: sd(40), b: sd(240) };
      }, m[1]);
    };
    const openPreview = async () => { await p.locator('aside >> text=프로그램 운영일지').first().click(); await sleep(900); await p.locator('button:has-text("음악치료") >> visible=true').first().click(); await sleep(500); await p.locator('button:has-text("미리보기 · 내보내기") >> visible=true').first().click();
      for (let i = 0; i < 40; i++) { const t = await p.locator('[data-blur-bar] [role=status]').innerText().catch(() => ''); if (/명 중/.test(t)) break; await sleep(300); } await sleep(400); };
    await openPreview(); let r = await stats();
    check('기본(초상권만): 초상권 동의·안면 미동의(PT-D005) 환자도 선명', r && r.a > 100 && r.b > 100, JSON.stringify(r));
    await p.locator('button:has-text("닫기") >> visible=true').first().click(); await sleep(300);
    // 기준을 '초상권 + 안면인식 둘 다'로
    await p.locator('aside >> text=개인정보 표시').first().click(); await sleep(800);
    await p.locator('[data-blur-cfg] button:has-text("초상권 + 안면인식 동의 둘 다")').click(); await sleep(300);
    await openPreview(); r = await stats();
    check('기준을 둘 다로 바꾸면 PT-D005는 블러, 둘 다 동의한 PT-D001은 선명', r && r.a > 100 && r.b < 40, JSON.stringify(r));
    await p.locator('button:has-text("닫기") >> visible=true').first().click(); await sleep(300);
    // [블러 안 함] 허용 범위: 허용 안 함
    await p.locator('aside >> text=개인정보 표시').first().click(); await sleep(800);
    await p.locator('[data-blur-cfg] button:has-text("허용 안 함")').click(); await sleep(300);
    await openPreview();
    check('[블러 안 함] 허용 안 함 → 내보내기 화면에 그 선택이 없음', (await p.locator('[data-blur-bar] button:has-text("블러 안 함")').count()) === 0);
    await p.locator('button:has-text("닫기") >> visible=true').first().click(); await sleep(300);
    // 기본 방식: 모두 블러
    await p.locator('aside >> text=개인정보 표시').first().click(); await sleep(800);
    await p.locator('[data-blur-cfg] button:has-text("모두 블러")').click(); await sleep(300);
    await openPreview(); r = await stats();
    check('기본 방식을 [모두 블러]로 바꾸면 동의한 분도 블러', r && r.a < 40 && r.b < 40, JSON.stringify(r));
    const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem('smartcare.blurCfg.v1') || '{}'));
    check('설정이 저장됨(기관 설정 키)', cfg.mode === 'all' && cfg.basis === 'both' && cfg.allowOff === 'none', JSON.stringify(cfg));
    check('화면 오류 없음', errs.length === 0, errs.join(' | '));
  } catch (e) { check('시험 진행', false, e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log('스마트케어 블러 기준 설정 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
