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
IDENTIFIER = re.compile(r"[a-z0-9][a-z0-9_-]*\Z")


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
        self.branch = config.get("branch", "main")
        if (not isinstance(self.branch, str) or not self.branch or
                any(part in self.branch for part in ("..", "@{", "//", "\\", " ")) or
                self.branch.startswith(("/", "-", ".")) or
                self.branch.endswith(("/", ".", ".lock")) or
                not re.fullmatch(r"[A-Za-z0-9._/-]+", self.branch)):
            raise ValueError("Expected a valid deployment branch name")
        self.image_prefix = config.get("image_prefix", "hamghadam")
        if not IDENTIFIER.fullmatch(self.image_prefix):
            raise ValueError("Expected a safe image prefix")
        self.root = Path(config["state_dir"])
        self.env = {**os.environ, "APP_ENV_FILE": config["env_file"]}
        self.port = config.get("app_port")
        self.bind_ip = config.get("bind_ip", "127.0.0.1")
        if self.port is not None:
            if type(self.port) is not int or not 1024 <= self.port <= 65535 or self.bind_ip != "127.0.0.1":
                raise ValueError("Configured app port must be an unprivileged loopback port")
            self.env["APP_PORT"] = f"{self.bind_ip}:{self.port}"
            if config["health_url"] != f"http://{self.bind_ip}:{self.port}/api/health":
                raise ValueError("Internal health URL must match the configured loopback port")
        if self.branch != "main":
            # A testing branch must never inherit production storage, credentials,
            # image tags, Compose project, or the production listener.
            production = {
                "project": "ham-ghadam", "volume": "ham-ghadam_app-data",
                "state_dir": "/var/lib/hamghadam-deploy",
                "env_file": "/root/ham-ghadam/.env.docker",
                "initial_compose": "/root/ham-ghadam/compose.yaml",
                "image_prefix": "hamghadam",
            }
            for key, value in production.items():
                configured = config.get(key)
                if key in ("state_dir", "env_file", "initial_compose") and configured:
                    if not Path(configured).is_absolute():
                        raise ValueError(f"Non-main deployments require an absolute {key}")
                    configured = str(Path(configured).resolve())
                if not configured or configured == value:
                    raise ValueError(f"Non-main deployments require an isolated {key}")
            if self.port is None or self.port == 3000:
                raise ValueError("Non-main deployments require a distinct loopback app_port")

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

    def fetch_branch(self):
        repository = self.root / "repository.git"
        if not repository.exists():
            run(["git", "init", "--bare", str(repository)], capture=True)
        run(["git", "-C", str(repository), "fetch", "--depth=1", "--no-tags",
             self.config["repository"], f"refs/heads/{self.branch}"], capture=True)
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
        # The controller uses umask 077 for secrets/state, but tracked source
        # directories must remain traversable by the image's non-root runtime.
        # tarfile's data filter intentionally does not restore directory modes.
        for directory in [release, *release.rglob("*")]:
            if not directory.is_symlink() and directory.is_dir():
                directory.chmod(0o755)
        image = f"{self.image_prefix}-release:{commit}"
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
        if self.port is not None:
            ports = resolved["services"]["app"].get("ports", [])
            if (len(ports) != 1 or ports[0].get("host_ip") != self.bind_ip or
                    str(ports[0].get("published")) != str(self.port) or ports[0].get("target") != 3000 or
                    ports[0].get("protocol", "tcp") != "tcp"):
                raise RuntimeError("App listener does not match the configured loopback port")
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
                if self.port is not None:
                    ports = container.get("NetworkSettings", {}).get("Ports", {}).get("3000/tcp", [])
                    if (len(ports) != 1 or ports[0].get("HostIp") != self.bind_ip or
                            ports[0].get("HostPort") != str(self.port)):
                        raise RuntimeError("Running app does not use the configured loopback port")
            tag = f"{self.image_prefix}-rollback-{service}:{transaction.name}"
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
                     "--wait", "--wait-timeout", str(self.config.get("wait_seconds", 180)), "app")
        # Compose versions differ when --wait encounters an explicitly disabled
        # image healthcheck. Only app has one; verify the worker's running state.
        self.compose(base, override, "up", "-d", "--no-build", "--pull", "never",
                     "--no-deps", "event-sync")
        if not self.inspect_service("event-sync")["State"]["Running"]:
            raise RuntimeError("The event-sync worker did not stay running")
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
            if self.fetch_branch() != commit:
                raise RuntimeError(f"Requested commit is no longer the head of {self.branch}; deploy the latest run")
            transactions = self.root / "transactions"
            transactions.mkdir(exist_ok=True)
            transaction = transactions / f"{commit[:12]}-{time.time_ns()}"
            transaction.mkdir(mode=0o700)
            # Pin the running images before rebuilding a release tag. Docker's
            # OCI image store may discard an untagged index when a same-commit
            # rebuild replaces its last tag, even while containers still use it.
            previous_base, previous_override, previous_image = self.previous_deployment(transaction)
            release, override = self.prepare_release(commit)
            if self.fetch_branch() != commit:
                raise RuntimeError(f"{self.branch.capitalize()} advanced during build; leaving the running app unchanged")
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
    arguments = sys.argv[1:]
    config_path = CONFIG
    if len(arguments) == 3 and arguments[0] == "--config":
        config_path = Path(arguments[1])
        if not config_path.is_absolute():
            raise ValueError("Deployment configuration must use an absolute path")
        arguments = arguments[2:]
    if len(arguments) != 1 or not (arguments[0] == "status" or re.fullmatch(r"deploy [0-9a-f]{40}", arguments[0])):
        raise ValueError("Only 'status' or 'deploy <40-character SHA>' is allowed")
    if os.geteuid() != 0:
        raise PermissionError("This controller must be installed and executed by root")
    config = json.loads(config_path.read_text())
    os.umask(0o077)
    controller = Deployment(config)
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    if arguments[0] == "status":
        controller.status()
    else:
        controller.deploy(arguments[0].split()[1])


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        log(f"Deployment error: {error}")
        sys.exit(1)
