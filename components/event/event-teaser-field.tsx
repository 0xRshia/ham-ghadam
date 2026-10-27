"use client";

import { useId } from "react";
import { normalizeEventTeaser } from "@/lib/event-teaser";
import { eventTeaserCopy as copy } from "@/locales/event-teaser-fa";

export function EventTeaserField({ value, onChange, disabled, className }: {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const hintId = useId();
  return <label className={className}>
    {copy.label}
    <input name="teaser" type="url" dir="ltr" maxLength={2048} autoCapitalize="none" autoCorrect="off" spellCheck={false}
      value={value} disabled={disabled} aria-describedby={hintId} onChange={event => {
        event.currentTarget.setCustomValidity(normalizeEventTeaser(event.currentTarget.value) === undefined ? copy.invalid : "");
        onChange?.(event.currentTarget.value);
      }} />
    <small id={hintId}>{copy.hint}</small>
  </label>;
}
