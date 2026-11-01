import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "squirrel-browser-"));
const origin = "http://127.0.0.1:5198";
const env = { ...process.env, DATABASE_PATH: path.join(temp, "test.sqlite"), MEDIA_PATH: path.join(temp, "media"), APP_ORIGIN: origin, HOST: "127.0.0.1", PORT: "5198", SEED_SAMPLE_EVENTS: "false", TEMP_LOGIN_ENABLED: "false" };
assert.equal(spawnSync(process.execPath, ["scripts/migrate-node.mjs"], { env, encoding: "utf8" }).status, 0);
const server = spawn(process.execPath, ["dist/standalone/server.js"], { env, stdio: ["ignore", "pipe", "pipe"] });
let logs = "";
for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => { logs += chunk; });
const screenshots = process.env.SQUIRREL_SCREENSHOTS;
if (screenshots) fs.mkdirSync(screenshots, { recursive: true });
let browser;
const errors = [];
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ...options });
  // Prevent unrelated external analytics, push and map requests in this local test.
  await ctx.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({ status: 200, body: "" }));
  await ctx.addInitScript(() => { localStorage.setItem("hg_map_introduction_completed", "1"); });
  return ctx;
}
async function pageFor(ctx) {
  const page = await ctx.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(12000);
  await page.goto(origin + "/game");
  await page.getByRole("button", { name: "شروع با دوربین", exact: true }).waitFor();
  return page;
}
async function phase(page, name) { await page.locator(`[data-game-phase="${name}"]`).waitFor(); }
async function screenshot(page, name) { if (screenshots) await page.screenshot({ path: path.join(screenshots, name + ".png") }); }
async function swipe(page, horizontal = 0, upward = .35) {
  const ball = await page.locator("[data-launcher]").boundingBox();
  const arena = await page.locator(".sg-arena").boundingBox();
  const x = ball.x + ball.width / 2, y = ball.y + ball.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + horizontal * arena.width, y - upward * arena.height, { steps: 10 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin + "/game")).ok) { ready = true; break; } } catch {}
    if (server.exitCode !== null) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const ctx = await context();
  const page = await pageFor(ctx);
  assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
  assert.equal(await page.locator("link[rel=manifest]").getAttribute("href"), "/game/squirrel.webmanifest");
  const manifest = await (await fetch(origin + "/game/squirrel.webmanifest")).json();
  assert.equal(manifest.start_url, "/game");
  assert.equal(manifest.scope, "/game", "The game PWA must not claim the main app's routes");
  for (const icon of manifest.icons) assert.equal((await fetch(origin + icon.src)).status, 200);
  await screenshot(page, "intro-mobile");
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 900]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `No horizontal overflow at ${width}×${height}`);
    await page.getByRole("button", { name: "شروع با دوربین", exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.getByRole("button", { name: "شروع با دوربین", exact: true }).isVisible(), true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "اول بدون دوربین امتحان می‌کنم" }).click();
  await phase(page, "encounter");
  await screenshot(page, "encounter-mobile");
  await page.getByRole("button", { name: "توقف بازی", exact: true }).click();
  const timer = await page.locator(".sg-timer").innerText();
  await page.waitForTimeout(5300);
  assert.equal(await page.locator(".sg-timer").innerText(), timer, "Pause freezes the encounter timer");
  await page.getByRole("button", { name: "ادامهٔ بازی", exact: true }).click();
  await page.getByRole("button", { name: "منو بگیر!", exact: true }).click();
  await phase(page, "playing");
  await screenshot(page, "throw-mobile");
  await swipe(page, 0, .015);
  assert.equal(await page.locator(".sg-spent").count(), 0, "Tiny gestures do not spend a ball");
  await swipe(page);
  await phase(page, "caught");
  assert.match(await page.locator(".sg-result-score").innerText(), /۱۵۰/);
  await screenshot(page, "caught-mobile");
  await page.getByRole("button", { name: "یه دور دیگه" }).click();
  await phase(page, "encounter");
  await phase(page, "escaping");
  await phase(page, "escaped");
  await screenshot(page, "escaped-mobile");
  await phase(page, "encounter");
  assert.match(await page.locator(".sg-hud").innerText(), /دور\s+۳/);
  await page.getByRole("button", { name: "منو بگیر!", exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await swipe(page, .8, .3);
    if (i < 2) await page.locator("[data-launcher]").waitFor();
  }
  await phase(page, "escaped");
  await page.getByRole("button", { name: "یه دور دیگه" }).click();
  await phase(page, "encounter");
  await page.getByRole("button", { name: "منو بگیر!", exact: true }).press("Enter");
  await page.locator("[data-launcher]").press("Enter");
  await phase(page, "caught");
  await page.getByRole("link", { name: "بازگشت به خانه" }).click();
  await page.locator(".el-catalog").waitFor();
  await page.locator(".el-navigation").waitFor();
  assert.equal(new URL(page.url()).pathname, "/");
  assert.equal(await page.locator(".sg-game").count(), 0);
  assert.equal(await page.locator('a[href="/game"], a[href="/play/squirrel"]').count(), 0, "The original homepage has no game promotion");
  assert.equal(await page.locator('link[rel="manifest"][href="/game/squirrel.webmanifest"]').count(), 0, "Leaving the game removes its PWA manifest");
  await screenshot(page, "restored-home-mobile");
  await page.goto(origin + "/play/squirrel");
  await phase(page, "ready");
  assert.equal(new URL(page.url()).pathname, "/game", "The previous game URL redirects to its separate route");
  await ctx.close();
  console.log("Practice: mobile layouts, pause, swipe hit/miss, escape/return, keyboard, separate game route and restored homepage passed.");

  const touchContext = await context({ hasTouch: true, isMobile: true });
  const touchPage = await pageFor(touchContext);
  await touchPage.getByRole("button", { name: "اول بدون دوربین امتحان می‌کنم" }).tap();
  await phase(touchPage, "encounter");
  await touchPage.getByRole("button", { name: "منو بگیر!", exact: true }).tap();
  await phase(touchPage, "playing");
  const touchBall = await touchPage.locator("[data-launcher]").boundingBox();
  const touchArena = await touchPage.locator(".sg-arena").boundingBox();
  const touchX = touchBall.x + touchBall.width / 2, touchY = touchBall.y + touchBall.height / 2;
  const cdp = await touchContext.newCDPSession(touchPage);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touchX, y: touchY, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: touchX, y: touchY - touchArena.height * .35, id: 1 }] });
  await touchPage.waitForTimeout(120);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await phase(touchPage, "caught");
  assert.equal(await touchPage.evaluate(() => window.scrollY), 0, "Throwing does not scroll the page");
  await touchContext.close();
  console.log("Touchscreen: touch tap, swipe, pointer capture and catch passed.");

  const cameraContext = await context({ reducedMotion: "no-preference" });
  await cameraContext.addInitScript(() => {
    window.__gameTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await original(constraints);
      window.__gameTracks.push(...stream.getTracks());
      return stream;
    };
  });
  const cameraPage = await pageFor(cameraContext);
  await cameraPage.getByRole("button", { name: "شروع با دوربین", exact: true }).click();
  await cameraPage.locator('[data-camera-state="on"][data-mode="camera"]').waitFor();
  await phase(cameraPage, "entering");
  assert.ok(await cameraPage.locator("video").evaluate(video => video.videoWidth > 0 && !video.paused));
  await phase(cameraPage, "encounter");
  await screenshot(cameraPage, "camera-encounter");
  await cameraPage.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await cameraPage.getByRole("dialog").waitFor();
  assert.ok(await cameraPage.evaluate(() => window.__gameTracks.every(track => track.readyState === "ended")), "Hidden app releases camera tracks");
  await cameraPage.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  await cameraPage.getByRole("button", { name: "ادامهٔ بازی", exact: true }).click();
  await cameraPage.locator('[data-camera-state="on"]').waitFor();
  assert.equal(await cameraPage.evaluate(() => window.__gameTracks.filter(track => track.readyState === "live").length), 1);
  await cameraPage.getByRole("link", { name: "بازگشت به خانه" }).click();
  assert.ok(await cameraPage.evaluate(() => window.__gameTracks.every(track => track.readyState === "ended")), "Leaving the route releases the camera");
  await cameraContext.close();
  console.log("Camera: fake media device, inline playback, visibility pause, reacquisition and cleanup passed.");

  const deniedContext = await context();
  await deniedContext.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("denied", "NotAllowedError"); }; });
  const deniedPage = await pageFor(deniedContext);
  await deniedPage.getByRole("button", { name: "شروع با دوربین", exact: true }).click();
  await deniedPage.getByRole("alert").waitFor();
  assert.match(await deniedPage.getByRole("alert").innerText(), /اجازه/);
  await deniedPage.getByRole("button", { name: "اول بدون دوربین امتحان می‌کنم" }).click();
  await phase(deniedPage, "encounter");
  await deniedContext.close();

  const lateContext = await context();
  await lateContext.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = constraints => new Promise(resolve => {
      window.__releaseCamera = async () => { const stream = await original(constraints); window.__lateTracks = stream.getTracks(); resolve(stream); };
    });
  });
  const latePage = await pageFor(lateContext);
  await latePage.getByRole("button", { name: "شروع با دوربین", exact: true }).click();
  await latePage.locator('[data-camera-state="starting"]').waitFor();
  await latePage.getByRole("button", { name: "اول بدون دوربین امتحان می‌کنم" }).click();
  await latePage.evaluate(() => window.__releaseCamera());
  await latePage.waitForFunction(() => window.__lateTracks.every(track => track.readyState === "ended"));
  assert.equal(await latePage.locator(".sg-game").getAttribute("data-mode"), "practice");
  await lateContext.close();
  assert.deepEqual(errors, []);
  console.log("Permission denial and late camera response passed. No browser runtime errors.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once("exit", resolve); });
  fs.rmSync(temp, { recursive: true, force: true });
}
