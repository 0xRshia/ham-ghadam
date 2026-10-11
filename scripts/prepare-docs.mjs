import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const destination = new URL("../public/docs/swagger/", import.meta.url);
await mkdir(destination, { recursive: true });
// Ship the pinned distribution with both runtimes; documentation must work without a CDN.
for (const file of ["swagger-ui-bundle.js", "swagger-ui.css", "LICENSE", "NOTICE"]) {
  await copyFile(require.resolve(`swagger-ui-dist/${file}`), new URL(file, destination));
}
