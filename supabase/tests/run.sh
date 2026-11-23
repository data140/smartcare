#!/usr/bin/env bash
# 새 서버 권한 규칙 시험 (로컬 PostgreSQL 필요): PGHOST=... PGPORT=... PGUSER=postgres bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
psql -v ON_ERROR_STOP=1 -q -c "drop database if exists smartcare_rls_test" -c "create database smartcare_rls_test"
out=$(psql -v ON_ERROR_STOP=1 -q -d smartcare_rls_test -f supabase-stub.sql -f ../schema-next.sql -f ../schema-next.sql -f rls-test.sql 2>&1)
echo "$out" | sed -n '/결과/,$p'
psql -q -c "drop database smartcare_rls_test"
echo "$out" | grep -A2 '실패 수' | tail -1 | grep -qE '^\s*0\s*$'
