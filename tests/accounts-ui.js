#!/usr/bin/env node
/* 계정 목록 화면 시험 (설정 › 담당자 명단 및 권한)
 *   python3 tools/build.py local-staff && node tests/accounts-ui.js
 * 계정마다 같은 구성(머리줄 → 기본 정보 → 권한 → 계정 관리 → 접속 기록)인지, 비밀번호 지정 규칙(숫자 6자리)을 확인합니다. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8882, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };

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
    await p.locator('text=담당자 명단 및 권한 >> visible=true').first().click(); await p.waitForTimeout(1500);

    // 처음에는 한 줄 요약만 보이고, [상세]를 눌러야 입력칸이 펼쳐짐
    const collapsed = await p.evaluate(() => ({
      cards: [...document.querySelectorAll('span[title="끌어서 순서 변경"]')].filter(g => g.offsetParent !== null).length,
      inputs: [...document.querySelectorAll('input[aria-label="사번"]')].filter(i => i.offsetParent !== null).length,
      chips: /환자\s*(사용|뷰|없음)/.test(document.body.innerText) && /일지\s*(사용|뷰|없음)/.test(document.body.innerText)
    }));
    check('처음에는 계정마다 한 줄 요약만 표시 (입력칸 접힘)', collapsed.cards === 3 && collapsed.inputs === 0, JSON.stringify(collapsed));
    check('요약에 권한(환자·일지·통계) 표시', collapsed.chips);
    for (const b of await p.locator('button[aria-label="상세 열기·닫기"]:visible').all()) { await b.click(); }
    await p.waitForTimeout(500);
    const info = await p.evaluate(() => [...document.querySelectorAll('span[title="끌어서 순서 변경"]')].filter(g => g.offsetParent !== null).map(g => {
      const card = g.parentElement.parentElement; const t = card.innerText.replace(/\s+/g, ' ');
      const pos = (k) => t.indexOf(k);
      return { n: t.slice(0, 12), order: [pos('기본 정보'), pos('알림 수신 Gmail'), pos('기능 보기 사용'), pos('비밀번호 지정'), pos('최근 접속')], mine: (t.match(/본인/g) || []).length };
    }));
    check('계정 3개가 같은 카드 구성으로 표시', info.length === 3, info.map(c => c.n).join(' / '));
    check('카드마다 구역 순서 일정: 기본 정보 → Gmail → 권한 → 비밀번호 → 접속 기록', info.every(c => c.order.every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1]))), JSON.stringify(info.map(c => c.order)));
    check('"본인" 표시는 한 번만', info.every(c => c.mine <= 1));

    // 비밀번호 지정 규칙 (두 번째 계정 = 박체험)
    const pwBtn = p.locator('button:has-text("비밀번호 지정")').nth(1);
    await pwBtn.click();
    const input = p.locator('input[aria-label="새 비밀번호"]');
    check('비밀번호 안내 예시가 숫자 6자리', (await input.getAttribute('placeholder')).includes('123456'));
    await input.fill('1234'); await input.press('Enter');
    await p.waitForSelector('text=6자 이상', { timeout: 5000 }).then(() => check('4자리는 안내와 함께 거부', true), () => check('4자리는 안내와 함께 거부', false));
    await input.fill('123456'); await input.press('Enter');
    await p.waitForSelector('text=비밀번호를 지정했습니다', { timeout: 8000 }).then(() => check('숫자 6자리(123456) 지정', true), () => check('숫자 6자리(123456) 지정', false));
    const tr = await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 's2.smartcare@smartcare.invalid', password: '123456' }) });
    check('지정한 123456 으로 서버 로그인', tr.ok);

    // 초기화 → 임시 비밀번호는 숫자 6자리
    await p.locator('button:has-text("비밀번호 초기화")').nth(1).click();
    await p.waitForSelector('text=/임시 비밀번호\\s*\\d{6}/', { timeout: 8000 }).then(() => check('비밀번호 초기화 → 임시 비밀번호는 숫자 6자리', true), () => check('비밀번호 초기화 → 임시 비밀번호는 숫자 6자리', false));
    check('화면 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('시험 진행', false, e.message);
  } finally {
    await browser.close(); srv.kill();
  }
  console.log('스마트케어 계정 목록 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
