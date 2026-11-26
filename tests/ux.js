#!/usr/bin/env node
/* 사용 편의 시험 (직원별 계정 방식)
 *   python3 tools/build.py local-staff && node tests/ux.js
 * 일정 시작·종료 시각 고르기 · 화면 모드(라이트/다크) · 일정 담당자 표시 끄기 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8888, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1466, height: 1100 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101');
    await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click();
    await p.waitForSelector('text=가상환자1', { timeout: 20000 });

    // 1) 화면 모드
    const bg = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const before = await bg();
    const light = p.locator('[aria-label="화면 모드"] button[aria-label="라이트"]').first(), dark = p.locator('[aria-label="화면 모드"] button[aria-label="다크"]').first();
    check('사이드바 아래쪽에 화면 모드(라이트/다크) 선택이 있음', (await light.isVisible()) && (await dark.isVisible()));
    await light.click(); await sleep(400); const lb = await bg();
    await dark.click(); await sleep(400); const db = await bg();
    check('라이트·다크를 누르면 화면 색이 바뀜', lb !== db, lb + ' ↔ ' + db);

    // 1-3) 사이드바 아래: 계정 · 비밀번호 변경 · 로그아웃이 한 줄
    const oneLine = await p.evaluate(() => { const lo = document.querySelector('button[aria-label="로그아웃"]'), pw = document.querySelector('button[aria-label="비밀번호 변경"]'); if (!lo || !pw) return null; const a = lo.getBoundingClientRect(), b = pw.getBoundingClientRect(); return { dy: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)), h: a.height }; });
    check('계정·비밀번호 변경·로그아웃이 한 줄에 있음', !!oneLine && oneLine.dy < 8, JSON.stringify(oneLine));

    // 1-2) EMR 붙여넣기 버튼 말풍선 설명
    const tipBtn = p.locator('button:has-text("EMR 붙여넣기")').first();
    check('EMR 붙여넣기 버튼에 말풍선 설명이 있음 (eClick 병실현황판 환자 데이터 붙여넣기)', (await tipBtn.getAttribute('data-tip')) === 'eClick 병실현황판 환자 데이터 붙여넣기 하세요!');
    await tipBtn.hover(); await sleep(350);
    check('마우스를 올리면 말풍선이 보임', await p.evaluate(() => { const b = [...document.querySelectorAll('button.has-tip')][0]; return b && getComputedStyle(b, '::after').opacity === '1'; }));

    // 2) 일정 시각 고르기
    await p.locator('text=캘린더 >> visible=true').first().click(); await sleep(1000);
    await p.locator('button:has-text("일정 등록")').first().click(); await sleep(600);
    const sel = (l) => p.locator('select[aria-label="' + l + '"], [aria-label="' + l + '"]').first();
    const val = async (l) => sel(l).inputValue();
    check('기본값은 오후 2시~3시 (소요 1시간)', (await val('시작 시')) === '14' && (await val('종료 시')) === '15' && await p.evaluate(() => document.body.innerText.includes('소요 1시간')));
    await p.locator('button:has-text("오전 9:00")').first().click(); await sleep(200);
    check('시작 시각 버튼을 누르면 시작이 바뀌고 종료도 같은 소요 시간으로 따라감', (await val('시작 시')) === '09' && (await val('종료 시')) === '10', (await val('시작 시')) + '시 → ' + (await val('종료 시')) + '시');
    await p.locator('button:has-text("1시간 30분")').first().click(); await sleep(200);
    check('소요 시간 버튼으로 종료 시각 맞춤 (1시간 30분 → 10:30)', (await val('종료 시')) === '10' && (await val('종료 분')) === '30', (await val('종료 시')) + ':' + (await val('종료 분')));
    await sel('시작 분').selectOption('30'); await sleep(200);
    check('시작 분을 바꾸면 종료가 소요 시간만큼 따라감 (9:30 → 11:00)', (await val('종료 시')) === '11' && (await val('종료 분')) === '00', (await val('종료 시')) + ':' + (await val('종료 분')));
    await sel('종료 시').selectOption('08'); await sleep(200);
    check('종료가 시작보다 빠르면 바로 알려 줌', await p.evaluate(() => document.body.innerText.includes('종료 시각이 시작보다 빨라요')));
    await p.locator('button:has-text("닫기"), [aria-label="닫기"]').first().click().catch(() => {});
    await p.keyboard.press('Escape'); await sleep(300);

    // 3) 일정 담당자로 표시 끄기
    await p.locator('text=담당자 명단 및 권한 >> visible=true').first().click(); await sleep(1200);
    const card = p.locator('button[aria-label="상세 열기·닫기"]:visible').nth(1); await card.click(); await sleep(500);
    const tog = p.locator('button:has-text("일정 담당자로 표시 ✓")').first();
    check('계정마다 "일정 담당자로 표시" 설정이 있음 (기본 켜짐)', await tog.isVisible());
    await tog.click(); await sleep(500);
    check('끄면 표시가 바뀜', await p.locator('button:has-text("일정 담당자로 표시 안 함")').first().isVisible());
    await p.locator('text=캘린더 >> visible=true').first().click().catch(() => {}); await sleep(1000);
    await p.locator('button:has-text("일정 등록")').first().click(); await sleep(600);
    const names = await p.evaluate(() => document.body.innerText);
    check('끈 사람(박체험)은 일정 등록 담당자 목록에서 빠지고 다른 사람은 그대로', !/담당자 \*[\s\S]*박체험/.test(names.split('담당자 *')[1] || '') && /김체험/.test(names.split('담당자 *')[1] || ''));
    // 4) Gmail 로그인 (기관 + Gmail 주소 + 비밀번호) — 김체험 계정의 Gmail 로 로그인
    const p4 = await browser.newPage({ viewport: { width: 1466, height: 900 } });
    p4.on('pageerror', e => errors.push(e.message));
    await p4.goto(BASE + '/'); await p4.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p4.locator('button:has-text("Gmail")').first().click(); await sleep(300);
    await p4.locator('input[autocomplete="username"]').first().fill('staff1@example.test');
    await p4.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p4.locator('button:has-text("로그인")').last().click();
    const ok4 = await p4.waitForSelector('text=가상환자1', { timeout: 15000 }).then(() => true, () => false);
    check('Gmail 주소로 로그인됨 (기관 + Gmail + 비밀번호)', ok4);
    const p5 = await browser.newPage({ viewport: { width: 1466, height: 900 } });
    await p5.goto(BASE + '/'); await p5.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p5.locator('button:has-text("Gmail")').first().click(); await sleep(300);
    await p5.locator('input[autocomplete="username"]').first().fill('staff1@example.test');
    await p5.locator('input[autocomplete="current-password"]').first().fill('틀린비밀번호');
    await p5.locator('button:has-text("로그인")').last().click(); await sleep(1500);
    check('Gmail 로그인도 비밀번호가 틀리면 들어가지 못함', !(await p5.evaluate(() => document.body.innerText.includes('가상환자1'))) && await p5.evaluate(() => /일치하지|확인|틀|실패/.test(document.body.innerText)));
    // 4-2) 브라우저 자동 채우기처럼 입력 이벤트 없이 값만 채워져도 로그인됨
    const p7 = await browser.newPage({ viewport: { width: 1466, height: 900 } });
    p7.on('pageerror', e => errors.push(e.message));
    await p7.goto(BASE + '/'); await p7.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p7.evaluate(() => { document.querySelector('input[autocomplete="username"]').value = '100101'; document.querySelector('input[autocomplete="current-password"]').value = '1234'; });
    await p7.locator('button:has-text("로그인")').last().click();
    check('자동 채우기(입력 이벤트 없음)로 채워진 아이디·비밀번호로도 로그인됨', await p7.waitForSelector('text=가상환자1', { timeout: 15000 }).then(() => true, () => false));
    // 4-3) 휴대폰: '내 설정' 탭에 계정·화면 모드/색상(한 줄)·비밀번호 변경·로그아웃
    const ctxm = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    const pm = await ctxm.newPage(); pm.on('pageerror', e => errors.push(e.message));
    await pm.goto(BASE + '/'); await pm.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await pm.locator('input[autocomplete="username"]').first().fill('100101'); await pm.locator('input[autocomplete="current-password"]').first().fill('1234');
    await pm.locator('button:has-text("로그인")').last().tap(); await pm.waitForSelector('text=오늘', { timeout: 20000 }); await sleep(800);
    await pm.locator('button:has-text("내 설정")').last().tap(); await sleep(500);
    const mtxt = await pm.evaluate(() => document.body.innerText);
    check('휴대폰 "내 설정": 계정 · 화면 모드/색상 · 로그아웃이 있음', mtxt.includes('김체험') && mtxt.includes('화면 모드') && mtxt.includes('로그아웃'));
    const rowOk = await pm.evaluate(() => { const g = document.querySelector('[aria-label="화면 모드"]'), c = document.querySelector('[aria-label="강조 색상"]'); if (!g || !c) return false; const a = g.getBoundingClientRect(), b = c.getBoundingClientRect(); return Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) < 12; });
    check('화면 모드와 강조 색상이 한 줄에 있음', rowOk);
    const bb = await pm.evaluate(() => { const d = [...document.querySelectorAll('[aria-label="다크"],[aria-label="라이트"]')].map(e => e.getAttribute('aria-pressed')); return d.join(','); });
    await pm.locator('[aria-label="화면 모드"] button[aria-pressed="false"]').first().tap(); await sleep(400);
    check('휴대폰에서도 라이트/다크가 바뀜', (await pm.evaluate(() => [...document.querySelectorAll('[aria-label="다크"],[aria-label="라이트"]')].map(e => e.getAttribute('aria-pressed')).join(','))) !== bb);
    await pm.evaluate(() => { const x = [...document.querySelectorAll('button')].find(b => b.offsetParent && b.querySelector('.ph-x') && /브리핑/.test((b.parentElement || {}).innerText || '')); if (x) x.click(); }); await sleep(300);
    await pm.locator('button:has-text("로그아웃")').last().evaluate(e => e.scrollIntoView({ block: 'center' })); await sleep(300); await pm.locator('button:has-text("로그아웃")').last().tap();
    check('휴대폰에서 로그아웃하면 로그인 화면으로 돌아감', await pm.waitForSelector('input[autocomplete="username"]', { timeout: 15000 }).then(() => true, () => false));
    await ctxm.close();

    // 4-4) 로그인 화면 위치: PC 는 화면 세로 중앙, 휴대폰은 로그인 버튼이 첫 화면 안에 보임 (운영 화면 기준)
    const prodRoute = async (c) => c.route('**/*', async (route) => { if (route.request().resourceType() !== 'document') return route.continue(); const r = await route.fetch(); route.fulfill({ response: r, body: (await r.text()).replace("'1' === '1'", "'0' === '1'") }); });
    const cPc = await browser.newContext({ viewport: { width: 1554, height: 1000 } }); await prodRoute(cPc);
    const pPc = await cPc.newPage(); await pPc.goto(BASE + '/'); await pPc.waitForSelector('input[autocomplete="username"]', { timeout: 60000 }); await sleep(500);
    const mPc = await pPc.evaluate(() => { const r = document.querySelector('form').getBoundingClientRect(); return { top: r.top, bottom: window.innerHeight - r.bottom }; });
    check('PC 로그인 화면: 로그인 입력이 화면 세로 중앙에 있음', Math.abs(mPc.top - mPc.bottom) < 140 && mPc.top > 150, '위 ' + Math.round(mPc.top) + 'px · 아래 ' + Math.round(mPc.bottom) + 'px');
    await cPc.close();
    const cPh = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }); await prodRoute(cPh);
    const pPh = await cPh.newPage(); await pPh.goto(BASE + '/'); await pPh.waitForSelector('input[autocomplete="username"]', { timeout: 60000 }); await sleep(500);
    const bPh = await pPh.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.type === 'submit'); return b.getBoundingClientRect().bottom <= window.innerHeight; });
    check('휴대폰 로그인 화면: 스크롤 없이 로그인 버튼까지 보임', bPh);
    await cPh.close();
    // 4-5) 환자 이름·등록번호 가리기 (설정 › 개인정보 표시)
    const pp = await browser.newPage({ viewport: { width: 1466, height: 1000 } });
    pp.on('pageerror', e => errors.push(e.message));
    await pp.goto(BASE + '/'); await pp.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await pp.locator('input[autocomplete="username"]').first().fill('100101'); await pp.locator('input[autocomplete="current-password"]').first().fill('1234');
    await pp.locator('button:has-text("로그인")').last().click(); await pp.waitForSelector('text=가상환자1', { timeout: 20000 }); await sleep(800);
    check('가리기 전에는 환자 이름이 그대로 보임', await pp.evaluate(() => document.body.innerText.includes('가상환자1')));
    await pp.locator('text=담당자 명단 및 권한 >> visible=true').first().click(); await sleep(600);
    await pp.locator('button:has-text("개인정보 표시")').first().click(); await sleep(500);
    check('설정에 "개인정보 표시" 탭이 있고 미리 보기가 보임', await pp.evaluate(() => document.body.innerText.includes('환자 이름') && document.body.innerText.includes('미리 보기')));
    await pp.locator('button:has-text("김*순 · 가운데만 가림")').first().click(); await sleep(400);
    check('이름 가림 "#*#" 미리 보기: 김명순A → 김*순A', await pp.evaluate(() => document.body.innerText.includes('김*순A')));
    await pp.locator('button:has-text("00010*** · 앞 5자리만 보임")').first().click(); await sleep(400);
    check('등록번호 가림 "#####*" 미리 보기: 00010617 → 00010***', await pp.evaluate(() => document.body.innerText.includes('00010***')));
    await pp.locator('text=환자 등록 관리 >> visible=true').first().click(); await sleep(1200);
    const ptxt = await pp.evaluate(() => document.body.innerText);
    check('환자 목록의 이름이 가려져 보임 (가상환자1 → 가*환자1 형태)', !ptxt.includes('가상환자1') && /가\*환자1/.test(ptxt));
    // 다른 시험에 영향이 없도록 설정을 원래대로(가리지 않음) 되돌림 — 이 설정은 서버에 저장되어 모든 화면에 적용됨
    await pp.locator('text=담당자 명단 및 권한 >> visible=true').first().click(); await sleep(500);
    await pp.locator('button:has-text("개인정보 표시")').first().click(); await sleep(400);
    for (const b of await pp.locator('button:has-text("가리지 않음")').all()) await b.click();
    await sleep(500);
    check('가리지 않음으로 되돌리면 이름이 다시 그대로 보임', await (async () => { await pp.locator('text=환자 등록 관리 >> visible=true').first().click(); await sleep(900); return pp.evaluate(() => document.body.innerText.includes('가상환자1')); })());
    await pp.close();

    // 5) 아이디 저장 (비밀번호는 저장하지 않음) · Enter 로 로그인
    const p6 = await browser.newPage({ viewport: { width: 1466, height: 900 } });
    p6.on('pageerror', e => errors.push(e.message));
    await p6.goto(BASE + '/'); await p6.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    check('로그인 화면에 "이 기기에 아이디 저장" 선택이 있음 (처음에는 꺼짐)', (await p6.locator('label:has-text("이 기기에 아이디 저장") input').count()) === 1 && !(await p6.locator('label:has-text("이 기기에 아이디 저장") input').isChecked()));
    await p6.locator('label:has-text("이 기기에 아이디 저장") input').check();
    await p6.locator('input[autocomplete="username"]').first().fill('100101');
    await p6.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p6.locator('input[autocomplete="current-password"]').first().press('Enter');
    check('비밀번호 칸에서 Enter 만 눌러도 로그인됨', await p6.waitForSelector('text=가상환자1', { timeout: 15000 }).then(() => true, () => false));
    const hint = await p6.evaluate(() => localStorage.getItem('smartcare.loginHint.v1'));
    check('아이디만 저장되고 비밀번호는 저장되지 않음', !!hint && JSON.parse(hint).id === '100101' && !/pw|pass|1234/i.test(Object.keys(JSON.parse(hint)).join(',') + hint.replace('100101', '')), hint);
    await p6.locator('button:has-text("로그아웃")').first().click();
    await p6.waitForSelector('input[autocomplete="username"]', { timeout: 15000 }); await sleep(800);
    check('로그아웃 후에도 아이디가 채워져 있고 비밀번호는 비어 있음', (await p6.locator('input[autocomplete="username"]').first().inputValue()) === '100101' && (await p6.locator('input[autocomplete="current-password"]').first().inputValue()) === '');
    await p6.locator('label:has-text("이 기기에 아이디 저장") input').uncheck(); await sleep(300);
    check('저장을 끄면 저장된 아이디가 지워짐', (await p6.evaluate(() => localStorage.getItem('smartcare.loginHint.v1'))) === null);
    check('화면 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) { check('시험 진행', false, e.message); }
  finally { await browser.close(); srv.kill(); }
  console.log('스마트케어 사용 편의 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
