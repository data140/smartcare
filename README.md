# 스마트케어 프로세스 (사회사업실)

운영 주소: https://data140.github.io/smartcare/

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `src/app.js` | 앱 동작 코드 (화면 상태·저장·서버 동기화) |
| `src/page.html` | 화면 구성 (HTML). `<!--#include … -->` 자리에 스타일·코드가 들어감 |
| `src/styles/` | `app.css`(앱 스타일), `nocturne.css`(디자인 기본값), `phosphor-*.css`(아이콘) |
| `src/bundle/` | 묶음 파일 껍데기와 글꼴·라이브러리 묶음 (보통 고치지 않음) |
| `config/` | 데이터 서버 주소·공개 키·로그인 방식 (`prod.json` 운영 = 서울, `next.json` 새 서버 화면, `migrate-src.json` 데이터 이전 원본 = 도쿄) |
| `supabase/schema.sql` | 운영 서버(도쿄) 보안 구성 — 기관 공용 계정 |
| `supabase/schema-next.sql` | 새 서버(서울) 구성 — 직원별 계정 · 기관/역할별 권한 · 감사 기록 |
| `supabase/functions/smartcare-staff/` | 계정 관리 서버 함수 (직원 계정 만들기·비밀번호·권한) |
| `supabase/functions/smartcare-ai/` | AI 비서 서버 함수 (Claude 에 자유 질문) |
| `supabase/tests/` | 서버 권한 규칙 시험 (로컬 PostgreSQL) |
| `tools/` | 빌드·개발 서버·가상 데이터 |
| `tests/smoke.js` · `tests/smoke-staff.js` · `tests/migrate.js` | 화면 동작 시험 (공용 계정 방식 · 직원별 계정 방식 · 데이터 이전) |
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

## 데이터 이전 (운영 서버 → 새 서버)

새 서버 화면에서 시스템 관리자로 로그인 → **설정 › 데이터 이전**

1. 원본 서버(운영) 공용 계정으로 연결 → 옮길 데이터·직원 수 미리 보기
2. **리허설 이전**: 원본은 그대로 두고 옮겨 본 뒤 확인 → **새 서버 데이터 비우기**
3. **최종 이전**: 원본 서버에 저장 멈춤 표시(`smartcare.appver.v1` = 9999999999)를 기록 → 원본 화면은 1분 안에 저장을 멈춤 → 70초 뒤 복사
4. 직원마다 새 서버 계정과 임시 비밀번호 발급 → 목록 복사 후 각자 전달 (첫 로그인 때 변경)
5. 중단해야 하면 **원본 서버 저장 다시 허용**

데이터는 브라우저에서 원본 → 새 서버로 바로 옮기며 파일로 내려받지 않습니다. 새 서버 직원 명부에는 비밀번호를 옮기지 않습니다.

## AI 비서 (Claude)

화면의 AI 비서는 정해진 질문(오늘 할 일·미비사항·통계·환자 이력·사용법)은 화면에서 바로 답하고, 그 밖의 자유 질문은 서버 함수 `smartcare-ai` 를 거쳐 Claude(`claude-opus-5-5`)에게 묻습니다.

- 화면이 보내는 시스템 데이터는 환자 이름을 '환자A' 처럼 가린 요약본이며, 답변의 가명은 화면이 실명으로 되돌립니다.
- 로그인한 직원만 사용, 한 사람당 하루 질문 수 제한(기본 60회, 함수 비밀값 `SMARTCARE_AI_DAILY_LIMIT`).
- 질문 내용은 저장하지 않고 감사 기록에 글자 수·사용량만 남깁니다.

설정: Edge Functions › Deploy a new function › Via Editor → 이름 `smartcare-ai`, 내용 `supabase/functions/smartcare-ai/index.ts` → **Verify JWT 끄기** → Edge Functions › Secrets 에 `ANTHROPIC_API_KEY` 추가 → 화면 AI 비서의 설정(시스템 관리자)에서 연결 주소 저장.

## 서버 전환 (도쿄 → 서울)

운영 설정(`config/prod.json`)을 서울 서버 · 직원별 계정 방식으로 바꾼 빌드를 배포합니다.

- 직원 브라우저에서 새 운영 화면을 처음 열면, 예전 서버의 화면 데이터·로그인 정보를 비우고(`sc.server.v1` 기록 비교) 서울 서버에서 다시 받습니다. 화면 설정(테마 등)은 남깁니다.
- 전환 전에 열려 있던 예전 화면은 도쿄 서버의 저장 멈춤 표시 때문에 저장하지 못하고 새로고침을 요구합니다.
- 운영 화면에서는 데이터 이전 메뉴가 보이지 않습니다 (원본 = 자기 자신).

전환 당일 순서: 새 서버 화면에서 **최종 이전** → 전환 PR 병합 → 운영 주소에서 시스템 관리자 로그인 확인 → 직원 임시 비밀번호 전달
