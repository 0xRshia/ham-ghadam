import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hamghadam-discovery-"));
const databasePath = path.join(temporary, "test.sqlite");
const output = path.resolve(process.env.VISUAL_OUTPUT_PATH ?? "work/discovery-qa");
fs.mkdirSync(output, { recursive: true });
const migration = spawnSync(process.execPath, ["scripts/migrate-node.mjs"], {
  env: { ...process.env, DATABASE_PATH: databasePath }, encoding: "utf8",
});
assert.equal(migration.status, 0, migration.stderr);
const db = new DatabaseSync(databasePath);
const now = Date.now(), day = 86400000;
db.prepare("INSERT INTO users(id,phone,name,created_at) VALUES('discovery-host','09900000001','میزبان آزمون',?)").run(now);
const fixtures = [
  ["near", "جشنوارهٔ هنر و گفتگو؛ تجربه‌ای تازه در کنار هم برای دوستداران فرهنگ", 35.6892, 51.389, 5, 1250000, "/images/pottery.jpg", "تهران"],
  ["medium", "کارگاه کتاب و هنر", 35.76, 51.45, 3, 0, "/images/books.jpg", "تهران"],
  ["far", "نمایشگاه شهر دیگر", 32.65, 51.67, 2, 500000, "/images/pottery.jpg", "اصفهان"],
  ["unknown", "رویداد بدون موقعیت ثبت‌شده", null, null, 1, 0, null, "تهران"],
];
for (const [id, title, lat, lng, days, price, image, city] of fixtures) {
  db.prepare(`INSERT INTO events(id,host_id,title,description,category,venue,address,city,lat,lng,starts_at,ends_at,registration_ends_at,price,capacity,image,published,sample,created_at)
    VALUES(?,'discovery-host',?,'رویداد آزمون در پایگاه دادهٔ موقت','art','خانهٔ هنر','خیابان هنر',?,?,?,?,?,?,?,100,?,1,0,?)`)
    .run(id, title, city, lat, lng, now + days * day, now + days * day + 3600000, now + day / 2, price, image, now);
}
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["dist/standalone/server.js"], {
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), APP_ORIGIN: origin, DATABASE_PATH: databasePath,
    MEDIA_PATH: path.join(temporary, "media"), SEED_SAMPLE_EVENTS: "false", TEMP_LOGIN_ENABLED: "false", SKIP_PAY_DEV: "false",
    MAP_TILE_URL: "", MAP_ATTRIBUTION_LABEL: "", MAP_ATTRIBUTION_URL: "", HOST_PHONES: "", ADMIN_PHONES: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", data => { serverOutput += data; });
server.stderr.on("data", data => { serverOutput += data; });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors = [];
const storageKey = "hg_map_introduction_completed";
const skipText = "فعلاً رد می‌کنم";
const confirmText = "تأیید موقعیت و دیدن رویدادها";
async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, ...options });
  await context.route("https://tile.openstreetmap.org/**", route => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !/net::ERR_FAILED/.test(message.text())) errors.push(message.text());
  });
  return { context, page };
}
async function home(page, layout = "v1") {
  await page.waitForURL(origin + (layout === "v2" ? "/?layout=v2" : "/"));
  await page.locator(".el-event-feature").first().waitFor();
  assert.equal(await page.locator(".el-catalog .el-event-list,.el-catalog .el-event-card").count(), 0);
}
async function eventIds(page, selector) {
  return page.locator(`${selector} h3 a`).evaluateAll(links => links.map(link => link.getAttribute("href").split("/").pop()));
}
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, name + ".png"), fullPage: true, animations: "disabled" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + " page overflow");
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(origin + "/api/events")).ok) { ready = true; break; } } catch { /* Wait for the isolated server. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, serverOutput);

  const { page, context } = await newPage();
  await page.goto(origin + "/login");
  await page.locator(".el-auth-heading").waitFor();
  assert.equal(new URL(page.url()).pathname, "/login");
  await page.goto(origin + "/events/near");
  await page.locator(".el-detail").waitFor();
  assert.equal(new URL(page.url()).pathname, "/events/near");
  await page.goto(origin + "/?layout=v2");
  await page.waitForURL("**/map?intro=1&layout=v2");
  await page.locator(".el-map-pin").first().waitFor();
  assert.ok(await page.getByRole("link", { name: "© OpenStreetMap" }).isVisible());
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), null);
  await page.getByRole("textbox", { name: "جستجوی رویداد", exact: true }).fill("no matching events");
  await page.getByRole("button", { name: skipText, exact: true }).click();
  await home(page, "v2");
  assert.deepEqual(await eventIds(page, ".el-popular"), ["unknown", "far", "medium", "near"]);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), "1");
  await page.reload();
  await home(page, "v2");
  await page.locator(".el-search-location").click();
  await page.locator(".el-map-pin").first().waitFor();
  await page.getByRole("button", { name: confirmText, exact: true }).click();
  await home(page, "v2");
  assert.deepEqual(await eventIds(page, ".el-popular"), ["near", "medium", "far", "unknown"]);
  assert.equal((await eventIds(page, ".el-search-section"))[0], "near");
  assert.ok((await page.locator(".el-home-header h1").innerText()).includes("موقعیت انتخاب‌شده"));
  await shot(page, "home-v2-light");
  const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  assert.equal(Object.keys(stored).some(key => /lat|lng|point/.test(key)), false);
  await page.locator('.el-navigation a[href="/events"]').click();
  await page.waitForURL(origin + "/events");
  await page.waitForFunction(() => document.querySelector(".el-category-1 span")?.textContent.includes("۴"));
  await page.locator(".el-category").nth(1).click();
  await page.locator(".el-event-list").first().waitFor();
  assert.deepEqual(await eventIds(page, ".el-search-events"), ["near", "medium", "far", "unknown"]);
  await page.locator('.el-navigation a[href="/"]').click();
  await home(page);
  assert.equal((await eventIds(page, ".el-upcoming"))[0], "near");
  assert.deepEqual(await eventIds(page, ".el-popular"), ["near", "medium", "far", "unknown"]);
  await page.locator(".el-search-location").click();
  await page.locator(".el-map-page").waitFor();
  await page.getByRole("textbox", { name: "جستجوی رویداد", exact: true }).fill("discard this draft");
  await page.getByRole("button", { name: skipText, exact: true }).click();
  await home(page);
  assert.equal((await eventIds(page, ".el-upcoming"))[0], "near");
  for (const theme of ["light", "dark"]) {
    if ((await page.locator("html").getAttribute("class")).includes("dark") !== (theme === "dark")) {
      await page.locator('.el-home-actions button[aria-pressed]').click();
    }
    await page.waitForFunction(theme => document.documentElement.classList.contains(theme), theme);
    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 812 });
      await shot(page, `home-${theme}-${width}`);
      const firstCard = page.locator(".el-event-feature").first();
      const card = await firstCard.boundingBox(), panel = await firstCard.locator(".el-event-copy").boundingBox();
      assert.ok(panel.x >= card.x && panel.x + panel.width <= card.x + card.width + 1);
      assert.ok(panel.y > card.y && panel.y + panel.height <= card.y + card.height + 1);
      assert.equal(await firstCard.locator(".el-event-copy").evaluate(element => element.scrollWidth > element.clientWidth), false);
    }
  }
  await page.reload();
  await home(page);
  assert.equal((await eventIds(page, ".el-upcoming"))[0], "unknown", "Refresh clears coordinates but retains dismissal");
  await shot(page, "home-without-event-image");
  await context.close();
  console.log("PASS first visit, skip, layout preservation, distance ordering on home/search, temporary coordinates and home-only card design");

  const back = await newPage();
  await back.page.goto(origin);
  await back.page.waitForURL("**/map?intro=1");
  await back.page.locator(".el-map-pin").first().waitFor();
  await back.page.locator(".el-header > a").click();
  await home(back.page);
  await back.page.goBack();
  assert.ok(!back.page.url().includes("/map?intro=1"), "Completion replaces the introductory history entry");
  await back.context.close();

  const blocked = await newPage();
  await blocked.context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage unavailable", "SecurityError"); } });
  });
  await blocked.page.goto(origin);
  await blocked.page.waitForURL("**/map?intro=1");
  await blocked.page.locator(".el-map-pin").first().waitFor();
  await blocked.page.getByRole("button", { name: skipText, exact: true }).click();
  await home(blocked.page);
  await blocked.page.locator('.el-navigation a[href="/events"]').click();
  await blocked.page.waitForURL(origin + "/events");
  await blocked.page.locator(".el-category").first().waitFor();
  await blocked.page.locator('.el-navigation a[href="/"]').click();
  await home(blocked.page);
  await blocked.context.close();
  console.log("PASS introductory Back and blocked-storage navigation without redirect loops");

  const loading = await newPage();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await loading.page.route("**/api/events", async route => { await pending; await route.continue(); });
  await loading.page.goto(origin + "/map?intro=1");
  await loading.page.locator(".leaflet-control-zoom").waitFor();
  await loading.page.locator(".el-map-canvas").click({ position: { x: 240, y: 180 } });
  const transform = await loading.page.locator(".leaflet-map-pane").evaluate(element => element.style.transform);
  release();
  await loading.page.locator(".el-map-pin").first().waitFor();
  assert.equal(await loading.page.locator(".leaflet-map-pane").evaluate(element => element.style.transform), transform);
  await loading.page.unroute("**/api/events");
  await loading.page.locator(".el-map-canvas").focus();
  await loading.page.keyboard.press("ArrowRight");
  await loading.page.locator(".el-map-pin").first().focus();
  await loading.page.keyboard.press("Enter");
  await loading.page.locator(".el-map-selected").waitFor();
  await loading.context.clearPermissions();
  await loading.page.locator(".el-map-locate").click();
  await loading.page.locator('.el-map-warning[role="alert"]').waitFor();
  await shot(loading.page, "map-tile-and-location-failure");
  await loading.page.getByRole("button", { name: skipText, exact: true }).click();
  await home(loading.page);
  await loading.context.close();

  const failed = await newPage();
  await failed.page.route("**/api/events", route => route.abort());
  await failed.page.goto(origin);
  await failed.page.waitForURL("**/map?intro=1");
  await failed.page.locator('.el-map-results [role="alert"]').waitFor();
  await failed.page.getByRole("button", { name: skipText, exact: true }).click();
  await failed.page.waitForURL(origin + "/");
  await failed.page.locator('.el-catalog [role="alert"]').waitFor();
  await failed.context.close();

  db.prepare("UPDATE events SET published=0").run();
  const empty = await newPage();
  await empty.page.goto(origin);
  await empty.page.waitForURL("**/map?intro=1");
  await empty.page.locator(".el-map-empty").waitFor();
  await empty.page.getByRole("button", { name: skipText, exact: true }).click();
  await empty.page.locator(".el-empty").waitFor();
  await empty.context.close();
  console.log("PASS stable map during loading, tap/keyboard selection, denied geolocation, tile/catalog failure and empty catalog");
  assert.deepEqual(errors, [], "No browser runtime or hydration errors");
  console.log(`PASS visual checks in both themes at 320/375/430px; captures: ${output}`);
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
    console.error("PAGE", page.url(), await page.locator("body").innerText().catch(() => ""));
  }
  console.error("BROWSER ERRORS", errors, "SERVER", serverOutput);
  throw error;
} finally {
  await browser.close();
  server.kill("SIGTERM");
  await new Promise(resolve => server.exitCode !== null ? resolve() : server.once("exit", resolve));
  db.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
