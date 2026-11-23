/* 체험용 빌드 전용: 데이터 서버 요청을 가로채 가상 데이터로 응답 (실제 서버에 접속하지 않음) */
(function () {
  var now = new Date().toISOString(), WS = 'smartcare:';
  var kv = scFakeData();
  var rows = {}; Object.keys(kv).forEach(function (k) { rows[k] = { k: k, v: kv[k], updated_at: now }; });
  // 서버 로그인 화면은 건너뜀 (체험용)
  try { localStorage.setItem('sc.auth.v1', JSON.stringify({ url: '__SC_CLOUD_URL__', access_token: 'demo', refresh_token: 'demo', expires_at: Date.now() + 864e5, email: '체험용' })); } catch (e) {}
  var esc = function (s) { return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'); };
  var like = function (pat) { var re = new RegExp('^' + pat.split('*').map(esc).join('.*') + '$'); return function (v) { return re.test(v); }; };
  var cond = function (expr) {
    var m = expr.match(/^(k|updated_at)\.(not\.)?(like|eq|in|gt)\.(.*)$/); if (!m) return function () { return true; };
    var col = m[1], neg = !!m[2], op = m[3], raw = m[4], f;
    if (op === 'like') f = like(raw); else if (op === 'eq') f = function (v) { return v === raw; }; else if (op === 'gt') f = function (v) { return v > raw; };
    else { var list = raw.replace(/^\(|\)$/g, '').split(',').map(function (s) { return s.replace(/^"|"$/g, ''); }); f = function (v) { return list.indexOf(v) >= 0; }; }
    return function (r) { return neg ? !f(r[col]) : f(r[col]); };
  };
  var splitTop = function (s) { var out = [], d = 0, cur = ''; for (var i = 0; i < s.length; i++) { var ch = s[i]; if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; };
  var J = function (status, body) { return Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status: status, headers: { 'Content-Type': 'application/json' } })); };
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var u; try { u = new URL(url, location.href); } catch (e) { return realFetch(input, init); }
    if (!/supabase\.co$/.test(u.hostname)) return realFetch(input, init);
    var method = ((init && init.method) || 'GET').toUpperCase(), body = (init && init.body) || '';
    var p = u.pathname;
    if (p.indexOf('/auth/v1/') === 0) {
      if (p === '/auth/v1/logout') return J(204);
      if (p === '/auth/v1/token') return J(200, { access_token: 'demo', refresh_token: 'demo', expires_in: 86400, user: { email: '체험용' } });
      return J(200, {});
    }
    if (p === '/rest/v1/rpc/smartcare_is_member') return J(200, true);
    if (p === '/rest/v1/smartcare_kv') {
      if (method === 'POST') { JSON.parse(body || '[]').forEach(function (r) { rows[r.k] = { k: r.k, v: r.v, updated_at: r.updated_at || new Date().toISOString() }; }); return J(201); }
      var fs = [];
      u.searchParams.forEach(function (val, key) {
        if (key === 'k' || key === 'updated_at') fs.push(cond(key + '.' + val));
        else if (key === 'or') { var parts = splitTop(val.replace(/^\(|\)$/g, '')).map(cond); fs.push(function (r) { return parts.some(function (f) { return f(r); }); }); }
      });
      var list = Object.keys(rows).map(function (k) { return rows[k]; }).filter(function (r) { return fs.every(function (f) { return f(r); }); });
      if (method === 'DELETE') { list.forEach(function (r) { delete rows[r.k]; }); return J(204); }
      list.sort(function (a, b) { return a.updated_at < b.updated_at ? -1 : 1; });
      var lim = +u.searchParams.get('limit'); if (lim) list = list.slice(0, lim);
      var sel = (u.searchParams.get('select') || 'k,v,updated_at').split(',');
      return J(200, list.map(function (r) { var o = {}; sel.forEach(function (c) { o[c] = r[c]; }); return o; }));
    }
    return J(404, {});
  };
})();
