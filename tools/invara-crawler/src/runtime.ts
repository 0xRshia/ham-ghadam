export interface RateLimitState {
  pause_until: number;
  adaptive_delay_ms: number;
  rate_limit_count: number;
}

export interface CrawlRuntimeState extends RateLimitState {
  pid: number;
  updated_at: string;
  last_activity_at: string;
  active_place_ids: string[];
  pending_response_count: number;
}

export function crawlIsStalled(runtime: CrawlRuntimeState | null, pid: number, startedAt: number,
  rateLimit: RateLimitState | null, now = Date.now(), timeoutMs = 600000): boolean {
  const ownRuntime = runtime?.pid === pid ? runtime : null;
  const activity = ownRuntime ? Date.parse(ownRuntime.last_activity_at) : startedAt;
  const pauseUntil = Math.max(ownRuntime?.pause_until ?? 0, rateLimit?.pause_until ?? 0);
  // A restart must never shorten a server-requested pause, including its settling time.
  return now - (Number.isFinite(activity) ? activity : startedAt) > timeoutMs && now > pauseUntil + 60000;
}

export async function bounded<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out ${label}`)), timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
  }
}
