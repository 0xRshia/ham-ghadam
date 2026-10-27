import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { nodeSourceModules } from '../tests/node-source-module.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-browser-'));
const load = nodeSourceModules(path.join(temp, 'modules'));
const { hashPassword } = await load('lib/passwords.ts');
const password = randomBytes(20).toString('hex');
const origin = process.env.TEST_ORIGIN ?? 'http://127.0.0.1:5193';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Browser tests must target loopback');
const env = { ...process.env, DATABASE_PATH: path.join(temp, 'test.sqlite'), MEDIA_PATH: path.join(temp, 'media'), APP_ORIGIN: origin, HOST: new URL(origin).hostname, PORT: new URL(origin).port, SEED_SAMPLE_EVENTS: 'false', TEMP_LOGIN_ENABLED: 'false', FAST_ADMIN_USERNAME: 'browser-check', FAST_ADMIN_PASSWORD_HASH: await hashPassword(password) };
assert.equal(spawnSync(process.execPath, ['scripts/migrate-node.mjs'], { env, encoding:'utf8' }).status, 0);
const server = spawn(process.execPath, ['dist/standalone/server.js'], {env, stdio:['ignore','pipe','pipe']});
let output = ''; for (const s of [server.stdout, server.stderr]) s.on('data', chunk => { output += chunk; });
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({ viewport:{width:390,height:844} });
page.setDefaultTimeout(15000);
const db = new DatabaseSync(env.DATABASE_PATH);
const errors = [];
page.on('pageerror', e => { errors.push(e.message); console.log('BROWSER ERROR', e.message); });
page.on('response', async r => { if(r.status()>=400) console.log('HTTP ERROR',r.status(),r.url()); });
try {
  for(let i=0;i<60;i++) { try { if((await fetch(origin+'/api/health')).ok)break; }catch{} await new Promise(r=>setTimeout(r,250)); }
  await page.goto(origin+'/fast/login');
  await page.getByLabel('نام کاربری', {exact:true}).fill('browser-check');
  await page.getByLabel('رمز عبور', {exact:true}).fill(password);
  await page.getByRole('button', {name:'ورود',exact:true}).click();
  await page.waitForURL(origin+'/fast');
  await page.goto(origin+'/fast/events/new');
  await page.getByLabel('عنوان ایونت', {exact:true}).fill('آزمون واقعی ساخت رویداد با تصویر');
  await page.getByLabel('دربارهٔ ایونت', {exact:true}).fill('بررسی ثبت تصاویر در پنل مدیریت روی سرور محلی');
  await page.getByRole('combobox', {name:'برگزارکننده',exact:true}).fill('برگزارکنندهٔ آزمون مرورگر');
  await page.getByLabel('نام کافه / محل برگزاری', {exact:true}).fill('محل آزمون');
  await page.getByLabel('شهر', {exact:true}).fill('تهران');
  await page.getByLabel(/^پیوند محل برگزاری/).fill('https://maps.google.com/?q=35.7,51.4');
  const cover = fs.readFileSync('public/banners/halloween.png');
  const webp = fs.readFileSync('tests/fixtures/event-sheet-poster.webp');
  await page.getByLabel('تصویر جلد', {exact:true}).setInputFiles({ name:'camera.png', mimeType:'application/octet-stream', buffer:cover });
  await page.getByLabel('گالری تصاویر', {exact:true}).setInputFiles({ name:'damaged.webp', mimeType:'image/webp', buffer:webp.subarray(0, webp.length - 2) });
  const rejected = page.waitForResponse(r=>r.url()===origin+'/api/fast/events' && r.request().method()==='POST');
  await page.getByRole('button',{name:'ذخیرهٔ رویداد',exact:true}).click();
  assert.equal((await rejected).status(),400);
  await page.getByRole('alert').filter({hasText:'damaged.webp'}).waitFor();
  assert((await page.getByRole('alert').innerText()).includes('HTTP 400'));
  assert.equal(await page.locator('img[src^="blob:"]').count(),2,'Failed uploads preserve previews');
  assert.equal(db.prepare('SELECT COUNT(*) count FROM events').get().count,0,'A rejected image cannot create a partial event');
  await page.getByRole('button',{name:'حذف تصویر',exact:true}).nth(1).click();
  await page.getByLabel('گالری تصاویر', {exact:true}).setInputFiles([
    {name:'gallery.webp',mimeType:'application/octet-stream',buffer:webp},
    {name:'gallery.jpg',mimeType:'image/jpeg',buffer:fs.readFileSync('public/images/books.jpg')},
  ]);
  await page.getByLabel('ظرفیت (خالی = نامحدود)', {exact:true}).fill('0');
  const invalidCapacity = page.waitForResponse(r=>r.url()===origin+'/api/fast/events' && r.request().method()==='POST');
  await page.getByRole('button',{name:'ذخیرهٔ رویداد',exact:true}).click();
  assert.equal((await invalidCapacity).status(),400);
  await page.getByRole('alert').filter({hasText:'ظرفیت باید'}).waitFor();
  await page.getByLabel('ظرفیت (خالی = نامحدود)', {exact:true}).fill('');
  assert.equal(await page.locator('img[src^="blob:"]').count(),3);
  const responsePromise = page.waitForResponse(r=>r.url()===origin+'/api/fast/events' && r.request().method()==='POST', {timeout:15000});
  await page.getByRole('button',{name:'ذخیرهٔ رویداد',exact:true}).click();
  const response = await responsePromise;
  const result = await response.json(); console.log('SAVE',response.status(),response.ok()? result.event.id:result);
  assert.equal(response.status(),201);
  await page.waitForURL(origin+'/fast/events/'+result.event.id);
  assert.equal(result.event.gallery.length,2);
  assert(result.event.image);
  for (const width of [390, 1280]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false,'Event editor fits the viewport');
  }
  for (const image of await page.locator('figure img').all()) await image.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>[...document.querySelectorAll('figure img')].every(img=>img.complete && img.naturalWidth>0));
  if (process.env.BROWSER_SCREENSHOT) await page.screenshot({path:process.env.BROWSER_SCREENSHOT,fullPage:true});
  assert.equal(db.prepare('SELECT COUNT(*) count FROM event_media WHERE event_id=?').get(result.event.id).count,3);
  assert.deepEqual(errors,[]);
  console.log('PASS browser creation, generic MIME uploads, filename/field errors, retained input, real persistence and responsive layout');
} catch(e) { console.log('PAGE',await page.locator('body').innerText()); console.log('SERVER',output.slice(-5000)); throw e; }
finally { await browser.close(); if (server.exitCode === null) { const stopped = new Promise(r=>server.once('exit',r)); server.kill('SIGTERM'); await stopped; } db.close(); fs.rmSync(temp,{recursive:true,force:true}); }
