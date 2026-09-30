import { digits } from "./types";
const partsFormatter = new Intl.DateTimeFormat("en-US-u-ca-persian", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
export function persianInput(time: number) {
  const p = partsFormatter.formatToParts(time);
  return ["year", "month", "day"]
    .map((t) => p.find((x) => x.type === t)!.value.padStart(2, "0"))
    .join("/");
}
export function parsePersianDate(value: string, time: string) {
  const match = digits(value).match(/^(14\d{2})[/-](\d{1,2})[/-](\d{1,2})$/);
  const tm = digits(time).match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !tm || +tm[1] > 23 || +tm[2] > 59) return NaN;
  const y = +match[1],
    m = +match[2],
    d = +match[3];
  if (m < 1 || m > 12 || d < 1 || d > 31) return NaN;
  const expected = `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
  const estimate =
    Date.UTC(y + 621, 2, 20) +
    ((m - 1) * 31 - Math.max(0, m - 7) + d - 1) * 86400000;
  for (let offset = -3; offset <= 3; offset++) {
    const day = estimate + offset * 86400000;
    const candidate = day + (+tm[1] * 60 + +tm[2] - 210) * 60000;
    if (persianInput(candidate) === expected) return candidate;
  }
  return NaN;
}
