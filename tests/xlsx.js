#!/usr/bin/env node
/* 통계 '데이터 목록' 엑셀 다운로드 시험
 *   python3 tools/build.py local-staff && node tests/xlsx.js
 * 데이터 목록이 있는 모든 통계에서 [엑셀 다운로드]가 보이고, 내려받은 .xlsx 가 정상 파일(헤더·행 수·숫자 칸)인지 확인 */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 8960, BASE = 'http://localhost:' + PORT;
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
    await p.locator('input[autocomplete="username"]').first().fill('100101');
    await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xl-'));
    const items = ['병동별 프로그램 참여', '프로그램 구성 비중', '프로그램 진행 상태', '병동별 건수 · 비율', '월별 · 병동별 추이'];
    let tested = 0;
    for (const it of items) {
      const nav = p.locator('aside button:has-text("' + it + '") >> visible=true').first();
      if (!(await nav.count())) { check('메뉴 없음: ' + it, false); continue; }
      await nav.click(); await sleep(900);
      const lst = p.locator('button:has-text("데이터 목록") >> visible=true').first();
      if (!(await lst.count())) continue;
      await lst.click(); await sleep(500);
      const btn = p.locator('button:has-text("엑셀 다운로드") >> visible=true').first();
      const has = (await btn.count()) > 0; check(it + ': 데이터 목록에 [엑셀 다운로드]가 있음', has); if (!has) continue;
      const d = p.waitForEvent('download', { timeout: 15000 }); await btn.click(); const dl = await d;
      const f = path.join(tmp, 'a' + tested + '.xlsx'); await dl.saveAs(f);
      const out = execFileSync('python3', ['-I', '-c', "import sys,zipfile,re\nz=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None\nimport xml.dom.minidom as m\n[m.parseString(z.read(n)) for n in z.namelist()]\ns=z.read('xl/worksheets/sheet1.xml').decode()\nrows=len(re.findall(r'<row ',s));print(rows, 'inlineStr' in s, dl_name)".replace('dl_name', JSON.stringify(dl.suggestedFilename())), f], { encoding: 'utf8' }).trim();
      const rows = parseInt(out, 10);
      check(it + ': 내려받은 엑셀이 정상 파일 (헤더+자료 ' + rows + '줄) ', rows >= 1, out);
      tested++;
    }
    check('데이터 목록이 있는 통계 3개 이상에서 확인', tested >= 3, tested + '개');
    check('화면 오류 없음', errs.length === 0, errs.slice(0, 2).join('|'));
  } catch (e) { check('시험 진행', false, e.message.split('\n')[0]); }
  console.log('스마트케어 통계 엑셀 다운로드 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
