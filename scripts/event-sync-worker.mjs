import { setTimeout as delay } from "node:timers/promises";

export function eventSyncJobUrl(origin) {
  const url = new URL("/api/jobs/event-sync", origin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const compose = url.hostname === "app" && url.port === "3000";
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && (local || compose)))) throw new Error("Event sync requires HTTPS outside loopback or the internal Compose app service");
  return url;
}

export async function eventSyncTick(origin, secret, signal) {
  if (!secret || secret.length < 32) throw new Error("EVENT_SYNC_JOB_SECRET must contain at least 32 characters");
  const response = await fetch(eventSyncJobUrl(origin), {
    method: "POST", headers: { Authorization: `Bearer ${secret}` }, redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(55000)]),
  });
  if (!response.ok) throw new Error(`Event sync job returned HTTP ${response.status}`);
  const result = await response.json();
  if (typeof result.hasMore !== "boolean") throw new Error("Invalid event sync job response");
  return result;
}

async function main() {
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => controller.abort());
  const secret = process.env.EVENT_SYNC_JOB_SECRET;
  const origin = process.env.EVENT_SYNC_JOB_ORIGIN ?? process.env.APP_ORIGIN;
  if (!origin || !secret || secret.length < 32) console.error("Event sheet scheduler is inactive: configure EVENT_SYNC_JOB_SECRET and APP_ORIGIN.");
  else eventSyncJobUrl(origin);
  while (!controller.signal.aborted) {
    let wait = 30000;
    if (origin && secret && secret.length >= 32) {
      try { const result = await eventSyncTick(origin,secret,controller.signal); if (result.hasMore) wait = 250; }
      catch (error) { if (!controller.signal.aborted) console.error(error instanceof Error ? error.message : "Event sync tick failed"); }
    }
    try { await delay(wait,undefined,{ signal: controller.signal }); } catch { break; }
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) await main();
