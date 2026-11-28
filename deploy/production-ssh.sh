#!/bin/sh
# Root-owned forced command; the deployment account has no Docker/group access.
set -eu
case "${SSH_ORIGINAL_COMMAND:-}" in
    "deploy-blog "*) exec sudo -n /usr/local/sbin/hamghadam-blog-deploy main "${SSH_ORIGINAL_COMMAND#deploy-blog }" ;;
esac
exec sudo -n /usr/local/sbin/hamghadam-deploy "${SSH_ORIGINAL_COMMAND:-}"
