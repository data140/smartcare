/* 시험용·새 서버 빌드 전용: 화면 구석에 서버 종류 표시 (운영과 헷갈리지 않게)
 * 묶음 파일은 페이지를 다 읽은 뒤 화면을 다시 그리므로, 표시가 없으면 다시 붙임 */
(function () {
  function ensure() {
    if (!document.body) return;
    if (document.getElementById('sc-env-badge')) return;
    var b = document.createElement('div');
    b.id = 'sc-env-badge';
    b.textContent = '__SC_BADGE__';
    b.setAttribute('role', 'status');
    b.setAttribute('aria-label', '__SC_BADGE__ 에 연결된 화면입니다');
    b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:10001;padding:6px 12px;border-radius:999px;background:#b45309;color:#fff;font:600 13px/1.4 sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.25);pointer-events:none;';
    document.body.appendChild(b);
  }
  ensure();
  setInterval(ensure, 1500);
})();
