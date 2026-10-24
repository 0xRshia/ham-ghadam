import type { FastOrganizer } from "@/lib/fast-types";

export type EventOrganizerInput = { host_id: string | null; organizer_name: string | null; organizer_id?: string | null; instagram_handle?: string };

export function readEventOrganizer(data: Record<string, unknown>): EventOrganizerInput | null {
  if (typeof data.host_id === "string" && data.host_id.trim()) {
    if (data.organizer_name != null && data.organizer_name !== "") return null;
    return { host_id: data.host_id, organizer_name: null };
  }
  if (data.host_id !== null || typeof data.organizer_name !== "string") return null;
  const name = data.organizer_name.trim();
  if (!name || Array.from(name).length > 100 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return { host_id: null, organizer_name: name };
}

export function normalizeOrganizerSearch(value: string) {
  return value.normalize("NFKC").replace(/ي/g, "ی").replace(/ك/g, "ک")
    .replace(/[۰-۹٠-٩]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".includes(digit) ? "۰۱۲۳۴۵۶۷۸۹".indexOf(digit) : "٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\s\u200c]+/g, " ").trim().toLocaleLowerCase("fa-IR");
}

export function matchingOrganizers(organizers: FastOrganizer[], query: string) {
  const search = normalizeOrganizerSearch(query);
  return organizers.filter(item => normalizeOrganizerSearch(item.name).includes(search) || normalizeOrganizerSearch(item.phone).includes(search) || normalizeOrganizerSearch(item.instagram_handle ?? "").includes(search.replace(/^@/, "")));
}
