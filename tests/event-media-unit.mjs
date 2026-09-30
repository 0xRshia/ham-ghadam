import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "mvp-media-unit-"));
const priorMediaPath = process.env.MEDIA_PATH;
const priorDatabasePath = process.env.DATABASE_PATH;
const mediaPath = path.join(temporary, "uploads");
process.env.MEDIA_PATH = mediaPath;
process.env.DATABASE_PATH = path.join(temporary, "test.sqlite");

// Run the actual helpers against the actual Node storage adapter, with only
// compile-time import aliases composed into this isolated test directory.
const modules = {
  "@/locales/domain-fa": "locales/domain-fa.ts",
  "@/db": "db/node.ts",
  "@/lib/types": "lib/types.ts",
  "@/lib/temporary-login": "lib/temporary-login.ts",
  "@/lib/server": "lib/server.ts",
  "@/lib/media-policy": "lib/media-policy.ts",
  "@/lib/media-storage": "lib/media-storage-node.ts",
  "@/lib/event-media": "lib/event-media.ts",
};
const moduleUrls = Object.fromEntries(Object.keys(modules).map((name, index) => [name, pathToFileURL(path.join(temporary, `module-${index}.mjs`)).href]));
for (const [name, filename] of Object.entries(modules)) {
  let { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  for (const [alias, url] of Object.entries(moduleUrls)) outputText = outputText.replaceAll(`"${alias}"`, `"${url}"`);
  fs.writeFileSync(new URL(moduleUrls[name]), outputText);
}

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWP4v8jl/yIXBggFADgGB5Wq4pdJAAAAAElFTkSuQmCC", "base64");
const webp = Buffer.from("UklGRjoAAABXRUJQVlA4IC4AAAAQAgCdASoCAAIAAUAmJaACdLoB+AH4AAPIAP7xKS/9eiDxBv1oP/pNGqfj6gAA", "base64");
const jpeg = fs.readFileSync("public/images/cafe.jpg");
const request = (form) => new Request("http://localhost/api/host", { method: "POST", body: form });
function form() {
  const result = new FormData();
  result.set("data", JSON.stringify({ title: "Media validation test" }));
  return result;
}
const status = (expected) => (error) => error.status === expected;

try {
  const { validateImageBytes, readEventSubmission, saveEventImages, cleanupEventImages, discardEventRequest } = await import(moduleUrls["@/lib/event-media"]);
  const { readMedia, writeMedia } = await import(moduleUrls["@/lib/media-storage"]);
  const { MAX_IMAGE_BYTES, MAX_EVENT_REQUEST_BYTES, MAX_GALLERY_IMAGES } = await import(moduleUrls["@/lib/media-policy"]);

  assert.equal(validateImageBytes(jpeg), "image/jpeg");
  assert.equal(validateImageBytes(png), "image/png");
  assert.equal(validateImageBytes(webp), "image/webp");
  for (const bytes of [Buffer.from("<svg></svg>"), png.subarray(0, 33), jpeg.subarray(0, jpeg.length - 2), webp.subarray(0, webp.length - 2)]) {
    assert.throws(() => validateImageBytes(bytes), status(400));
  }
  const oversizedDimensions = Buffer.from(png);
  oversizedDimensions.writeUInt32BE(20000, 16);
  assert.throws(() => validateImageBytes(oversizedDimensions), status(400));
  assert.throws(() => validateImageBytes(new Uint8Array(MAX_IMAGE_BYTES + 1)), status(413));
  console.log("PASS real JPEG, PNG and WebP signatures, containers, dimensions and size limits");

  const valid = form();
  valid.append("cover", new Blob([jpeg], { type: "image/jpeg" }), "cover.jpg");
  valid.append("gallery", new Blob([png], { type: "image/png" }), "../../ignored.png");
  valid.append("gallery", new Blob([webp], { type: "image/webp" }), "photo.webp");
  const submission = await readEventSubmission(request(valid));
  assert.equal(submission.data.title, "Media validation test");
  assert.deepEqual(submission.uploads.map(({ role, position, contentType }) => [role, position, contentType]), [["cover", 0, "image/jpeg"], ["gallery", 0, "image/png"], ["gallery", 1, "image/webp"]]);
  const json = await readEventSubmission(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish" }) }));
  assert.equal(json.data.action, "publish");
  assert.deepEqual(json.uploads, []);

  const spoof = form();
  spoof.append("cover", new Blob([png], { type: "image/jpeg" }), "misleading.jpg");
  await assert.rejects(readEventSubmission(request(spoof)), status(400));
  const count = form();
  for (let index = 0; index <= MAX_GALLERY_IMAGES; index++) count.append("gallery", new Blob([png], { type: "image/png" }), "photo.png");
  await assert.rejects(readEventSubmission(request(count)), status(400));
  const total = form();
  const large = new Blob([new Uint8Array(MAX_IMAGE_BYTES)], { type: "image/png" });
  for (let index = 0; index < 5; index++) total.append("gallery", large, "photo.png");
  await assert.rejects(readEventSubmission(request(total)), status(413));
  const duplicateData = form();
  duplicateData.append("data", "{}");
  await assert.rejects(readEventSubmission(request(duplicateData)), status(400));

  let generated = 0;
  let cancelled = false;
  const chunk = new Uint8Array(64 * 1024).fill(120);
  const stream = new ReadableStream({
    pull(controller) {
      if (generated === 0) controller.enqueue(new TextEncoder().encode('--bounded\r\nContent-Disposition: form-data; name="data"\r\n\r\n'));
      controller.enqueue(chunk);
      generated += chunk.byteLength;
      if (generated > MAX_EVENT_REQUEST_BYTES + chunk.byteLength * 2) controller.close();
    },
    cancel() { cancelled = true; },
  });
  const chunked = new Request("http://localhost/api/host", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=bounded" }, body: stream, duplex: "half" });
  assert.equal(chunked.headers.get("content-length"), null);
  await assert.rejects(readEventSubmission(chunked), status(413));
  await new Promise((resolve) => setImmediate(resolve));
  assert(cancelled, "Oversized actual request stream is cancelled");
  console.log("PASS multipart order, JSON compatibility, MIME mismatch, count/total limits and chunked-body bound");

  const rejectedUpload = request(valid);
  await discardEventRequest(rejectedUpload);
  assert.equal(rejectedUpload.bodyUsed, true, "Authorization failures discard the pending body without parsing files");
  let rejectedBytes = 0;
  let rejectedCancelled = false;
  const rejectedStream = new ReadableStream({
    pull(controller) { rejectedBytes += chunk.byteLength; controller.enqueue(chunk); },
    cancel() { rejectedCancelled = true; },
  });
  await discardEventRequest(new Request("http://localhost/api/host", { method: "POST", body: rejectedStream, duplex: "half" }));
  assert.equal(rejectedCancelled, true);
  assert(rejectedBytes <= MAX_EVENT_REQUEST_BYTES + 2 * chunk.byteLength, "Rejected-body disposal remains bounded");
  console.log("PASS unread rejected uploads are discarded without retaining files, with a strict byte bound");

  const saved = await saveEventImages("test-event", submission.uploads);
  assert.equal(saved.rows.length, 3);
  assert.equal(saved.coverUrl, `/api/media/${saved.rows[0].id}`);
  assert.deepEqual(saved.galleryUrls, saved.rows.slice(1).map((row) => `/api/media/${row.id}`));
  for (const [index, row] of saved.rows.entries()) {
    assert.deepEqual(Buffer.from(await readMedia(row.storage_key)), Buffer.from(submission.uploads[index].bytes));
    assert(!row.storage_key.includes("ignored"));
  }
  await cleanupEventImages(saved.rows);
  assert.deepEqual(fs.readdirSync(mediaPath), []);
  await assert.rejects(writeMedia("../unsafe.png", png, "image/png"), /Invalid media storage key/);

  const originalUuid = crypto.randomUUID;
  const ids = ["10000000-0000-4000-8000-000000000000", "20000000-0000-4000-8000-000000000000"];
  const collisionKey = `${ids[1]}.png`;
  fs.writeFileSync(path.join(mediaPath, collisionKey), png);
  try {
    crypto.randomUUID = () => ids.shift();
    await assert.rejects(saveEventImages("failure-test", [
      { role: "gallery", position: 0, contentType: "image/png", bytes: png },
      { role: "gallery", position: 1, contentType: "image/png", bytes: png },
    ]), (error) => error.code === "EEXIST");
  } finally {
    crypto.randomUUID = originalUuid;
  }
  assert.deepEqual(fs.readdirSync(mediaPath), [collisionKey], "Failure removes newly written files, preserving a pre-existing collision");
  assert.deepEqual(fs.readFileSync(path.join(mediaPath, collisionKey)), png);
  delete process.env.MEDIA_PATH;
  assert.deepEqual((await saveEventImages("no-media", [])).rows, []);
  await assert.rejects(writeMedia("30000000-0000-4000-8000-000000000000.png", png, "image/png"), status(503));
  console.log("PASS immutable filesystem storage, bytes, removal, traversal rejection, failure compensation and missing configuration");
} finally {
  if (priorMediaPath === undefined) delete process.env.MEDIA_PATH; else process.env.MEDIA_PATH = priorMediaPath;
  if (priorDatabasePath === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = priorDatabasePath;
  fs.rmSync(temporary, { recursive: true, force: true });
}
