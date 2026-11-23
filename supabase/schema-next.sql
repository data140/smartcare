-- 스마트케어 새 데이터 서버 (서울) — 직원별 계정 · 기관/역할별 권한 · 감사 기록
-- Supabase SQL Editor 에 붙여 넣고 Run 하세요. 여러 번 실행해도 안전합니다.
--
-- 구조
--   smartcare_kv     화면 데이터 (키 = '<작업공간>:<저장 키>')
--   smartcare_staff  서버가 믿는 직원 정보 (기관·역할·사용 여부). 계정 관리 함수만 바꿀 수 있음
--   smartcare_audit  누가 언제 어떤 데이터를 바꿨는지 (자동 기록)
--
-- 직원 서버 계정의 이메일은 내부용 주소 s<직원번호>.<작업공간>@smartcare.invalid 입니다.
-- (.invalid 는 메일이 갈 수 없는 예약 도메인 — 직원은 지금처럼 기관 + 사번/Gmail 로 로그인)

-- ───────────────────────── 테이블 ─────────────────────────
create table if not exists smartcare_kv (
  k text primary key,
  v text,
  updated_at timestamptz default now(),
  updated_by uuid default auth.uid()
);
alter table smartcare_kv enable row level security;

create table if not exists smartcare_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ws text not null,
  roster_id integer not null,
  org text not null,                       -- 기관 ID, '*' = 시스템 관리자
  emp_no text not null default '',
  gmail text not null default '',
  name text not null default '',
  roles text[] not null default '{}',      -- 관리자 · 담당자 · 보조 · 조회 · 시스템관리자
  status text not null default '활성',
  valid_from date,
  valid_to date,
  must_change boolean not null default true,
  last_login timestamptz,
  updated_at timestamptz not null default now(),
  unique (ws, roster_id)
);
alter table smartcare_staff enable row level security;

create table if not exists smartcare_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  ws text,
  action text not null,                    -- insert · update · delete · login
  k text,
  size integer,
  detail jsonb
);
alter table smartcare_audit enable row level security;
create index if not exists smartcare_audit_ws_at on smartcare_audit (ws, at desc);

-- ───────────────────────── 함수 ─────────────────────────
-- 직원 서버 계정 이메일 (계정 관리 함수와 같은 규칙)
create or replace function smartcare_staff_email(p_ws text, p_roster_id integer)
returns text language sql immutable as $$
  select 's' || p_roster_id || '.' || p_ws || '@smartcare.invalid';
$$;

-- 지금 로그인한 직원 (사용 중 · 기간 안일 때만)
create or replace function smartcare_me_row(p_ws text)
returns smartcare_staff language sql stable security definer set search_path = public as $$
  select * from smartcare_staff
  where user_id = auth.uid() and ws = p_ws and status = '활성'
    and (valid_from is null or valid_from <= current_date)
    and (valid_to is null or valid_to >= current_date)
  limit 1;
$$;

create or replace function smartcare_is_member(p_ws text)
returns boolean language sql stable security definer set search_path = public as $$
  select (smartcare_me_row(p_ws)).user_id is not null;
$$;

create or replace function smartcare_me(p_ws text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when s.user_id is null then null else jsonb_build_object(
    'roster_id', s.roster_id, 'org', s.org, 'roles', to_jsonb(s.roles), 'name', s.name, 'must_change', s.must_change) end
  from (select (smartcare_me_row(p_ws)).*) s;
$$;

-- 저장 키가 어느 기관 것인지: 'smartcare.o.<기관>.*' = 그 기관, 공용 키 = '*', 나머지 = 'ORG1'
create or replace function smartcare_key_org(p_rest text)
returns text language sql immutable as $$
  select case
    when p_rest like 'smartcare.o.%' then split_part(p_rest, '.', 3)
    when p_rest like 'smartcare.chart.%' then '*'
    when p_rest in ('smartcare.roster.v1', 'smartcare.orgs.v1', 'smartcare.viewMode.v1', 'smartcare.menu.v1',
                    'smartcare.menuCollapsed.v1', 'smartcare.menuMini.v1', 'smartcare.kpiView.v1', 'smartcare.sbW.v1',
                    'smartcare.flowView.v1', 'smartcare.ptCols.v1', 'smartcare.emrCols.v1', 'smartcare.cformLib.v1',
                    'smartcare.approval.v1', 'smartcare.theme.v1', 'smartcare.cformMargin.v1', 'smartcare.appver.v1') then '*'
    else 'ORG1'
  end;
$$;

-- 읽기: 사용 중인 직원 + (공용 키 · 시스템 관리자 · 자기 기관 키)
create or replace function smartcare_can_read(p_k text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  ws text := split_part(p_k, ':', 1);
  me smartcare_staff;
  org text;
begin
  me := smartcare_me_row(ws);
  if me.user_id is null then return false; end if;
  org := smartcare_key_org(substr(p_k, length(ws) + 2));
  return org = '*' or me.org = '*' or me.org = org;
end $$;

-- 쓰기: 읽을 수 있고, '조회' 외의 역할이 하나라도 있을 때
create or replace function smartcare_can_write(p_k text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me smartcare_staff;
begin
  if not smartcare_can_read(p_k) then return false; end if;
  me := smartcare_me_row(split_part(p_k, ':', 1));
  return exists (select 1 from unnest(me.roles) r where r <> '조회');
end $$;

-- 관리자 여부 (감사 기록 조회용)
create or replace function smartcare_is_admin(p_ws text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select r.roles && array['관리자', '시스템관리자'] from (select (smartcare_me_row(p_ws)).*) r), false);
$$;

-- 로그인 화면용 (로그인 전 호출): 서버 계정 이메일 찾기
-- 없는 계정이어도 같은 모양의 주소를 돌려줘, 계정이 있는지 알아낼 수 없게 함
create or replace function smartcare_login_email(p_ws text, p_mode text, p_org text, p_id text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select smartcare_staff_email(s.ws, s.roster_id) from smartcare_staff s
     where s.ws = p_ws and coalesce(p_id, '') <> '' and (
       (p_mode = 'sys' and s.org = '*' and s.emp_no = p_id) or
       (p_mode = 'emp' and s.org = p_org and s.emp_no = p_id) or
       (p_mode = 'gmail' and s.org = p_org and lower(s.gmail) = lower(p_id)))
     limit 1),
    'x' || substr(md5(coalesce(p_ws, '') || '|' || coalesce(p_mode, '') || '|' || coalesce(p_org, '') || '|' || coalesce(p_id, '')), 1, 16) || '@smartcare.invalid');
$$;

-- 로그인 화면용 (로그인 전 호출): 기관 목록 (ID·이름만)
create or replace function smartcare_login_orgs(p_ws text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e->>'id', 'name', e->>'name')), '[]'::jsonb)
  from smartcare_kv kv, jsonb_array_elements(case when jsonb_typeof(kv.v::jsonb) = 'array' then kv.v::jsonb else '[]'::jsonb end) e
  where kv.k = p_ws || ':smartcare.orgs.v1';
$$;

-- 로그인 기록
create or replace function smartcare_touch_login(p_ws text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not smartcare_is_member(p_ws) then return; end if;
  update smartcare_staff set last_login = now() where user_id = auth.uid() and ws = p_ws;
  insert into smartcare_audit (user_id, ws, action) values (auth.uid(), p_ws, 'login');
end $$;

-- 데이터 변경 자동 기록 (내용은 남기지 않고 키·크기만)
create or replace function smartcare_audit_kv()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  key text;
  sz integer;
begin
  if tg_op = 'DELETE' then key := old.k; sz := 0;
  else key := new.k; sz := length(coalesce(new.v, ''));
  end if;
  insert into smartcare_audit (user_id, ws, action, k, size)
  values (auth.uid(), split_part(key, ':', 1), lower(tg_op), key, sz);
  return null;
end $$;
drop trigger if exists smartcare_kv_audit on smartcare_kv;
create trigger smartcare_kv_audit after insert or update or delete on smartcare_kv
  for each row execute function smartcare_audit_kv();

-- ───────────────────────── 권한 규칙 (RLS) ─────────────────────────
drop policy if exists "kv read" on smartcare_kv;
drop policy if exists "kv insert" on smartcare_kv;
drop policy if exists "kv update" on smartcare_kv;
drop policy if exists "kv delete" on smartcare_kv;
create policy "kv read" on smartcare_kv for select to authenticated using (smartcare_can_read(k));
create policy "kv insert" on smartcare_kv for insert to authenticated with check (smartcare_can_write(k));
create policy "kv update" on smartcare_kv for update to authenticated using (smartcare_can_write(k)) with check (smartcare_can_write(k));
create policy "kv delete" on smartcare_kv for delete to authenticated using (smartcare_can_write(k));

drop policy if exists "staff read own" on smartcare_staff;
create policy "staff read own" on smartcare_staff for select to authenticated using (user_id = auth.uid());
-- 직원 정보 추가·수정·삭제는 계정 관리 함수(서버 키)만 가능 — 정책 없음

drop policy if exists "audit read admin" on smartcare_audit;
create policy "audit read admin" on smartcare_audit for select to authenticated using (smartcare_is_admin(ws));

-- ───────────────────────── 접근 권한 ─────────────────────────
revoke all on smartcare_kv, smartcare_staff, smartcare_audit from anon;
revoke all on sequence smartcare_audit_id_seq from anon, authenticated;
grant select, insert, update, delete on smartcare_kv to authenticated;
grant select on smartcare_staff, smartcare_audit to authenticated;

revoke all on function smartcare_me_row(text), smartcare_is_member(text), smartcare_me(text), smartcare_can_read(text),
  smartcare_can_write(text), smartcare_is_admin(text), smartcare_touch_login(text), smartcare_audit_kv(),
  smartcare_login_email(text, text, text, text), smartcare_login_orgs(text) from public, anon;
grant execute on function smartcare_is_member(text), smartcare_me(text), smartcare_can_read(text), smartcare_can_write(text),
  smartcare_is_admin(text), smartcare_touch_login(text), smartcare_me_row(text) to authenticated;
grant execute on function smartcare_login_email(text, text, text, text), smartcare_login_orgs(text) to anon, authenticated;

-- ───────────────────────── 첫 시스템 관리자 ─────────────────────────
-- 1) Authentication › Users › Add user › Create new user
--      이메일 s99.smartcare@smartcare.invalid · 비밀번호 직접 지정 · Auto Confirm User 켜기
-- 2) 아래를 실행 (로그인: 로그인 방식 '시스템 관리자' · ID admin · 위 비밀번호)
insert into smartcare_staff (user_id, ws, roster_id, org, emp_no, name, roles, must_change)
select id, 'smartcare', 99, '*', 'admin', '시스템 관리자', array['시스템관리자'], true
from auth.users where email = 's99.smartcare@smartcare.invalid'
on conflict (user_id) do nothing;
