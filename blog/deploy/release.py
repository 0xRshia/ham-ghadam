#!/usr/bin/env python3
"""Release an existing blog stack. Installed by root, invoked by the CI forced command."""
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

REPOSITORY = "https://github.com/0xRshia/ham-ghadam.git"
BUILD_INPUTS = ["blog", "public/brand", "public/fonts/darbareh", "public/favicon.ico",
                "public/favicon.svg", "public/apple-touch-icon.png", "design-system/tokens.css"]


def output(*args):
    return subprocess.check_output(args, text=True).strip()


def point_landing(link, target):
    pending = link.with_name(f".current-{os.getpid()}")
    pending.unlink(missing_ok=True)
    pending.symlink_to(target)
    pending.replace(link)


def prepare_landing(git, commit, releases):
    destination = releases / commit
    if destination.is_dir():
        return destination
    with tempfile.TemporaryDirectory(dir=releases) as temporary:
        source = Path(temporary) / "site"
        source.mkdir()
        archive = Path(temporary) / "landing.tar"
        subprocess.run([*git, "archive", "-o", archive, f"{commit}:blog/landing-site"], check=True)
        with tarfile.open(archive) as files:
            if any(not (item.isfile() or item.isdir()) for item in files):
                raise ValueError("The public landing tree must contain regular files and directories")
            files.extractall(source, filter="data")
        if not (source / "index.html").is_file():
            raise ValueError("Missing public landing page")
        for path in [source, *source.rglob("*")]:
            path.chmod(0o755 if path.is_dir() else 0o644)
        source.rename(destination)
    return destination


def verify_service(origin, revision):
    with urllib.request.urlopen(f"{origin}/api/health", timeout=15) as response:
        health = json.load(response)
    if (health.get("status"), health.get("service"), health.get("revision")) != ("ok", "hamghadam-blog", revision):
        raise RuntimeError(f"Blog revision or health mismatch at {origin}")
    with urllib.request.urlopen(f"{origin}/blog", timeout=15) as response:
        if response.status != 200:
            raise RuntimeError(f"Blog archive unavailable at {origin}")


def deploy(branch, commit):
    production = branch == "main"
    project = "hmghadam-blog" if production else "hmghadam-blog-stage"
    domain = "hmghadam.com" if production else "blog-stage.hmghadam.com"
    port = "9090" if production else "9190"
    env_file = Path("/opt") / project / "shared" / (".env.production" if production else ".env.stage")
    state = Path("/var/lib") / f"{project}-release"
    volume = f"{project}_blog-data"
    backups = Path("/var/backups") / project
    link = Path("/var/www/hmghadam-landing") / domain / "current"
    image = f"{project}:{commit}"
    runtime = Path("/etc/hamghadam-blog-deploy") / f"{branch}.yaml"
    volume_override = state / "volume.json"
    compose = ["docker", "compose", "--project-name", project, "--env-file", str(env_file),
               "-f", runtime, "-f", volume_override]
    env = {**os.environ, "BLOG_ENV_FILE": str(env_file), "BLOG_IMAGE": image}
    git = ["git", "--git-dir", str(state / "source.git")]

    def up(tag):
        subprocess.run([*compose, "up", "-d", "--no-deps", "--no-build", "--pull", "never",
                        "--wait", "--wait-timeout", "120", "blog"], env={**env, "BLOG_IMAGE": tag}, check=True)

    def check_branch():
        subprocess.run([*git, "fetch", "--quiet", "--depth=1", "--no-tags", REPOSITORY, f"refs/heads/{branch}"], check=True)
        head = output(*git, "rev-parse", "FETCH_HEAD")
        if head != commit:
            # An unrelated app commit may arrive without triggering a newer blog run.
            subprocess.run([*git, "fetch", "--quiet", "--depth=1", "--no-tags", REPOSITORY, commit], check=True)
            subprocess.run([*git, "diff", "--quiet", commit, head, "--", *BUILD_INPUTS], check=True)

    def verify():
        verify_service(f"http://127.0.0.1:{port}", commit)
        if production:
            verify_service(f"https://{domain}", commit)

    with (state / "release.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        old_landing = link.resolve(strict=True)
        if not link.is_symlink() or not old_landing.is_dir():
            raise RuntimeError("Expected an existing landing release symlink")
        running = json.loads(output("docker", "inspect", f"{project}-blog-1"))[0]
        labels = running["Config"]["Labels"]
        binding = running["HostConfig"]["PortBindings"].get("3000/tcp")
        mounts = [m for m in running["Mounts"] if m["Destination"] == "/data"]
        if (labels.get("com.docker.compose.project") != project or labels.get("com.docker.compose.service") != "blog"
                or binding != [{"HostIp": "127.0.0.1", "HostPort": port}]
                or len(mounts) != 1 or mounts[0].get("Name") != volume):
            raise RuntimeError("Running blog does not match the configured project, volume and port")
        # Host-owned Compose configuration keeps staging and production storage independent.
        volume_override.write_text(json.dumps({"volumes": {"blog-data": {"name": volume, "external": True}}}))
        config = json.loads(subprocess.check_output([*compose, "config", "--format", "json"], env=env))
        service = config["services"]["blog"]
        ports = service["ports"]
        if (service["image"] != image or service["environment"]["BLOG_ORIGIN"] != f"https://{domain}"
                or service["environment"]["BLOG_DATA_DIR"] != "/data"
                or not any(m.get("source") == "blog-data" and m["target"] == "/data" for m in service["volumes"])
                or len(ports) != 1 or (ports[0]["host_ip"], str(ports[0]["published"]), ports[0]["target"]) != ("127.0.0.1", port, 3000)):
            raise RuntimeError("Blog configuration does not match its image, storage, port or origin")
        if not (state / "source.git").exists():
            subprocess.run(["git", "init", "--quiet", "--bare", str(state / "source.git")], check=True)
        check_branch()
        if running["State"]["Running"] and labels.get("org.opencontainers.image.revision") == commit and old_landing.name == commit:
            verify()
            print(f"{project} already serves {commit}", flush=True)
            return

        previous_image = f"{project}:rollback-{running['Id'][:12]}"
        subprocess.run(["docker", "image", "tag", running["Image"], previous_image], check=True)
        new_landing = prepare_landing(git, commit, link.parent / "releases")
        # Docker receives a Git archive, so local env files never enter the build context.
        with tempfile.TemporaryFile(dir=state) as archive:
            subprocess.run([*git, "archive", commit, "--", *BUILD_INPUTS], stdout=archive, check=True)
            archive.seek(0)
            subprocess.run(["docker", "build", "-f", "blog/Dockerfile", "--build-arg", f"BLOG_REVISION={commit}",
                            "-t", image, "-"], stdin=archive, check=True)
        check_branch()
        try:
            subprocess.run(["docker", "stop", "--time", "30", running["Id"]], check=True)
            subprocess.run(["docker", "run", "--rm", "--network", "none",
                            "--mount", f"type=volume,src={volume},dst=/data",
                            "--mount", f"type=bind,src={backups},dst=/backups",
                            "-e", "BLOG_DATA_DIR=/data", "-e", "BLOG_BACKUP_DIR=/backups", previous_image,
                            "node", "scripts/backup.ts"], check=True)
            up(image)
            point_landing(link, new_landing)
            verify()
        except BaseException:
            print("Blog release failed; restoring the previous landing and image", flush=True)
            try:
                point_landing(link, old_landing)
            finally:
                up(previous_image)
            raise
        print(f"{project} now serves {commit}", flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("main", "stage") or not re.fullmatch(r"[0-9a-f]{40}", sys.argv[2]):
        sys.exit("Usage: hamghadam-blog-deploy {main|stage} <40-character SHA>")
    if os.geteuid() != 0:
        sys.exit("The blog release command must be installed and run by root")
    os.umask(0o077)
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    deploy(sys.argv[1], sys.argv[2])
