#!/usr/bin/env node
/* 운영일지 자동 작성 시험: 프로그램별로 내용이 다름 · 다시 쓸 때마다 다른 문장 · 직접 고친 내용 학습 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8988, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101'); await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click(); await p.waitForSelector('text=가상환자1', { timeout: 20000 }); await sleep(1500);
    await p.locator('aside button:has-text("운영일지") >> visible=true').first().click(); await sleep(1000);
    const texts = () => p.evaluate(() => [...document.querySelectorAll('textarea')].filter(t => t.offsetParent).map(t => t.value));
    const open = async (name) => { await p.locator('button:has-text("' + name + '") >> visible=true').first().click(); await sleep(500); };
    const redo = async () => { await p.locator('button:has-text("자동으로 다시 쓰기") >> visible=true').first().click(); await sleep(500); };
    await open('음악치료');
    const seen = [(await texts()).join('\n')];
    for (let i = 0; i < 3; i++) { await redo(); seen.push((await texts()).join('\n')); }
    check('다시 쓰기를 누를 때마다 내용이 달라짐 (처음 + 3번 = 서로 다른 4개)', new Set(seen).size === 4, String(new Set(seen).size));
    check('연속으로 누를 때 바로 앞 내용과 같지 않음', seen.every((t, i) => i === 0 || t !== seen[i - 1]));
    const music = (await texts()); const musicAll = music.join('\n');
    check('음악치료 내용에 음악 관련 표현이 들어감', /노래|음악|리듬|악기|박자|합창/.test(musicAll));
    await p.locator('aside button:has-text("운영일지") >> visible=true').first().click().catch(() => {}); await sleep(300);
    await open('미술치료');
    const art = (await texts()).join('\n');
    check('미술치료 내용에는 미술 관련 표현이 들어가고 음악치료와 다름', /작품|색|그림|만들|재료/.test(art) && art !== musicAll && !/노래|합창/.test((await texts())[0]));
    // 학습: 음악치료 내용을 직접 고치면 다음 자동 작성에 반영
    await open('음악치료');
    const mine = '시험 학습 문장: 어르신들이 직접 고른 곡으로 합창을 하였다.';
    await p.locator('textarea').first().fill(mine); await p.locator('textarea').first().blur(); await sleep(800);
    check('학습 안내 문구가 보임', /학습/.test(await p.evaluate(() => document.body.innerText)));
    await redo();
    check('고쳐 쓴 문장이 다음 자동 작성에 반영됨', (await texts())[0].includes('어르신들이 직접 고른 곡으로 합창을 하였다'), (await texts())[0].slice(0, 60));
    await redo();
    check('그다음 다시 쓰기에서는 다른 문장도 나옴(같은 문장만 반복하지 않음)', !(await texts())[0].includes('어르신들이 직접 고른 곡으로 합창을 하였다'));
    // 다른 프로그램에는 섞이지 않음
    await p.locator('aside button:has-text("운영일지") >> visible=true').first().click().catch(() => {}); await sleep(300);
    await open('미술치료'); await redo();
    check('학습한 문장이 다른 프로그램(미술치료)에는 섞이지 않음', !(await texts()).join('\n').includes('합창'));
    // 학습 지우기
    await p.locator('aside button:has-text("운영일지") >> visible=true').first().click().catch(() => {}); await sleep(300);
    await open('음악치료');
    await p.locator('button:has-text("학습 지우기") >> visible=true').first().click(); await sleep(400);
    check('학습 지우기를 누르면 학습 문구가 바뀜', !(await p.locator('button:has-text("학습 지우기") >> visible=true').count()));
    check('화면 오류 없음', errs.length === 0, errs.join(' | '));
  } catch (e) { check('시험 진행', false, e.message.split('\n').slice(0, 3).join(' | ')); }
  console.log('스마트케어 운영일지 자동 작성·학습 시험\n' + results.join('\n'));
  await browser.close(); srv.kill(); process.exit(failed ? 1 : 0);
})();
