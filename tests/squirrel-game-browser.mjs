import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "squirrel-browser-"));
const origin = "http://127.0.0.1:5198";
const modelAsset=JSON.parse(fs.readFileSync(new URL('../public/game/mascot/manifest.json',import.meta.url),'utf8'));
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
  await page.getByRole("button", { name: "شروع بازی AR", exact: true }).waitFor();
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
    await page.getByRole("button", { name: "شروع بازی AR", exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.getByRole("button", { name: "شروع بازی AR", exact: true }).isVisible(), true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "تمرین دوبعدی، بدون دوربین" }).click();
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
  await touchPage.getByRole("button", { name: "تمرین دوبعدی، بدون دوربین" }).tap();
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

  const mockSource = fs.readFileSync(new URL("./fixtures/xr8-world-mock.js", import.meta.url), "utf8");
  async function mockedContext(options = {}) {
    const ctx = await context(options);
    await ctx.addInitScript(() => {
      window.__cameraRequests = [];
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.enumerateDevices = async () => [
        {kind:'videoinput',deviceId:'ultrawide',label:'Back Ultra Wide Camera'},
        {kind:'videoinput',deviceId:'front',label:'Front Camera'},
        {kind:'videoinput',deviceId:'main',label:'Back Camera'},
      ];
      navigator.mediaDevices.getUserMedia = async constraints => {
        window.__cameraRequests.push(structuredClone(constraints));
        const stream = await original({video:true});
        const selected = typeof constraints.video === 'object' ? constraints.video.deviceId?.exact : null;
        for (const track of stream.getVideoTracks()) {
          const settings = track.getSettings.bind(track);
          track.getSettings = () => ({...settings(),deviceId:selected || 'ultrawide'});
        }
        return stream;
      };
      window.__cameraOriginal = navigator.mediaDevices.getUserMedia;
    });
    await ctx.route("**/game/vendor/xr/xr.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: mockSource }));
    return ctx;
  }
  const arContext = await mockedContext();
  const arPage = await pageFor(arContext);
  await arPage.getByRole("button", {name:"شروع بازی AR",exact:true}).click();
  await arPage.locator('[data-ar-status="scanning"]').waitFor();
  await arPage.waitForTimeout(500);
  assert.equal(await arPage.locator('[data-game-phase="ready"]').count(),1,'No automatic placement before floor evidence');
  assert.equal(await arPage.locator('[data-ar-place]').count(),0,'Automatic floor detection does not require a confirm button');
  assert.equal(await arPage.locator(".sg-target").count(), 0, "AR renders a 3D model, never an HTML squirrel over the camera");
  assert.equal(await arPage.evaluate(() => window.__arTest.config.disableWorldTracking), false);
  assert.equal(await arPage.evaluate(() => window.__arTest.config.scale), "responsive");
  assert.equal(await arPage.evaluate(() => window.__arTest.cameraDevice), 'main', 'An ultrawide default must be replaced by the physical main camera');
  assert.equal(await arPage.getByRole('button',{name:'تعویض دوربین',exact:true}).isEnabled(),true);
  assert.equal(await arPage.locator('.sg-ar-camera select').count(),0);
  assert.equal(await arPage.locator('main').getAttribute('data-character'),'3d');
  for (const invalid of ['wall','feature']) {
    await arPage.evaluate(value => { window.__arTest.surface=value; },invalid);
    await arPage.waitForTimeout(1100);
    assert.equal(await arPage.locator('[data-game-phase="ready"]').count(),1,'Walls and isolated feature points cannot trigger automatic floor placement');
  }
  await arPage.evaluate(() => { window.__arTest.surface = true; });
  await arPage.waitForFunction(() => document.querySelector('progress').value > .1);
  await arPage.evaluate(() => { window.__arTest.surface = false; });
  await arPage.waitForTimeout(150);
  assert.ok(await arPage.locator('progress').evaluate(p=>p.value) > 0,'Brief misses preserve the floor estimate');
  await arPage.waitForFunction(() => document.querySelector('progress').value === 0);
  await arPage.evaluate(() => { window.__arTest.surface = true; });
  await phase(arPage,'waiting');
  const countdownStarted=Date.now();
  await screenshot(arPage,'ar-auto-floor-countdown');
  assert.match(await arPage.locator('.sg-timer').innerText(),/۳/);
  await phase(arPage, "encounter");
  assert.ok(Date.now()-countdownStarted >= 2800,'The first entry waits for the configured three-second countdown');
  const modelInfo=await arPage.evaluate(()=>{
    const root=window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model');let mesh;root.traverse(object=>{if(object.isSkinnedMesh)mesh=object;});
    return {asset:root.userData.asset,animation:root.userData.animation,joints:mesh.skeleton.bones.length,vertices:mesh.geometry.attributes.position.count,textures:[mesh.material.map.source.data.width,mesh.material.normalMap.source.data.width]};
  });
  assert.equal(modelInfo.asset,modelAsset.file,'AR loads the supplied GLB asset');
  assert.equal(modelInfo.joints,34);assert.equal(modelInfo.vertices,modelAsset.geometry.vertices);
  assert.equal(modelInfo.animation,'HG_Walk');assert.deepEqual(modelInfo.textures,[2048,1024]);
  const pose = () => arPage.evaluate(() => {
    const {scene,camera} = window.XR8.Threejs.xrScene();
    scene.updateMatrixWorld(true);
    const position = scene.getObjectByName("squirrel-model").getWorldPosition(new window.THREE.Vector3());
    const projected = position.clone().add(new window.THREE.Vector3(0,.24,0)).project(camera);
    return {world:position.toArray(),screen:projected.toArray(),rotation:scene.getObjectByName('squirrel-model').getWorldQuaternion(new window.THREE.Quaternion()).toArray()};
  });
  const before = await pose();
  await arPage.evaluate(() => { window.__arTest.cameraX = .35; });
  await arPage.waitForTimeout(100);
  const after = await pose();
  assert.deepEqual(after.world, before.world, "The rendered model stays in the same world location when the phone translates");
  assert.deepEqual(after.rotation,before.rotation,'The 3D character does not billboard toward a moving camera');
  assert.ok(Math.abs(after.screen[0]-before.screen[0]) > .1, "Real parallax moves the model's screen projection");
  await arPage.evaluate(() => { window.__arTest.cameraX = 0; });
  await arPage.waitForTimeout(100);
  await screenshot(arPage, "ar-placed-simulated-pose");
  const emptySpace=await arPage.evaluate(()=>{
    const {scene,camera}=window.XR8.Threejs.xrScene();
    const p=scene.getObjectByName('squirrel-model').localToWorld(new window.THREE.Vector3(-.2,.2,0)).project(camera);
    return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
  });
  await arPage.mouse.click(emptySpace.x,emptySpace.y);
  assert.equal(await arPage.locator('[data-game-phase="encounter"]').count(),1,'Empty space within the broad animation bounds does not count as a mesh hit');
  const target = await pose();
  await arPage.mouse.click((target.screen[0]+1)*195, (1-target.screen[1])*422);
  await phase(arPage, "playing");
  assert.equal(await arPage.evaluate(()=>window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').userData.animation),'HG_Run');
  await arPage.evaluate(() => { window.__arTest.tracking = false; });
  await arPage.locator('[data-tracking="limited"]').waitFor();
  const frozen = await arPage.locator('.sg-timer').innerText();
  await arPage.waitForTimeout(1100);
  assert.equal(await arPage.locator('.sg-timer').innerText(), frozen);
  assert.equal(await arPage.evaluate(() => window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').visible),false);
  await arPage.evaluate(() => { window.__arTest.tracking = true; });
  await arPage.locator('[data-tracking="normal"]').waitFor();
  const launcher = await arPage.locator('[data-world-launcher]').boundingBox();
  const bx=launcher.x+launcher.width/2, by=launcher.y+launcher.height/2;
  await arPage.mouse.move(bx,by); await arPage.mouse.down();
  // A short flick: serial CDP steps wait for software-rendered GPU frames and
  // can otherwise turn a gesture into a multi-second hold in headless Chromium.
  await arPage.mouse.move(bx,by-844*.3,{steps:2}); await arPage.waitForTimeout(100); await arPage.mouse.up();
  await arPage.evaluate(() => { window.__arTest.cameraX = .25; });
  await phase(arPage,"caught");
  assert.match(await arPage.locator('.sg-ar-result').innerText(),/۱۵۰/);
  assert.equal(await arPage.evaluate(()=>window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').userData.animation),'HG_Sit_Intro');
  await arPage.waitForFunction(()=>window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').userData.animation === 'HG_Sit_Loop');
  assert.equal(await arPage.evaluate(()=>window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').userData.animation),'HG_Sit_Loop');
  await screenshot(arPage,"ar-caught-simulated-pose");
  const firstRound=await arPage.locator('main').getAttribute('data-round');
  await arPage.locator('[data-game-phase="escaped"]').waitFor({timeout:25000});
  await arPage.locator('[data-game-phase="encounter"]').waitFor({timeout:25000});
  assert.ok(Number(await arPage.locator('main').getAttribute('data-round')) > Number(firstRound),'The squirrel returns automatically after a successful catch');
  assert.match(await arPage.locator('.sg-hud').innerText(),/۱۵۰/,'Return visits retain the score');
  await arPage.evaluate(()=>{
    const images=new Set();window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').traverse(object=>{
      if(object.material) for(const material of Array.isArray(object.material)?object.material:[object.material]) for(const value of Object.values(material)) if(value instanceof window.THREE.Texture && value.source.data instanceof ImageBitmap) images.add(value.source.data);
    });window.__modelImages=[...images];
  });
  assert.ok(await arPage.evaluate(()=>window.__modelImages.length >= 3));
  await arPage.getByRole('button',{name:'توقف بازی',exact:true}).click();
  await arPage.locator('[data-ar-status="paused"]').waitFor();
  assert.ok(await arPage.evaluate(() => window.__arTest.stopCount)>0);
  assert.equal(await arPage.evaluate(() => navigator.mediaDevices.getUserMedia === window.__cameraOriginal),true,'Pausing restores the camera API');
  assert.ok(await arPage.evaluate(()=>window.__modelImages.every(image=>image.width===0 && image.height===0)),'Pausing closes the model ImageBitmaps');
  await arPage.getByRole('button',{name:'دوباره اسکن کن',exact:true}).click();
  await arPage.locator('[data-ar-status="scanning"]').waitFor();
  await phase(arPage,'ready');
  assert.match(await arPage.locator('.sg-hud').innerText(),/۱۵۰/);
  await phase(arPage,'waiting');
  await arPage.getByRole('button',{name:'تغییر جای سنجاب',exact:true}).click();
  await phase(arPage,'ready');
  await arPage.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange')); });
  await arPage.locator('[data-ar-status="paused"]').waitFor();
  await arContext.close();
  console.log('AR with simulated poses: supplied skinned GLB and textures, authored Walk/Run/Sit playback, mesh taps, world anchoring, automatic start/return, bitmap cleanup and camera lifecycle passed.');

  const singleCameraContext = await mockedContext();
  await singleCameraContext.addInitScript(() => {
    navigator.mediaDevices.enumerateDevices = async () => [{kind:'videoinput',deviceId:'main',label:'Back Camera'}];
  });
  const singleCameraPage = await pageFor(singleCameraContext);
  await singleCameraPage.getByRole('button',{name:'شروع بازی AR',exact:true}).click();
  await singleCameraPage.locator('[data-ar-status="scanning"]').waitFor();
  assert.equal(await singleCameraPage.getByRole('button',{name:'تعویض دوربین',exact:true}).isDisabled(),true,'A single rear camera cannot be cycled');
  await singleCameraContext.close();

  const manualContext = await mockedContext();
  const manualPage = await pageFor(manualContext);
  await manualPage.getByRole('button',{name:'شروع بازی AR',exact:true}).click();
  await manualPage.locator('[data-tracking="normal"]').waitFor();
  await manualPage.getByRole('button',{name:'قرارگیری دستی، بدون تشخیص سطح',exact:true}).click();
  await manualPage.waitForFunction(() => !document.querySelector('[data-ar-place]').disabled);
  await screenshot(manualPage,'ar-manual-placement');
  for (const [width,height] of [[320,568],[844,390]]) {
    await manualPage.setViewportSize({width,height});
    assert.equal(await manualPage.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
    await screenshot(manualPage,`ar-manual-placement-${width}`);
  }
  await manualPage.setViewportSize({width:390,height:844});
  await manualPage.locator('[data-ar-place]').click();
  await phase(manualPage,'encounter');
  const manualAnchor = await manualPage.evaluate(() => window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-anchor').position.toArray());
  await manualPage.evaluate(() => { window.__arTest.cameraX = .4; });
  await manualPage.waitForTimeout(120);
  assert.deepEqual(await manualPage.evaluate(() => window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-anchor').position.toArray()), manualAnchor, 'Manual placement remains world anchored without any surface hits');
  await manualPage.getByRole('button',{name:'تعویض دوربین',exact:true}).click();
  await manualPage.locator('[data-ar-status="scanning"]').waitFor();
  assert.equal(await manualPage.evaluate(() => window.__arTest.cameraDevice),'ultrawide','Changing the camera restarts SLAM with the selected physical lens');
  await manualPage.getByRole('button',{name:'تعویض دوربین',exact:true}).click();
  await manualPage.locator('[data-ar-status="scanning"]').waitFor();
  assert.equal(await manualPage.evaluate(() => window.__arTest.cameraDevice),'main','Camera cycling wraps to the main rear lens and excludes the front camera');
  await manualPage.evaluate(() => { window.__arTest.tracking = false; });
  await manualPage.waitForTimeout(12500);
  await manualPage.getByRole('button',{name:'شروع دوبارهٔ ردیابی',exact:true}).waitFor();
  assert.equal(await manualPage.locator('[data-game-phase="ready"]').count(),1,'Unavailable tracking never fabricates a placement');
  await screenshot(manualPage,'ar-scan-recovery');
  await manualPage.getByRole('button',{name:'شروع دوبارهٔ ردیابی',exact:true}).click();
  await manualPage.locator('[data-tracking="normal"]').waitFor();
  await manualContext.close();
  console.log('No-surface manual placement, fixed 3D anchor, physical lens switch, front camera exclusion and stalled tracking recovery passed.');

  const agileContext=await mockedContext({reducedMotion:'no-preference'});
  const agilePage=await pageFor(agileContext);
  await agilePage.getByRole('button',{name:'شروع بازی AR',exact:true}).click();
  await agilePage.locator('[data-ar-status="scanning"]').waitFor();
  // Exercise the point-cloud floor path, with no SDK surface hit at all.
  await agilePage.evaluate(()=>{window.__arTest.surface='points';});
  await phase(agilePage,'encounter');
  const renderedPose=()=>agilePage.evaluate(()=>{
    const {scene,camera}=window.XR8.Threejs.xrScene();scene.updateMatrixWorld(true);
    const p=scene.getObjectByName('squirrel-model').getWorldPosition(new window.THREE.Vector3());
    const screen=p.clone().add(new window.THREE.Vector3(0,.24,0)).project(camera);
    return {world:p.toArray(),x:(screen.x+1)*innerWidth/2,y:(1-screen.y)*innerHeight/2};
  });
  const roamStart=await renderedPose();await agilePage.waitForTimeout(850);const roamEnd=await renderedPose();
  assert.ok(Math.hypot(roamEnd.world[0]-roamStart.world[0],roamEnd.world[2]-roamStart.world[2]) > .1,'The squirrel roams before the player taps it');
  for(let attempt=0;attempt<40;attempt++) {
    const p=await renderedPose();
    if(p.x>20 && p.x<370 && p.y>290 && p.y<760) {
      await agilePage.mouse.click(p.x,p.y);
      if(await agilePage.locator('[data-game-phase="playing"]').count()) break;
    }
    await agilePage.waitForTimeout(60);
  }
  await phase(agilePage,'playing');
  const motion=[];let travel=0;
  for(let i=0;i<140;i++) {
    const position=(await renderedPose()).world;
    if(motion.length) {const last=motion.at(-1);travel+=Math.hypot(position[0]-last[0],position[2]-last[2]);}
    motion.push(position);
    if(motion.length>=33 && travel>3 && Math.max(...motion.map(p=>p[0]))-Math.min(...motion.map(p=>p[0]))>.8 && Math.max(...motion.map(p=>p[2]))-Math.min(...motion.map(p=>p[2]))>.5)break;
    await agilePage.waitForTimeout(100);
  }
  assert.ok(travel > 2,'The rendered squirrel follows the floor-space path during the catch; speed is separately checked in deterministic game tests');
  assert.ok(Math.max(...motion.map(p=>p[0]))-Math.min(...motion.map(p=>p[0])) > .8);
  assert.ok(Math.max(...motion.map(p=>p[2]))-Math.min(...motion.map(p=>p[2])) > .5,'The squirrel moves toward/away from the phone as well as sideways');
  assert.ok(motion.every(p=>Math.abs(p[1]-motion[0][1]) < .001),'Movement remains on the inferred floor');
  assert.equal(await agilePage.evaluate(()=>window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').userData.animation),'HG_Run');
  await screenshot(agilePage,'ar-agile-supplied-model');await agileContext.close();
  const failedModelContext=await mockedContext();let failModel=true;
  await failedModelContext.route('**/game/mascot/*.glb',route=>failModel?route.fulfill({status:503,body:'unavailable'}):route.continue());
  const failedModelPage=await pageFor(failedModelContext);
  await failedModelPage.getByRole('button',{name:'شروع بازی AR',exact:true}).click();
  await failedModelPage.locator('[data-ar-status="error"]').waitFor();
  assert.match(await failedModelPage.getByRole('alert').innerText(),/مدل/);
  assert.equal(await failedModelPage.evaluate(()=>window.__arTest.runCount),0,'A missing model cannot start an empty AR game or substitute the old mascot');
  failModel=false;
  await failedModelPage.getByRole('button',{name:'دوباره تلاش کن',exact:true}).click();
  await failedModelPage.locator('[data-ar-status="scanning"]').waitFor();await failedModelContext.close();
  const cancelledModelContext=await mockedContext();let releaseModel;
  const modelGate=new Promise(resolve=>{releaseModel=resolve;});
  await cancelledModelContext.route('**/game/mascot/*.glb',async route=>{await modelGate;await route.fulfill({path:new URL('../public/game/mascot/'+modelAsset.file,import.meta.url).pathname}).catch(()=>{});});
  const cancelledModelPage=await pageFor(cancelledModelContext);
  const requestedModel=cancelledModelPage.waitForRequest(request=>request.url().endsWith('.glb'));
  await cancelledModelPage.getByRole('button',{name:'شروع بازی AR',exact:true}).click();await requestedModel;
  await cancelledModelPage.getByRole('button',{name:'تمرین دوبعدی، بدون دوربین',exact:true}).click();releaseModel();
  await phase(cancelledModelPage,'encounter');
  assert.equal(await cancelledModelPage.evaluate(()=>window.__arTest.runCount),0,'Cancelling a model download cannot start a late camera session');
  await cancelledModelContext.close();
  console.log('Real model roaming/turning, fast depth movement, model download failure/retry and cancellation passed.');

  for (const [flag,message] of [['__arCompatible','برای AR'],['__arDeny','اجازهٔ دوربین']]) {
    const ctx = await mockedContext();
    await ctx.addInitScript(({flag}) => { window[flag] = flag === '__arDeny'; },{flag});
    const page = await pageFor(ctx);
    await page.getByRole('button',{name:'شروع بازی AR',exact:true}).click();
    await page.locator('[data-ar-status="error"]').waitFor();
    assert.ok((await page.getByRole('alert').innerText()).includes(message));
    await page.getByRole('button',{name:'تمرین دوبعدی، بدون دوربین',exact:true}).click();
    await phase(page,'encounter'); await ctx.close();
  }
  const lateContext = await context();
  let releaseEngine;
  const engineGate = new Promise(resolve => { releaseEngine=resolve; });
  await lateContext.route('**/game/vendor/xr/xr.js',async route => { await engineGate; await route.fulfill({status:200,contentType:'text/javascript',body:mockSource}); });
  const latePage = await pageFor(lateContext);
  await latePage.getByRole('button',{name:'شروع بازی AR',exact:true}).click();
  await latePage.locator('[data-ar-status="loading"]').waitFor();
  await latePage.getByRole('button',{name:'تمرین دوبعدی، بدون دوربین',exact:true}).click();
  releaseEngine();
  await latePage.waitForFunction(() => !!window.__arTest);
  assert.equal(await latePage.evaluate(() => window.__arTest.runCount),0,'A late engine download cannot start a cancelled camera session');
  await lateContext.close();
  // Real, unmodified engine and SLAM binary. The only substitutions here are
  // synthetic hardware inputs: Chromium's fake camera has no rear-facing ID.
  const realContext = await context({ ...devices["Pixel 7"], permissions: ["camera", "accelerometer", "gyroscope", "magnetometer"] });
  await realContext.addInitScript(() => {
    window.__realArTracks = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const syntheticConstraints = structuredClone(constraints);
      if (typeof syntheticConstraints.video === "object") delete syntheticConstraints.video.facingMode;
      const stream = await original(syntheticConstraints);
      window.__realArTracks.push(...stream.getTracks());
      return stream;
    };
    setInterval(() => {
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", {alpha:0,beta:110,gamma:0,absolute:true}));
      window.dispatchEvent(new DeviceMotionEvent("devicemotion", {acceleration:{x:0,y:0,z:0},accelerationIncludingGravity:{x:0,y:-9.81,z:0},rotationRate:{alpha:0,beta:0,gamma:0},interval:16}));
    },16);
  });
  const realPage = await pageFor(realContext);
  await realPage.getByRole("button",{name:"شروع بازی AR",exact:true}).click();
  await realPage.locator('[data-ar-status="scanning"]').waitFor({timeout:60000});
  await realPage.waitForTimeout(1200);
  assert.ok(await realPage.evaluate(() => window.__realArTracks.some(track => track.readyState === "live")));
  assert.equal(await realPage.locator('[data-game-phase="ready"]').count(),1,'Synthetic camera frames cannot unlock a fabricated floor');
  assert.ok(await realPage.locator("canvas").evaluate(canvas => canvas.width <= innerWidth*1.6 && canvas.height <= innerHeight*1.6),"The real SDK must not cause a DPR/ResizeObserver sizing loop");
  assert.equal(await realPage.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  await screenshot(realPage,"ar-real-engine-synthetic-camera");
  await realPage.getByRole("button",{name:"توقف بازی",exact:true}).click();
  assert.ok(await realPage.evaluate(() => window.__realArTracks.every(track => track.readyState === "ended")));
  await realContext.close();
  console.log("Unmodified 8th Wall engine: local SLAM assets, Three.js startup, synthetic camera frames, bounded GPU buffer and camera cleanup passed. Real-world tracking quality requires a physical phone.");
  assert.deepEqual(errors, []);
  console.log('Unsupported device, permission denial, cancellation during engine download and practice fallback passed. No browser runtime errors.');

} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once("exit", resolve); });
  fs.rmSync(temp, { recursive: true, force: true });
}
