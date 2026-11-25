import { test } from "node:test";
import assert from "node:assert/strict";
import { pastedImageFiles } from "../lib/clipboard-images.ts";

const png = new File([new Uint8Array([1])], "image.png", { type: "image/png" });
const gif = new File([new Uint8Array([1])], "image.gif", { type: "image/gif" });
const pdf = new File([new Uint8Array([1])], "file.pdf", { type: "application/pdf" });

test("screenshots and copied images paste as images", () => {
  assert.deepEqual(pastedImageFiles("", [png]), [png]);
  assert.deepEqual(pastedImageFiles("  \n", [png]), [png]);
  assert.deepEqual(pastedImageFiles("https://example.com/photo.png", [png]), [png], "browser copy-image may include the image address");
});

test("text with a bitmap preview stays a text paste", () => {
  assert.deepEqual(pastedImageFiles("ردیف اول\tمقدار", [png]), []);
  assert.deepEqual(pastedImageFiles("see https://example.com", [png]), []);
});

test("non-image files are ignored and unsupported image types reach upload validation", () => {
  assert.deepEqual(pastedImageFiles("", [pdf]), []);
  assert.deepEqual(pastedImageFiles("", [pdf, gif, png]), [gif, png]);
  assert.deepEqual(pastedImageFiles("plain text", []), []);
});
