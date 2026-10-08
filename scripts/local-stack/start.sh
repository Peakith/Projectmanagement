#!/usr/bin/env bash
# Lichte, Supabase-compatibele lokale stack zonder Docker:
# PostgreSQL + Supabase Auth (GoTrue) + PostgREST + kleine API-gateway.
# Bedoeld voor Linux/CI. Op een Mac/Windows-werkplek: gebruik `npx supabase start`.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/env.sh"
ROOT="$(cd "$HERE/../.." && pwd)"
mkdir -p "$STACK_DIR/logs"
chmod 777 "$STACK_DIR" "$STACK_DIR/logs"
"$HERE/download.sh"

# 1. PostgreSQL
if [ ! -f "$PG_DATA/PG_VERSION" ]; then
  echo "PostgreSQL-cluster initialiseren..."
  mkdir -p "$PG_DATA"
  [ "$(id -u)" = "0" ] && chown postgres "$PG_DATA"
  "$HERE/run-as-pg.sh" "$PG_BIN/initdb" -D "$PG_DATA" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
fi
if ! "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PG_PORT" >/dev/null 2>&1; then
  "$HERE/run-as-pg.sh" "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$STACK_DIR/logs/postgres.log" \
    -o "-p $PG_PORT -k /tmp -c listen_addresses=127.0.0.1 -c timezone=UTC" -w start >/dev/null
fi
psql "$DB_URL" -q -X -c "alter role postgres password 'postgres'" >/dev/null
PGOPTIONS="-c client_min_messages=warning" psql "$DB_URL" -q -X -v ON_ERROR_STOP=1 -f "$HERE/bootstrap.sql" >/dev/null

# 2. Supabase Auth (voert eigen migraties uit in schema auth)
if ! curl -fs "http://127.0.0.1:$GOTRUE_PORT/health" >/dev/null 2>&1; then
  (
    cd "$BIN_DIR/gotrue"
    export GOTRUE_API_HOST=127.0.0.1 PORT="$GOTRUE_PORT" API_EXTERNAL_URL="http://127.0.0.1:$GATEWAY_PORT/auth/v1"
    export GOTRUE_DB_DRIVER=postgres DB_NAMESPACE=auth
    export GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:$PG_PORT/postgres"
    export GOTRUE_SITE_URL="$SITE_URL" GOTRUE_URI_ALLOW_LIST="$SITE_URL/**"
    export GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
    export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role
    export GOTRUE_DISABLE_SIGNUP=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=false
    export GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 GOTRUE_SMTP_ADMIN_EMAIL=noreply@localhost
    export GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_LOG_LEVEL=warn
    nohup ./auth >"$STACK_DIR/logs/gotrue.log" 2>&1 &
    echo $! >"$STACK_DIR/gotrue.pid"
  )
  for i in $(seq 1 60); do curl -fs "http://127.0.0.1:$GOTRUE_PORT/health" >/dev/null 2>&1 && break; sleep 0.5; done
  curl -fs "http://127.0.0.1:$GOTRUE_PORT/health" >/dev/null || { echo "Auth start niet; zie $STACK_DIR/logs/gotrue.log"; exit 1; }
fi

# 3. App-migraties
"$HERE/migrate.sh"

# 4. PostgREST
if ! curl -fs "http://127.0.0.1:$POSTGREST_PORT/" -o /dev/null 2>&1; then
  PGRST_DB_URI="postgres://authenticator:postgres@127.0.0.1:$PG_PORT/postgres" \
  PGRST_DB_SCHEMAS="public,finance" PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" \
  PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT="$POSTGREST_PORT" PGRST_DB_EXTRA_SEARCH_PATH="public,extensions" \
  PGRST_DB_MAX_ROWS=1000 PGRST_LOG_LEVEL=warn \
    nohup "$BIN_DIR/postgrest" >"$STACK_DIR/logs/postgrest.log" 2>&1 &
  echo $! >"$STACK_DIR/postgrest.pid"
  for i in $(seq 1 40); do curl -fs "http://127.0.0.1:$POSTGREST_PORT/" -o /dev/null 2>&1 && break; sleep 0.5; done
fi

# 5. Gateway (zelfde paden als Supabase: /auth/v1 en /rest/v1)
if ! curl -fs "http://127.0.0.1:$GATEWAY_PORT/health" >/dev/null 2>&1; then
  GATEWAY_PORT="$GATEWAY_PORT" GOTRUE_PORT="$GOTRUE_PORT" POSTGREST_PORT="$POSTGREST_PORT" JWT_SECRET="$JWT_SECRET" \
    nohup node "$HERE/gateway.mjs" >"$STACK_DIR/logs/gateway.log" 2>&1 &
  echo $! >"$STACK_DIR/gateway.pid"
  for i in $(seq 1 20); do curl -fs "http://127.0.0.1:$GATEWAY_PORT/health" >/dev/null 2>&1 && break; sleep 0.3; done
fi

node "$HERE/keys.mjs"
