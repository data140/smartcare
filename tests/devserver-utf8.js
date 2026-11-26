#!/usr/bin/env node
/* 시험용 가짜 서버가 큰 한글 요청을 깨뜨리지 않는지 시험
 * (예전에는 요청을 조각마다 문자열로 바꿔, 한글 한 글자가 조각 경계에 걸리면 깨져 quota 시험이 간헐적으로 실패했음) */
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8971;
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(o => srv.stdout.once('data', o));
  let ok = true; const out = [];
  try {
    for (let round = 0; round < 3; round++) {
      const arr = []; for (let i = 0; i < 4000 + round * 123; i++) arr.push({ id: 'P' + i, stay: '재원', name: '가상환자' + i, memo: '가'.repeat(37 + round) });
      const body = JSON.stringify(arr);
      await fetch('http://localhost:' + PORT + '/rest/v1/smartcare_kv?on_conflict=k', { method: 'POST', headers: { apikey: 'k', Authorization: 'Bearer dev-token', 'Content-Type': 'application/json' }, body: JSON.stringify([{ k: 'smartcare:chk' + round, v: body, updated_at: new Date().toISOString() }]) });
      const r = await (await fetch('http://localhost:' + PORT + '/rest/v1/smartcare_kv?select=k,v&k=eq.smartcare:chk' + round, { headers: { apikey: 'k', Authorization: 'Bearer dev-token' } })).json();
      const back = r[0] && r[0].v;
      const good = back === body && !/�/.test(back);
      out.push((good ? '  ✓ ' : '  ✗ ') + '큰 한글 요청 ' + Math.round(body.length / 1024) + 'KB가 깨지지 않고 저장됨');
      if (!good) ok = false;
    }
  } catch (e) { ok = false; out.push('  ✗ 시험 진행 — ' + e.message); }
  console.log('스마트케어 시험용 서버 한글 요청 시험\n' + out.join('\n'));
  srv.kill(); process.exit(ok ? 0 : 1);
})();
