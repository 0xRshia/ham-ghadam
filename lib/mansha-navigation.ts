export const manshaMenuPath = "/menu/mansha";
export const manshaSellerOrderPrefix = `${manshaMenuPath}/seller/`;

export function isManshaOrderId(value: string) {
  return value.length === 36 && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
}

export function isManshaSellerOrderPath(value: string | null) {
  return value !== null && value.startsWith(manshaSellerOrderPrefix) && isManshaOrderId(value.slice(manshaSellerOrderPrefix.length));
}

export function isManshaVenue(name: string) {
  const normalized = name.normalize("NFKC").replace(/[أآ]/g, "ا").replace(/\u200c/g, " ").replace(/\s+/gu, " ").trim();
  return /^(?:(?:کافه(?: رستوران)? )?(?:عمارت )?)منشاع?$/u.test(normalized);
}
