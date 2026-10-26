"""Exercise the production transaction without Docker, SSH, or network access."""
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest import mock


SOURCE = Path(__file__).resolve().parents[1] / "deploy" / "production-deploy.py"
SPEC = importlib.util.spec_from_file_location("production_deploy", SOURCE)
controller = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(controller)
COMMIT = "a" * 40
OTHER = "b" * 40


class FakeHost:
    """External boundaries only; controller filesystem/orchestration stays real."""

    def __init__(self, directory):
        directory = Path(directory)
        original = directory / "original"
        original.mkdir()
        self.compose_file = original / "compose.yaml"
        self.compose_file.write_text("services:\n  app:\n    build: .\n  event-sync:\n    build: .\nvolumes:\n  app-data:\n")
        self.config = {
            "state_dir": str(directory / "state"),
            "env_file": str(directory / "runtime.env"),
            "project": "ham-ghadam",
            "volume": "ham-ghadam_app-data",
            "repository": "https://example.invalid/fixed/repository.git",
            "initial_compose": str(self.compose_file),
            "database_path": "/data/hmghadam.sqlite",
            "media_path": "/data/media",
            "health_url": "http://127.0.0.1:3000/api/health",
            "public_health_url": "https://example.invalid/api/health",
        }
        Path(self.config["env_file"]).write_text("TEST_ENV=retained\n")
        self.images = {
            "old-app": {"Config": {"Labels": {"org.opencontainers.image.revision": OTHER}}},
            "old-sync": {"Config": {"Labels": {"org.opencontainers.image.revision": OTHER}}},
        }
        self.containers = {
            name: {
                "Image": "old-app" if name == "app" else "old-sync",
                "Config": {"Env": ["DATABASE_PATH=/data/hmghadam.sqlite", "MEDIA_PATH=/data/media"]},
                "Mounts": [{"Name": self.config["volume"], "Destination": "/data"}] if name == "app" else [],
                "State": {"Running": True, "Health": {"Status": "healthy"}},
            }
            for name in ("app", "event-sync")
        }
        self.calls = []
        self.events = []
        self.heads = [COMMIT, COMMIT]
        self.fetched = None
        self.resolved_environment = {"DATABASE_PATH": "/data/hmghadam.sqlite", "MEDIA_PATH": "/data/media"}
        self.resolved_volume = self.config["volume"]
        self.resolved_mount = {"type": "volume", "source": "app-data", "target": "/data"}
        self.resolved_ports = [{"target": 3000, "published": "3000", "host_ip": "0.0.0.0", "protocol": "tcp"}]
        self.failure = None
        self.new_revision = COMMIT
        self.active = "old"
        self.health_state_observations = []

    @property
    def state(self):
        return Path(self.config["state_dir"]) / "current.json"

    def run(self, args, *, env=None, capture=False):
        args = [str(arg) for arg in args]
        self.calls.append((args, copy.deepcopy(env), capture))
        if args[:3] == ["git", "init", "--bare"]:
            Path(args[3]).mkdir(parents=True)
            return ""
        if args[0] == "git":
            command = args[3]
            if command == "fetch":
                self.fetched = self.heads.pop(0) if len(self.heads) > 1 else self.heads[0]
                return ""
            if command == "rev-parse":
                return self.fetched
            if command == "archive":
                archive = next(arg.split("=", 1)[1] for arg in args if arg.startswith("--output="))
                with tarfile.open(archive, "w") as output:
                    content = self.compose_file.read_bytes()
                    entry = tarfile.TarInfo("compose.yaml")
                    entry.size = len(content)
                    output.addfile(entry, io.BytesIO(content))
                    for name in ("drizzle", "drizzle/meta"):
                        directory = tarfile.TarInfo(name)
                        directory.type = tarfile.DIRTYPE
                        directory.mode = 0o755
                        output.addfile(directory)
                    journal = tarfile.TarInfo("drizzle/meta/_journal.json")
                    journal.size = 2
                    journal.mode = 0o644
                    output.addfile(journal, io.BytesIO(b"{}"))
                return ""
        if args[:2] == ["docker", "build"]:
            self.events.append("build")
            image = args[args.index("-t") + 1]
            self.images[image] = {"Config": {"Labels": {"org.opencontainers.image.revision": self.new_revision}}}
            if self.failure == "build":
                raise subprocess.CalledProcessError(1, args)
            return ""
        if args[:2] == ["docker", "ps"]:
            service = next(arg.split("=", 2)[2] for arg in args if arg.startswith("label=com.docker.compose.service="))
            return service
        if args[:2] == ["docker", "inspect"]:
            return json.dumps([self.containers[args[2]]])
        if args[:3] == ["docker", "image", "inspect"]:
            self.events.append("verify-revision")
            return json.dumps([self.images[args[3]]])
        if args[:2] == ["docker", "tag"]:
            self.images[args[3]] = copy.deepcopy(self.images[args[2]])
            return ""
        if args[:2] == ["docker", "run"]:
            self.events.append("backup")
            if self.failure == "backup":
                raise subprocess.CalledProcessError(1, args)
            return ""
        if args[:2] == ["docker", "compose"]:
            files = [Path(args[index + 1]) for index, arg in enumerate(args) if arg == "-f"]
            override = json.loads(files[-1].read_text())
            operations = args[args.index("-f", args.index("-f") + 1) + 2:]
            command = operations[0]
            if command == "config":
                return json.dumps({"services": {"app": {"environment": self.resolved_environment,
                                   "ports": self.resolved_ports,
                                   "volumes": [self.resolved_mount], "build": {"context": str(self.compose_file.parent)}}},
                                   "volumes": {"app-data": {"name": self.resolved_volume}}})
            if command == "stop":
                self.events.append("stop-" + operations[1])
                self.containers[operations[1]]["State"]["Running"] = False
                if self.failure == "stop" and operations[1] == "event-sync":
                    raise subprocess.CalledProcessError(1, args)
                return ""
            if command == "up":
                is_new = files[-1].name == "production.override.json"
                active = "new" if is_new else "old"
                names = [operations[-1]]
                if names == ["app"]:
                    self.active = active
                    self.events.append("up-" + active)
                else:
                    self.events.append("start-" + active + "-sync")
                for name in names:
                    service = override["services"][name]
                    self.containers[name]["Image"] = service["image"]
                    self.containers[name]["State"]["Running"] = True
                if self.failure == "startup" and is_new or self.failure == "worker" and is_new and names == ["event-sync"]:
                    raise subprocess.CalledProcessError(1, args)
                return ""
        raise AssertionError(f"Unexpected external command: {args}")

    def urlopen(self, url, *, timeout):
        self.events.append(f"health-{self.active}-{url}")
        self.health_state_observations.append(self.state.read_text() if self.state.exists() else None)
        failed = self.active == "new" and self.failure == "health"
        response = io.StringIO(json.dumps({"status": "broken" if failed else "ok"}))
        response.status = 503 if failed else 200
        return response


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="hamghadam-deploy-test-")
        self.addCleanup(self.directory.cleanup)
        self.host = FakeHost(self.directory.name)
        self.deployment = controller.Deployment(self.host.config)
        self.addCleanup(mock.patch.stopall)
        mock.patch.object(controller, "run", side_effect=self.host.run).start()
        mock.patch.object(controller.urllib.request, "urlopen", side_effect=self.host.urlopen).start()
        clock = iter(range(0, 1000000, 100))
        mock.patch.object(controller.time, "monotonic", side_effect=lambda: next(clock)).start()
        mock.patch.object(controller.time, "sleep").start()
        mock.patch.object(controller, "log").start()

    def stop_calls(self):
        return [args for args, _, _ in self.host.calls if args[:2] == ["docker", "compose"] and "stop" in args]

    def configure_stage(self):
        self.host.config.update({
            "branch": "stage", "image_prefix": "hamghadam-stage",
            "project": "ham-ghadam-stage", "volume": "ham-ghadam-stage_app-data",
            "app_port": 3100, "bind_ip": "127.0.0.1",
            "health_url": "http://127.0.0.1:3100/api/health",
            "public_health_url": "https://stage.example.invalid/api/health",
        })
        self.host.resolved_volume = self.host.config["volume"]
        self.host.containers["app"]["Mounts"][0]["Name"] = self.host.config["volume"]
        self.host.resolved_ports = [{"target": 3000, "published": "3100", "host_ip": "127.0.0.1", "protocol": "tcp"}]
        self.host.containers["app"]["NetworkSettings"] = {
            "Ports": {"3000/tcp": [{"HostIp": "127.0.0.1", "HostPort": "3100"}]},
        }
        self.deployment = controller.Deployment(self.host.config)

    def test_stage_uses_its_branch_project_environment_volume_port_and_image_tags(self):
        self.configure_stage()
        self.deployment.deploy(COMMIT)
        for args, env, _ in self.host.calls:
            if args[0] == "git" and "fetch" in args:
                self.assertEqual(args[-1], "refs/heads/stage")
            if args[:2] == ["docker", "compose"]:
                self.assertEqual(args[args.index("--project-name") + 1], "ham-ghadam-stage")
                self.assertEqual(env["APP_PORT"], "127.0.0.1:3100")
                self.assertEqual(env["APP_ENV_FILE"], self.host.config["env_file"])
            if args[:2] == ["docker", "run"]:
                self.assertIn("ham-ghadam-stage_app-data:/data", args)
                self.assertTrue(any(arg.startswith("hamghadam-stage-rollback-app:") for arg in args))
        state = json.loads(self.host.state.read_text())
        release = Path(state["compose_file"]).parent
        override = json.loads((release / "production.override.json").read_text())
        self.assertEqual(override["services"]["app"]["image"], f"hamghadam-stage-release:{COMMIT}")
        self.assertEqual(override["volumes"]["app-data"]["name"], "ham-ghadam-stage_app-data")

    def test_stage_rejects_stale_commits_before_build_and_advanced_branch_before_stop(self):
        self.configure_stage()
        for heads, message in (([OTHER], "head of stage"), ([COMMIT, OTHER], "Stage advanced")):
            with self.subTest(heads=heads):
                self.host.events.clear()
                self.host.heads = heads
                with self.assertRaisesRegex(RuntimeError, message):
                    self.deployment.deploy(COMMIT)
                self.assertFalse(self.stop_calls())
                self.assertFalse(self.host.state.exists())

    def test_stage_rejects_production_resources_and_missing_isolation_configuration(self):
        self.configure_stage()
        production = {
            "project": "ham-ghadam", "volume": "ham-ghadam_app-data",
            "state_dir": "/var/lib/hamghadam-deploy",
            "env_file": "/root/ham-ghadam/.env.docker",
            "initial_compose": "/root/ham-ghadam/compose.yaml", "image_prefix": "hamghadam",
        }
        for key, production_value in production.items():
            for value in (production_value, None):
                with self.subTest(key=key, value=value):
                    config = {**self.host.config, key: value}
                    if value is None:
                        del config[key]
                    with self.assertRaisesRegex((ValueError, KeyError), "isolated|image_prefix|state_dir|env_file"):
                        controller.Deployment(config)

    def test_stage_rejects_production_environment_path_alias(self):
        self.configure_stage()
        config = {**self.host.config, "env_file": "/root/ham-ghadam/../ham-ghadam/.env.docker"}
        with self.assertRaisesRegex(ValueError, "isolated env_file"):
            controller.Deployment(config)

    def test_stage_configuration_requires_absolute_state_and_runtime_paths(self):
        self.configure_stage()
        for key in ("state_dir", "env_file", "initial_compose"):
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "absolute " + key):
                controller.Deployment({**self.host.config, key: "relative/path"})

    def test_stage_requires_a_matching_distinct_loopback_listener(self):
        self.configure_stage()
        for update in ({"app_port": 3000, "health_url": "http://127.0.0.1:3000/api/health"},
                       {"app_port": None}, {"app_port": 70000}, {"app_port": True},
                       {"bind_ip": "0.0.0.0"}, {"health_url": "http://127.0.0.1:3000/api/health"}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                controller.Deployment({**self.host.config, **update})

    def test_stage_rejects_changed_release_listener_before_stopping(self):
        self.configure_stage()
        expected = copy.deepcopy(self.host.resolved_ports)
        changes = [{"host_ip": "0.0.0.0"}, {"published": "3000"}, {"target": 8080}, {"protocol": "udp"}]
        for change in changes:
            with self.subTest(change=change):
                self.host.resolved_ports = [{**expected[0], **change}]
                with self.assertRaisesRegex(RuntimeError, "listener"):
                    self.deployment.deploy(COMMIT)
                self.assertFalse(self.stop_calls())
        self.host.resolved_ports = expected + expected
        with self.assertRaisesRegex(RuntimeError, "listener"):
            self.deployment.deploy(COMMIT)
        self.assertFalse(self.stop_calls())

    def test_stage_rejects_changed_running_listener_before_stopping(self):
        self.configure_stage()
        self.host.containers["app"]["NetworkSettings"]["Ports"]["3000/tcp"][0]["HostPort"] = "3000"
        with self.assertRaisesRegex(RuntimeError, "Running app.*loopback port"):
            self.deployment.deploy(COMMIT)
        self.assertFalse(self.stop_calls())

    def assert_no_data_restore(self):
        # Recovery must only select previous images, never copy/delete/restore data.
        runs = [args for args, _, _ in self.host.calls if args[:2] == ["docker", "run"]]
        self.assertEqual(len(runs), 1)
        self.assertIn("node /app/scripts/backup-node.mjs", runs[0][-1])
        self.assertFalse(any("restore" in arg.lower() or "--volumes" == arg for args, _, _ in self.host.calls for arg in args))

    def test_stale_commit_is_rejected_without_building_or_stopping(self):
        self.host.heads = [OTHER]
        with self.assertRaisesRegex(RuntimeError, "no longer the head"):
            self.deployment.deploy(COMMIT)
        self.assertFalse(self.host.events)
        self.assertFalse(self.host.state.exists())

    def test_main_advancing_during_build_keeps_existing_app_running(self):
        self.host.heads = [COMMIT, OTHER]
        with self.assertRaisesRegex(RuntimeError, "Main advanced"):
            self.deployment.deploy(COMMIT)
        self.assertEqual(self.host.events, ["build"])
        self.assertFalse(self.stop_calls())
        self.assertEqual(self.host.containers["app"]["Image"], "old-app")

    def test_build_failure_does_not_stop_or_replace_running_app(self):
        self.host.failure = "build"
        with self.assertRaises(subprocess.CalledProcessError):
            self.deployment.deploy(COMMIT)
        self.assertFalse(self.stop_calls())
        self.assertFalse(self.host.state.exists())

    def test_backup_failure_and_partial_stop_restart_previous_images(self):
        for failure in ("backup", "stop"):
            with self.subTest(failure=failure):
                self.host.failure = failure
                self.host.events.clear()
                with self.assertRaises(subprocess.CalledProcessError):
                    self.deployment.deploy(COMMIT)
                self.assertIn("up-old", self.host.events)
                self.assertNotIn("up-new", self.host.events)
                self.assertTrue(self.host.containers["app"]["State"]["Running"])
                self.assertTrue(self.host.containers["event-sync"]["State"]["Running"])
                self.assertFalse(self.host.state.exists())

    def test_startup_health_and_revision_failure_roll_back_without_restoring_data(self):
        for failure in ("startup", "worker", "health", "revision"):
            with self.subTest(failure=failure):
                # Each transaction starts with exactly the production state it must preserve.
                self.host.failure = failure
                self.host.calls.clear()
                self.host.events.clear()
                self.host.new_revision = OTHER if failure == "revision" else COMMIT
                original_state = {"commit": OTHER, "compose_file": str(self.host.compose_file)}
                self.host.state.parent.mkdir(exist_ok=True)
                self.host.state.write_text(json.dumps(original_state))
                with self.assertRaises((RuntimeError, subprocess.CalledProcessError)):
                    self.deployment.deploy(COMMIT)
                self.assertLess(self.host.events.index("up-new"), self.host.events.index("up-old"))
                self.assertEqual(self.host.active, "old")
                self.assertEqual(json.loads(self.host.state.read_text()), original_state)
                self.assert_no_data_restore()

    def test_success_uses_fixed_env_volume_both_images_and_commits_after_health(self):
        self.deployment.deploy(COMMIT)
        state = json.loads(self.host.state.read_text())
        self.assertEqual(state["commit"], COMMIT)
        self.assertTrue(state["deployed_at"])
        self.assertEqual(self.host.health_state_observations, [None, None])
        self.assertEqual(self.host.events[:4], ["build", "stop-event-sync", "stop-app", "backup"])
        self.assertEqual(self.host.events[-1], "verify-revision")
        release = Path(state["compose_file"]).parent
        override = json.loads((release / "production.override.json").read_text())
        expected_image = "hamghadam-release:" + COMMIT
        self.assertEqual(override["services"], {"app": {"image": expected_image}, "event-sync": {"image": expected_image}})
        self.assertEqual(override["volumes"]["app-data"], {"external": True, "name": self.host.config["volume"]})
        for args, env, _ in self.host.calls:
            if args[:2] == ["docker", "compose"]:
                self.assertEqual(args[args.index("--project-name") + 1], self.host.config["project"])
                self.assertEqual(args[args.index("--env-file") + 1], self.host.config["env_file"])
                self.assertEqual(env["APP_ENV_FILE"], self.host.config["env_file"])
                if "up" in args:
                    self.assertIn("--no-build", args)
                    self.assertEqual(args[args.index("--pull") + 1], "never")
                    if args[-1] == "app":
                        self.assertIn("--wait", args)
                    else:
                        self.assertEqual(args[-1], "event-sync")
                        self.assertIn("--no-deps", args)
                        self.assertNotIn("--wait", args)
        backup = next(args for args, _, _ in self.host.calls if args[:2] == ["docker", "run"])
        self.assertIn("--network=none", backup)
        self.assertIn(self.host.config["volume"] + ":/data", backup)
        self.assertTrue(any(arg.startswith("hamghadam-rollback-app:") for arg in backup))
        self.assertEqual(backup[backup.index("--entrypoint") + 1], "sh")
        fetches = [args for args, _, _ in self.host.calls if args[0] == "git" and "fetch" in args]
        self.assertEqual([args[-1] for args in fetches], ["refs/heads/main", "refs/heads/main"])
        self.assert_no_data_restore()

    def test_changed_release_data_paths_and_volume_fail_before_stop(self):
        for key, value in (("DATABASE_PATH", "/data/new.sqlite"), ("MEDIA_PATH", "/elsewhere"), ("volume", "empty-volume")):
            with self.subTest(key=key):
                before = len(self.stop_calls())
                old = self.host.resolved_environment.copy()
                self.host.resolved_volume = "empty-volume" if key == "volume" else self.host.config["volume"]
                if key != "volume":
                    self.host.resolved_environment[key] = value
                with self.assertRaisesRegex(RuntimeError, "unexpected|volume mismatch"):
                    self.deployment.deploy(COMMIT)
                self.assertEqual(len(self.stop_calls()), before)
                self.host.resolved_environment = old

    def test_running_data_environment_or_volume_mismatch_fails_before_stop(self):
        original = copy.deepcopy(self.host.containers["app"])
        for mismatch in ("environment", "volume"):
            with self.subTest(mismatch=mismatch):
                self.host.containers["app"] = copy.deepcopy(original)
                if mismatch == "environment":
                    self.host.containers["app"]["Config"]["Env"][0] = "DATABASE_PATH=/data/other.sqlite"
                else:
                    self.host.containers["app"]["Mounts"][0]["Name"] = "wrong-volume"
                with self.assertRaisesRegex(RuntimeError, "does not match|expected data volume"):
                    self.deployment.deploy(COMMIT)
                self.assertFalse(self.stop_calls())

    def test_changed_app_mount_rejects_an_empty_data_volume_before_stop(self):
        for key, value in (("source", "different-data"), ("target", "/new-data"), ("type", "bind")):
            with self.subTest(key=key):
                self.host.resolved_mount = {"type": "volume", "source": "app-data", "target": "/data", key: value}
                with self.assertRaisesRegex(RuntimeError, "must mount the existing data volume"):
                    self.deployment.deploy(COMMIT)
                self.assertFalse(self.stop_calls())

    def test_rollback_snapshot_preserves_resolved_absolute_paths(self):
        self.deployment.root.mkdir()
        transaction = self.deployment.root / "transaction"
        transaction.mkdir()
        base, _, _ = self.deployment.previous_deployment(transaction)
        snapshot = json.loads(base.read_text())
        self.assertEqual(snapshot["services"]["app"]["build"]["context"], str(self.host.compose_file.parent))

    def test_private_controller_umask_does_not_make_runtime_source_unreadable(self):
        previous_umask = os.umask(0o077)
        try:
            self.deployment.deploy(COMMIT)
            release = self.deployment.root / "releases" / COMMIT
            for path in (release, release / "drizzle", release / "drizzle/meta"):
                self.assertEqual(path.stat().st_mode & 0o777, 0o755)
            self.assertEqual((release / "drizzle/meta/_journal.json").stat().st_mode & 0o777, 0o644)
            self.assertEqual((self.deployment.root / "current.json").stat().st_mode & 0o777, 0o600)
        finally:
            os.umask(previous_umask)


class RequestValidationTests(unittest.TestCase):
    def test_ssh_request_rejects_extra_arguments_whitespace_and_shell_syntax_before_access(self):
        invalid = [[], ["deploy"], ["deploy", COMMIT], ["deploy " + COMMIT + "; id"],
                   ["deploy " + COMMIT + "\n"], ["deploy  " + COMMIT], ["deploy " + COMMIT.upper()],
                   ["deploy " + COMMIT[:-1]], ["status ", "extra"], ["status\n"], ["unknown"]]
        with mock.patch.object(controller, "Deployment") as deployment, mock.patch.object(controller.os, "geteuid") as uid:
            for arguments in invalid:
                with self.subTest(arguments=arguments), mock.patch.object(controller.sys, "argv", ["controller", *arguments]):
                    with self.assertRaises(ValueError):
                        controller.main()
            uid.assert_not_called()
            deployment.assert_not_called()

    def test_non_root_cannot_execute_valid_request(self):
        with mock.patch.object(controller.sys, "argv", ["controller", "status"]), mock.patch.object(controller.os, "geteuid", return_value=1000):
            with self.assertRaises(PermissionError):
                controller.main()

    def test_explicit_configuration_dispatches_only_the_existing_request(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "stage.json"
            config.write_text('{"branch": "stage"}')
            with mock.patch.object(controller.os, "geteuid", return_value=0), mock.patch.object(controller, "Deployment") as deployment, mock.patch.object(controller.signal, "signal"):
                with mock.patch.object(controller.sys, "argv", ["controller", "--config", str(config), "deploy " + COMMIT]):
                    controller.main()
                deployment.assert_called_once_with({"branch": "stage"})
                deployment.return_value.deploy.assert_called_once_with(COMMIT)

    def test_relative_configuration_is_rejected_before_access(self):
        with mock.patch.object(controller.os, "geteuid") as uid, mock.patch.object(controller.sys, "argv", ["controller", "--config", "stage.json", "status"]):
            with self.assertRaisesRegex(ValueError, "absolute path"):
                controller.main()
            uid.assert_not_called()

    def test_invalid_branch_or_image_names_are_rejected(self):
        config = json.loads((SOURCE.parent / "staging-config.example.json").read_text())
        for branch in ("--upload-pack=evil", "../main", "stage; id", "stage\n", "", "main.lock"):
            with self.subTest(branch=branch), self.assertRaises(ValueError):
                controller.Deployment({**config, "branch": branch})
        with self.assertRaises(ValueError):
            controller.Deployment({**config, "image_prefix": "hamghadam:production"})

    def test_examples_select_independent_environments(self):
        production = controller.Deployment(json.loads((SOURCE.parent / "production-config.example.json").read_text()))
        staging = controller.Deployment(json.loads((SOURCE.parent / "staging-config.example.json").read_text()))
        self.assertEqual(production.branch, "main")
        self.assertEqual(staging.branch, "stage")
        for field in ("project", "volume", "state_dir", "env_file", "initial_compose", "image_prefix"):
            self.assertNotEqual(production.config[field], staging.config[field])
        self.assertEqual(staging.env["APP_PORT"], "127.0.0.1:3100")

    def test_exact_commands_dispatch_and_ignore_ssh_disconnect_signal(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.json"
            config.write_text("{}")
            with mock.patch.object(controller, "CONFIG", config), mock.patch.object(controller.os, "geteuid", return_value=0), mock.patch.object(controller, "Deployment") as deployment, mock.patch.object(controller.signal, "signal") as signal:
                for request in ("status", "deploy " + COMMIT):
                    with mock.patch.object(controller.sys, "argv", ["controller", request]):
                        controller.main()
                deployment.return_value.status.assert_called_once_with()
                deployment.return_value.deploy.assert_called_once_with(COMMIT)
                self.assertEqual(signal.call_count, 2)
                signal.assert_called_with(controller.signal.SIGHUP, controller.signal.SIG_IGN)


if __name__ == "__main__":
    unittest.main()
