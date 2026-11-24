#!/usr/bin/env node
/* 앱 설치(PWA) 구성 점검: 운영·새 서버 화면에 앱 정보(manifest)·아이콘·서비스 워커가 연결되어 있는지 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const png = (f) => { const b = fs.readFileSync(f); return b.slice(1, 4).toString() === 'PNG' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null; };
for (const [label, dir, pre] of [['운영(index.html)', '.', ''], ['새 서버(next)', 'next', '../']]) {
  const d = path.join(ROOT, dir);
  const html = fs.readFileSync(path.join(d, 'index.html'), 'utf8');
  check(label + ': 화면에 앱 정보·테마색·애플 아이콘이 연결됨', html.indexOf('manifest.webmanifest') > 0 && html.indexOf('theme-color') > 0 && html.indexOf('apple-touch-icon') > 0);
  const mf = JSON.parse(fs.readFileSync(path.join(d, 'manifest.webmanifest'), 'utf8'));
  check(label + ': 앱 정보가 standalone(주소창 없음)·시작 주소·이름 지정', mf.display === 'standalone' && mf.start_url === './' && !!mf.name && !!mf.short_name);
  const icons = mf.icons.map(i => ({ i, p: png(path.join(d, i.src)) }));
  check(label + ': 192·512 아이콘과 maskable 아이콘이 실제 파일로 있음', icons.every(x => x.p && ('' + x.p.w + 'x' + x.p.h) === x.i.sizes) && icons.some(x => x.i.purpose === 'maskable') && icons.some(x => x.i.sizes === '192x192'), icons.map(x => x.i.sizes).join(','));
  check(label + ': 서비스 워커 파일이 있고 화면이 등록함', fs.existsSync(path.join(d, 'sw.js')) && /serviceWorker.*register\("sw.js"\)/.test(html));
}
check('서비스 워커는 환자 정보를 캐시하지 않음(저장 호출 없음)', !/caches\.(open|put)/.test(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')));
(async () => {
  // 실제로 화면을 열었을 때 앱 정보(manifest)가 살아 있는지 (화면이 머리말을 다시 쓰기 때문에 열린 뒤 확인해야 함)
  const http = require('http'); const { chromium } = require('playwright');
  const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': /\.html$/.test(f) ? 'text/html; charset=utf-8' : /\.webmanifest$/.test(f) ? 'application/manifest+json' : /\.js$/.test(f) ? 'text/javascript' : 'image/png' }); r.end(d); } }); }).listen(8972);
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.route('**/supabase.co/**', r => r.abort()); await pg.route('**/cdn.jsdelivr.net/**', r => r.abort());
  await pg.goto('http://localhost:8972/index.html'); await pg.waitForTimeout(3500);
  const live = await pg.evaluate(() => ({ m: (document.querySelector('link[rel=manifest]') || {}).href || '', t: !!document.querySelector('meta[name=theme-color]'), a: !!document.querySelector('link[rel=apple-touch-icon]') }));
  check('화면이 열린 뒤에도 앱 정보 연결이 남아 있음 (설치 가능 조건)', /manifest\.webmanifest$/.test(live.m) && live.t && live.a, JSON.stringify(live));
  await b.close(); srv.close();
  console.log('스마트케어 앱 설치(PWA) 점검\n' + results.join('\n')); process.exit(failed ? 1 : 0);
})();
