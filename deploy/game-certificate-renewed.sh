#!/bin/sh
set -eu
if [ "${RENEWED_LINEAGE:-}" = "/etc/letsencrypt/live/game.hmghadam.com" ]; then
    nginx -t
    systemctl reload nginx
fi
