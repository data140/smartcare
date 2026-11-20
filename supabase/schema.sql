-- 스마트케어 데이터 서버 (Supabase) — 보안 구성
-- 서버 데이터는 "작업공간에 등록된 서버 계정"으로 로그인한 기기만 읽고 쓸 수 있습니다 (RLS).
-- SQL Editor에 붙여 넣고 Run 하세요. 여러 번 실행해도 안전합니다.

-- 1) 데이터 테이블
create table if not exists smartcare_kv (
  k text primary key,
  v text,
  updated_at timestamptz default now()
);
alter table smartcare_kv enable row level security;

-- 2) 예전 "누구나 읽기·쓰기" 정책 제거
drop policy if exists "smartcare test access" on smartcare_kv;

-- 3) 작업공간 구성원: 어떤 서버 계정이 어떤 작업공간 데이터에 접근하는지
create table if not exists smartcare_members (
  ws text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (ws, user_id)
);
alter table smartcare_members enable row level security;
drop policy if exists "members read own" on smartcare_members;
create policy "members read own" on smartcare_members
  for select to authenticated using (user_id = auth.uid());

-- 4) 로그인한 계정이 작업공간 구성원인지 확인
create or replace function smartcare_is_member(p_ws text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from smartcare_members where ws = p_ws and user_id = auth.uid());
$$;
revoke all on function smartcare_is_member(text) from public, anon;
grant execute on function smartcare_is_member(text) to authenticated;

-- 5) 키 앞부분(작업공간 코드)이 내 작업공간일 때만 읽기·쓰기·삭제
drop policy if exists "kv members only" on smartcare_kv;
create policy "kv members only" on smartcare_kv
  for all to authenticated
  using (smartcare_is_member(split_part(k, ':', 1)))
  with check (smartcare_is_member(split_part(k, ':', 1)));

-- 6) 로그인하지 않은 요청(공개 키만 가진 요청)은 차단
revoke all on smartcare_kv from anon;
revoke all on smartcare_members from anon;
grant select, insert, update, delete on smartcare_kv to authenticated;
grant select on smartcare_members to authenticated;

-- 7) 공용 서버 계정 등록
--    먼저 Authentication › Users › Add user 로 계정을 만드세요 (Auto Confirm User 체크).
--    아래 이메일을 그 계정 이메일로 바꿔 실행합니다.
insert into smartcare_members (ws, user_id)
select 'smartcare', id from auth.users where email = 'shared-account@example.com'
on conflict do nothing;
