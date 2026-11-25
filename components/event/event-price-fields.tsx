"use client";

import { useId } from "react";
import { copy } from "@/locales/fa";
import { fastCopy } from "@/locales/fast-fa";

export function EventPriceFields({ price, originalPrice, onChange, disabled, fieldClassName, hintClassName }: {
  price?: string;
  originalPrice?: string;
  onChange?: (field: "price" | "original_price", value: string) => void;
  disabled?: boolean;
  fieldClassName?: string;
  hintClassName?: string;
}) {
  const id = useId();
  return <>
    <label className={fieldClassName}>
      <span id={`${id}-price-label`}>{fastCopy.priceOptional}</span>
      <input name="price" aria-labelledby={`${id}-price-label`} aria-describedby={`${id}-price-help`} inputMode="numeric" dir="ltr" maxLength={15} placeholder={fastCopy.priceUnspecified} value={price} disabled={disabled} onChange={event => onChange?.("price", event.target.value)} />
      <small id={`${id}-price-help`} className={hintClassName}>{fastCopy.priceHint}</small>
    </label>
    <label className={fieldClassName}>
      <span id={`${id}-original-label`}>{copy.originalPrice}</span>
      <input name="original_price" aria-labelledby={`${id}-original-label`} aria-describedby={`${id}-original-help`} inputMode="numeric" dir="ltr" maxLength={15} value={originalPrice} disabled={disabled} onChange={event => onChange?.("original_price", event.target.value)} />
      <small id={`${id}-original-help`} className={hintClassName}>{fastCopy.originalPriceHint}</small>
    </label>
  </>;
}
