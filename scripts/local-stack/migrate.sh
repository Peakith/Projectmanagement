#!/usr/bin/env bash
# Past supabase/migrations/*.sql in volgorde toe (zoals `supabase migration up`).
set -euo pipefail
shopt -s nullglob
source "$(dirname "$0")/env.sh"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, applied_at timestamptz default now());"
for f in "$ROOT"/supabase/migrations/*.sql; do
  v="$(basename "$f" .sql)"
  done_already="$("${PSQL[@]}" -tAc "select 1 from supabase_migrations.schema_migrations where version = '$v'")"
  if [ -z "$done_already" ]; then
    echo "  migratie $v"
    "${PSQL[@]}" -1 -f "$f"
    "${PSQL[@]}" -c "insert into supabase_migrations.schema_migrations(version) values ('$v')"
  fi
done
"${PSQL[@]}" -c "notify pgrst, 'reload schema'" || true
