#!/usr/bin/env node
/* 프로그램 운영일지 시험
 *   python3 tools/build.py local-staff && node tests/journal.js
 * 일정으로 자동 작성 → 수정 저장 → 미리보기 → Word/한글 파일(사진 포함)이 정상 파일인지, 휴대폰에서는 음성 입력 단추가 보이는지 확인 */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const PORT = 8949, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  const login = async (ctx, wait) => {
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101');
    await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click();
    await p.waitForSelector(wait || 'text=가상환자1', { timeout: 20000 }); return p;
  };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const p = await login(ctx);
    const today = await p.evaluate(() => { const d = new Date(), q = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + q(d.getMonth() + 1) + '-' + q(d.getDate()); });
    // 오늘 일정(음악치료)에 사진 1장을 달아 둠 (서버 동기화가 덮어쓰지 않도록 잠시 기다린 뒤 새로고침)
    await p.evaluate(([k, u]) => localStorage.setItem('smartcare.wsess.' + encodeURIComponent(k), JSON.stringify({ photos: [{ id: 'p1', url: u }], review: [], confirmed: false })), [today + '|음악치료', PNG]);
    await sleep(2000); await p.reload(); await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    await p.locator('aside button:has-text("운영일지") >> visible=true').first().click(); await sleep(1000);
    const body = await p.evaluate(() => document.body.innerText);
    check('프로그램 하위 메뉴에 "운영일지"가 있고 일정 목록이 보임', /작성 전/.test(body) && /음악치료/.test(body));
    check('일정으로 자동 작성된 초안(내용·특이사항·차기계획)이 채워짐', await p.evaluate(() => [...document.querySelectorAll('textarea')].filter(t => t.offsetParent).every(t => t.value.length > 10)));
    await p.locator('button:has-text("음악치료") >> visible=true').first().click(); await sleep(500);
    check('사진이 앨범에서 자동으로 들어감', (await p.locator('img[alt="프로그램 사진"]').count()) >= 1);
    check('PC에서는 음성 입력 단추가 없음(타이핑)', (await p.locator('button:has-text("음성 입력") >> visible=true').count()) === 0);
    await p.locator('textarea').first().fill('시험 내용 직접 수정'); await sleep(900);
    await p.reload(); await p.waitForSelector('aside button:has-text("운영일지")', { timeout: 20000 }); await sleep(800);
    if (!(await p.locator('button:has-text("음악치료") >> visible=true').count())) await p.locator('aside button:has-text("운영일지") >> visible=true').first().click();
    await sleep(500);
    await p.locator('button:has-text("음악치료") >> visible=true').first().click(); await sleep(500);
    check('고친 내용은 새로고침 후에도 유지', (await p.locator('textarea').first().inputValue()) === '시험 내용 직접 수정');
    // 상태 탭(작성 전·중·완료)과 하단 글자·로고 선택
    check('상태 탭(전체·작성 전·작성 중·완료)이 있음', (await p.locator('[role=tab]:has-text("작성 전") >> visible=true').count()) >= 1 && (await p.locator('[role=tab]:has-text("완료") >> visible=true').count()) >= 1);
    await p.locator('button:has-text("완료 처리") >> visible=true').first().click(); await sleep(500);
    const doneN = await p.locator('[role=tab]:has-text("완료") b >> visible=true').first().innerText();
    check('완료 처리하면 완료 탭 개수가 늘어남', Number(doneN) >= 1, doneN);
    await p.locator('[role=tab]:has-text("완료") >> visible=true').first().click(); await sleep(400);
    check('완료 탭에는 완료한 일지만 보임', (await p.locator('button[aria-pressed]:has-text("완료") >> visible=true').count()) >= 1);
    await p.locator('[role=tab]:has-text("전체") >> visible=true').first().click(); await sleep(300);
    await p.locator('button:has-text("글자만") >> visible=true').first().click(); await sleep(300);
    await p.locator('input[aria-label="문서 하단 글자 (직접 작성)"]').first().fill('직접 쓴 하단 글자'); await p.locator('input[aria-label="문서 하단 글자 (직접 작성)"]').first().blur(); await sleep(400);
    // 사진 추가·빼기, 결재라인 위치
    const png = path.join(os.tmpdir(), 'jrn-up.png'); fs.writeFileSync(png, Buffer.from(PNG.split(',')[1], 'base64'));
    const before = await p.locator('img[alt="프로그램 사진"]').count();
    await p.locator('label:has-text("사진 추가") input').first().setInputFiles(png); await sleep(900);
    check('사진 추가 (최대 4장 안에서)', (await p.locator('img[alt="프로그램 사진"]').count()) === before + 1);
    await p.locator('button[aria-label="사진 빼기"]').first().click(); await sleep(400);
    check('사진 빼기', (await p.locator('img[alt="프로그램 사진"]').count()) === before);
    check('결재라인 위치(상단/하단/표시 안 함) 선택 단추가 있음', (await p.locator('button:has-text("상단") >> visible=true').count()) >= 1 && (await p.locator('button:has-text("표시 안 함") >> visible=true').count()) >= 1);
    await p.locator('button:has-text("상단") >> visible=true').first().click(); await sleep(400);
    await p.locator('button:has-text("미리보기 · 내보내기") >> visible=true').first().click(); await sleep(700);
    const doc2 = await p.locator('iframe[title="운영일지 미리보기"]').getAttribute('srcdoc');
    check('결재라인이 문서 상단에 들어감 (제목 바로 아래, 표보다 앞)', doc2.indexOf('class="ap"') > 0 && doc2.indexOf('class="ap"') < doc2.indexOf('프로그램명'));
    check('하단에 직접 쓴 글자가 들어가고 로고는 빠짐(글자만)', /직접 쓴 하단 글자/.test(doc2));
    check('사진이 잘리지 않음(object-fit: contain)', /object-fit:contain/.test(doc2) && !/object-fit:cover/.test(doc2));
    await p.locator('button:has-text("닫기") >> visible=true').first().click(); await sleep(300);
    await p.locator('button:has-text("미리보기 · 내보내기") >> visible=true').first().click(); await sleep(700);
    const frame = p.frames().find(f => f !== p.mainFrame() && /프로그램 운영일지|프 로 그 램/.test(f.url() + '')) || p.frames()[1];
    const doc = await p.locator('iframe[title="운영일지 미리보기"]').getAttribute('srcdoc');
    check('미리보기 문서에 표 항목과 수정 내용·사진이 들어감', /프로그램명/.test(doc) && /진 행 현 황/.test(doc) && /시험 내용 직접 수정/.test(doc) && /<img src="data:image\//.test(doc));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jrn-'));
    let early = false, lastEarly = false; p.once('download', () => { early = true; });
    const save = async (label, goLabel, name) => { early = false; await p.locator('button:has-text("' + label + '") >> visible=true').first().click(); await sleep(500); lastEarly = early; if (early) throw new Error('미리보기 없이 바로 내려받음'); const d = p.waitForEvent('download', { timeout: 15000 }); await p.locator('button:has-text("' + goLabel + '") >> visible=true').first().click(); const dl = await d; const f = path.join(tmp, name); await dl.saveAs(f); return f; };
    const docx = await save('Word', 'Word 파일 다운로드', 'a.docx'); check('Word 단추를 누르면 먼저 미리보기(다운로드는 다음 단추)', !lastEarly); const hwpx = await save('한글(hwpx)', '한글 파일 다운로드', 'a.hwpx');
    const py = (code, f) => execFileSync('python3', ['-I', '-c', code, f], { encoding: 'utf8' }).trim();
    check('Word 파일이 정상 문서이고 사진(그림)이 들어 있음', py("import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None\nprint(any(n.startswith('word/media/') for n in z.namelist()) and b'\\xed\\x94\\x84' in z.read('word/document.xml'))", docx) === 'True');
    check('한글(.hwpx) 파일이 올바른 구조(mimetype 첫 항목, XML 정상)', py("import sys,zipfile,xml.dom.minidom as m\nz=zipfile.ZipFile(sys.argv[1]);n=z.namelist();assert n[0]=='mimetype' and z.read('mimetype')==b'application/hwp+zip'\n[m.parseString(z.read(x)) for x in n if x.endswith(('.xml','.hpf'))]\nprint('ok')", hwpx) === 'ok');
    check('화면 오류 없음(PC)', p.errs.length === 0, p.errs.slice(0, 2).join('|'));

    // 휴대폰: 음성 입력 단추
    const cm = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
    await cm.addInitScript(() => {
      // 시험용 가짜 음성 인식: 마이크 연결 → 소리 감지 → 중간 결과 → 최종 결과 순서로 알려 줌
      const Mock = class { constructor() { this.s = 0; }
        start() { const me = this; window.__sr = me; setTimeout(() => me.onaudiostart && me.onaudiostart(), 50); setTimeout(() => me.onsoundstart && me.onsoundstart(), 150);
          setTimeout(() => me.onresult && me.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: '시험 중간 문장' }], { isFinal: false })] }), 300);
          setTimeout(() => me.onresult && me.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: '음성으로 입력한 문장' }], { isFinal: true })] }), 700);
          setTimeout(() => { if (!me.stopped) me.onend && me.onend(); }, 900); }
        stop() { this.stopped = true; this.onend && this.onend(); } };
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: Mock, configurable: true, writable: true });
      Object.defineProperty(window, 'SpeechRecognition', { value: Mock, configurable: true, writable: true });
    });
    const m = await login(cm, 'button:has-text("운영일지")');
    await m.locator('button:has-text("운영일지") >> visible=true').first().click(); await sleep(1000);
    check('휴대폰: 운영일지 탭에서 음성 입력 단추가 보임', (await m.locator('button:has-text("음성 입력") >> visible=true').count()) >= 1);
    await m.locator('button:has-text("음성 입력") >> visible=true').first().click(); await sleep(250);
    check('녹음 중 표시와 음파가 보임 (마이크 연결·소리 감지를 실제 이벤트로 표시)', (await m.locator('text=/녹음 중/').count()) >= 1 && (await m.locator('.sc-wave').count()) >= 1);
    await sleep(300);
    check('말하는 동안 인식 중인 글자가 실시간으로 보임', (await m.locator('text=/인식 중: 시험 중간 문장/').count()) >= 1);
    await sleep(700);
    check('말한 내용이 칸에 들어감', await m.evaluate(() => [...document.querySelectorAll('textarea')].some(x => x.value.includes('음성으로 입력한 문장'))));
    await m.locator('button:has-text("중지") >> visible=true').first().click(); await sleep(300);
    check('[중지]를 누르면 녹음 표시가 사라짐', (await m.locator('.sc-wave').count()) === 0);
    check('화면 오류 없음(휴대폰)', m.errs.length === 0, m.errs.slice(0, 2).join('|'));
  } catch (e) { check('시험 진행', false, e.message.split('\n')[0]); }
  console.log('스마트케어 운영일지 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
