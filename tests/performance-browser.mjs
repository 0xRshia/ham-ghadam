import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { get } from "node:http";
import { nodeSourceModules } from "./node-source-module.mjs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "performance-browser-"));
const load = nodeSourceModules(path.join(directory, "modules"));
const { hashPassword } = await load("lib/passwords.ts");
const origin = "http://127.0.0.1:5197";
const passwordHash = await hashPassword(randomBytes(20).toString("hex"));
const phone = "09990000001";
const env = { ...process.env, DATABASE_PATH: path.join(directory, "db.sqlite"), MEDIA_PATH: path.join(directory, "media"), APP_ORIGIN: origin, HOST: "127.0.0.1", PORT: "5197", SEED_SAMPLE_EVENTS: "false", TEMP_LOGIN_ENABLED: "false", HOST_PHONES: phone, ADMIN_PHONES: phone, FAST_ADMIN_USERNAME: "performance", FAST_ADMIN_PASSWORD_HASH: passwordHash };
assert.equal(spawnSync(process.execPath, ["scripts/migrate-node.mjs"], { env }).status, 0);
const db = new DatabaseSync(env.DATABASE_PATH);
const id = "performance-event", sheetId = "performance-sheet";
const token = randomBytes(32).toString("hex"), fastToken = randomBytes(32).toString("hex");
const sha = value => createHash("sha256").update(value).digest("hex");
db.prepare("INSERT INTO users(id,phone,name,created_at) VALUES(?,?,?,?)").run("performance-host", phone, "میزبان آزمون", Date.now());
db.prepare("INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)").run(sha(token), "performance-host", Date.now() + 3600000);
db.prepare("INSERT INTO fast_sessions(hash,credential_fingerprint,expires_at) VALUES(?,?,?)").run(sha(fastToken), sha(JSON.stringify([env.FAST_ADMIN_USERNAME, passwordHash])), Date.now() + 3600000);
for (const eventId of [id,sheetId]) db.prepare("INSERT INTO events(id,host_id,title,description,category,venue,address,city,price,published,sample,starts_at,ends_at,image) VALUES(?,?,?,?,?,?,?, ?,0,1,0,?,?,?)")
  .run(eventId, "performance-host", "رویداد آزمون کارایی", "بررسی بارگیری از پایگاه واقعی محلی", "books", "محل آزمون", "نشانی آزمون", "تهران", Date.now()+86400000, Date.now()+90000000, "/images/books.jpg");
db.prepare("INSERT INTO event_sheet_links(external_id,event_id,image_hash,source_hash,last_run_id) VALUES(?,?,?,?,?)").run(sheetId,sheetId,"image","source","run");
const serverPath = process.env.PERFORMANCE_SERVER ?? "dist/standalone/server.js";
const server = spawn(process.execPath, [serverPath], { env, stdio: ["ignore","pipe","pipe"] });
let output = "";for (const stream of [server.stdout,server.stderr]) stream.on("data", chunk => { output += chunk; });
let browser;
try {
  for (let i=0;i<100;i++) { try { if ((await fetch(origin+"/api/health")).ok) break; } catch {} if(server.exitCode!==null)throw new Error(output); await new Promise(resolve=>setTimeout(resolve,100)); }
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(() => {
    localStorage.setItem("hg_map_introduction_completed","1");
    window.__performance = {lcp:0,cls:0,longTasks:0};
    new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__performance.lcp=entry.startTime;}).observe({type:"largest-contentful-paint",buffered:true});
    new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.__performance.cls+=entry.value;}).observe({type:"layout-shift",buffered:true});
    new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__performance.longTasks+=entry.duration;}).observe({type:"longtask",buffered:true});
  });
  const page = await context.newPage();const errors=[];page.on("pageerror",error=>errors.push(error.message));
  const requests=[];page.on("request",request=>requests.push(new URL(request.url()).pathname));
  await page.goto(origin);await page.locator(".el-event-feature").first().waitFor();
  await page.locator('.el-navigation a[href="/events"]').click();await page.locator(".el-category-list").waitFor();
  if (!process.env.PERFORMANCE_BASELINE) assert.equal(requests.filter(p=>p==="/api/events").length,1,"Navigation reuses the catalog");
  if (!process.env.PERFORMANCE_BASELINE) {
    const document = await (await fetch(origin)).text();
    const stylesheet = document.match(/href="([^" ]+\.css)"/)[1];
    const identity = await fetch(origin+stylesheet,{headers:{"Accept-Encoding":"identity"}});
    const original = Buffer.from(await identity.arrayBuffer());
    for (const encoding of ["br","gzip"]) {
      const compressed = await fetch(origin+stylesheet,{headers:{"Accept-Encoding":encoding}});
      assert.equal(compressed.headers.get("content-encoding"),encoding);
      assert.match(compressed.headers.get("vary"),/Accept-Encoding/i);
      assert.deepEqual(Buffer.from(await compressed.arrayBuffer()),original);
      assert.match(compressed.headers.get("cache-control"), /immutable/);
      assert.ok(compressed.headers.get("etag"));
      // Node fetch adds Cache-Control: no-cache to conditional requests; send a real revalidation instead.
      const status = await new Promise((resolve, reject) => {
        get(origin+stylesheet, {headers:{"Accept-Encoding":encoding,"If-None-Match":compressed.headers.get("etag")}}, response => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        }).on("error", reject);
      });
      assert.equal(status,304);
    }
  }
  requests.length=0;
  const html=await (await fetch(origin+"/events/"+id)).text();
  await page.goto(origin+"/events/"+id);await page.locator(".el-detail h1").waitFor();
  if (!process.env.PERFORMANCE_BASELINE) {
    assert.ok(html.includes("رویداد آزمون کارایی"),"Initial HTML contains event content");
    assert.equal(requests.filter(p=>p==="/api/events/"+id).length,0,"Hydration does not repeat the detail query");
    assert.equal(requests.some(p=>p.includes("event-share-")),false,"Share code is deferred");
  }
  await page.getByRole("button",{name:"اشتراک‌گذاری",exact:true}).click();await page.locator("dialog[open]").waitFor();await page.keyboard.press("Escape");
  await context.addCookies([{name:"hg_fast_session",value:fastToken,url:origin},{name:"hg_session",value:token,url:origin}]);
  requests.length=0;await page.goto(origin+"/fast");await page.locator("article").first().waitFor();
  if(!process.env.PERFORMANCE_BASELINE)assert.equal(requests.filter(p=>p==="/api/fast/events").length,0,"First admin page is server loaded");
  await page.goto(origin+"/fast/events/new");await page.getByLabel("عنوان ایونت",{exact:true}).waitFor();
  await page.goto(origin+"/fast/events/"+sheetId);await page.locator('input[type="file"]').first().waitFor();
  await page.goto(origin+"/host");await page.locator(".stats-grid").waitFor();
  await page.goto(origin+"/host/reviews");await page.locator(".host-reviews").waitFor();
  assert.equal(await page.locator(".host-review-filter").evaluate(element => getComputedStyle(element).display),"flex");
  await page.goto(origin+"/admin/articles");await page.locator(".container").waitFor();
  for (const width of [320,390,1280]) {
    await page.setViewportSize({width,height:844});await page.goto(origin+"/events/"+id);await page.locator(".el-detail h1").waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await context.clearCookies();
  if (!process.env.PERFORMANCE_BASELINE) {
    const introduction = await browser.newContext({viewport:{width:390,height:844}});
    const mapPage = await introduction.newPage();
    mapPage.on("pageerror", error => errors.push(error.message));
    await mapPage.goto(origin);
    await mapPage.waitForURL(url => url.pathname === "/map" && url.searchParams.get("intro") === "1");
    await mapPage.locator(".maplibregl-map").waitFor();
    assert.deepEqual(await mapPage.locator(".maplibregl-map").evaluate(element => {
      const style = getComputedStyle(element);
      return {position:style.position,overflow:style.overflow,visible:element.clientWidth>300 && element.clientHeight>300};
    }),{position:"absolute",overflow:"hidden",visible:true});
    await introduction.close();
  }
  const measurements=[];const runs=Number(process.env.PERFORMANCE_RUNS??"1");
  const cdp=await context.newCDPSession(page);await cdp.send("Network.enable");
  for (const [device,width,rate,latency,throughput] of [["mobile",390,4,150,200000],["desktop",1280,1,20,2000000]]) {
    await page.setViewportSize({width,height:844});await cdp.send("Emulation.setCPUThrottlingRate",{rate});
    await cdp.send("Network.emulateNetworkConditions",{offline:false,latency,downloadThroughput:throughput,uploadThroughput:throughput});
    for(const route of ["/","/events?view=all"]) for(let run=0;run<runs;run++) for(const cache of ["cold","warm"]){
      if(cache==="cold")await cdp.send("Network.clearBrowserCache");
      await page.goto(origin+route,{waitUntil:"domcontentloaded"});await page.locator(route==="/"?".el-event-feature":".el-event-list").first().waitFor();await page.waitForTimeout(1000);
      const metrics=await page.evaluate(()=>{const resources=performance.getEntriesByType("resource");return {...window.__performance,assetBytes:resources.filter(r=>r.name.includes("/_next/")&&/\.(js|css)$/.test(r.name)).reduce((s,r)=>s+r.transferSize,0),api:resources.filter(r=>r.name.includes("/api/")).map(r=>({path:new URL(r.name).pathname,start:r.startTime,duration:r.duration}))};});
      measurements.push({device,route,run,cache,...metrics});console.log(JSON.stringify(measurements.at(-1)));
    }
  }
  assert.deepEqual(errors,[]);
  if(process.env.PERFORMANCE_OUTPUT)fs.writeFileSync(process.env.PERFORMANCE_OUTPUT,JSON.stringify(measurements,null,2));
  console.log("PASS production performance: catalog reuse, server detail/admin data, deferred sharing, admin routes, responsive RTL, and browser errors");
} catch(error){console.error(output.slice(-2500));throw error;}
finally{await browser?.close();if(server.exitCode===null){const stopped=new Promise(resolve=>server.once("exit",resolve));server.kill("SIGTERM");await stopped;}db.close();fs.rmSync(directory,{recursive:true,force:true});}
