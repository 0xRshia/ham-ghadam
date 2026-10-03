#!/bin/sh
set -eu

case "${DATABASE_PATH:-}" in
  /*) ;;
  *) echo "DATABASE_PATH must be an absolute SQLite file path" >&2; exit 1 ;;
esac
case "${MEDIA_PATH:-}" in
  /*) ;;
  *) echo "MEDIA_PATH must be an absolute directory path" >&2; exit 1 ;;
esac

mkdir -p "$(dirname "$DATABASE_PATH")" "$MEDIA_PATH"
node /app/scripts/migrate-node.mjs
exec "$@"
