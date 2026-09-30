import { spawn } from "node:child_process";
import path from "node:path";
import { projectRoot } from "./sites-env.mjs";

// Wrangler resolves secret files relative to its config; use the project root explicitly.
const child = spawn(process.execPath, [
  path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js"),
  "dev", "--config", path.join(projectRoot, "dist/server/wrangler.json"),
  "--local", "--persist-to", path.join(projectRoot, ".wrangler/state"),
  "--ip", "127.0.0.1", "--inspector-port", "0",
  "--env-file", path.join(projectRoot, ".env"),
  ...process.argv.slice(2),
], { stdio: "inherit", env: process.env });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 0; });
