import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "mvp-sqlite-"));
process.env.DATABASE_PATH = path.join(folder, "test.sqlite");
const { outputText } = ts.transpileModule(fs.readFileSync("db/node.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { database } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const db = database();
try {
  await db.prepare("CREATE TABLE checks (id TEXT PRIMARY KEY, value INTEGER)").run();
  await assert.rejects(db.batch([
    db.prepare("INSERT INTO checks VALUES (?,?)").bind("same", 1),
    db.prepare("INSERT INTO checks VALUES (?,?)").bind("same", 2),
  ]));
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM checks").first()).n, 0);
  const bound = db.prepare("SELECT ?1 a, ?2 b, ?1 c").bind(10, 20);
  assert.deepEqual({ ...await bound.first() }, { a: 10, b: 20, c: 10 });
  await assert.rejects(db.prepare("SELECT ?2").bind(1).first());
  assert.equal((await db.prepare("PRAGMA foreign_keys").first()).foreign_keys, 1);
  assert.equal((await db.prepare("PRAGMA journal_mode").first()).journal_mode, "wal");
  console.log("PASS batch rollback, numbered parameters, missing binding rejection, foreign keys, WAL");
} finally {
  db.prepare("").connection.close();
  fs.rmSync(folder, { recursive: true, force: true });
}
