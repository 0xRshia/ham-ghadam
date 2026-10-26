#!/bin/sh
# Root-owned forced command; the deployment account has no Docker/group access.
set -eu
exec sudo -n /usr/local/sbin/hamghadam-deploy "${SSH_ORIGINAL_COMMAND:-}"
