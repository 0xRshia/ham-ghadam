import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:5193";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname), "Use an isolated localhost server");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
  : "playwright");
const helper = ts.transpileModule(readFileSync("lib/browser-push.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const helperUrl = `data:text/javascript;base64,${Buffer.from(helper).toString("base64")}`;
const sdkUrl = "https://cdn.kavenegar.com/sdk/page.js?appId=3fd309c7-5f34-4ca8-9252-e57fcb71f5cc";

const response = await fetch(`${origin}/kvn-push-sw.js`);
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type"), /javascript/);
const workerBytes = Buffer.from(await response.arrayBuffer());
assert.deepEqual(workerBytes, readFileSync("public/kvn-push-sw.js"));
assert.equal(createHash("sha256").update(workerBytes).digest("hex"), "3df9c9ac3c0d3498e5fb7beaa10a421f4cdf94ba83d8ca9f5b14317952baacd9");

const browser = await chromium.launch({ headless: true, channel: "chromium" });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  const script = page.locator(`head script[src="${sdkUrl}"]`);
  assert.equal(await script.count(), 1);
  assert.equal(await script.getAttribute("charset"), "utf-8");
  assert.equal(await script.evaluate(element => element.defer), true);

  // Exercise real registrations and the production helper without granting push permission.
  const result = await page.evaluate(async helperUrl => {
    const { getAppPushRegistration, registerAppPushWorker } = await import(helperUrl);
    const root = await navigator.serviceWorker.register("/kvn-push-sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const rootOnly = await getAppPushRegistration();
    const app = await registerAppPushWorker();
    const found = await getAppPushRegistration();
    const repeated = await registerAppPushWorker();
    const scopes = (await navigator.serviceWorker.getRegistrations()).map(item => item.scope).sort();
    const rootScript = root.active.scriptURL;
    const appScript = app.active.scriptURL;
    const appState = app.active.state;
    await app.unregister();
    const afterRemoval = await getAppPushRegistration();
    const remainingRoot = await navigator.serviceWorker.getRegistration("/");
    return {
      rootOnly: rootOnly?.scope ?? null,
      found: found?.scope,
      repeated: repeated.scope,
      scopes, rootScript, appScript, appState,
      afterRemoval: afterRemoval?.scope ?? null,
      remainingRootScript: remainingRoot?.active?.scriptURL,
    };
  }, helperUrl);
  assert.equal(result.rootOnly, null, "A root worker must not be treated as the app worker");
  assert.equal(result.found, `${origin}/app-notifications/`);
  assert.equal(result.repeated, result.found);
  assert.deepEqual(result.scopes, [`${origin}/`, `${origin}/app-notifications/`]);
  assert.equal(result.rootScript, `${origin}/kvn-push-sw.js`);
  assert.equal(result.appScript, `${origin}/notifications-sw.js`);
  assert.equal(result.appState, "activated");
  assert.equal(result.afterRemoval, null);
  assert.equal(result.remainingRootScript, result.rootScript, "Removing the app worker must preserve Kavenegar");
  assert.deepEqual(errors, []);
  console.log("PASS: head script, unchanged provider worker, independent active registrations, repeated registration, and isolated removal");
} finally {
  await browser.close();
}
