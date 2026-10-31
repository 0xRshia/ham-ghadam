import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { organizerAgreement } from './legal-fixtures.mjs';
import { nodeSourceModules } from '../tests/node-source-module.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-browser-'));
const load = nodeSourceModules(path.join(temp, 'modules'));
const { hashPassword } = await load('lib/passwords.ts');
const password = randomBytes(20).toString('hex');
const origin = process.env.TEST_ORIGIN ?? 'http://127.0.0.1:5193';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Browser tests must target loopback');
const env = { ...process.env, DATABASE_PATH: path.join(temp, 'test.sqlite'), MEDIA_PATH: path.join(temp, 'media'), APP_ORIGIN: origin, HOST: new URL(origin).hostname, PORT: new URL(origin).port, SEED_SAMPLE_EVENTS: 'false', TEMP_LOGIN_ENABLED: 'false', HOST_PHONES: '09990000002', FAST_ADMIN_USERNAME: 'browser-check', FAST_ADMIN_PASSWORD_HASH: await hashPassword(password), MAP_TILE_URL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', MAP_ATTRIBUTION_URL: 'https://www.openstreetmap.org/copyright', MAP_ATTRIBUTION_LABEL: '© OpenStreetMap' };
assert.equal(spawnSync(process.execPath, ['scripts/migrate-node.mjs'], { env, encoding:'utf8' }).status, 0);
const server = spawn(process.execPath, ['dist/standalone/server.js'], {env, stdio:['ignore','pipe','pipe']});
let output = ''; for (const s of [server.stdout, server.stderr]) s.on('data', chunk => { output += chunk; });
const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const page = await browser.newPage({ viewport:{width:390,height:844} });
page.setDefaultTimeout(15000);
const db = new DatabaseSync(env.DATABASE_PATH);
const errors = [];
page.on('pageerror', e => { errors.push(e.message); console.log('BROWSER ERROR', e.message); });
page.on('response', async r => { if(r.status()>=400) console.log('HTTP ERROR',r.status(),r.url()); });
let creationRequests = 0;
page.on('request', request => { if (request.url() === origin+'/api/fast/events' && request.method() === 'POST') creationRequests++; });
// Exercise real marker rendering while preventing automated tile downloads.
await page.route('https://tile.openstreetmap.org/**', route => route.abort());
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
  const venueUrl = 'https://maps.app.goo.gl/ExampleSharedPlace';
  await page.getByLabel(/^پیوند محل برگزاری/).fill(venueUrl);
  const coordinates = page.getByLabel('مختصات جغرافیایی (Latitude, Longitude)', {exact:true});
  assert.deepEqual(await page.locator('input[aria-describedby="event-location-hint"],input[name="coordinates"]').evaluateAll(inputs => inputs.map(input => input.name || input.type)), ['url','coordinates'], 'Coordinates follow the venue link');
  for (const value of ['35.7219', '35.7219,', '91, 51.3347', '35.7219, 181', '35.7219, 51.3347, 1', '35.7219 51.3347']) {
    await coordinates.fill(value);
    await page.getByRole('button',{name:'ذخیرهٔ رویداد',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'مختصات را به‌شکل «عرض, طول» وارد کنید'}).waitFor();
    assert.equal(creationRequests,0,'Invalid or incomplete coordinates are blocked before submission');
  }
  await coordinates.fill('۳۵٫۷۲۱۹، ۵۱٫۳۳۴۷');
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
  assert.equal(result.event.maps_url,venueUrl,'Explicit coordinates preserve the original venue link');
  assert.equal(result.event.lat,35.7219);
  assert.equal(result.event.lng,51.3347);
  assert.deepEqual({...db.prepare('SELECT lat,lng FROM events WHERE id=?').get(result.event.id)},{lat:35.7219,lng:51.3347});
  await page.reload();
  assert.equal(await coordinates.inputValue(),'35.7219, 51.3347');
  await coordinates.fill('35.7319,51.3447');
  const edited = page.waitForResponse(r=>r.url()===origin+'/api/fast/events/'+result.event.id && r.request().method()==='PUT');
  await page.getByRole('button',{name:'ذخیرهٔ رویداد',exact:true}).click();
  assert.equal((await edited).status(),200);
  await page.getByRole('status').filter({hasText:'تغییرات ذخیره شد.'}).waitFor();
  await page.reload();
  assert.equal(await coordinates.inputValue(),'35.7319, 51.3447');
  for (const width of [390, 1280]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false,'Event editor fits the viewport');
  }
  for (const image of await page.locator('figure img').all()) await image.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>[...document.querySelectorAll('figure img')].every(img=>img.complete && img.naturalWidth>0));
  if (process.env.BROWSER_SCREENSHOT) await page.screenshot({path:process.env.BROWSER_SCREENSHOT,fullPage:true});
  assert.equal(db.prepare('SELECT COUNT(*) count FROM event_media WHERE event_id=?').get(result.event.id).count,3);
  const published = page.waitForResponse(r=>r.url()===origin+'/api/fast/events/'+result.event.id && r.request().method()==='PATCH');
  await page.getByRole('button',{name:'انتشار رویداد',exact:true}).click();
  assert.equal((await published).status(),200);
  await page.getByRole('button',{name:'توقف انتشار',exact:true}).waitFor();
  const catalog = await (await fetch(origin+'/api/events')).json();
  const publicEvent = catalog.events.find(event=>event.id===result.event.id);
  assert(publicEvent,'Published event appears in the public catalog');
  assert.equal(publicEvent.lat,35.7319);
  assert.equal(publicEvent.lng,51.3447);
  await page.goto(origin+'/map');
  const marker = page.locator('.el-map-category-pin').filter({hasText:'کیلومتر'});
  await marker.waitFor();
  assert((await marker.getAttribute('aria-label')).includes(result.event.title));
  assert.equal(await marker.getAttribute('data-event-count'),'1');
  await marker.click();
  await page.waitForFunction(()=>document.querySelector('.el-map-category-pin')?.getAttribute('aria-pressed')==='true');
  assert.equal(await marker.locator('.el-map-category-distance').innerText(),'۰ کیلومتر','Selecting the real event marker centers its saved coordinates');
  db.prepare("INSERT INTO users(id,phone,name,created_at) VALUES('legacy-reader','09990000001','خوانندهٔ آزمون',?)").run(Date.now());
  for (const [lat,lng,booked] of [[null,null,true],[35.75,null,false]]) {
    db.prepare("DELETE FROM reservations WHERE event_id=?").run(result.event.id);
    db.prepare('UPDATE events SET maps_url=?,lat=?,lng=? WHERE id=?').run('https://www.google.com/maps/search/?api=1&query=35.75%2C51.4',lat,lng,result.event.id);
    if (booked) db.prepare("INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,payment_state) VALUES('legacy-booking','legacy-reader',?,1,0,0,'cancelled','legacy-booking',?,'none')").run(result.event.id,Date.now());
    await page.goto(origin+'/fast/events/'+result.event.id);
    assert.equal(await coordinates.inputValue(),lat === null ? '' : `${lat}, `);
    assert.equal(await coordinates.isDisabled(),booked,'Any reservation history keeps location locked');
    await page.getByLabel('دربارهٔ ایونت',{exact:true}).fill(`اصلاح توضیح رویداد قدیمی ${booked ? 'با رزرو لغوشده' : 'با مختصات ناقص'}`);
    const legacySave = page.waitForResponse(r=>r.url()===origin+'/api/fast/events/'+result.event.id && r.request().method()==='PUT');
    await page.getByRole('button',{name:'ذخیرهٔ رویداد',exact:true}).click();
    const legacyResponse = await legacySave;
    assert.equal(legacyResponse.status(),200,'Unchanged legacy coordinates never block a content edit');
    const request = legacyResponse.request();
    const multipart = await new Request(origin+'/api/fast/events/'+result.event.id,{method:'PUT',headers:{'Content-Type':request.headers()['content-type']},body:request.postDataBuffer()}).formData();
    const payload = JSON.parse(multipart.get('data'));
    assert.equal(Object.hasOwn(payload,'lat'),false,'Content-only saves omit unchanged legacy coordinates');
    assert.equal(Object.hasOwn(payload,'lng'),false);
    assert.deepEqual({...db.prepare('SELECT lat,lng FROM events WHERE id=?').get(result.event.id)},{lat,lng},'Content-only saves preserve null and incomplete legacy coordinates exactly');
  }
  // Exercise schedule creation, editing and public presentation through real HTTP.
  console.log('CHECK weekly and session editor');
  await page.goto(origin+'/fast/events/new');
  await page.getByLabel('عنوان ایونت',{exact:true}).fill('کارگاه هفتگی با دو سانس');
  await page.getByLabel('دربارهٔ ایونت',{exact:true}).fill('جمعه‌ها سانس صبح و بعدازظهر');
  await page.getByRole('combobox',{name:'برگزارکننده',exact:true}).fill('برگزارکنندهٔ سانس‌ها');
  await page.getByLabel('نام کافه / محل برگزاری',{exact:true}).fill('کارگاه');
  await page.getByLabel('شهر',{exact:true}).fill('تهران');
  await page.getByLabel(/^پیوند محل برگزاری/).fill(venueUrl);
  await page.getByLabel('نحوهٔ برگزاری',{exact:true}).selectOption('weekly');
  assert.equal(await page.getByRole('checkbox',{name:'جمعه',exact:true}).isChecked(),true);
  for (const width of [360,390,1280]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Weekly schedule fits the viewport');
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByLabel('نحوهٔ برگزاری',{exact:true}).scrollIntoViewIfNeeded();
  await page.locator('section').filter({has:page.getByLabel('نحوهٔ برگزاری',{exact:true})}).screenshot({path:'/tmp/hamghadam-weekly-schedule-mobile.png'});
  const scheduleSaved=page.waitForResponse(r=>r.url()===origin+'/api/fast/events' && r.request().method()==='POST');
  await page.getByRole('button',{name:'ذخیرهٔ رویداد',exact:true}).click();
  const scheduleResponse=await scheduleSaved;assert.equal(scheduleResponse.status(),201);
  const recurring=(await scheduleResponse.json()).event;
  assert.equal(recurring.schedule.sessions.length,2);assert.deepEqual(recurring.schedule.weekdays,[5]);
  await page.waitForURL(origin+'/fast/events/'+recurring.id);await page.reload();
  assert.equal(await page.getByLabel('نحوهٔ برگزاری',{exact:true}).inputValue(),'weekly');
  await page.getByLabel('شروع سانس ۲',{exact:true}).fill('15:00');
  await page.getByLabel('پایان سانس ۲',{exact:true}).fill('17:00');
  await page.getByRole('checkbox',{name:'تعیین تاریخ پایان تکرار',exact:true}).check();
  const {persianInput}=await load('lib/persian-date.ts');
  await page.getByRole('textbox',{name:'پایان تکرار (شامل این روز)',exact:true}).fill(persianInput(Date.now()+22*86400000));
  await page.getByRole('checkbox',{name:'تعیین مهلت ثبت‌نام (اختیاری)',exact:true}).check();
  const slotEdit=page.waitForResponse(r=>r.url()===origin+'/api/fast/events/'+recurring.id && r.request().method()==='PUT');
  await page.getByRole('button',{name:'ذخیرهٔ رویداد',exact:true}).click();
  assert.equal((await slotEdit).status(),200);await page.reload();
  assert.equal(await page.getByLabel('شروع سانس ۲',{exact:true}).inputValue(),'15:00');
  const publishSchedule=page.waitForResponse(r=>r.url()===origin+'/api/fast/events/'+recurring.id && r.request().method()==='PATCH');
  await page.getByRole('button',{name:'انتشار رویداد',exact:true}).click();assert.equal((await publishSchedule).status(),200);
  await page.goto(origin+'/events/'+recurring.id);
  await page.getByText(/هر هفته جمعه/).first().waitFor();
  await page.getByText(/۱۵:۰۰ تا ۱۷:۰۰/).first().waitFor();
  const iconHref=await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  assert.equal(iconHref,'/brand/hamghadam-apple-touch-icon-2b04d97f998d.png');
  const icon=await fetch(origin+iconHref);assert.equal(icon.status,200);assert.match(icon.headers.get('content-type'),/image\/png/);
  assert(Buffer.from(await icon.arrayBuffer()).equals(fs.readFileSync('public/apple-touch-icon.png')));
  await page.goto(origin+'/fast/events/'+recurring.id);
  await page.getByRole('checkbox',{name:'تعیین مهلت ثبت‌نام (اختیاری)',exact:true}).uncheck();
  await page.getByLabel('نحوهٔ برگزاری',{exact:true}).selectOption('sessions');
  const toSlots=page.waitForResponse(r=>r.url()===origin+'/api/fast/events/'+recurring.id && r.request().method()==='PUT');
  await page.getByRole('button',{name:'ذخیرهٔ رویداد',exact:true}).click();
  assert.equal((await toSlots).status(),200);await page.reload();
  assert.equal(await page.getByLabel('نحوهٔ برگزاری',{exact:true}).inputValue(),'sessions');
  assert.equal(await page.getByLabel('شروع سانس ۲',{exact:true}).inputValue(),'15:00');
  console.log('PASS admin schedules and served iPhone icon');
  // The host uses the same editor and saves the full contract with the schedule.
  db.prepare("INSERT INTO users(id,phone,name,created_at) VALUES('schedule-browser-host','09990000002','میزبان مرورگر',?)").run(Date.now());
  const token=randomBytes(32).toString('hex');
  db.prepare("INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,'schedule-browser-host',?)").run(createHash('sha256').update(token).digest('hex'),Date.now()+600000);
  await page.context().addCookies([{name:'hg_session',value:token,url:origin}]);
  await page.goto(origin+'/host');
  await page.getByRole('button',{name:'ایونت جدید',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('نحوهٔ برگزاری',{exact:true}).selectOption('weekly');
  for(const width of [360,1280]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'Host schedule fits its dialog');
  }
  await dialog.getByLabel('عنوان ایونت',{exact:true}).fill('رویداد هفتگی میزبان');
  await dialog.getByLabel('دربارهٔ ایونت',{exact:true}).fill('برگزاری هر جمعه در دو سانس');
  await dialog.getByLabel('نام کافه / محل برگزاری',{exact:true}).fill('کارگاه میزبان');
  await dialog.getByLabel(/^پیوند محل برگزاری/).fill(venueUrl);
  for(const [key,value] of Object.entries(organizerAgreement)) {
    const input=dialog.locator(`[name="contract_${key}"]`);
    if(await input.count() && typeof value==='string' && key!=='version' && key!=='partyType')await input.fill(value);
  }
  await dialog.locator('[name="contract_accepted"]').check();
  const hostSaved=page.waitForResponse(r=>r.url()===origin+'/api/host' && r.request().method()==='POST');
  await dialog.getByRole('button',{name:'انتشار ایونت',exact:true}).click();
  const hostResponse=await hostSaved;assert.equal(hostResponse.status(),201,await hostResponse.text());
  await dialog.waitFor({state:'hidden'});
  console.log('PASS host recurring event creation');
  // Browser WebOTP is mocked at its device boundary; the real form must listen before sending.
  await page.context().clearCookies();
  await page.addInitScript(()=>{
    window.OTPCredential=class{};
    Object.defineProperty(navigator,'credentials',{value:{get:options=>new Promise(resolve=>{
      window.__otpOptions=options;window.__receiveOtp=resolve;
    })}});
  });
  await page.route('**/api/auth/request',async route=>{
    assert.equal(await page.evaluate(()=>!!window.__receiveOtp),true,'Listen before sending SMS');
    await route.fulfill({json:{challengeId:'browser-otp',serverNow:Date.now(),expiresAt:Date.now()+300000,resendAt:Date.now(),resendAfter:0,expiresIn:300}});
  });
  await page.goto(origin+'/login');
  await page.getByLabel('شمارهٔ همراه',{exact:true}).fill('09990000003');
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button',{name:'دریافت کد تأیید',exact:true}).click();
  const otp=page.locator('input[autocomplete="one-time-code"]');await otp.waitFor();
  await page.evaluate(()=>window.__receiveOtp({code:'123456'}));
  await page.waitForFunction(()=>document.querySelector('input[autocomplete="one-time-code"]').value==='123456');
  assert.equal(await page.getByRole('button',{name:'تأیید کد',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'ارسال دوبارهٔ کد',exact:true}).click();
  await otp.fill('۱۲۳۴۵۶');assert.equal(await otp.inputValue(),'123456');
  assert.equal(await page.evaluate(()=>window.__otpOptions.signal.aborted),true,'Manual input cancels the pending device request');
  await page.evaluate(()=>window.__receiveOtp({code:'654321'}));
  assert.equal(await otp.inputValue(),'123456','A late code does not overwrite manual input');
  console.log('PASS WebOTP ordering, autofill, manual fallback and stale-code cancellation');
  assert.deepEqual(errors,[]);
  console.log('PASS browser coordinate validation, creation/edit/reload, public catalog/map marker, legacy location preservation, generic MIME uploads, retained input and responsive layout');
} catch(e) { console.log('PAGE',await page.locator('body').innerText()); console.log('SERVER',output.slice(-5000)); throw e; }
finally { await browser.close(); if (server.exitCode === null) { const stopped = new Promise(r=>server.once('exit',r)); server.kill('SIGTERM'); await stopped; } db.close(); fs.rmSync(temp,{recursive:true,force:true}); }
