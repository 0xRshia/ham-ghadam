# Docker deployment

This deployment runs one Node application instance with SQLite and local media on a persistent named volume. Use Docker Engine/Desktop with Docker Compose v2. It does not provision hosting, HTTPS, or a notification scheduler.

## First start

```sh
cp .env.docker.example .env.docker
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Put the generated value in `OTP_SECRET` in `.env.docker`. Set `APP_ORIGIN` to the URL users will visit. The default is `http://localhost:3000`; if changing `APP_PORT`, update the origin too. Configure SMS, payment, email, or push credentials for the features you use. The environment file is ignored by Git and excluded from the image; do not commit it.

```sh
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=100 app
curl --fail http://localhost:3000/api/health
```

The image uses `node:22-bookworm-slim`, installs the lockfile with `npm ci`, and builds the existing Node target. The runtime contains standalone output, migrations, and operational scripts. The app runs as UID/GID 1000, listens on port 3000, and checks `/api/health` every 30 seconds. Startup creates directories and applies pending migrations before serving traffic; a migration error stops startup. Docker's health status reports failures; it does not itself restart an unhealthy process.

The `app-data` volume contains `/data/hmghadam.sqlite` (including SQLite WAL files) and `/data/media`. Fresh named volumes inherit the image's ownership. If importing data or substituting a host bind mount, make its files writable by UID/GID 1000. Keep one app instance per volume. Regular `docker compose down` retains the volume; `down --volumes` deletes it and must not be used for routine upgrades.

For public access, put an HTTPS reverse proxy in front of the service, set `APP_ORIGIN=https://your-domain` and `VINEXT_TRUST_PROXY=1`, and configure the proxy to preserve `Host` and overwrite `X-Forwarded-Proto` with `https`. This lets the installed vinext server recognize HTTPS and issue Secure cookies. Restrict direct access to the app port; leave proxy trust disabled when accessing Node directly. TLS termination is outside this Compose setup. These settings were verified against the installed vinext package because its Context7 documentation did not cover proxy trust.

## Test login

In an isolated testing deployment, set `TEMP_LOGIN_ENABLED=true`, keep `OTP_SECRET` configured, and recreate the service with the `up` command above. Choose SMS login on `/login`, enter `09108624707`, and verify with `123456`. No SMS provider credentials are needed for this account. The flag also enables the existing instant-login demo host `09108624708`.

Return the flag to `false` and recreate the service to disable new demo logins and reject outstanding test challenges. Existing sessions remain valid until logout, expiry, or explicit revocation. Do not enable sample data or payment bypasses merely to test login.

## Updates and operations

Back up data before updating. Pull the intended source revision through your normal release process, then rebuild and recreate:

```sh
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker logs --tail=100 app
docker compose --env-file .env.docker ps
```

Migrations use a checksum journal and are safe to rerun. Do not edit applied migration files. Rollback requires a compatible application revision or restoration of a matching database/media backup. Keep the same Compose project name/directory between releases so Compose reuses the intended volume.

To invoke configured notification delivery, schedule this command externally at the cadence described in [notification setup](notifications.md):

```sh
docker compose --env-file .env.docker exec -T app node scripts/notifications-job.mjs
```

## Backup and restore

Stop the app while taking a backup so media cannot be deleted between the database snapshot and file copying. The backup helper checks SQLite integrity and copies all referenced event, article, and profile images. It retains the newest 14 snapshot pairs in its destination.

```sh
docker compose --env-file .env.docker stop app
docker compose --env-file .env.docker run --rm --no-deps --entrypoint sh app -c 'mkdir -p /data/backups && BACKUP_DIRECTORY=/data/backups node scripts/backup-node.mjs'
mkdir -p backups
docker compose --env-file .env.docker cp app:/data/backups/. ./backups/
docker compose --env-file .env.docker start app
```

Copy `backups` to separate storage; backups inside the application volume do not protect against losing that volume. Each `mvp-<timestamp>.sqlite` belongs with its matching `mvp-<timestamp>.media` directory.

For restoration, stop the app, copy the chosen pair into the volume's backup directory, and set `RESTORE_NAME` to its filename stem. Restore only into a stopped deployment; this replaces the current database and media. Take a fresh backup first.

```sh
docker compose --env-file .env.docker stop app
docker compose --env-file .env.docker cp ./backups/. app:/data/backups/
RESTORE_NAME=mvp-REPLACE-WITH-TIMESTAMP
docker compose --env-file .env.docker run --rm --no-deps --user root --entrypoint sh -e RESTORE_NAME="$RESTORE_NAME" app -c '
  set -eu
  test -f "/data/backups/$RESTORE_NAME.sqlite"
  test -d "/data/backups/$RESTORE_NAME.media"
  rm -f /data/hmghadam.sqlite-wal /data/hmghadam.sqlite-shm
  cp "/data/backups/$RESTORE_NAME.sqlite" /data/hmghadam.sqlite
  rm -rf /data/media
  cp -R "/data/backups/$RESTORE_NAME.media" /data/media
  chown -R 1000:1000 /data/hmghadam.sqlite /data/media
'
docker compose --env-file .env.docker up -d
```

## Configuration details

`compose.yaml` fixes the container port and storage paths; `APP_PORT` changes the published host port. Runtime credentials and feature flags come from `.env.docker`. To use a separate environment file, set `APP_ENV_FILE` to its path and pass the same file to Compose's `--env-file` option. No secrets are needed at build time. The existing Workers build remains available separately.

Run `npm run test:docker` with Docker running to build and exercise an isolated Compose deployment. It checks migrations, health, assets, non-root execution, OTP login, uploaded-media persistence after recreation, and migration failure handling, then removes only its own test containers, image, and volume.

**Learning notes:** SQLite and media must persist together, and the migration runner is packaged with the standalone server. Containers are replaceable; their writable application layer is not the data store.

**Why this matters:** Rebuilding or replacing a container preserves accounts, reservations, and uploaded images while applying the same migrations used outside Docker.
