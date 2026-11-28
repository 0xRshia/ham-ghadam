#!/bin/sh
# One-time host setup. The first blog release is triggered by GitHub Actions.
set -eu
test "$(id -u)" = 0
command -v skopeo >/dev/null
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
config=/etc/hamghadam-blog-deploy
install -d -m 0700 "$config"
install -m 0755 "$repo/blog/deploy/release.py" /usr/local/sbin/hamghadam-blog-deploy

for branch in stage main; do
    case "$branch" in
        main) project=hmghadam-blog; account=hamghadam-deploy; gateway=production-ssh.sh; compose=compose.yaml ;;
        stage) project=hmghadam-blog-stage; account=hamghadam-stage-deploy; gateway=staging-ssh.sh; compose=compose.stage.yaml ;;
    esac
    id "$account" >/dev/null
    install -d -m 0700 "/var/lib/$project-release"
    # Container UID 1000 may also belong to a host account. Only root can traverse the parent.
    install -d -o root -g root -m 0700 "/var/backups/$project"
    install -d -o 1000 -g 1000 -m 0700 "/var/backups/$project/snapshots"
    install -m 0600 "$repo/blog/$compose" "$config/$branch.yaml"
    rule="$config/$branch.sudoers"
    printf '%s ALL=(root) NOPASSWD: /usr/local/sbin/hamghadam-blog-deploy %s *\n' "$account" "$branch" > "$rule"
    chmod 0440 "$rule"
    visudo -cf "$rule"
    install -m 0440 "$rule" "/etc/sudoers.d/$project-release"
    install -m 0755 "$repo/deploy/$gateway" "/usr/local/libexec/$account-ssh"
done
