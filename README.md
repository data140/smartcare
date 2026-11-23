# 스마트케어 프로세스 (사회사업실)

운영 주소: https://data140.github.io/smartcare/

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `src/app.js` | 앱 동작 코드 (화면 상태·저장·서버 동기화) |
| `src/page.html` | 화면 구성 (HTML). `<!--#include … -->` 자리에 스타일·코드가 들어감 |
| `src/styles/` | `app.css`(앱 스타일), `nocturne.css`(디자인 기본값), `phosphor-*.css`(아이콘) |
| `src/bundle/` | 묶음 파일 껍데기와 글꼴·라이브러리 묶음 (보통 고치지 않음) |
| `config/` | 데이터 서버 주소·공개 키 (`prod.json` 운영, `test.json` 시험) |
| `supabase/schema.sql` | 데이터 서버 보안 구성 (RLS) |
| `tools/` | 빌드·개발 서버·가상 데이터 |
| `tests/smoke.js` | 기본 동작 시험 |
| `index.html` | **빌드 결과물** (운영 배포 파일 — 직접 고치지 않음) |

## 고치는 순서

1. `src/` 의 파일을 고칩니다.
2. 개발 서버로 확인합니다 — 실제 서버에 접속하지 않고 가상 데이터로 동작합니다.
   ```bash
   npm run dev
   ```
   http://localhost:8080 · 서버 로그인 `dev@smartcare.test` / `dev1234` · 직원 로그인 `100101` / `1234`
3. 시험을 돌립니다.
   ```bash
   npm test
   ```
4. 운영 파일을 다시 만듭니다.
   ```bash
   npm run build
   ```
5. 브랜치에 커밋하고 PR을 올립니다. PR마다 자동 검사가 돌고, 병합하면 GitHub Pages에 배포됩니다.

`index.html` 을 직접 고치거나, 디자인 도구에서 내보낸 파일로 덮어쓰지 마세요. 자동 검사가 `src/` 와 다르면 실패로 표시합니다.

## 빌드 종류

| 명령 | 결과 | 용도 |
|---|---|---|
| `python3 tools/build.py` | `index.html` | 운영 |
| `python3 tools/build.py test` | `test/index.html` | 시험 서버용 (`config/test.json` 필요, 화면에 '시험 서버' 표시) |
| `python3 tools/build.py local` | `dist/local.html` | 개발 서버용 |
| `python3 tools/build.py demo` | `dist/demo.html` | 서버 없이 가상 데이터로 동작하는 체험용 화면 |
