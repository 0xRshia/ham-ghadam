export type CheckoutDraft = { counts: Record<string, number>; requestKey: string | null; expiresAt: number };
const storageKey = (eventId: string) => `hg_checkout:${eventId}`;
export function readCheckoutDraft(eventId: string): CheckoutDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(eventId)) ?? "null");
    if (!value || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now() || !value.counts || Array.isArray(value.counts) || typeof value.counts !== "object") return null;
    const entries = Object.entries(value.counts);
    if (entries.length > 12 || entries.some(([key,count])=>!/^[\w-]{1,80}$/.test(key) || !Number.isInteger(count) || (count as number)<0 || (count as number)>6)) return null;
    if (value.requestKey !== null && (typeof value.requestKey !== "string" || !/^[\w-]{16,80}$/.test(value.requestKey))) return null;
    return value;
  } catch { return null; }
}
export function saveCheckoutDraft(eventId: string, counts: Record<string,number>, requestKey: string | null) {
  sessionStorage.setItem(storageKey(eventId),JSON.stringify({counts,requestKey,expiresAt:Date.now()+3600000}));
}
export function clearCheckoutDraft(eventId: string) {
  try { sessionStorage.removeItem(storageKey(eventId)); } catch { /* A confirmed booking remains accessible through the account API. */ }
}
