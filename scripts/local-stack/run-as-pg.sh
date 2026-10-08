#!/usr/bin/env bash
# Postgres weigert als root te draaien; voer dan uit als gebruiker 'postgres'.
if [ "$(id -u)" = "0" ]; then
  exec runuser -u postgres -- "$@"
else
  exec "$@"
fi
