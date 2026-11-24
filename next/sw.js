/* 스마트케어 앱 설치용 서비스 워커.
   환자 정보를 기기에 따로 저장(캐시)하지 않도록 아무것도 가로채지 않습니다 — 설치 조건만 충족시킵니다. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* 네트워크 그대로 사용 */ });
