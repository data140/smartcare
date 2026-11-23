#!/usr/bin/env node
/* AI 비서 시험 (실제 Claude 에는 요청하지 않음 — 개발 서버가 SDK 를 가짜로 바꿔 끼움)
 *   python3 tools/build.py local-staff && node tests/ai.js
 * - 서버 함수(supabase/functions/smartcare-ai): 로그인 확인, 하루 한도
 * - 화면: 규칙형으로 답 못 하는 질문 → AI 함수 → 답변 표시 (가명 → 실명 되돌림)
 * - Claude 로 가는 데이터에 환자 실명이 없는지 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8851, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const r0 = await fetch(BASE + '/functions/v1/smartcare-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: '안녕', context: '' }) });
    check('로그인 없이 AI 함수 호출 → 거부', r0.status === 401);

    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101');
    await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click();
    await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    await p.evaluate((u) => localStorage.setItem('smartcare.ai.v1', JSON.stringify({ url: u })), BASE + '/functions/v1/smartcare-ai');

    await p.click('button[aria-label="AI 비서 열기"]');
    const ask = async (q) => { await p.fill('input[aria-label="질문 입력"]', q); await p.click('button[aria-label="보내기"]'); await p.waitForTimeout(1500); };
    await ask('요즘 프로그램 운영에서 개선할 점을 제안해 주세요');
    const body1 = await p.evaluate(() => document.body.innerText);
    check('자유 질문 → AI 답변 표시', body1.includes('(가짜 AI 답변)'));
    check('AI 답변의 가명을 실명으로 되돌림', /가짜 AI 답변\) 가상환자\d/.test(body1));
    const last = await (await fetch(BASE + '/__test/ai-last')).json();
    const sent = JSON.stringify(last);
    check('Claude 로 보낸 데이터에 환자 실명 없음', !/가상환자\d/.test(sent) && /환자A/.test(sent));
    check('모델 claude-opus-5-5 · 답변 거절 시 대체 모델 사용', last && last.model === 'claude-opus-5-5' && last.fallbacks === 'default');
    await ask('오늘 할 일');
    check('규칙형으로 답할 수 있는 질문은 AI 를 쓰지 않음', (await (await fetch(BASE + '/__test/ai-last')).json()).messages.length === last.messages.length && !(await p.evaluate(() => document.body.innerText)).split('오늘 할 일').pop().includes('(가짜 AI 답변)'));
    // 하루 한도 (개발 서버는 3회)
    await ask('직원 교육 아이디어를 알려 주세요');
    await ask('보호자 상담 때 쓸 안내 문구를 만들어 주세요');
    await ask('다음 달 프로그램 계획 방향을 제안해 주세요');
    check('하루 한도를 넘으면 안내', (await p.evaluate(() => document.body.innerText)).includes('오늘 AI 질문 한도'));
    check('화면 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('시험 진행', false, e.message);
  } finally {
    await browser.close(); srv.kill();
  }
  console.log('스마트케어 AI 비서 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
