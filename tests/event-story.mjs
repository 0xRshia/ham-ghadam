import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hmghadam-event-story-"));
try {
  const localePath = path.join(temporary, "locale.mjs");
  const storyPath = path.join(temporary, "story.mjs");
  const transpile = filename => ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  fs.writeFileSync(localePath, transpile("locales/event-share-fa.ts"));
  fs.writeFileSync(storyPath, transpile("lib/event-story.ts").replaceAll('"@/locales/event-share-fa"', JSON.stringify(pathToFileURL(localePath).href)));
  const { eventShareUrl, eventStoryFilename, wrapStoryText } = await import(pathToFileURL(storyPath).href);

  const id = "رویداد /?#&";
  const url = new URL(eventShareUrl(id, "https://example.test"));
  assert.equal(url.origin, "https://example.test");
  assert.equal(decodeURIComponent(url.pathname.slice("/events/".length)), id);
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  assert.match(eventStoryFilename("../cover.png?token=abc\\x"), /^hmghadam-[a-zA-Z0-9_-]+-story\.png$/);

  const measure = text => Array.from(new Intl.Segmenter("fa", { granularity: "grapheme" }).segment(text)).length;
  const title = "نمایشگاه بسیار طولانی هنر و موسیقی برای خانواده‌ها و دوستان";
  const lines = wrapStoryText(title, 16, 3, measure);
  assert.equal(lines.length, 3);
  assert.ok(lines.at(-1).endsWith("…"));
  assert.ok(lines.every(line => measure(line) <= 16));
  const unbroken = "👨‍👩‍👧‍👦".repeat(14);
  const emojiLines = wrapStoryText(unbroken, 5, 3, measure);
  assert.equal(emojiLines.join(""), unbroken, "Wrapping must not break a family emoji's grapheme sequence");
  assert.ok(emojiLines.every(line => measure(line) <= 5));
  const mixed = "کارگاه طراحی UI/UX در تهران";
  assert.equal(wrapStoryText(mixed, 100, 2, measure).join(" "), mixed);
  assert.deepEqual(wrapStoryText("\n  \t", 16, 3, measure), []);
  assert.deepEqual(wrapStoryText(title, 0, 3, measure), []);
  console.log("PASS story text wrapping, Persian/mixed text, grapheme integrity and canonical event URL/filename safety");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
