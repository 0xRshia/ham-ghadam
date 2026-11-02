import { cp, mkdir } from "node:fs/promises";

// Ship the original, pinned engine distribution and its license together.
// No runtime dependency on an external CDN or a hosted 8th Wall account.
const source = new URL("../node_modules/@8thwall/engine-binary/dist/", import.meta.url);
const destination = new URL("../public/game/vendor/xr/", import.meta.url);
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
