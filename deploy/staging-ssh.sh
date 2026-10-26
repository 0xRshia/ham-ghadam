#!/bin/sh
# Root-owned forced command; this account only controls the isolated stage stack.
set -eu
exec sudo -n /usr/local/sbin/hamghadam-stage-deploy --config /etc/hamghadam-stage-deploy/config.json "${SSH_ORIGINAL_COMMAND:-}"
