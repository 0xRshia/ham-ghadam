"use client";
import { copy } from "@/locales/fa";

export function DeferredLoading({ error, retry }: { error?: Error | null; retry?: () => void }) {
  return error ? <div role="alert"><p>{copy.saveFailed}</p><button type="button" onClick={retry}>{copy.retry}</button></div>
    : <p role="status">{copy.loading}</p>;
}
