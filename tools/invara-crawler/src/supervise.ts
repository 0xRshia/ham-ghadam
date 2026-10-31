import { mkdir, open, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { errorMessage, sleep } from "./model.js";
import { readJson, writeJson } from "./output.js";
import { snapshot } from "./snapshot.js";
import { crawlIsStalled } from "./runtime.js";
import type { CrawlRuntimeState, RateLimitState } from "./runtime.js";

const { values } = parseArgs({ options: {
  out: { type: "string", default: "exports/all-public" },
  workers: { type: "string", default: "2" }, "delay-ms": { type: "string", default: "3000" },
} });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(values.out!);
await mkdir(path.join(out, "checkpoints"), { recursive: true });
const statusPath = path.join(out, "job-status.json");
const lockPath = path.join(out, ".supervisor.lock");
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const oldLock = await readJson<{ pid: number }>(lockPath);
if (oldLock && alive(oldLock.pid)) throw new Error(`A supervisor is already running with PID ${oldLock.pid}`);
if (oldLock) await unlink(lockPath);
const lock = await open(lockPath, "wx");
await lock.writeFile(JSON.stringify({ pid: process.pid }));
await lock.close();
let stop = false;
let stopRequestedAt = 0;
let child: ReturnType<typeof spawn> | null = null;
const startedAt = new Date().toISOString();
const signal = () => { stop = true; stopRequestedAt ||= Date.now(); child?.kill("SIGTERM"); };
process.once("SIGINT", signal); process.once("SIGTERM", signal);
const signalChildGroup = (signal: NodeJS.Signals) => {
  if (!child?.pid) return;
  try { process.kill(-child.pid, signal); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
};
let attempt = 0;
let snapshotAt = 0;
let state: Record<string, unknown> = {};
let runtime: CrawlRuntimeState | null = null;
let rateLimit: RateLimitState | null = null;
const update = async (fields: Record<string, unknown> = {}) => {
  const files = await readdir(path.join(out, "checkpoints"));
  const checkpoint = await readJson<{ limit: number }>(path.join(out, "checkpoint.json"));
  runtime = await readJson<CrawlRuntimeState>(path.join(out, "crawler-status.json"));
  rateLimit = await readJson<RateLimitState>(path.join(out, "rate-limit-state.json"));
  state = { ...state, supervisor_pid: process.pid, child_pid: child?.pid ?? null,
    started_at: startedAt, updated_at: new Date().toISOString(), attempt,
    saved_detail_count: files.filter(file => file.endsWith(".json")).length,
    target_count: checkpoint?.limit ?? null,
    crawler_updated_at: runtime?.pid === child?.pid ? runtime?.updated_at : null,
    last_activity_at: runtime?.pid === child?.pid ? runtime?.last_activity_at : null,
    pause_until: rateLimit?.pause_until ?? 0,
    ...fields };
  await writeJson(statusPath, state);
};
try {
  while (!stop) {
    attempt++;
    const attemptStartedAt = Date.now();
    let recoveryRequestedAt = 0;
    let forced = false;
    console.log(`${new Date().toISOString()} Starting resumable crawl attempt ${attempt}`);
    child = spawn(process.execPath, [path.join(root, "dist/cli.js"), "--all", "--workers", values.workers!, "--delay-ms", values["delay-ms"]!, "--out", out],
      { cwd: root, detached: true, stdio: ["ignore", "inherit", "inherit"] });
    let exit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
    const result = new Promise<void>(resolve => {
      child!.once("exit", (code, signal) => { exit = { code, signal }; resolve(); });
      child!.once("error", error => { console.error(errorMessage(error)); exit = { code: 1, signal: null }; resolve(); });
    });
    await update({ status: "running" });
    while (!exit) {
      if (Date.now() - snapshotAt >= 300000) {
        try { await snapshot(out); snapshotAt = Date.now(); }
        catch (error) { console.error(`Snapshot deferred: ${errorMessage(error)}`); }
      }
      await Promise.race([result, sleep(10000)]);
      await update();
      if (!exit && !stop && !recoveryRequestedAt && child.pid
        && crawlIsStalled(runtime, child.pid, attemptStartedAt, rateLimit)) {
        recoveryRequestedAt = Date.now();
        console.error(`${new Date().toISOString()} No crawler activity for ten minutes; recovering from saved checkpoints.`);
        child.kill("SIGTERM");
        await update({ status: "recovering", recovery_reason: "No crawler activity for ten minutes outside server backoff" });
      }
      const terminatingAt = stopRequestedAt || recoveryRequestedAt;
      if (!exit && terminatingAt && !forced && Date.now() - terminatingAt >= 60000) {
        forced = true;
        signalChildGroup("SIGKILL");
      }
    }
    signalChildGroup("SIGTERM");
    child = null;
    await snapshot(out);
    const report = await readJson<{ requested_store_count: number; exported_store_count: number; reviews_complete_store_count: number; discovery_complete: boolean; partial_store_ids: string[] }>(path.join(out, "run-report.json"));
    const complete = report && report.requested_store_count > 0 && report.exported_store_count === report.requested_store_count
      && report.reviews_complete_store_count === report.requested_store_count && report.discovery_complete && !report.partial_store_ids.length;
    if (complete) { await update({ status: "complete", completed_at: new Date().toISOString() }); break; }
    await update({ status: stop ? "stopped" : "retrying", last_exit: exit });
    if (!stop) await sleep(60000);
  }
} finally {
  signalChildGroup("SIGTERM");
  if (stop) await update({ status: "stopped" });
  await unlink(lockPath).catch(() => {});
}
