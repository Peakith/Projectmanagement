#!/usr/bin/env bash
# Bundelt alle migraties tot één bestand voor de Supabase SQL Editor (zonder terminal/CLI).
# Gebruik: bash scripts/build-install-sql.sh  -> supabase/install-alles.sql
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/supabase/install-alles.sql"
{
  echo "-- ============================================================================"
  echo "-- Studio Brutaal — volledige database-installatie in één keer."
  echo "-- GEGENEREERD uit supabase/migrations/ door scripts/build-install-sql.sh; niet met de hand wijzigen."
  echo "--"
  echo "-- Gebruik: Supabase → SQL Editor → New query → plak dit hele bestand → Run."
  echo "-- Alleen uitvoeren op een NIEUW (leeg) project. Alles gebeurt in één transactie:"
  echo "-- bij een fout wordt niets half aangemaakt."
  echo "-- ============================================================================"
  echo
  echo "begin;"
  echo
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo "-- >>> $(basename "$f")"
    cat "$f"
    echo
  done
  echo "-- Registreer de migraties, zodat 'supabase db push' ze later niet opnieuw uitvoert."
  echo "create schema if not exists supabase_migrations;"
  echo "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    b="$(basename "$f" .sql)"
    echo "insert into supabase_migrations.schema_migrations (version, name) values ('${b%%_*}', '${b#*_}') on conflict (version) do nothing;"
  done
  echo
  echo "commit;"
} > "$OUT"
echo "Geschreven: $OUT ($(wc -l < "$OUT") regels)"
