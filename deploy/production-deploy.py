#!/usr/bin/env python3
"""Root-owned, forced-command Docker deployment controller. Python 3.12+."""
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

CONFIG = Path("/etc/hamghadam-deploy/config.json")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")


def log(message):
    try:
        print(message, flush=True)
    except BrokenPipeError:
        pass  # A disconnected SSH client must not interrupt recovery.


def run(args, *, env=None, capture=False):
    result = subprocess.run(args, env=env, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else ""


class Deployment:
    def __init__(self, config):
        self.config = config
        self.root = Path(config["state_dir"])
        self.env = {**os.environ, "APP_ENV_FILE": config["env_file"]}

    def compose(self, base, override, *args, capture=False):
        return run(["docker", "compose", "--project-name", self.config["project"],
                    "--env-file", self.config["env_file"], "-f", str(base),
                    "-f", str(override), *args], env=self.env, capture=capture)

    def inspect_service(self, service):
        ids = run(["docker", "ps", "--all", "--filter",
                   f"label=com.docker.compose.project={self.config['project']}",
                   "--filter", f"label=com.docker.compose.service={service}",
                   "--format", "{{.ID}}"], capture=True).split()
        if len(ids) != 1:
            raise RuntimeError(f"Expected exactly one {service} container")
        return json.loads(run(["docker", "inspect", ids[0]], capture=True))[0]

    def write_override(self, path, images):
        # Explicit external volume name prevents accidental empty-volume creation.
        path.write_text(json.dumps({
            "services": {name: {"image": image} for name, image in images.items()},
            "volumes": {"app-data": {"external": True, "name": self.config["volume"]}},
        }))

    def fetch_main(self):
        repository = self.root / "repository.git"
        if not repository.exists():
            run(["git", "init", "--bare", str(repository)], capture=True)
        run(["git", "-C", str(repository), "fetch", "--depth=1", "--no-tags",
             self.config["repository"], "main"], capture=True)
        return run(["git", "-C", str(repository), "rev-parse", "FETCH_HEAD"], capture=True)

    def prepare_release(self, commit):
        release = self.root / "releases" / commit
        release.parent.mkdir(exist_ok=True)
        if not release.exists():
            with tempfile.TemporaryDirectory(dir=release.parent) as directory:
                archive = Path(directory) / "source.tar"
                run(["git", "-C", str(self.root / "repository.git"), "archive",
                     "--format=tar", f"--output={archive}", commit])
                source = Path(directory) / "source"
                source.mkdir()
                with tarfile.open(archive) as files:
                    files.extractall(source, filter="data")
                source.rename(release)
        image = f"hamghadam-release:{commit}"
        run(["docker", "build", "--pull", "--label",
             f"org.opencontainers.image.revision={commit}", "-t", image, str(release)])
        override = release / "production.override.json"
        self.write_override(override, {"app": image, "event-sync": image})
        resolved = json.loads(self.compose(release / "compose.yaml", override,
                                           "config", "--format", "json", capture=True))
        environment = resolved["services"]["app"]["environment"]
        for key in ("DATABASE_PATH", "MEDIA_PATH"):
            if environment.get(key) != self.config[key.lower()]:
                raise RuntimeError(f"Refusing unexpected {key}; persistent data must not move")
        if resolved["volumes"]["app-data"]["name"] != self.config["volume"]:
            raise RuntimeError("Persistent volume mismatch")
        if not any(mount.get("type") == "volume" and mount.get("source") == "app-data"
                   and mount.get("target") == "/data" for mount in resolved["services"]["app"].get("volumes", [])):
            raise RuntimeError("The app must mount the existing data volume at /data")
        return release, override

    def previous_deployment(self, transaction):
        state = self.root / "current.json"
        base = Path(json.loads(state.read_text())["compose_file"]) if state.exists() else Path(self.config["initial_compose"])
        rollback_base = transaction / "previous.compose.json"
        images = {}
        for service in ("app", "event-sync"):
            container = self.inspect_service(service)
            if service == "app":
                environment = dict(value.split("=", 1) for value in container["Config"]["Env"])
                for key in ("DATABASE_PATH", "MEDIA_PATH"):
                    if environment.get(key) != self.config[key.lower()]:
                        raise RuntimeError(f"Running {key} does not match deployment configuration")
                if not any(mount.get("Name") == self.config["volume"] and mount["Destination"] == "/data"
                           for mount in container["Mounts"]):
                    raise RuntimeError("Running app does not use the expected data volume")
            tag = f"hamghadam-rollback-{service}:{transaction.name}"
            run(["docker", "tag", container["Image"], tag])
            images[service] = tag
        override = transaction / "previous.override.json"
        self.write_override(override, images)
        # Snapshot resolved paths and env before moving into another directory.
        # This contains runtime secrets and remains inside a root-only directory.
        resolved = self.compose(base, override, "config", "--format", "json", capture=True)
        rollback_base.write_text(resolved)
        return rollback_base, override, images["app"]

    def backup(self, image):
        run(["docker", "run", "--rm", "--network=none", "--volume",
             f"{self.config['volume']}:/data", "--env", f"DATABASE_PATH={self.config['database_path']}",
             "--env", f"MEDIA_PATH={self.config['media_path']}", "--env", "BACKUP_DIRECTORY=/data/backups",
             "--entrypoint", "sh", image, "-c",
             'mkdir -p "$BACKUP_DIRECTORY" && node /app/scripts/backup-node.mjs'])

    def wait_health(self):
        for url in (self.config["health_url"], self.config["public_health_url"]):
            deadline = time.monotonic() + 45
            while True:
                try:
                    with urllib.request.urlopen(url, timeout=8) as response:
                        if response.status != 200 or json.load(response).get("status") != "ok":
                            raise ValueError("Unhealthy response")
                    break
                except (OSError, ValueError):
                    if time.monotonic() >= deadline:
                        raise RuntimeError(f"Health check failed: {url}") from None
                    time.sleep(2)

    def up(self, base, override):
        self.compose(base, override, "up", "-d", "--no-build", "--pull", "never",
                     "--wait", "--wait-timeout", str(self.config.get("wait_seconds", 180)))
        self.wait_health()

    def status(self):
        state = self.root / "current.json"
        deployed = json.loads(state.read_text()) if state.exists() else {"commit": None}
        app = self.inspect_service("app")
        sync = self.inspect_service("event-sync")
        log(json.dumps({**deployed, "app_image": app["Image"],
                        "app_health": app["State"].get("Health", {}).get("Status"),
                        "event_sync_running": sync["State"]["Running"]}))

    def deploy(self, commit):
        if not COMMIT.fullmatch(commit):
            raise ValueError("Expected a full lowercase Git commit SHA")
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        with (self.root / "deployment.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if self.fetch_main() != commit:
                raise RuntimeError("Requested commit is no longer the head of main; deploy the latest run")
            release, override = self.prepare_release(commit)
            if self.fetch_main() != commit:
                raise RuntimeError("Main advanced during build; leaving the running app unchanged")
            transactions = self.root / "transactions"
            transactions.mkdir(exist_ok=True)
            transaction = transactions / f"{commit[:12]}-{time.time_ns()}"
            transaction.mkdir(mode=0o700)
            previous_base, previous_override, previous_image = self.previous_deployment(transaction)
            stopped = False
            try:
                log("Build ready; stopping the scheduler and app for a consistent backup")
                stopped = True  # Even a partial stop must enter recovery.
                self.compose(previous_base, previous_override, "stop", "event-sync")
                self.compose(previous_base, previous_override, "stop", "app")
                self.backup(previous_image)
                log("Verified backup complete; starting the new app and scheduler")
                self.up(release / "compose.yaml", override)
                app = self.inspect_service("app")
                image = json.loads(run(["docker", "image", "inspect", app["Image"]], capture=True))[0]
                if image["Config"]["Labels"].get("org.opencontainers.image.revision") != commit:
                    raise RuntimeError("Running image does not match the requested commit")
                state = {"commit": commit, "compose_file": str(release / "compose.yaml"),
                         "deployed_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
                temporary = self.root / "current.pending.json"
                temporary.write_text(json.dumps(state) + "\n")
                temporary.replace(self.root / "current.json")
                log(f"Deployed {commit}; internal and public health checks passed")
            except BaseException:
                if stopped:
                    log("Deployment failed; restoring the previous images (database is not reverted)")
                    try:
                        self.up(previous_base, previous_override)
                        log("Previous deployment is healthy again; inspect the failed run before retrying")
                    except BaseException:
                        log("Recovery failed; operator intervention required. Verified backups remain in /data/backups")
                raise


def main():
    if len(sys.argv) != 2 or not (sys.argv[1] == "status" or re.fullmatch(r"deploy [0-9a-f]{40}", sys.argv[1])):
        raise ValueError("Only 'status' or 'deploy <40-character SHA>' is allowed")
    if os.geteuid() != 0:
        raise PermissionError("This controller must be installed and executed by root")
    config = json.loads(CONFIG.read_text())
    os.umask(0o077)
    controller = Deployment(config)
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    if sys.argv[1] == "status":
        controller.status()
    else:
        controller.deploy(sys.argv[1].split()[1])


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        log(f"Deployment error: {error}")
        sys.exit(1)
