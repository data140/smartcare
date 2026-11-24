#!/usr/bin/env node
/* 글자 대비 점검 도구 (개발용)
 *   python3 tools/build.py local-staff && node tools/contrast-audit.js [light|dark] [phone]
 * 각 화면에서 보이는 글자의 색과 바탕색 대비를 재서, 기준(일반 글자 4.5:1 · 큰 글자 3:1)에 못 미치는 곳을 모아 보여줍니다. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const THEME = process.argv[2] === 'dark' ? 'dark' : 'light', PHONE = process.argv.includes('phone');
const PORT = 8920;
const PAGES = ['환자 등록 관리', '서면 동의서 관리', '캘린더', '일지 목록 · 검수', '출석부', '앨범', '전체 보기', '운영 지표', '병동별 프로그램 참여', '월별 · 병동별 추이', '프로그램 구성 비중', '프로그램 진행 상태', '병동별 건수 · 비율', 'AI 판독 파라미터', '동의서식 관리', '프로그램 관리', '병동 · 호실', '계정 · 권한', '데이터 서버'];
(async () => {
  const srv = spawn('node', [path.join(__dirname, 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(ok => srv.stdout.once('data', ok));
  const browser = await chromium.launch();
  const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: 1466, height: 1000 } });
  const p = await ctx.newPage();
  await p.addInitScript((t) => { try { localStorage.setItem('sc.theme', JSON.stringify({ theme: t, accent: '#9184d9' })); } catch (e) {} }, THEME);
  await p.goto('http://localhost:' + PORT + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
  await p.locator('input[autocomplete="username"]').first().fill(PHONE ? '100101' : 'admin');
  if (!PHONE) await p.locator('button:has-text("시스템 관리자")').first().click().catch(() => {});
  await p.locator('input[autocomplete="username"]').first().fill(PHONE ? '100101' : 'admin'); await p.locator('input[autocomplete="current-password"]').first().fill(PHONE ? '1234' : 'demo1234');
  await p.locator('button:has-text("로그인")').last().click(); await p.waitForTimeout(3500);
  const audit = () => p.evaluate(() => {
    // oklch · color-mix 같은 모든 CSS 색을 캔버스로 rgb 로 바꿔 읽음
    const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
    const cache = {};
    const parse = (c) => {
      if (!c || c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
      if (cache[c]) return cache[c];
      let res = null;
      const m = c.match(/^rgba?\(([^)]+)\)$/);
      if (m) { const v = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); res = { r: v[0], g: v[1], b: v[2], a: v[3] == null ? 1 : v[3] }; }
      else { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; res = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; }
      cache[c] = res; return res;
    };
    const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const bgOf = (el) => { let stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base); return base; };
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const n = walker.currentNode; const t = (n.nodeValue || '').trim(); if (!t) continue;
      const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.3) continue;
      let hid = false; for (let e = el; e; e = e.parentElement) { if (getComputedStyle(e).display === 'none') { hid = true; break; } } if (hid) continue;
      const fg0 = parse(cs.color); if (!fg0) continue; const bg = bgOf(el); const fg = over(fg0, bg);
      const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700, large = size >= 24 || (size >= 18.66 && bold);
      const cr = ratio(fg, bg); const need = large ? 3 : 4.5;
      if (cr < need) out.push({ cr: Math.round(cr * 100) / 100, need, text: t.slice(0, 24), fg: cs.color, bg: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')', size: size, st: (el.getAttribute('style') || '').slice(0, 110), pst: ((el.parentElement && el.parentElement.getAttribute('style')) || '').slice(0, 140) });
    }
    return out;
  });
  const all = [];
  const visit = async (label) => { const r = await audit(); r.forEach(x => all.push(Object.assign({ page: label }, x))); };
  await visit('(시작 화면)');
  if (PHONE) { for (const t of ['일지', '검수', '동의서', '내 설정']) { await p.locator('button:has-text("' + t + '")').last().tap().catch(() => {}); await p.waitForTimeout(700); await visit(t); } }
  else for (const name of PAGES) {
    const loc = p.locator('nav >> text=' + name).first();
    const el = (await loc.count()) ? loc : p.locator('text=' + name).first();
    await el.click({ timeout: 4000 }).catch(() => {}); await p.waitForTimeout(900); await visit(name);
  }
  // 요약: 같은 (글자색, 바탕색) 조합끼리 묶기
  const groups = {};
  all.forEach(x => { const k = x.fg + ' on ' + x.bg; (groups[k] = groups[k] || { n: 0, cr: x.cr, need: x.need, ex: [], pages: new Set(), st: x.st, pst: x.pst }); const g = groups[k]; g.n++; g.cr = Math.min(g.cr, x.cr); if (g.ex.length < 3) g.ex.push(x.text); g.pages.add(x.page); });
  const rows = Object.entries(groups).sort((a, b) => b[1].n - a[1].n);
  console.log('[' + THEME + (PHONE ? ' · 휴대폰' : '') + '] 대비 부족 글자 ' + all.length + '곳 · 색 조합 ' + rows.length + '종');
  rows.slice(0, 40).forEach(([k, g]) => { console.log(String(g.n).padStart(4) + '곳  ' + g.cr + ':1 (기준 ' + g.need + ')  ' + k + '  예) ' + g.ex.join(' / ') + '  [' + [...g.pages].slice(0, 3).join(', ') + ']'); if (process.argv.includes('--detail')) console.log('      style: ' + g.st + '\n      parent: ' + g.pst); });
  await browser.close(); srv.kill();
  process.exit(process.argv.includes('--strict') && all.length ? 1 : 0);
})();
