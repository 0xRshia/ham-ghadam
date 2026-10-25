type VuesaxIconName = "flash" | "brush" | "music" | "book" | "coffee" | "game" | "ghost" |
  "search-normal" | "setting-4" | "calendar" | "arrow-down" | "close-circle" | "location";

/** Linear SVGs, coloured by the surrounding control in both themes. */
export function VuesaxIcon({ name }: { name: VuesaxIconName }) {
  const source = `url("${name === "ghost" ? "/icons/ghost.svg" : `/icons/vuesax/${name}.svg`}")`;
  return <span className="el-vuesax-icon" aria-hidden="true" style={{ maskImage: source, WebkitMaskImage: source }} />;
}
