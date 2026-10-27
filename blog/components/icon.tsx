const paths = {
  "arrow-up-left": "M17 17 7 7M7 17V7h10",
  "arrow-down": "M12 5v14m-7-7 7 7 7-7",
  "arrow-left": "M19 12H5m7-7-7 7 7 7",
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
