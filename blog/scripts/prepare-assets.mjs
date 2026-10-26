import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../../", import.meta.url);
const destination = new URL("../public/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const path of ["brand", "fonts/darbareh", "favicon.ico", "favicon.svg", "apple-touch-icon.png"]) {
  const target = new URL(path, destination);
  await mkdir(new URL(".", target), { recursive: true });
  await cp(new URL(`public/${path}`, root), target, { recursive: true });
}
await cp(new URL("design-system/tokens.css", root), new URL("design-tokens.css", destination));
console.log(`Prepared shared brand assets in ${fileURLToPath(destination)}`);
