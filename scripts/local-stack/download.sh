#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
mkdir -p "$BIN_DIR"
if [ ! -x "$BIN_DIR/postgrest" ]; then
  echo "PostgREST $POSTGREST_VERSION downloaden..."
  curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz" | tar xJ -C "$BIN_DIR"
fi
if [ ! -x "$BIN_DIR/gotrue/auth" ]; then
  echo "Supabase Auth (GoTrue) $GOTRUE_VERSION downloaden..."
  mkdir -p "$BIN_DIR/gotrue"
  curl -fsSL "https://github.com/supabase/auth/releases/download/$GOTRUE_VERSION/auth-$GOTRUE_VERSION-x86.tar.gz" | tar xz -C "$BIN_DIR/gotrue"
fi
