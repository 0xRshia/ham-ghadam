"use client";

import { useId } from "react";

export function EventCoordinatesField({ value, onChange, disabled, fieldClassName, hintClassName }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  fieldClassName?: string;
  hintClassName?: string;
}) {
  const hintId = useId();
  return <>
    <label className={fieldClassName}>مختصات جغرافیایی (Latitude, Longitude)<input name="coordinates" type="text" inputMode="decimal" dir="ltr" placeholder="35.7219, 51.3347" autoComplete="off" value={value} disabled={disabled} aria-describedby={hintId} onChange={event => onChange(event.target.value)} /></label>
    <p id={hintId} className={hintClassName}>مختصات اختیاری محل برای نمایش رویداد روی نقشه است. عرض و طول را با کاما جدا کنید، به همان ترتیبی که Google Maps کپی می‌کند؛ اگر خالی باشد، مختصات قابل‌استخراج از پیوند محل استفاده می‌شود.</p>
  </>;
}
