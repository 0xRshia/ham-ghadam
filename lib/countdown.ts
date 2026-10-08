export function countdownParts(deadline: number, now: number) {
  const totalMinutes = Math.max(0, Math.ceil((deadline - now) / 60_000));
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor(totalMinutes / 60) % 24,
    minutes: totalMinutes % 60,
  };
}
