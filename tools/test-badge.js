/* 시험용 빌드 전용: 화면 구석에 '시험 서버' 표시 (운영과 헷갈리지 않게) */
document.addEventListener('DOMContentLoaded', function () {
  var b = document.createElement('div');
  b.textContent = '시험 서버';
  b.setAttribute('aria-label', '시험 서버에 연결된 화면입니다');
  b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:10001;padding:6px 12px;border-radius:999px;background:#b45309;color:#fff;font:600 13px/1.4 sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.25);pointer-events:none;';
  document.body.appendChild(b);
});
