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
    const light = p.locator('[aria-label="화면 모드"] button:has-text("라이트")').first(), dark = p.locator('[aria-label="화면 모드"] button:has-text("다크")').first();
    check('사이드바 아래쪽에 화면 모드(라이트/다크) 선택이 있음', (await light.isVisible()) && (await dark.isVisible()));
    await light.click(); await sleep(400); const lb = await bg();
    await dark.click(); await sleep(400); const db = await bg();
    check('라이트·다크를 누르면 화면 색이 바뀜', lb !== db, lb + ' ↔ ' + db);

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
    await p.locator('text=계정 · 권한 >> visible=true').first().click(); await sleep(1200);
    const card = p.locator('button[aria-label="상세 열기·닫기"]:visible').nth(1); await card.click(); await sleep(500);
    const tog = p.locator('button:has-text("일정 담당자로 표시 ✓")').first();
    check('계정마다 "일정 담당자로 표시" 설정이 있음 (기본 켜짐)', await tog.isVisible());
    await tog.click(); await sleep(500);
    check('끄면 표시가 바뀜', await p.locator('button:has-text("일정 담당자로 표시 안 함")').first().isVisible());
    await p.locator('text=캘린더 >> visible=true').first().click().catch(() => {}); await sleep(1000);
    await p.locator('button:has-text("일정 등록")').first().click(); await sleep(600);
    const names = await p.evaluate(() => document.body.innerText);
    check('끈 사람(박체험)은 일정 등록 담당자 목록에서 빠지고 다른 사람은 그대로', !/담당자 \*[\s\S]*박체험/.test(names.split('담당자 *')[1] || '') && /김체험/.test(names.split('담당자 *')[1] || ''));
    check('화면 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) { check('시험 진행', false, e.message); }
  finally { await browser.close(); srv.kill(); }
  console.log('스마트케어 사용 편의 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
