# 스마트케어 프로세스 (사회사업실)

운영 주소: https://data140.github.io/smartcare/

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `src/app.js` | 앱 동작 코드 (화면 상태·저장·서버 동기화) |
| `src/page.html` | 화면 구성 (HTML). `<!--#include … -->` 자리에 스타일·코드가 들어감 |
| `src/styles/` | `app.css`(앱 스타일), `nocturne.css`(디자인 기본값), `phosphor-*.css`(아이콘) |
| `src/bundle/` | 묶음 파일 껍데기와 글꼴·라이브러리 묶음 (보통 고치지 않음) |
| `config/` | 데이터 서버 주소·공개 키·로그인 방식 (`prod.json` 운영(도쿄), `next.json` 새 서버(서울)) |
| `supabase/schema.sql` | 운영 서버(도쿄) 보안 구성 — 기관 공용 계정 |
| `supabase/schema-next.sql` | 새 서버(서울) 구성 — 직원별 계정 · 기관/역할별 권한 · 감사 기록 |
| `supabase/functions/smartcare-staff/` | 계정 관리 서버 함수 (직원 계정 만들기·비밀번호·권한) |
| `supabase/tests/` | 서버 권한 규칙 시험 (로컬 PostgreSQL) |
| `tools/` | 빌드·개발 서버·가상 데이터 |
| `tests/smoke.js` · `tests/smoke-staff.js` | 화면 동작 시험 (공용 계정 방식 · 직원별 계정 방식) |
| `index.html` · `next/index.html` | **빌드 결과물** (운영 · 새 서버 배포 파일 — 직접 고치지 않음) |

## 고치는 순서

1. `src/` 의 파일을 고칩니다.
2. 개발 서버로 확인합니다 — 실제 서버에 접속하지 않고 가상 데이터로 동작합니다.
   ```bash
   npm run dev
   ```
   http://localhost:8080 · 서버 로그인 `dev@smartcare.test` / `dev1234` · 직원 로그인 `100101` / `1234`

   직원별 계정 방식(새 서버)은 `npm run dev:staff` — 직원 로그인 `100101` / `1234`, 시스템 관리자 `admin` / `demo1234`
3. 시험을 돌립니다.
   ```bash
   npm test
   ```
   서버 권한 규칙 시험은 로컬 PostgreSQL이 있으면 `PGHOST=… PGUSER=postgres npm run test:sql`
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

## 로그인 방식

| 방식 | 설정 (`config/*.json` 의 `auth`) | 내용 |
|---|---|---|
| 기관 공용 계정 | `shared` (기본) | 기기마다 공용 서버 계정으로 한 번 로그인 → 직원 로그인은 화면 안에서 확인. 지금 운영(도쿄) |
| 직원별 계정 | `staff` | 직원마다 서버 계정. 서버가 비밀번호·사용 여부·기관·역할을 확인하고, 데이터 변경을 기록. 새 서버(서울) |

직원별 계정 방식에서 직원 서버 계정의 이메일은 `s<직원번호>.<작업공간>@smartcare.invalid` 형식의 내부용 주소입니다. 직원은 지금처럼 소속기관 + 사번(또는 Gmail)으로 로그인합니다.

## 새 서버(서울) 설정 순서

1. SQL Editor에서 `supabase/schema-next.sql` 실행
2. 서버 함수 등록: Edge Functions › Deploy a new function › Via Editor → 이름 `smartcare-staff`, 내용은 `supabase/functions/smartcare-staff/index.ts`
3. 첫 시스템 관리자: Authentication › Users › Add user 로 `s99.smartcare@smartcare.invalid` 생성(Auto Confirm) 후 `schema-next.sql` 맨 아래 문장 다시 실행
4. `https://data140.github.io/smartcare/next/` 에서 시스템 관리자(`admin`)로 로그인 → 비밀번호 변경
