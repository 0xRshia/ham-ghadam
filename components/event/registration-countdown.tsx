"use client";

import { faContent, faMessages } from "@/locales/domain-fa";
import { useState } from "react";
import { Clock3 } from "lucide-react";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { REGISTRATION_CLOSED, registrationCountdownMinutes } from "@/lib/registration";
import { fa } from "@/lib/types";
import styles from "./registration-countdown.module.css";

function RollingDigit({ digit }: { digit: string }) {
  const [frame, setFrame] = useState({ current: digit, previous: digit });
  // Retain the outgoing glyph only when this digit changes, without an effect or another timer.
  if (frame.current !== digit) setFrame({ current: digit, previous: frame.current });
  return (
    <span className={styles.digit}>
      <span key={frame.current} className={styles.frame} data-changing={frame.current !== frame.previous || undefined}>
        <span className={styles.previous}>{frame.previous}</span>
        <span className={styles.current}>{frame.current}</span>
      </span>
    </span>
  );
}

export function RegistrationCountdown({ deadline, serverNow, compact = false, tiles = false, squareTiles = false, className = "" }: {
  deadline: number;
  serverNow?: number;
  compact?: boolean;
  tiles?: boolean;
  squareTiles?: boolean;
  className?: string;
}) {
  const now = useDeadlineClock(deadline, 60000, serverNow);
  const remaining = now === null ? null : registrationCountdownMinutes(deadline, now);
  const countdownClassName = `${styles.countdown}${compact ? ` ${styles.compact}` : ""}${tiles ? ` ${styles.tiles}` : ""}${squareTiles ? ` ${styles.squareTiles}` : ""} ${className}`;
  if (remaining === null) return null;
  if (remaining === 0) {
    return (
      <div className={`${countdownClassName} ${styles.closed}`}>
        <span className={styles.label}><Clock3 size={16} aria-hidden="true" /><span>{REGISTRATION_CLOSED}</span></span>
      </div>
    );
  }
  const units = [
    { value: Math.floor(remaining / (24 * 60)), label: faContent.day },
    { value: Math.floor(remaining / 60) % 24, label: faContent.hour },
    { value: remaining % 60, label: faContent.minute },
  ];
  const description = units.map(({ value, label }) => `${fa(value)} ${label}`).join(faContent.conjunction);
  return (
    <div className={countdownClassName} role="timer" aria-live="off" aria-label={faMessages.registrationTimeRemaining(String(description))}>
      <span className={styles.label} aria-hidden="true"><Clock3 size={16} />{faContent.registrationDeadline}</span>
      <div className={styles.units} dir="ltr" aria-hidden="true">
        {units.map(({ value, label }) => (
          <div className={styles.unit} key={label}>
            <span className={styles.digits}>
              {fa(value).padStart(2, "۰").split("").map((digit, position) => (
                <RollingDigit key={position} digit={digit} />
              ))}
            </span>
            <span className={styles.unitLabel} dir="rtl">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
