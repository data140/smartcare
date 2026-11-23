#!/usr/bin/env node
/* AI 비서 무료 규칙형 질문 시험 (Claude 를 쓰지 않음)
 *   python3 tools/build.py local-staff && node tests/ai-rules.js
 * 일지 미작성 목록 · 병동별 동의 미완료 환자 · 담당자별 일정 · 증명사진 없는 환자 인원 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8871, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [], external = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('request', r => { if (/anthropic|supabase\.co/.test(r.url())) external.push(r.url()); });
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101');
    await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click();
    await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    await p.click('button[aria-label="AI 비서 열기"]');
    const panel = () => p.locator('[role="dialog"][aria-label="AI 비서"]').innerText();
    const ask = async (q) => { await p.fill('input[aria-label="질문 입력"]', q); await p.click('button[aria-label="보내기"]'); await p.waitForTimeout(900); return panel(); };

    let t = await ask('일지 미작성인 프로그램 목록 보여 줘');
    check('일지 미작성 프로그램 목록', /일지 미작성 프로그램 2건/.test(t) && t.includes('미술치료') && t.includes('음악치료'));
    t = await ask('3병동 동의 미완료 환자는 누구야?');
    const last3 = t.slice(t.lastIndexOf('3병동 동의 미완료 환자'));
    check('3병동 동의 미완료 환자 명단', /3병동 동의 미완료 환자 1명/.test(t) && last3.includes('가상환자3') && !last3.includes('가상환자1 ') && !last3.includes('가상환자4'));
    t = await ask('이번 주 담당자별 일정 알려 줘');
    check('이번 주 담당자별 일정 (담당자마다 건수와 일정)', t.includes('이번 주 담당자별 일정') && /박체험 \(\d+건\) — .*미술치료/.test(t) && /김체험 \(\d+건\) — .*음악치료/.test(t));
    if (process.env.SHOW) console.log(t.slice(t.lastIndexOf('이번 주 담당자별 일정') - 20, t.lastIndexOf('이번 주 담당자별 일정') + 400));
    t = await ask('증명사진 없는 환자 몇 명이야?');
    check('증명사진 없는 환자 인원', /증명사진 없는 환자 5명/.test(t) && /재원 환자 5명 중/.test(t));
    t = await ask('4병동 증명사진 없는 환자 몇 명이야?');
    check('병동을 말하면 그 병동만 셈', /4병동 증명사진 없는 환자 2명/.test(t), (t.match(/4병동 증명사진 없는 환자 \d+명/) || [''])[0]);
    t = await ask('동의서 어떻게 받아?');
    check('사용법 질문은 그대로 사용법으로 답함', t.includes('동의서 방법'));
    t = await ask('미비사항 점검');
    check('미비사항 점검은 그대로', t.split('미비사항 점검').length > 1 && /검수 필요/.test(t));
    check('외부 AI 서버로 요청 없음 (무료)', external.length === 0, external.slice(0, 2).join(', '));
    check('화면 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('시험 진행', false, e.message);
  } finally {
    await browser.close(); srv.kill();
  }
  console.log('스마트케어 AI 비서 규칙형 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
