import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const folder = mkdtempSync(path.join(tmpdir(), "hamghadam-docker-"));
const project = `hamghadam-test-${randomBytes(6).toString("hex")}`;
const environmentFile = path.join(folder, "runtime.env");
const portProbe = createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const secret = randomBytes(32).toString("hex");
function writeEnvironment(enabled) {
  writeFileSync(environmentFile, readFileSync(".env.docker.example", "utf8")
    .replace(/^APP_PORT=.*$/m, `APP_PORT=${port}`)
    .replace(/^APP_ORIGIN=.*$/m, `APP_ORIGIN=${origin}`)
    .replace(/^OTP_SECRET=.*$/m, `OTP_SECRET=${secret}`)
    .replace(/^TEMP_LOGIN_ENABLED=.*$/m, `TEMP_LOGIN_ENABLED=${enabled}`), { mode: 0o600 });
}
writeEnvironment(false);
function compose(args, { allowFailure = false, streamOutput = false } = {}) {
  const result = spawnSync("docker", ["compose", "--project-name", project,
    "--project-directory", root, "--file", path.join(root, "compose.yaml"),
    "--env-file", environmentFile, ...args], {
    env: { ...process.env, APP_ENV_FILE: environmentFile, APP_PORT: String(port) },
    encoding: "utf8", timeout: 900000, maxBuffer: 16 * 1024 * 1024,
    stdio: streamOutput ? "inherit" : "pipe",
  });
  if (!allowFailure) assert.equal(result.status, 0,
    `Compose ${args[0]} failed: ${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`);
  return result;
}
const execute = (source) => compose(["exec", "-T", "app", "node", "--input-type=module", "-e", source]).stdout.trim();
async function request(route, data, cookie) {
  const response = await fetch(origin + route, {
    method: data ? "POST" : "GET",
    headers: { Origin: origin, ...(data ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}) },
    body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(15000),
  });
  return { response, data: await response.json() };
}
let passed = false;
try {
  compose(["config", "--quiet"]);
  console.log("Building and starting isolated Compose deployment...");
  compose(["up", "-d", "--build", "--wait", "--wait-timeout", "120"], { streamOutput: true });
  assert.equal((await request("/api/health")).data.status, "ok");
  assert.equal(execute("console.log(process.getuid())"), "1000");
  assert.equal((await request("/api/auth/request", { phone: "09108624707" })).response.status, 503);
  for (const asset of ["/favicon.svg", "/images/cafe.jpg", "/login"]) {
    assert.equal((await fetch(origin + asset, { signal: AbortSignal.timeout(15000) })).status, 200);
  }
  console.log("PASS fresh-volume migrations, health, non-root runtime, assets, and disabled test login");

  writeEnvironment(true);
  compose(["up", "-d", "--no-build", "--wait", "--wait-timeout", "120"]);
  const challenge = await request("/api/auth/request", { phone: "09108624707" });
  assert.equal(challenge.response.status, 200);
  assert(challenge.data.challengeId);
  assert.equal(challenge.response.headers.get("set-cookie"), null);
  assert.equal((await request("/api/auth/verify", { challengeId: challenge.data.challengeId, code: "999999" })).response.status, 400);
  const login = await request("/api/auth/verify", { challengeId: challenge.data.challengeId, code: "123456" });
  assert.equal(login.response.status, 200);
  assert.equal(login.data.user.phone, "09108624707");
  const cookie = login.response.headers.get("set-cookie").split(";")[0];
  const bytes = readFileSync("public/images/cafe.jpg");
  const form = new FormData();
  form.set("data", "{}");
  form.set("cover", new Blob([bytes], { type: "image/jpeg" }), "avatar.jpg");
  const upload = await fetch(origin + "/api/profile/avatar", {
    method: "POST", headers: { Origin: origin, Cookie: cookie }, body: form,
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(upload.status, 201);
  const avatar = await upload.json();
  console.log("PASS container OTP login and real media upload without SMS credentials");

  compose(["up", "-d", "--no-build", "--force-recreate", "--wait", "--wait-timeout", "120"]);
  assert.equal((await request("/api/me", undefined, cookie)).data.user.id, login.data.user.id);
  const media = await fetch(origin + avatar.url, { signal: AbortSignal.timeout(15000) });
  assert.equal(media.status, 200);
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), bytes);
  compose(["exec", "-T", "app", "node", "scripts/migrate-node.mjs"]);
  console.log("PASS database, session, and uploaded media survive recreation; migrations are repeatable");

  compose(["exec", "-T", "-e", "DATABASE_PATH=/data/failure.sqlite", "app", "node", "scripts/migrate-node.mjs"]);
  execute(`import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync('/data/failure.sqlite');
    db.exec("UPDATE mvp_migrations SET checksum='invalid'"); db.close();`);
  const failed = compose(["run", "--rm", "--no-deps", "-e", "DATABASE_PATH=/data/failure.sqlite",
    "app", "node", "-e", 'console.log("SERVER_SHOULD_NOT_START")'], { allowFailure: true });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Applied migration changed/);
  assert(!failed.stdout.includes("SERVER_SHOULD_NOT_START"));
  console.log("PASS entrypoint refuses to start after a migration checksum failure");
  passed = true;
} finally {
  if (!passed) {
    const logs = compose(["logs", "--tail=100", "app"], { allowFailure: true });
    console.error(logs.stdout, logs.stderr);
  }
  // Only remove this test's randomly named project and its disposable volume.
  const cleanup = compose(["down", "--volumes", "--rmi", "local"], { allowFailure: true });
  rmSync(folder, { recursive: true, force: true });
  assert.equal(cleanup.status, 0, `Could not clean up Docker test project ${project}: ${cleanup.stderr}`);
}
