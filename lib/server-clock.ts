const serverClockAnchors = new Map<number, number>();

export function serverClockAnchor(serverNow: number, observedAt: number) {
  const existing = serverClockAnchors.get(serverNow);
  if (existing !== undefined) return existing;
  serverClockAnchors.set(serverNow, observedAt);
  if (serverClockAnchors.size > 256) {
    const oldest = serverClockAnchors.keys().next().value;
    if (oldest !== undefined) serverClockAnchors.delete(oldest);
  }
  return observedAt;
}

export function serverClockTime(serverNow: number, observedAt: number, localNow: number) {
  return serverNow + localNow - observedAt;
}
