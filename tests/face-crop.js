#!/usr/bin/env node
/* 단체 사진에서 얼굴 오려내기: 네모 그리기 · 옮기기 · 테두리/모서리로 크기 조절
 *   python3 tools/build.py local-staff && node tests/face-crop.js */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8861, BASE = 'http://localhost:' + PORT;
const results = []; let failed = false;
const check = (name, ok, extra) => { results.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed = true; };

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT), '--staff'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => { srv.stdout.once('data', ok); srv.once('exit', c => fail(new Error('서버 시작 실패 ' + c))); });
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE + '/'); await p.waitForSelector('input[autocomplete="username"]', { timeout: 60000 });
    await p.locator('input[autocomplete="username"]').first().fill('100101');
    await p.locator('input[autocomplete="current-password"]').first().fill('1234');
    await p.locator('button:has-text("로그인")').last().click();
    await p.waitForSelector('text=가상환자1', { timeout: 20000 });
    const reg = await p.locator('button.btn-primary:has-text("환자 등록")').first().boundingBox();
    await p.mouse.click(reg.x + reg.width / 2, reg.y + reg.height / 2); await p.waitForTimeout(2000);
    await p.locator('button[title^="단체 사진에서"]').first().click({ timeout: 5000 }); await p.waitForTimeout(500);
    const dlg = p.locator('[role="dialog"][aria-label="단체 사진에서 얼굴 오려내기"]');
    check('얼굴 오려내기 창 열림', await dlg.isVisible());
    // 가상 사진 (600x800)
    const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#88a'; g.fillRect(0, 0, 600, 800); g.fillStyle = '#fc9'; g.beginPath(); g.arc(300, 300, 120, 0, 7); g.fill(); return c.toDataURL('image/png').split(',')[1]; });
    await dlg.locator('input[type="file"]').setInputFiles({ name: 'group.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await p.waitForTimeout(800);
    const img = dlg.locator('img[alt="단체 사진"]');
    const ib = await img.boundingBox();
    // 네모 그리기
    await p.mouse.move(ib.x + ib.width * 0.3, ib.y + ib.height * 0.2); await p.mouse.down();
    await p.mouse.move(ib.x + ib.width * 0.6, ib.y + ib.height * 0.5, { steps: 5 }); await p.mouse.up();
    const boxOf = async () => { const h = dlg.locator('[aria-label="오른쪽 아래 모서리"]'); if (!(await h.count())) return null; const r = await h.boundingBox(); const n = await dlg.locator('[aria-label="왼쪽 위 모서리"]').boundingBox(); return { l: n.x + n.width / 2, t: n.y + n.height / 2, r: r.x + r.width / 2, b: r.y + r.height / 2 }; };
    const b1 = await boxOf();
    check('네모 그리기 → 크기 조절 손잡이 8개 표시', !!b1 && await dlg.locator('[aria-label$="크기 조절"], [aria-label$="모서리"]').count() === 8);
    // 오른쪽 아래 모서리 끌어 키우기
    const se = await dlg.locator('[aria-label="오른쪽 아래 모서리"]').boundingBox();
    await p.mouse.move(se.x + se.width / 2, se.y + se.height / 2); await p.mouse.down();
    await p.mouse.move(se.x + 60, se.y + 80, { steps: 5 }); await p.mouse.up();
    const b2 = await boxOf();
    check('모서리를 끌면 가로·세로 함께 커짐 (왼쪽 위는 고정)', b2.r - b1.r > 40 && b2.b - b1.b > 60 && Math.abs(b2.l - b1.l) < 2 && Math.abs(b2.t - b1.t) < 2, JSON.stringify({ dr: Math.round(b2.r - b1.r), db: Math.round(b2.b - b1.b) }));
    // 위쪽 테두리 끌어 올리기
    const n = await dlg.locator('[aria-label="위쪽 크기 조절"]').boundingBox();
    await p.mouse.move(n.x + n.width / 2, n.y + n.height / 2); await p.mouse.down();
    await p.mouse.move(n.x + n.width / 2, n.y - 50, { steps: 5 }); await p.mouse.up();
    const b3 = await boxOf();
    check('위쪽 테두리를 끌면 위로만 늘어남', b2.t - b3.t > 30 && Math.abs(b3.b - b2.b) < 2 && Math.abs(b3.l - b2.l) < 2);
    // 안쪽 끌어 옮기기 (크기 유지)
    await p.mouse.move((b3.l + b3.r) / 2, (b3.t + b3.b) / 2); await p.mouse.down();
    await p.mouse.move((b3.l + b3.r) / 2 + 30, (b3.t + b3.b) / 2 + 20, { steps: 5 }); await p.mouse.up();
    const b4 = await boxOf();
    check('안쪽을 끌면 크기는 그대로 옮겨짐', Math.abs((b4.r - b4.l) - (b3.r - b3.l)) < 2 && b4.l - b3.l > 20);
    check('증명사진으로 버튼 사용 가능', await dlg.locator('button:has-text("증명사진으로")').isEnabled());
    check('화면 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('시험 진행', false, e.message);
  } finally {
    await browser.close(); srv.kill();
  }
  console.log('스마트케어 얼굴 오려내기 시험\n' + results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
