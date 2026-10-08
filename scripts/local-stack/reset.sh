#!/usr/bin/env bash
# Verwijdert de lokale database volledig en bouwt hem opnieuw op (alleen lokaal!).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/env.sh"
"$HERE/stop.sh"
rm -rf "$PG_DATA"
"$HERE/start.sh"
