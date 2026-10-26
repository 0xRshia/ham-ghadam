import { hashPassword } from "../lib/passwords.ts";
import { emitKeypressEvents } from "node:readline";

if (process.argv.length > 2) {
  throw new Error("Pass the password through stdin, not command-line arguments");
}
async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk.toString();
      if (Buffer.byteLength(input) > 1024) throw new Error("Password input is too long");
    }
    return input.replace(/\r?\n$/, "");
  }
  process.stderr.write("Password (12–128 characters, input hidden): ");
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise(resolve => {
    let value = "";
    process.stdin.on("keypress", (text, key) => {
      if (key?.ctrl && key.name === "c") {
        process.stdin.setRawMode(false);
        process.stderr.write("\n");
        process.exit(130);
      }
      if (key?.name === "return") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stderr.write("\n");
        resolve(value);
      } else if (key?.name === "backspace") {
        value = Array.from(value).slice(0, -1).join("");
      } else if (text && !key?.ctrl && !key?.meta && Array.from(value).length < 129) {
        value += text;
      }
    });
  });
}
console.log(await hashPassword(await readPassword()));
