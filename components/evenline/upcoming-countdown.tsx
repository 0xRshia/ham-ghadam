import { countdownParts } from "@/lib/countdown";
import { copy } from "@/locales/fa";

export function UpcomingCountdown({ startsAt, now }: { startsAt: number; now: number }) {
  const { days, hours, minutes } = countdownParts(startsAt, now);
  return <div className="el-upcoming-countdown" role="timer" aria-label={copy.upcomingCountdown} dir="ltr">
    {[[days, "Day"], [hours, "hour"], [minutes, "minute"]].map(([value, label]) =>
      <span key={label}><strong>{String(value).padStart(2, "0")}</strong><small lang="en">{label}</small></span>
    )}
  </div>;
}
