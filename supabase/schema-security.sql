-- 스마트케어 보안 경보 2단계 (서버 쪽 로그인 실패·접속 IP 감시) — schema-next.sql 적용 후 SQL Editor 에서 실행
-- 여러 번 실행해도 안전합니다.

-- 보안 사건 기록: 로그인 실패·성공(접속 IP), 경보 (환자 정보는 들어가지 않음)
create table if not exists smartcare_sec_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  ws text not null,
  kind text not null,               -- login_fail · login_ok · alert
  level text,                       -- alert 일 때만: warn · crit
  ip text,
  acct text,                        -- 로그인 시도한 계정(서버 계정 주소의 앞부분)
  user_id uuid,
  title text,
  detail text
);
alter table smartcare_sec_events enable row level security;
create index if not exists smartcare_sec_events_ws_at on smartcare_sec_events (ws, at desc);
create index if not exists smartcare_sec_events_ip_at on smartcare_sec_events (ws, ip, at desc);

-- 알림 받을 사람과 감지 기준 (작업공간당 1행)
create table if not exists smartcare_sec_cfg (
  ws text primary key,
  emails text[] not null default '{}',
  phones text[] not null default '{}',
  fail_ip integer not null default 10,      -- 같은 IP 에서 로그인 실패 N회
  fail_acct integer not null default 5,     -- 같은 계정 로그인 실패 N회
  window_min integer not null default 10,   -- 위 횟수를 세는 시간(분)
  new_ip_notify boolean not null default false,  -- 처음 보는 IP 로그인도 알림(주의)
  updated_at timestamptz not null default now()
);
alter table smartcare_sec_cfg enable row level security;

drop policy if exists "sec events read admin" on smartcare_sec_events;
create policy "sec events read admin" on smartcare_sec_events for select to authenticated using (smartcare_is_admin(ws));
drop policy if exists "sec cfg read admin" on smartcare_sec_cfg;
create policy "sec cfg read admin" on smartcare_sec_cfg for select to authenticated using (smartcare_is_admin(ws));
-- 쓰기는 보안 서버 함수(smartcare-security, 서버 키)만 가능 — 정책 없음

revoke all on smartcare_sec_events, smartcare_sec_cfg from anon;
revoke all on sequence smartcare_sec_events_id_seq from anon, authenticated;
grant select on smartcare_sec_events, smartcare_sec_cfg to authenticated;
grant all on smartcare_sec_events, smartcare_sec_cfg to service_role;
grant usage, select on sequence smartcare_sec_events_id_seq to service_role;
