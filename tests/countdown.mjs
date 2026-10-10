import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../lib/countdown.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { countdownParts } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const now = 1_800_000_000_000;
assert.deepEqual(countdownParts(now + (2 * 1440 + 3 * 60 + 4) * 60_000, now), { days: 2, hours: 3, minutes: 4 });
assert.deepEqual(countdownParts(now + 1, now), { days: 0, hours: 0, minutes: 1 });
assert.deepEqual(countdownParts(now + 24 * 60 * 60_000, now), { days: 1, hours: 0, minutes: 0 });
assert.deepEqual(countdownParts(now, now), { days: 0, hours: 0, minutes: 0 });
assert.deepEqual(countdownParts(now - 60_000, now), { days: 0, hours: 0, minutes: 0 });
console.log("Countdown rollover, minute rounding, and expiry checks passed.");
