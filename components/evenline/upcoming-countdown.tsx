import { countdownParts } from "@/lib/countdown";
import { fa, faDigits } from "@/lib/types";
import { faContent } from "@/locales/domain-fa";
import { copy } from "@/locales/fa";

export function UpcomingCountdown({ startsAt, now, eventTitle }: { startsAt: number; now: number; eventTitle: string }) {
  const { days, hours, minutes } = countdownParts(startsAt, now);
  const units = [
    { value: days, label: faContent.day },
    { value: hours, label: faContent.hour },
    { value: minutes, label: faContent.minute },
  ];
  const description = units.map(({ value, label }) => `${fa(value)} ${label}`).join(faContent.conjunction);
  return <div className="el-upcoming-countdown" role="timer" aria-live="off" aria-label={copy.upcomingCountdown(eventTitle, description)} dir="rtl" lang="fa">
    {units.map(({ value, label }) =>
      <span key={label} aria-hidden="true"><strong>{faDigits(String(value).padStart(2, "0"))}</strong><small>{label}</small></span>
    )}
  </div>;
}
