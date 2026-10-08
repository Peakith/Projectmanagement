# Gedeelde instellingen voor de lichte lokale stack (alleen ontwikkeling/CI).
# Gebruikt dezelfde JWT-secret en poorten als de Supabase CLI, zodat .env.local
# voor beide varianten gelijk is.
STACK_DIR="${STACK_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.local-stack}"
BIN_DIR="$STACK_DIR/bin"
PG_DATA="$STACK_DIR/pgdata"
PG_PORT="${PG_PORT:-54322}"
GOTRUE_PORT="${GOTRUE_PORT:-54331}"
POSTGREST_PORT="${POSTGREST_PORT:-54332}"
GATEWAY_PORT="${GATEWAY_PORT:-54321}"
JWT_SECRET="${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"
SITE_URL="${SITE_URL:-http://localhost:3000}"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
POSTGREST_VERSION="v12.2.3"
GOTRUE_VERSION="v2.170.0"
DB_URL="postgresql://postgres:postgres@127.0.0.1:$PG_PORT/postgres"
