import { countdownParts } from "@/lib/countdown";
import { copy } from "@/locales/fa";
import { faDigits } from "@/lib/types";

export function UpcomingCountdown({ startsAt, now }: { startsAt: number; now: number }) {
  const { days, hours, minutes } = countdownParts(startsAt, now);
  return <div className="el-upcoming-countdown" role="timer" aria-label={copy.upcomingCountdown} dir="ltr">
    {[[days, copy.countdownDays], [hours, copy.countdownHours], [minutes, copy.countdownMinutes]].map(([value, label]) =>
      <span key={label}><strong>{faDigits(String(value).padStart(2, "0"))}</strong><small>{label}</small></span>
    )}
  </div>;
}
