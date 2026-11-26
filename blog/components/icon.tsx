const paths = {
  "arrow-up-left": "M17 17 7 7M7 17V7h10",
  "arrow-down": "M12 5v14m-7-7 7 7 7-7",
  "arrow-left": "M19 12H5m7-7-7 7 7 7",
  "chevron-left": "m14.5 5-7 7 7 7",
  pin: "M19.5 10c0 5.1-5.6 9.5-7.5 11-1.9-1.5-7.5-5.9-7.5-11a7.5 7.5 0 1 1 15 0ZM14.6 10a2.6 2.6 0 1 0-5.2 0 2.6 2.6 0 1 0 5.2 0Z",
  book: "M12 6c-3-2-6-2.5-10-1.5v14c4-1 7-.5 10 1.5m0-14c3-2 6-2.5 10-1.5v14c-4-1-7-.5-10 1.5m0-14v14",
  directions: "m20 3-6.1 17a1 1 0 0 1-1.9-.1l-1.8-6.4-6.6-2a1 1 0 0 1 0-1.9l15-6.7a1 1 0 0 1 1.4.1Z",
  close: "m5.5 5.5 13 13m0-13-13 13",
  moon: "M20.6 14.2A8.9 8.9 0 0 1 9.8 3.4a9 9 0 1 0 10.8 10.8Z",
  sun: "M16 12a4 4 0 1 0-8 0 4 4 0 1 0 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M6.3 17.7l-1.4 1.4M17.7 6.3l1.4-1.4",
  bolt: "m14 2-9.5 12H11l-1 8 9.5-12H13z",
  instagram: "M8.5 3h7A5.5 5.5 0 0 1 21 8.5v7a5.5 5.5 0 0 1-5.5 5.5h-7A5.5 5.5 0 0 1 3 15.5v-7A5.5 5.5 0 0 1 8.5 3ZM16 12a4 4 0 1 0-8 0 4 4 0 1 0 8 0Zm1.5-5h.01",
  "external-link": "M15 3h6v6m0-6L10 14m-1-9H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  plus: "M12 5v14M5 12h14",
  "file-text": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8m-8 4h6",
};

export function Icon({ name, size = 20, className = "" }: {
  name: keyof typeof paths;
  size?: number;
  className?: string;
}) {
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">
    <path d={paths[name]} />
  </svg>;
}
