-- 새 서버 권한 규칙 시험: psql -v ON_ERROR_STOP=1 -f supabase-stub.sql -f ../schema-next.sql -f rls-test.sql
\set QUIET on
-- 시험 계정: 시스템 관리자, ORG1 관리자, ORG1 조회 전용, ORG2 담당자, 중지된 직원, 직원 아님
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000099', 's99.smartcare@smartcare.invalid'),
  ('00000000-0000-0000-0000-000000000001', 's1.smartcare@smartcare.invalid'),
  ('00000000-0000-0000-0000-000000000002', 's2.smartcare@smartcare.invalid'),
  ('00000000-0000-0000-0000-000000000011', 's11.smartcare@smartcare.invalid'),
  ('00000000-0000-0000-0000-000000000004', 's4.smartcare@smartcare.invalid'),
  ('00000000-0000-0000-0000-000000000077', 'outsider@smartcare.invalid');
insert into smartcare_staff (user_id, ws, roster_id, org, emp_no, gmail, name, roles, status) values
  ('00000000-0000-0000-0000-000000000001', 'smartcare', 1, 'ORG1', '100101', 'a@example.test', '관리자1', '{관리자}', '활성'),
  ('00000000-0000-0000-0000-000000000002', 'smartcare', 2, 'ORG1', '100102', '', '조회1', '{조회}', '활성'),
  ('00000000-0000-0000-0000-000000000011', 'smartcare', 11, 'ORG2', '1111', '', '담당2', '{담당자}', '활성'),
  ('00000000-0000-0000-0000-000000000004', 'smartcare', 4, 'ORG1', '100104', '', '중지1', '{담당자}', '중지');
-- 첫 시스템 관리자 등록 (schema-next.sql 끝부분과 같은 문장 — 시험 계정을 만든 뒤 다시 실행)
insert into smartcare_staff (user_id, ws, roster_id, org, emp_no, name, roles, must_change)
select id, 'smartcare', 99, '*', 'admin', '시스템 관리자', array['시스템관리자'], true
from auth.users where email = 's99.smartcare@smartcare.invalid'
on conflict (user_id) do nothing;
insert into smartcare_kv (k, v) values
  ('smartcare:smartcare.patients.v1', '[{"id":"ORG1환자"}]'),
  ('smartcare:smartcare.o.ORG2.patients.v1', '[{"id":"ORG2환자"}]'),
  ('smartcare:smartcare.roster.v1', '[]'),
  ('smartcare:smartcare.orgs.v1', '[{"id":"ORG1","name":"가기관","extra":"x"},{"id":"ORG2","name":"나기관"}]');

create temp table results (name text, got text, want text);
grant all on results to anon, authenticated, service_role;

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid, ''), false);
  if uid is null then set role anon; else set role authenticated; end if;
end $$;

-- 읽기 범위
reset role; select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into results select 'ORG1 관리자 읽기', string_agg(k, ',' order by k), 'smartcare:smartcare.orgs.v1,smartcare:smartcare.patients.v1,smartcare:smartcare.roster.v1' from smartcare_kv;
reset role; select pg_temp.as_user('00000000-0000-0000-0000-000000000011');
insert into results select 'ORG2 담당자 읽기', string_agg(k, ',' order by k), 'smartcare:smartcare.o.ORG2.patients.v1,smartcare:smartcare.orgs.v1,smartcare:smartcare.roster.v1' from smartcare_kv;
reset role; select pg_temp.as_user('00000000-0000-0000-0000-000000000099');
insert into results select '시스템 관리자 읽기(전체 4)', count(*)::text, '4' from smartcare_kv;
reset role; select pg_temp.as_user('00000000-0000-0000-0000-000000000004');
insert into results select '중지된 직원 읽기', count(*)::text, '0' from smartcare_kv;
reset role; select pg_temp.as_user('00000000-0000-0000-0000-000000000077');
insert into results select '직원 아닌 계정 읽기', count(*)::text, '0' from smartcare_kv;

-- 쓰기
reset role; select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into smartcare_kv (k, v) values ('smartcare:smartcare.plans.v1', '[]');
insert into results select 'ORG1 관리자 쓰기', count(*)::text, '1' from smartcare_kv where k = 'smartcare:smartcare.plans.v1';
do $$ begin
  insert into smartcare_kv (k, v) values ('smartcare:smartcare.o.ORG2.plans.v1', '[]');
  insert into results values ('ORG1 관리자 → ORG2 키 쓰기', '허용됨', '거부');
exception when insufficient_privilege then insert into results values ('ORG1 관리자 → ORG2 키 쓰기', '거부', '거부'); end $$;

reset role; select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
do $$ begin
  insert into smartcare_kv (k, v) values ('smartcare:smartcare.memo.v1', 'x');
  insert into results values ('조회 전용 쓰기', '허용됨', '거부');
exception when insufficient_privilege then insert into results values ('조회 전용 쓰기', '거부', '거부'); end $$;
update smartcare_kv set v = 'hack' where k = 'smartcare:smartcare.patients.v1';
reset role;
insert into results select '조회 전용 수정(변경 없어야 함)', v, '[{"id":"ORG1환자"}]' from smartcare_kv where k = 'smartcare:smartcare.patients.v1';

-- 직원 정보는 함수만 수정 가능
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
do $$ begin
  update smartcare_staff set roles = '{시스템관리자}' where user_id = auth.uid();
  insert into results values ('직원 정보 스스로 수정', case when found then '허용됨' else '거부' end, '거부');
exception when insufficient_privilege then insert into results values ('직원 정보 스스로 수정', '거부', '거부'); end $$;

-- 로그인 전(anon)
reset role; select pg_temp.as_user(null);
do $$ begin
  perform count(*) from smartcare_kv;
  insert into results values ('로그인 전 데이터 읽기', '허용됨', '거부');
exception when insufficient_privilege then insert into results values ('로그인 전 데이터 읽기', '거부', '거부'); end $$;
insert into results select '로그인 이메일(사번)', smartcare_login_email('smartcare', 'emp', 'ORG1', '100101'), 's1.smartcare@smartcare.invalid';
insert into results select '로그인 이메일(Gmail)', smartcare_login_email('smartcare', 'gmail', 'ORG1', 'A@example.test'), 's1.smartcare@smartcare.invalid';
insert into results select '로그인 이메일(시스템 관리자)', smartcare_login_email('smartcare', 'sys', '', 'admin'), 's99.smartcare@smartcare.invalid';
insert into results select '없는 사번은 가짜 주소', (smartcare_login_email('smartcare', 'emp', 'ORG1', '999') like 'x%@smartcare.invalid')::text, 'true';
insert into results select '로그인 화면 기관 목록', smartcare_login_orgs('smartcare')::text, '[{"id": "ORG1", "name": "가기관"}, {"id": "ORG2", "name": "나기관"}]';
do $$ begin
  perform smartcare_me('smartcare');
  insert into results values ('로그인 전 smartcare_me', '허용됨', '거부');
exception when insufficient_privilege then insert into results values ('로그인 전 smartcare_me', '거부', '거부'); end $$;

-- 내 정보 · 로그인 기록 · 감사 기록
reset role; select pg_temp.as_user('00000000-0000-0000-0000-000000000011');
insert into results select '내 정보', smartcare_me('smartcare')->>'org', 'ORG2';
select smartcare_touch_login('smartcare');
insert into results select '감사 기록: 담당자는 못 봄', count(*)::text, '0' from smartcare_audit;
reset role; select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into results select '감사 기록: 관리자는 봄(쓰기 1 + 로그인 1 이상)', (count(*) >= 2)::text, 'true' from smartcare_audit;
reset role;
insert into results select '감사 기록에 작성자 남음', (count(*) = 1)::text, 'true' from smartcare_audit where action = 'insert' and k = 'smartcare:smartcare.plans.v1' and user_id = '00000000-0000-0000-0000-000000000001';

-- 서버 함수(service_role): 직원 정보·감사 기록을 읽고 쓸 수 있어야 함
reset role; set role service_role;
insert into results select '서버 함수: 직원 정보 읽기', count(*)::text, '5' from smartcare_staff;
update smartcare_staff set must_change = false where roster_id = 1;
insert into smartcare_audit (ws, action) values ('smartcare', 'staff.test');
insert into results select '서버 함수: 직원 정보 수정·감사 기록 추가', (count(*) = 1)::text, 'true' from smartcare_audit where action = 'staff.test';
reset role;

-- 보안 경보 2단계 테이블
reset role; set role service_role;
insert into smartcare_sec_events (ws, kind, ip, acct) values ('smartcare', 'login_fail', '203.0.113.9', 's1.smartcare');
insert into smartcare_sec_cfg (ws, emails) values ('smartcare', array['a@example.com']);
reset role; select pg_temp.as_user('00000000-0000-0000-0000-000000000011');
insert into results select '보안 기록: 담당자는 못 봄', (select count(*) from smartcare_sec_events)::text || '/' || (select count(*) from smartcare_sec_cfg)::text, '0/0';
reset role; select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into results select '보안 기록: 관리자는 봄', (select count(*) from smartcare_sec_events)::text || '/' || (select count(*) from smartcare_sec_cfg)::text, '1/1';
do $$ begin
  insert into smartcare_sec_events (ws, kind) values ('smartcare', 'alert');
  insert into results values ('보안 기록: 관리자도 직접 쓰기 불가', '허용됨', '거부');
exception when insufficient_privilege then insert into results values ('보안 기록: 관리자도 직접 쓰기 불가', '거부', '거부'); end $$;
insert into results select '계정 이름 목록: 기관 관리자는 자기 기관+시스템 계정만(ORG2 직원 제외)', count(*)::text || '/' || count(*) filter (where org = 'ORG2')::text, '4/0' from smartcare_sec_names('smartcare');
reset role; select pg_temp.as_user('00000000-0000-0000-0000-000000000011');
insert into results select '계정 이름 목록: 담당자는 못 봄', count(*)::text, '0' from smartcare_sec_names('smartcare');
reset role;
reset role; set role anon;
do $$ begin
  perform count(*) from smartcare_sec_events;
  insert into results values ('보안 기록: 로그인 전 읽기 불가', '허용됨', '거부');
exception when insufficient_privilege then insert into results values ('보안 기록: 로그인 전 읽기 불가', '거부', '거부'); end $$;
reset role;

\set QUIET off
select case when got is not distinct from want then '✓' else '✗' end as "결과", name as "항목", got as "실제", want as "기대" from results;
select count(*) filter (where got is distinct from want) as "실패 수" from results;
