#!/bin/sh
set -eu

umask 077
node /app/scripts/migrate-node.mjs
exec "$@"
