"use client";

import { useId } from "react";

export function EventCoordinatesFields({ lat, lng, onChange, disabled, fieldClassName, hintClassName }: {
  lat: string;
  lng: string;
  onChange: (key: "lat" | "lng", value: string) => void;
  disabled?: boolean;
  fieldClassName?: string;
  hintClassName?: string;
}) {
  const hintId = useId();
  return <>
    {([["lat", "عرض جغرافیایی (Latitude)", lat], ["lng", "طول جغرافیایی (Longitude)", lng]] as const).map(([key, label, value]) =>
      <label key={key} className={fieldClassName}>{label}<input name={key} type="text" inputMode="decimal" dir="ltr" value={value} disabled={disabled} aria-describedby={hintId} onChange={event => onChange(key, event.target.value)} /></label>)}
    <p id={hintId} className={hintClassName}>مختصات اختیاری محل برای نمایش رویداد روی نقشه است. هر دو مقدار را وارد کنید؛ اگر خالی باشند، مختصات قابل‌استخراج از پیوند محل استفاده می‌شود.</p>
  </>;
}
