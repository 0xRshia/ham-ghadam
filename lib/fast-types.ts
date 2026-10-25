import type { EventDetailData, EventItem } from "@/lib/types";

export type FastOrganizer = { id: string; name: string; phone: string; host_id?: string | null; instagram_handle?: string | null };
export type FastEvent = EventDetailData & { revision: number; hasReservations: boolean; canDelete: boolean };
export type FastEventList = {
  items: (EventItem & { revision: number; hasReservations: boolean; canDelete: boolean; organizer_name: string | null })[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
