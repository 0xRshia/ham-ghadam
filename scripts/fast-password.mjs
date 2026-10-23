import { readFile } from "node:fs/promises";
import { emitKeypressEvents } from "node:readline";
import ts from "typescript";

// Import the same implementation used by account login without a second hash format.
const source = await readFile(new URL("../lib/passwords.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { hashPassword, validPassword } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

async function readPassword() {
  if (!process.stdin.isTTY) {
    let value = "";
    for await (const chunk of process.stdin) value += chunk;
    return value.replace(/\r?\n$/, "");
  }
  process.stderr.write("Password (12–128 characters, input hidden): ");
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise(resolve => {
    let value = "";
    process.stdin.on("keypress", (text, key) => {
      if (key?.ctrl && key.name === "c") {
        process.stdin.setRawMode(false); process.stderr.write("\n"); process.exit(130);
      }
      if (key?.name === "return") {
        process.stdin.setRawMode(false); process.stdin.pause(); process.stderr.write("\n"); resolve(value);
      } else if (key?.name === "backspace") value = Array.from(value).slice(0, -1).join("");
      else if (text && !key?.ctrl && !key?.meta) value += text;
    });
  });
}
const password = await readPassword();
if (!validPassword(password)) {
  console.error("Password must contain 12–128 characters."); process.exitCode = 1;
} else console.log(await hashPassword(password));
