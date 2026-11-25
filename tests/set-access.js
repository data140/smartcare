#!/usr/bin/env node
/* 설정 메뉴별 접근 권한 시험
 *   python3 tools/build.py local-staff && node tests/set-access.js
 * 시스템 관리자=전체, 기관 관리자=기관 관리·데이터 서버 제외, 계정마다 항목별로 켜고 끌 수 있는지 확인합니다. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8934, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false; const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  const login = async (id, pw, wait) => {
    const p = await browser.newPage({ viewport: { width: 1466, height: 1100 } });
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    if (id === 'admin') await p.click('button:has-text("시스템 관리자")');
    await p.locator('input[autocomplete="username"]').first().fill(id);
    await p.locator('input[autocomplete="current-password"]').first().fill(pw);
    await p.locator('button:has-text("로그인")').last().click();
    if (id === 'admin') { await p.waitForTimeout(4000); if (!(await p.locator('text=담당자 명단 및 권한 >> visible=true').count())) { await p.getByText('설정', { exact: true }).first().click().catch(() => {}); await p.waitForTimeout(600); } }
    else await p.waitForSelector(wait || 'text=가상환자1', { timeout: 20000 });
    return p;
  };
  const tabs = async (p) => { const sy = p.locator('button[role=tab]:has-text("시스템 관리") >> visible=true'); if (await sy.count()) { await sy.first().click(); await sleep(400); const r = await tabsRaw(p); await p.locator('button[role=tab]:has-text("담당자 명단 및 권한")').first().click(); await sleep(500); return r; } return tabsRaw(p); };
  const tabsRaw = (p) => p.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent && /^(AI 판독 파라미터|동의서식 관리|프로그램 관리|병동 · 호실|담당자 명단 및 권한|일정 알림|개인정보 표시|결재라인 · 문서 서식|기관 관리|데이터 서버|운영 데이터 초기화)$/.test(b.innerText.trim())).map(b => b.innerText.trim()));
  try {
    // 기관 관리자 (김체험)
    const a = await login('100101', '1234');
    await a.locator('text=담당자 명단 및 권한 >> visible=true').first().click(); await a.waitForTimeout(1200);
    const at = await tabs(a);
    check('기관 관리자: 기관 관리·데이터 서버 제외 전부 보임', at.includes('일정 알림') && at.includes('개인정보 표시') && at.includes('결재라인 · 문서 서식') && !at.includes('기관 관리') && !at.includes('데이터 서버'), at.join(','));
    for (const b of await a.locator('button[aria-label="상세 열기·닫기"]:visible').all()) await b.click();
    await a.waitForTimeout(500);
    check('계정 상세에 "설정 메뉴 접근" 구역이 있음', (await a.locator('text=설정 메뉴 접근').count()) >= 2);
    check('기관 관리자에게는 기관 관리 칸이 잠김', await a.locator('button:disabled', { hasText: '기관 관리' }).count() >= 1);
    // 시스템 관리자가 김체험(첫 계정)의 일정 알림을 끄고, 김체험으로 로그인하면 숨겨져야 함
    const c = await login('admin', 'demo1234', 'text=담당자 명단 및 권한');
    await c.locator('text=담당자 명단 및 권한 >> visible=true').first().click(); await c.waitForTimeout(1200);
    const ct = await tabs(c);
    check('시스템 관리자: 기관 관리·데이터 서버 포함 전체', ct.includes('기관 관리') && ct.includes('데이터 서버') && ct.includes('AI 판독 파라미터') && ct.includes('결재라인 · 문서 서식'), ct.join(','));
    for (const x of await c.locator('button[aria-label="상세 열기·닫기"]:visible').all()) await x.click();
    await c.waitForTimeout(500);
    const pick = (label) => c.locator('button[aria-pressed]:visible', { hasText: label });
    const first = pick('일정 알림').first();
    check('관리자 기본값: 일정 알림 켜짐 · 선택 칸이 강조(sel-chip)', (await first.getAttribute('aria-pressed')) === 'true' && /sel-chip/.test(await first.getAttribute('class')));
    await first.click(); await c.waitForTimeout(1800);
    check('끄면 즉시 반영', (await pick('일정 알림').first().getAttribute('aria-pressed')) === 'false');
    check('시스템 관리자는 기관 관리 칸도 켤 수 있음(잠기지 않음)', await c.locator('button:not([disabled])', { hasText: '기관 관리' }).count() >= 1);
    check('화면 오류 없음(시스템 관리자)', c.errs.length === 0, c.errs.slice(0, 2).join('|'));
    await c.waitForTimeout(1500);
    const d = await login('100101', '1234');
    await d.locator('text=담당자 명단 및 권한 >> visible=true').first().click(); await d.waitForTimeout(1200);
    const dt = await tabs(d);
    check('김체험: 일정 알림 숨김 · 나머지는 유지', !dt.includes('일정 알림') && dt.includes('개인정보 표시') && dt.includes('결재라인 · 문서 서식'), dt.join(','));
  } catch (e) { check('시험 진행', false, e.message.split('\n')[0]); }
  console.log('스마트케어 설정 메뉴 접근 권한 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
