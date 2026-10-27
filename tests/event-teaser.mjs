import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hamghadam-teaser-"));
try {
  const { normalizeInstagramTeaser } = await nodeSourceModules(directory)("lib/event-teaser.ts");
  for (const kind of ["reel", "p", "tv"]) {
    for (const input of [`https://instagram.com/${kind}/Abc_123-xy`, ` https://WWW.INSTAGRAM.COM/${kind}/Abc_123-xy/?igsh=tracking#preview `])
      assert.equal(normalizeInstagramTeaser(input), `https://www.instagram.com/${kind}/Abc_123-xy/`);
  }
  for (const empty of [undefined, null, "", "  "]) assert.equal(normalizeInstagramTeaser(empty), null);
  for (const input of [
    "@organizer", "https://www.instagram.com/organizer/", "https://instagram.com/stories/organizer/123/", "https://instagram.com/reels/Abc/",
    "https://instagram.com/reel/", "https://instagram.com/reel/Abc/extra/", "https://instagram.com/p/%41bc/", "https://instagram.com/reel/Abc.123/",
    "http://instagram.com/reel/Abc/", "instagram.com/reel/Abc/", "javascript:alert(1)", "https://evil.test/reel/Abc/", "https://instagram.com.evil.test/reel/Abc/",
    "https://evil.test@instagram.com/reel/Abc/", "https://user:secret@instagram.com/p/Abc/", "https://instagram.com:8443/p/Abc/",
    "https://m.instagram.com/reel/Abc/", "https://instagram.com./p/Abc/", "https://instagram.com\\@evil.test/p/Abc/",
    "https://instagram.com/reel/A\nbc/", `https://instagram.com/p/${"x".repeat(65)}/`, "x".repeat(2049), 3, {}, [],
  ]) assert.equal(normalizeInstagramTeaser(input), undefined, JSON.stringify(input));
  console.log("PASS teaser canonicalization preserves shortcode case, removes tracking, accepts reels/posts/legacy TV, clears empty values and rejects profiles, stories and unsafe URLs");
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
