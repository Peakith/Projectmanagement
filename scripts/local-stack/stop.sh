#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/env.sh"
for s in gateway postgrest gotrue; do
  [ -f "$STACK_DIR/$s.pid" ] && kill "$(cat "$STACK_DIR/$s.pid")" 2>/dev/null; rm -f "$STACK_DIR/$s.pid"
done
[ -f "$PG_DATA/PG_VERSION" ] && "$HERE/run-as-pg.sh" "$PG_BIN/pg_ctl" -D "$PG_DATA" -m fast stop >/dev/null 2>&1
echo "Lokale stack gestopt."
