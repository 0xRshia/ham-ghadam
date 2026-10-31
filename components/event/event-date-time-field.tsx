"use client";
import { useState } from "react";
import { DayPicker } from "@daypicker/persian";
import { TZDate } from "react-day-picker";
import calendarClassNames from "react-day-picker/style.module.css";
import { parsePersianDate, persianInput } from "@/lib/persian-date";
import { digits } from "@/lib/types";
import { faContent } from "@/locales/domain-fa";
const TIME_ZONE = "Asia/Tehran";
/** Shared Persian calendar and Tehran time controls for manual event editing. */
export function EventDateTimeField({ label, dateValue, time, onDateChange, onTimeChange, disabled = false, dateOnly = false }: {
  label: string; dateValue: string; time: string;
  onDateChange: (value: string) => void; onTimeChange: (value: string) => void; disabled?: boolean; dateOnly?: boolean;
}) {
  const timestamp = parsePersianDate(dateValue, "12:00");
  const selected = Number.isFinite(timestamp) ? new TZDate(timestamp, TIME_ZONE) : undefined;
  const [today] = useState(Date.now);
  return <>
    <DayPicker mode="single" required selected={selected} defaultMonth={selected} timeZone={TIME_ZONE}
      startMonth={new TZDate(Math.min(today, selected ? +selected : today), TIME_ZONE)}
      endMonth={new TZDate(Math.max(today + 730 * 86400000, selected ? +selected : today), TIME_ZONE)}
      onSelect={value => onDateChange(persianInput(+value))} disabled={disabled}
      captionLayout="dropdown" navLayout="around" classNames={calendarClassNames} aria-label={label} />
    <label>{label}<input value={dateValue} onChange={event => onDateChange(digits(event.target.value))} required dir="ltr" maxLength={10} disabled={disabled} /></label>
    {!dateOnly && <label>{faContent.time}<input type="time" step={Number(time.split(":")[1]) % 5 === 0 ? 300 : 60} required dir="ltr" value={time} onChange={event => onTimeChange(event.target.value)} disabled={disabled} /></label>}
  </>;
}

