import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../lib/map-introduction.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { mapIntroductionKey, readMapIntroduction, saveMapIntroduction } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const values = new Map();
globalThis.window = { localStorage: {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
} };
assert.equal(readMapIntroduction(), false, "A new browser needs the location introduction");
saveMapIntroduction();
assert.equal(readMapIntroduction(), true, "Completion survives the next read/visit");
assert.deepEqual([...values], [[mapIntroductionKey, "1"]], "Persist completion only, without location data");
values.clear();
assert.equal(readMapIntroduction(), false, "Clearing site data enables the introduction again");
values.set(mapIntroductionKey, "invalid");
assert.equal(readMapIntroduction(), false, "Only an explicit completion flag skips the introduction");
globalThis.window = { get localStorage() { throw new Error("Storage blocked"); } };
assert.equal(readMapIntroduction(), false);
assert.doesNotThrow(saveMapIntroduction, "Blocked storage must not prevent entering the home page");
delete globalThis.window;
assert.doesNotThrow(readMapIntroduction, "Storage helpers must tolerate server execution");
assert.doesNotThrow(saveMapIntroduction);
console.log("PASS first-visit completion, repeat visits, cleared/invalid/blocked storage and no persisted coordinates");
