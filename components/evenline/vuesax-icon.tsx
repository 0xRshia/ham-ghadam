type VuesaxIconName = "flash" | "brush" | "music" | "book" | "coffee" | "game" |
  "search-normal" | "setting-4" | "calendar" | "arrow-down" | "close-circle" | "location";

/** Original Vuesax linear SVGs, coloured by the surrounding control in both themes. */
export function VuesaxIcon({ name }: { name: VuesaxIconName }) {
  const source = `url("/icons/vuesax/${name}.svg")`;
  return <span className="el-vuesax-icon" aria-hidden="true" style={{ maskImage: source, WebkitMaskImage: source }} />;
}
