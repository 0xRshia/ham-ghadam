import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { nodeSourceModules } from "./node-source-module.mjs";
import { eventSyncJobUrl, eventSyncTick } from "../scripts/event-sync-worker.mjs";
import { organizerMigrationSeed } from "./organizer-migration-fixture.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(),"hamghadam-sheet-sync-"));
process.env.DATABASE_PATH = path.join(directory,"events.sqlite");
process.env.MEDIA_PATH = path.join(directory,"media");
process.env.EVENT_SYNC_JOB_SECRET = "event-sync-tests-".repeat(3);
process.env.SEED_SAMPLE_EVENTS = "false";
process.env.TEMP_LOGIN_ENABLED = "false";
process.env.FAST_ADMIN_USERNAME = "sheet-sync-tests";
const originalFetch = globalThis.fetch;
const db = new DatabaseSync(process.env.DATABASE_PATH);
db.exec("PRAGMA foreign_keys=ON");
try {
  const { entries } = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json","utf8"));
  const syncIndex = entries.findIndex(entry => entry.tag === "0021_sheet_event_sync");
  assert.ok(syncIndex > 0);
  for (const entry of entries.slice(0,syncIndex)) db.exec(fs.readFileSync(`drizzle/${entry.tag}.sql`,"utf8"));
  db.exec(organizerMigrationSeed);
  const before = db.prepare("SELECT id,starts_at,ends_at,revision FROM events ORDER BY id").all();
  const tickets = db.prepare("SELECT * FROM tickets ORDER BY id").all();
  for (const entry of entries.slice(syncIndex)) {
    db.exec("BEGIN IMMEDIATE"); db.exec(fs.readFileSync(`drizzle/${entry.tag}.sql`,"utf8")); db.exec("COMMIT");
  }
  assert.deepEqual(db.prepare("SELECT id,starts_at,ends_at,revision FROM events ORDER BY id").all(),before);
  assert.deepEqual(db.prepare("SELECT * FROM tickets ORDER BY id").all(),tickets);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  for (const column of ["starts_at","ends_at"]) assert.equal(db.prepare("PRAGMA table_info(events)").all().find(item=>item.name===column).notnull,0);
  console.log("PASS populated SQLite migration preserves timestamps, revisions, tickets and foreign keys");

  const load = nodeSourceModules(path.join(directory,"modules"));
  const source = await load("lib/event-sheet-source.ts");
  const schedules = await load("lib/event-schedule.ts");
  const sync = await load("lib/event-sync.ts");
  const writer = await load("lib/fast-events.ts");
  const catalog = await load("app/api/events/route.ts");
  const rows = source.parseSheetCsv(fs.readFileSync("tests/fixtures/event-sheet.csv","utf8"));
  const poster = fs.readFileSync("tests/fixtures/event-sheet-poster.webp");
  assert.equal(rows.length,51);
  for (const row of rows) assert.deepEqual(source.sheetEventInput(row,1405).input.location,{url:null,lat:null,lng:null});
  const exhibition = source.sheetEventInput(rows[0],1405);
  assert.equal(exhibition.input.start,null);
  assert.equal(exhibition.input.end,null);
  assert.ok(exhibition.schedule.range_end);
  const halfHour = source.sheetEventInput(rows.find(row=>row["زمان"].includes("و نیم")),1405);
  assert.equal(halfHour.schedule.sessions[0].start,630);
  assert.ok(halfHour.input.start);
  const multiple = source.sheetEventInput(rows.find(row=>row["زمان"].includes("دو سانس")),1405);
  assert.equal(multiple.schedule.sessions.length,2);
  assert.equal(multiple.input.start,null);
  const recurring = source.sheetEventInput(rows.find(row=>row["تاریخ"].includes("دوشنبه")),1405);
  assert.deepEqual(recurring.schedule.weekdays,[1]);
  const unknown = source.sheetEventInput(rows.find(row=>row["زمان"].includes("مشخص نیست")),1405);
  assert.equal(unknown.schedule.sessions.length,0);
  assert.equal(unknown.input.start,null);
  assert.equal(schedules.eventAvailable({starts_at:null,ends_at:null,schedule:exhibition.schedule},exhibition.schedule.range_end+86400000),false);
  assert.equal(schedules.eventAvailable({starts_at:null,ends_at:null,schedule:exhibition.schedule},exhibition.schedule.range_end),true);
  assert.equal(sync.nextSyncAt(Date.UTC(2026,9,25,11,59)),Date.UTC(2026,9,25,12));
  assert.equal(sync.nextSyncAt(Date.UTC(2026,9,25,12)),Date.UTC(2026,9,26));
  console.log("PASS all 51 real sheet rows parse, including Persian dates, unknown hours, half-hours, sessions and recurrence");

  function csv(records) { const headers=[...source.sheetHeaders,...(records.some(row=>Object.hasOwn(row,"لینک نقشه"))?["لینک نقشه"]:[])];return [headers,...records.map(row=>headers.map(header=>row[header]??""))].map(cells=>cells.map(cell=>'"'+cell.replaceAll('"','""')+'"').join(",")).join("\n"); }
  const mapUrl="https://www.google.com/maps?q=35.7,51.4";
  const namedPlace="نگارخانه هم‌قدم\nتهران، خیابان نمونه";
  const optionalMapRow=source.parseSheetCsv(csv([{...rows[0],"محل برگزاری":namedPlace,"لینک نقشه":mapUrl}]))[0];
  const optionalMap=source.sheetEventInput(optionalMapRow,1405).input;
  assert.deepEqual(optionalMap.location,{url:mapUrl,lat:35.7,lng:51.4});
  assert.equal(optionalMap.venue,"نگارخانه هم‌قدم");assert.equal(optionalMap.address,"تهران، خیابان نمونه");
  const inlineMap=source.sheetEventInput({...rows[0],"محل برگزاری":`${namedPlace}\n${mapUrl}`},1405).input;
  assert.deepEqual(inlineMap.location,optionalMap.location);assert.equal(inlineMap.venue,optionalMap.venue);assert.equal(inlineMap.address,optionalMap.address);
  assert.deepEqual(source.sheetEventInput({...optionalMapRow,"محل برگزاری":`${namedPlace}\n${mapUrl}`},1405).input.location,optionalMap.location);
  for (const url of ["https://maps.app.goo.gl/ActualVenue","https://venue.example.test/"]) assert.deepEqual(source.sheetEventInput({...optionalMapRow,"لینک نقشه":url},1405).input.location,{url,lat:null,lng:null});
  assert.throws(()=>source.sheetEventInput({...optionalMapRow,"محل برگزاری":mapUrl},1405),/نام واقعی محل/);
  assert.throws(()=>source.sheetEventInput({...optionalMapRow,"محل برگزاری":`${namedPlace}\nhttps://www.google.com/maps?q=35.8,51.5`},1405),/متفاوت/);
  for (const url of ["https://www.instagram.com/reel/Example/","https://t.me/example","javascript:alert(1)","https://user:secret@maps.google.com/"]) {
    assert.throws(()=>source.sheetEventInput({...optionalMapRow,"لینک نقشه":url},1405));
  }
  assert.throws(()=>source.sheetEventInput({...rows[0],"محل برگزاری":`${namedPlace}\nhttps://www.instagram.com/reel/Example/`},1405));
  console.log("PASS optional map column and standalone venue URL preserve named places, extract only known coordinates and reject social, conflicting and name-free locations");
  let currentRows = [rows[0]];
  let sheetFailure = false;
  let posterFailure = false;
  let posterLogin = false;
  let requests = 0;
  // Recorded public source data, served through a controlled transport. Database, auth and media are real.
  globalThis.fetch = async (input,options={}) => {
    const url = new URL(String(input)); requests++;
    assert.equal(new Headers(options.headers).has("authorization"),false,"Source requests must never receive job/admin credentials");
    assert.equal(url.protocol,"https:");
    if (url.hostname==="docs.google.com") return new Response(sheetFailure ? "<html>Sign in</html>" : csv(currentRows),{headers:{"Content-Type":sheetFailure ? "text/html" : "text/csv"}});
    if (url.hostname==="drive.google.com") return new Response(null,{status:302,headers:{Location:`https://drive.usercontent.google.com/download?id=${url.searchParams.get("id")}`}});
    assert.equal(url.hostname,"drive.usercontent.google.com");
    assert.equal(url.searchParams.get("id"),"1y0OSE2Xr0pR6T4CeEZdTXJybaog6HFe_");
    if (posterLogin) return new Response(null,{status:302,headers:{Location:"https://accounts.google.com/ServiceLogin"}});
    return posterFailure ? new Response("Denied",{status:403}) : new Response(poster,{headers:{"Content-Type":"image/webp"}});
  };
  async function drain() {
    for (let i=0;i<20;i++) { await sync.processEventSync(); const status=await sync.eventSyncStatus(); if(!status.active) return status.latest; }
    assert.fail("Sync failed to finish bounded batches");
  }
  await Promise.all([sync.queueEventSync(),sync.queueEventSync()]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM event_sync_runs WHERE active=1").get().n,1);
  await Promise.all([sync.processEventSync(),sync.processEventSync()]);
  let result = await drain();
  assert.equal(result.status,"completed"); assert.equal(result.created,1);
  const link = db.prepare("SELECT * FROM event_sheet_links WHERE external_id=?").get(rows[0].ID);
  let event = await writer.fastEvent(link.event_id);
  assert.equal(event.title,exhibition.input.title);
  assert.equal(event.description,rows[0]["توضیحات"].trim());
  assert.equal(event.starts_at,null); assert.equal(event.ends_at,null); assert.equal(event.maps_url,null);
  assert.equal(event.category,"uncategorized"); assert.equal(event.published,1); assert.ok(event.sheet_managed); assert.equal(event.canDelete,false);
  const media = db.prepare("SELECT * FROM event_media WHERE event_id=? AND role='cover'").get(event.id);
  assert.deepEqual(fs.readFileSync(path.join(process.env.MEDIA_PATH,media.storage_key)),poster);
  const revision = event.revision;
  await sync.queueEventSync(); result=await drain(); assert.equal(result.unchanged,1);
  event=await writer.fastEvent(event.id);assert.equal(event.revision,revision);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM event_media WHERE event_id=?").get(event.id).n,1);
  console.log("PASS concurrent triggers, real image validation/storage, UUID identity and idempotent re-import");

  currentRows=[optionalMapRow];await sync.queueEventSync();result=await drain();assert.equal(result.updated,1);
  event=await writer.fastEvent(event.id);assert.equal(event.maps_url,mapUrl);assert.equal(event.lat,35.7);assert.equal(event.lng,51.4);assert.equal(event.venue,optionalMap.venue);assert.equal(event.address,optionalMap.address);
  const mappedRevision=event.revision;
  currentRows=[{...optionalMapRow,"لینک نقشه":"https://www.instagram.com/reel/Example/"}];
  await sync.queueEventSync();result=await drain();assert.equal(result.status,"partial");assert.equal(result.failed,1);assert.equal(result.unpublished,0);
  event=await writer.fastEvent(event.id);assert.equal(event.maps_url,mapUrl);assert.equal(event.lat,35.7);assert.equal(event.lng,51.4);assert.equal(event.revision,mappedRevision);assert.equal(event.published,1);
  console.log("PASS corrected source map links reach persisted coordinates and rejected social links preserve the previous published event");

  const teaser = "https://www.instagram.com/reel/SheetTeaser/";
  event=await writer.saveFastEvent({revision:event.revision,category:"art",teaser},[],event.id);
  assert.equal(event.teaser,teaser);
  currentRows=[{...rows[0],"اسم ایونت":rows[1]["اسم ایونت"]}];
  await sync.queueEventSync();result=await drain();assert.equal(result.updated,1);
  event=await writer.fastEvent(event.id);assert.equal(event.category,"art");assert.equal(event.title,rows[1]["اسم ایونت"].replace(/\s+/g," ").trim());
  assert.equal(event.teaser,teaser,"Sheet updates preserve the manually authored teaser");
  event=await writer.saveFastEvent({revision:event.revision,category:"art"},[],event.id);
  assert.equal(event.teaser,teaser,"Omitting teaser during a sheet-event edit preserves it");
  event=await writer.saveFastEvent({revision:event.revision,category:"art",teaser:null},[],event.id);
  assert.equal(event.teaser,null);
  await assert.rejects(writer.saveFastEvent({revision:event.revision,category:"art",title:"changed"},[],event.id),/شیت/);
  posterFailure=true;
  await sync.queueEventSync();result=await drain();assert.equal(result.status,"partial");assert.equal(result.failed,1);assert.equal(result.unpublished,0);
  assert.equal((await writer.fastEvent(event.id)).published,1);
  assert.equal((await writer.fastEvent(event.id)).image,event.image);
  posterFailure=false;
  posterLogin=true;await sync.queueEventSync();result=await drain();assert.equal(result.status,"partial");assert.match(result.errors[0].error,/ورود Google/);posterLogin=false;
  sheetFailure=true;await sync.queueEventSync();result=await drain();assert.equal(result.status,"failed");assert.equal((await writer.fastEvent(event.id)).published,1);sheetFailure=false;
  currentRows=[rows[0],rows[0]];await sync.queueEventSync();result=await drain();assert.equal(result.status,"failed");assert.equal((await writer.fastEvent(event.id)).published,1);
  console.log("PASS sheet-owned fields, category preservation, private sources, failed posters and malformed snapshots preserve prior events");

  currentRows=[];await sync.queueEventSync();result=await drain();assert.equal(result.unpublished,1);assert.equal((await writer.fastEvent(event.id)).published,0);
  currentRows=[rows[0]];await sync.queueEventSync();await drain();assert.equal((await writer.fastEvent(event.id)).published,1);
  assert.equal(db.prepare("SELECT event_id FROM event_sheet_links WHERE external_id=?").get(rows[0].ID).event_id,event.id);
  const settings=await sync.syncSettings();
  await sync.saveSyncSettings({...settings,persian_year:1406});
  assert.equal((await sync.syncSettings()).revision,settings.revision+1);
  await assert.rejects(sync.saveSyncSettings({...settings,persian_year:1405}),/جاری/);
  db.prepare("UPDATE event_sync_runs SET lease_token='crashed-worker',lease_until=? WHERE active=1").run(Date.now()+90000);
  assert.equal((await sync.processEventSync()).hasMore,true);
  db.prepare("UPDATE event_sync_runs SET lease_until=0 WHERE active=1").run();
  await drain();event=await writer.fastEvent(event.id);assert.equal(event.schedule.year,1406);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  const response=await catalog.GET(new Request("https://sync.example.test/api/events"));
  const publicCatalog=await response.json();assert.equal(response.status,200);assert.ok(publicCatalog.events.find(item=>item.id===event.id)?.schedule);
  console.log("PASS authoritative empty snapshots, reappearance, settings changes, crash recovery and public flexible schedule response");

  const count=requests;
  for (const url of ["http://127.0.0.1/image.jpg","https://localhost/image.jpg","https://evil.test/image.jpg","https://user:pass@drive.google.com/file/d/abc/view"]) await assert.rejects(source.fetchSheetPoster(url));
  assert.equal(requests,count,"Unapproved destinations are rejected before fetch");
  for (const url of ["https://docs.google.com.evil.test/spreadsheets/d/abc/edit","https://user:pass@docs.google.com/spreadsheets/d/abc/edit","http://docs.google.com/spreadsheets/d/abc/edit"]) assert.throws(()=>source.sheetSource(url));
  const job=await load("app/api/jobs/event-sync/route.ts");
  const fast=await load("app/api/fast/event-sync/route.ts");
  const runRoute=await load("app/api/fast/event-sync/run/route.ts");
  assert.equal((await job.POST(new Request("https://sync.example.test/api/jobs/event-sync",{method:"POST"}))).status,401);
  assert.equal((await fast.GET(new Request("https://sync.example.test/api/fast/event-sync"))).status,503);
  assert.equal((await runRoute.POST(new Request("https://sync.example.test/api/fast/event-sync/run",{method:"POST",headers:{Origin:"https://evil.test"}}))).status,403);
  assert.equal(eventSyncJobUrl("http://app:3000").href,"http://app:3000/api/jobs/event-sync");
  assert.throws(()=>eventSyncJobUrl("http://external.example.test"));
  globalThis.fetch=async(input,options)=>{assert.equal(options.headers.Authorization,`Bearer ${process.env.EVENT_SYNC_JOB_SECRET}`);assert.equal(options.redirect,"error");return Response.json({hasMore:false});};
  assert.deepEqual(await eventSyncTick("http://127.0.0.1:3000",process.env.EVENT_SYNC_JOB_SECRET,new AbortController().signal),{hasMore:false});
  console.log("PASS job authentication, Origin checks, outbound restrictions and scheduler transport");
} finally {
  globalThis.fetch=originalFetch;
  db.close();fs.rmSync(directory,{recursive:true,force:true});
}
