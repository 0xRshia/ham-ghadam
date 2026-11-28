#!/bin/sh
# Root-owned forced command; this account only controls the isolated stage stack.
set -eu
case "${SSH_ORIGINAL_COMMAND:-}" in
    "deploy-blog "*) exec sudo -n /usr/local/sbin/hamghadam-blog-deploy stage "${SSH_ORIGINAL_COMMAND#deploy-blog }" ;;
esac
exec sudo -n /usr/local/sbin/hamghadam-stage-deploy --config /etc/hamghadam-stage-deploy/config.json "${SSH_ORIGINAL_COMMAND:-}"
