import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "client-errors-"));
const load = nodeSourceModules(directory);
const { api, ClientError } = await load("lib/client.ts");
const server = createServer((req, res) => {
  if (req.url === "/disconnect") { req.socket.destroy(); return; }
  const [format, code] = req.url.slice(1).split("/");
  res.writeHead(Number(code), { "Content-Type": format === "html" ? "text/html" : "application/json" });
  res.end(format === "html" ? "<html>upstream failure</html>" : format === "null" ? "null"
    : format === "invalid-error" ? '{"error":{"internal":"not a user message"}}'
      : format === "success" ? '{"saved":true}' : '{"error":"فایل تصویر سالم نیست."}');
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const [status, text] of [[401, "وارد"], [403, "دسترسی"], [409, "تغییر"], [413, "حجم"], [429, "درخواست"], [504, "زمان"], [502, "پاسخ"]]) {
    await assert.rejects(api(`${origin}/html/${status}`), error => error instanceof ClientError && error.status === status && error.message.includes(text) && !error.message.includes("<html>"));
  }
  for (const format of ["null", "invalid-error"]) {
    await assert.rejects(api(`${origin}/${format}/413`), error => error instanceof ClientError && error.status === 413 && error.message.includes("حجم"));
  }
  await assert.rejects(api(`${origin}/json/400`), error => error.message === "فایل تصویر سالم نیست.");
  await assert.rejects(api(`${origin}/disconnect`), error => error instanceof ClientError && error.status === 0);
  await assert.rejects(api(`${origin}/html/200`), error => error instanceof ClientError && error.message.includes("وضعیت ذخیره"));
  assert.deepEqual(await api(`${origin}/success/200`), { saved: true });
  console.log("PASS real HTTP error responses preserve actionable status messages, server validation, and network errors without exposing HTML");
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(directory, { recursive: true, force: true });
}
