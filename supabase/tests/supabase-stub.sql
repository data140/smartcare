-- 로컬 PostgreSQL 에서 Supabase 환경을 흉내 내는 최소 설정 (시험 전용 — 실제 서버에 실행하지 마세요)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- 최근 Supabase 프로젝트처럼 새 테이블에 자동 권한을 주지 않음 (schema-next.sql 이 필요한 권한을 직접 부여해야 통과)
-- 함수는 PostgreSQL 기본값대로 PUBLIC 실행 가능 (schema-next.sql 이 직접 회수)
