export type TicketDownloadResponse = {
  reservation: {
    id: string;
    quantity: number;
    name: string;
    phone: string;
    title: string;
    venue: string;
    address: string;
    city: string;
    starts_at: number;
    ends_at: number;
  };
  tickets: { id: string; ordinal: number; qr: string; checked_in_at: number | null }[];
};
