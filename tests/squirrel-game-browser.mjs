import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { termsAcceptance } from "./legal-fixtures.mjs";
import { nodeSourceModules } from "./node-source-module.mjs";
import * as THREE from "three";

const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "squirrel-browser-"));
const origin = "http://127.0.0.1:5198";
const modelAsset=JSON.parse(fs.readFileSync(new URL('../public/game/mascot/manifest.json',import.meta.url),'utf8'));
const env = { ...process.env, DATABASE_PATH: path.join(temp, "test.sqlite"), MEDIA_PATH: path.join(temp, "media"), APP_ORIGIN: origin, HOST: "127.0.0.1", PORT: "5198", SEED_SAMPLE_EVENTS: "false", TEMP_LOGIN_ENABLED: "true", OTP_SECRET: randomBytes(32).toString("hex"), SQUIRREL_REWARD_LIMIT: "10" };
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
  await page.getByRole("button", { name: "شروع بازی", exact: true }).waitFor();
  await page.waitForFunction(() => {
    const art = document.querySelector('.sg-welcome-mascot img[src="/game/mascot/fandogh-welcome.png"]');
    return art?.complete && art.naturalWidth === 2048 && art.parentElement.getBoundingClientRect().height > 0;
  });
  await page.waitForFunction(()=>{
    const button=[...document.querySelectorAll("button")].find(item=>item.textContent.trim()==="شروع بازی");
    return button && Object.keys(button).some(key=>key.startsWith("__reactProps$") && typeof button[key]?.onClick==="function");
  });
  return page;
}
async function signInFixture(ctx) {
  const headers = { Origin: origin };
  const name = "بازیکن آزمایشی";
  const challenge = await ctx.request.post(origin + "/api/auth/request", {
    headers, data: { phone: "09108624707", name, ...termsAcceptance },
  });
  assert.equal(challenge.status(), 200);
  const { challengeId } = await challenge.json();
  assert.ok(challengeId);
  const login = await ctx.request.post(origin + "/api/auth/verify", {
    headers, data: { challengeId, code: "123456", name, ...termsAcceptance },
  });
  assert.equal(login.status(), 200);
}
async function phase(page, name, timeout) {
  try {
    await page.locator(`[data-game-phase="${name}"]`).waitFor({timeout});
  } catch (error) {
    const state = await page.locator('main').evaluate(main => ({...main.dataset, text:main.innerText}));
    console.error('Game state at timeout:',state,'Browser errors:',errors);
    throw error;
  }
}
async function visiblePawMotion(page,clip,minimum) {
  const spans=await page.evaluate(async({clip,minimum})=>{
    const {scene,camera}=window.XR8.Threejs.xrScene(),root=scene.getObjectByName('squirrel-model');let mesh;
    root.traverse(object=>{if(object.isSkinnedMesh)mesh=object;});
    const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
    const feet=['footL','footR'].map(name=>{
      const bone=mesh.skeleton.bones.findIndex(bone=>bone.name===name),ids=[];
      for(let i=0;i<indices.count;i++)for(let k=0;k<4;k++)if(indices.getComponent(i,k)===bone && weights.getComponent(i,k)>.6)ids.push(i);
      return ids.filter((_,i)=>i%Math.ceil(ids.length/64)===0);
    });
    const ranges=feet.map(()=>({min:Infinity,max:-Infinity}));
    for(let frame=0;frame<240;frame++) {
      await new Promise(requestAnimationFrame);scene.updateMatrixWorld(true);
      if(root.userData.animation!==clip)break;
      feet.forEach((ids,side)=>{
        const point=new window.THREE.Vector3();
        for(const id of ids)point.add(mesh.getVertexPosition(id,new window.THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
        point.divideScalar(ids.length).project(camera);
        const y=(1-point.y)*innerHeight/2;ranges[side].min=Math.min(ranges[side].min,y);ranges[side].max=Math.max(ranges[side].max,y);
      });
      if(frame>12 && ranges.every(range=>range.max-range.min>=minimum))break;
    }
    return ranges.map(range=>range.max-range.min);
  },{clip,minimum});
  assert.ok(spans.every(span=>span>=minimum),`${clip} must show at least ${minimum}px of paw movement from the actual game camera, got ${spans}`);
}
async function screenshot(page, name) { if (screenshots) await page.screenshot({ path: path.join(screenshots, name + ".png") }); }
async function moveMockCamera(page, x) {
  await page.evaluate(x => { window.__arTest.cameraX = x; }, x);
  await page.waitForFunction(x => window.XR8.Threejs.xrScene().camera.position.x === x, x);
}
// The synthetic camera records tracked frame times and its placement matrix.
// Project a led aim for that same seeded round, then perform a normal pointer
// flick. Hold one camera frame while CDP delivers input to the software GPU.
async function leadRunningSquirrel(page, launcher, session) {
  const load = nodeSourceModules(temp);
  const game = await load("lib/squirrel-ar-game.ts");
  const {frameSquirrelPlacement} = await load("lib/squirrel-ar-framing.ts");
  const cameraFrom = ({projection,world}) => {
    const camera = new THREE.PerspectiveCamera();
    camera.matrix.fromArray(world).decompose(camera.position,camera.quaternion,camera.scale);
    camera.projectionMatrix.fromArray(projection);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();
    return camera;
  };
  for(let attempt=0;attempt<20;attempt++) {
    const frame = await page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      const mock=window.__arTest,{scene,camera}=window.XR8.Threejs.xrScene();
      mock.holdFrame=true;
      const model=scene.getObjectByName('squirrel-model'), anchor=scene.getObjectByName('squirrel-anchor');
      const rect=document.querySelector('.sg-viewport').getBoundingClientRect();
      return {encounterMs:mock.encounterMs,playingMs:mock.playingMs,placementCamera:mock.placementCamera,
        camera:{projection:camera.projectionMatrix.toArray(),world:camera.matrixWorld.toArray()},
        anchor:anchor.position.toArray(),yaw:anchor.rotation.y,foot:model.getWorldPosition(new window.THREE.Vector3()).toArray(),
        scale:model.scale.x,round:Number(document.querySelector('main').dataset.round),left:rect.left,top:rect.top,width:rect.width,height:rect.height};
    });
    const anchor = new THREE.Vector3(...frame.anchor), up=new THREE.Vector3(0,1,0), camera=cameraFrom(frame.camera);
    const {zone}=frameSquirrelPlacement(anchor,frame.yaw,cameraFrom(frame.placementCamera),frame.height);
    let state=game.initialWorldGame(session.seed,session.movementVersion);
    for(let round=0;round<frame.round;round++)state=game.placeWorldGame(state,anchor,frame.yaw,zone);
    for(const ms of [game.worldTiming.waiting,game.worldTiming.entering,frame.encounterMs])state=game.advanceWorldGame(state,ms,true,true);
    state=game.advanceWorldGame(game.beginWorldCatch(state),frame.playingMs,true,true);
    const renderedFoot=new THREE.Vector3(...frame.foot);
    assert.ok(renderedFoot.distanceTo(game.worldSquirrelPosition(state,true))<.04,"The seeded frame agrees with the displayed squirrel");
    const center = new THREE.Vector3(zone.centerX,.24*frame.scale,zone.centerZ).applyAxisAngle(up,frame.yaw).add(anchor);
    const ray=new THREE.Raycaster();
    const x=(launcher.x-frame.left)/frame.width, y=(launcher.y-frame.top)/frame.height;
    ray.setFromCamera(new THREE.Vector2(2*x-1,1-2*y),camera);
    const origin=ray.ray.at(.28,new THREE.Vector3()),originDepth=camera.worldToLocal(origin.clone()).z;
    const planeDepth=camera.worldToLocal(center).z, upDepth=up.clone().transformDirection(camera.matrixWorldInverse).z;
    let flight=.43,fraction=1,screen,target;
    for(let i=0;i<8;i++) {
      target=new THREE.Vector3().copy(game.worldSquirrelPosition(game.advanceWorldGame(state,flight*fraction*1000,true,true),true));
      target.y+=.39*frame.scale;
      const lift=.5*game.gravity*flight**2*fraction*(1-fraction);
      fraction=(camera.worldToLocal(target.clone()).z-originDepth-lift*upDepth)/(planeDepth-originDepth);
      screen=target.clone().sub(origin).addScaledVector(up,-lift).multiplyScalar(1/fraction).add(origin).project(camera);
      flight=.55-Math.max(0,Math.min(1,(y-(1-screen.y)/2-.08)/.55))*.22;
    }
    if(Math.hypot(target.x-renderedFoot.x,target.z-renderedFoot.z)>.16 && Math.abs(screen.x)<.97 && Math.abs(screen.y)<.9) {
      return {x:frame.left+(1+screen.x)*frame.width/2,y:frame.top+(1-screen.y)*frame.height/2};
    }
    await page.evaluate(()=>{window.__arTest.holdFrame=false;});
  }
  throw new Error("The fixture could not observe a leadable in-frame diagonal");
}
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
    await page.getByRole("button", { name: "شروع بازی", exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.getByRole("button", { name: "شروع بازی", exact: true }).isVisible(), true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "تمرین در محیط دو بعدی" }).click();
  await phase(page, "encounter");
  const mark = page.locator(".sg-brand img");
  assert.equal(await mark.getAttribute("src"), "/game/hamghadam-mark.png");
  await mark.evaluate(image => image.decode());
  assert.equal(await mark.evaluate(image => image.naturalWidth), 1080);
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
  await touchPage.getByRole("button", { name: "تمرین در محیط دو بعدی" }).tap();
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

  const runningPractice = await context({ reducedMotion: "no-preference" });
  const runningPracticePage = await pageFor(runningPractice);
  // Include the actual SVG paths (the animated tail can extend past the SVG) and the encounter label.
  await runningPracticePage.evaluate(() => {
    window.practiceFrames = [];
    function observe() {
      const target = document.querySelector(".sg-target");
      if (target) {
        const arena = target.parentElement.getBoundingClientRect(), box = target.getBoundingClientRect();
        const parts = [...target.querySelectorAll("svg path, svg ellipse, .sg-target-label")];
        const contained = parts.every(part => {
          const rect = part.getBoundingClientRect();
          return rect.left >= Math.max(0, arena.left) - 1 && rect.right <= Math.min(innerWidth, arena.right) + 1 &&
            rect.top >= Math.max(0, arena.top) - 1 && rect.bottom <= Math.min(innerHeight, arena.bottom) + 1;
        });
        window.practiceFrames.push({phase: document.querySelector(".sg-game").dataset.gamePhase, width: innerWidth, contained,
          x: (box.left + box.width / 2 - arena.left) / arena.width, y: (box.top + box.height / 2 - arena.top) / arena.height});
      }
      requestAnimationFrame(observe);
    }
    requestAnimationFrame(observe);
  });
  await runningPracticePage.getByRole("button", { name: "تمرین در محیط دو بعدی", exact: true }).click();
  await phase(runningPracticePage, "encounter");
  await runningPracticePage.waitForFunction(() => {
    const track=window.practiceFrames.filter(frame=>frame.phase==="encounter");
    return track.length>1 && Math.max(...track.map(p=>p.x))-Math.min(...track.map(p=>p.x))>.5;
  });
  // An untouched encounter exercises the full escape animation before the next round.
  await phase(runningPracticePage, "escaped");
  await runningPracticePage.getByRole("button", { name: "یه دور دیگه" }).click();
  await phase(runningPracticePage, "encounter");
  await runningPracticePage.locator(".sg-target-encounter").click({force:true});
  await runningPracticePage.locator(".sg-target-playing .sg-squirrel-run").waitFor();
  for (const [width, height] of [[390, 844], [844, 390], [640, 280], [320, 568]]) {
    await runningPracticePage.setViewportSize({ width, height });
    await runningPracticePage.waitForFunction(width => {
      const frames = window.practiceFrames.filter(frame => frame.width === width && frame.phase === "playing");
      const range = axis => Math.max(...frames.map(frame => frame[axis])) - Math.min(...frames.map(frame => frame[axis]));
      return frames.length > 2 && range("x") > .58 && range("y") > .4;
    }, width);
  }
  // Rotate at the end of a landscape sprint, when reusing even one frame of
  // the previous arena's coordinates would carry the tail outside portrait.
  for (const side of ["right", "left"]) {
    await runningPracticePage.setViewportSize({width: 844, height: 390});
    await runningPracticePage.waitForFunction(side => {
      const frame = window.practiceFrames.at(-1);
      return frame?.width === 844 && frame.phase === "playing" && (side === "right" ? frame.x > .91 : frame.x < .09);
    }, side);
    await runningPracticePage.setViewportSize({width: 390, height: 844});
    await runningPracticePage.waitForFunction(() => window.practiceFrames.at(-1)?.width === 390);
  }
  const boundsCheck = await runningPracticePage.evaluate(() => ({
    phases: [...new Set(window.practiceFrames.map(frame => frame.phase))],
    outside: window.practiceFrames.filter(frame => !frame.contained).slice(0, 3),
  }));
  assert.deepEqual(boundsCheck.phases.sort(), ["encounter", "entering", "escaping", "playing"]);
  assert.deepEqual(boundsCheck.outside, [], "The full animated squirrel and its label must stay in the measured arena through layout changes");
  await runningPractice.close();
  console.log("Practice: wide two-axis zigzags stay in frame during entrance, encounter, running, escape, and rotation.");

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
  await signInFixture(arContext);
  const initialWallet = await arContext.request.get(origin + "/api/wallet");
  assert.equal(initialWallet.status(), 200);
  assert.equal((await initialWallet.json()).balance, 0);
  const arPage = await pageFor(arContext);
  const issuedRound=arPage.waitForResponse(response=>response.url()===origin+"/game/reward/session");
  await arPage.getByRole("button", {name:"شروع بازی",exact:true}).click();
  try {
    await arPage.locator('[data-ar-status="scanning"]').waitFor();
  } catch (error) {
    console.error("AR state before scan:", await arPage.locator("main").evaluate(main => ({ ...main.dataset, text: main.innerText })), errors);
    throw error;
  }
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
  await phase(arPage, "encounter",30000);
  assert.ok(Date.now()-countdownStarted >= 2800,'The first entry waits for the configured three-second countdown');
  const modelInfo=await arPage.evaluate(()=>{
    const root=window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model');let mesh;root.traverse(object=>{if(object.isSkinnedMesh)mesh=object;});
    return {asset:root.userData.asset,animation:root.userData.animation,joints:mesh.skeleton.bones.length,vertices:mesh.geometry.attributes.position.count,textures:[mesh.material.map.source.data.width,mesh.material.normalMap.source.data.width]};
  });
  assert.equal(modelInfo.asset,modelAsset.file,'AR loads the supplied GLB asset');
  assert.equal(modelInfo.joints,34);assert.equal(modelInfo.vertices,modelAsset.geometry.vertices);
  assert.equal(modelInfo.animation,'HG_Walk');assert.deepEqual(modelInfo.textures,[2048,1024]);
  await visiblePawMotion(arPage,'HG_Walk',4.5);
  const skinPose=()=>arPage.evaluate(()=>{
    let mesh;window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').traverse(object=>{if(object.isSkinnedMesh)mesh=object;});
    return Array.from({length:128},(_,i)=>mesh.getVertexPosition(Math.floor(i/128*mesh.geometry.attributes.position.count),new window.THREE.Vector3()).toArray());
  });
  const firstSkin=await skinPose();
  const animationFrame=await arPage.screenshot({clip:{x:100,y:285,width:200,height:250}});
  await arPage.waitForFunction(before=>{
    let mesh;window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').traverse(object=>{if(object.isSkinnedMesh)mesh=object;});
    return before.some((point,i)=>mesh.getVertexPosition(Math.floor(i/128*mesh.geometry.attributes.position.count),new window.THREE.Vector3()).distanceTo(new window.THREE.Vector3(...point)) > .0001);
  },firstSkin);
  const nextAnimationFrame=await arPage.screenshot({clip:{x:100,y:285,width:200,height:250}});
  assert.equal(animationFrame.equals(nextAnimationFrame),false,'The rendered character visibly animates even when the device requests reduced motion');
  const pose = (height = .24) => arPage.evaluate(height => {
    const {scene,camera} = window.XR8.Threejs.xrScene();
    scene.updateMatrixWorld(true);
    const position = scene.getObjectByName("squirrel-model").getWorldPosition(new window.THREE.Vector3());
    const projected = position.clone().add(new window.THREE.Vector3(0,height,0)).project(camera);
    return {world:position.toArray(),screen:projected.toArray(),rotation:scene.getObjectByName('squirrel-model').getWorldQuaternion(new window.THREE.Quaternion()).toArray()};
  },height);
  await arPage.evaluate(() => { window.__arTest.holdFrame = true; });
  const before = await pose();
  await moveMockCamera(arPage, .35);
  const after = await pose();
  assert.deepEqual(after.world, before.world, "The rendered model stays in the same world location when the phone translates");
  assert.deepEqual(after.rotation,before.rotation,'The 3D character does not billboard toward a moving camera');
  assert.ok(Math.abs(after.screen[0]-before.screen[0]) > .1, "Real parallax moves the model's screen projection");
  await moveMockCamera(arPage, 0);
  await screenshot(arPage, "ar-placed-simulated-pose");
  const emptySpace=await arPage.evaluate(()=>{
    const {scene,camera}=window.XR8.Threejs.xrScene();
    const p=scene.getObjectByName('squirrel-model').localToWorld(new window.THREE.Vector3(-.34,.04,0)).project(camera);
    return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
  });
  await arPage.mouse.click(emptySpace.x,emptySpace.y);
  assert.equal(await arPage.locator('[data-game-phase="encounter"]').count(),1,'Empty space within the broad animation bounds does not count as a mesh hit');
  const target = await arPage.evaluate(() => {
    const {scene,camera}=window.XR8.Threejs.xrScene();
    const model=scene.getObjectByName('squirrel-model');
    const p=model.getObjectByName('head').getWorldPosition(new window.THREE.Vector3());
    p.y+=.04*model.scale.y; p.project(camera);
    return {x:(1+p.x)*innerWidth/2,y:(1-p.y)*innerHeight/2};
  });
  await arPage.mouse.click(target.x, target.y);
  await arPage.evaluate(() => { window.__arTest.holdFrame = false; });
  await phase(arPage, "playing");
  await arPage.waitForFunction(()=>window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').userData.animation === 'HG_Run');
  await visiblePawMotion(arPage,'HG_Run',7.5);
  await arPage.evaluate(() => { window.__arTest.tracking = false; });
  await arPage.locator('[data-tracking="limited"]').waitFor();
  const frozen = await arPage.locator('.sg-timer').innerText();
  const frozenSkin=await skinPose();
  await arPage.waitForTimeout(1100);
  assert.equal(await arPage.locator('.sg-timer').innerText(), frozen);
  assert.deepEqual(await skinPose(),frozenSkin,'Tracking loss pauses the skeleton as well as the game');
  assert.equal(await arPage.evaluate(() => window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').visible),false);
  await arPage.evaluate(() => { window.__arTest.tracking = true; });
  await arPage.locator('[data-tracking="normal"]').waitFor();
  await moveMockCamera(arPage, .22);
  const launcher = await arPage.locator('[data-world-launcher]').boundingBox();
  const bx=launcher.x+launcher.width/2, by=launcher.y+launcher.height/2;
  const lead = await leadRunningSquirrel(arPage, {x:bx, y:by}, await (await issuedRound).json());
  const walletClaim = arPage.waitForResponse(response => response.url() === `${origin}/game/reward/claim`);
  await arPage.mouse.move(bx,by); await arPage.mouse.down();
  // A short flick: serial CDP steps wait for software-rendered GPU frames and
  // can otherwise turn a gesture into a multi-second hold in headless Chromium.
  await arPage.mouse.move(lead.x,lead.y,{steps:2}); await arPage.waitForTimeout(100); await arPage.mouse.up();
  await arPage.evaluate(() => { window.__arTest.holdFrame = false; window.__arTest.cameraX = -.15; });
  await phase(arPage,"caught");
  assert.match(await arPage.locator('.sg-ar-result').innerText(),/۱۵۰/);
  assert.equal(await arPage.evaluate(()=>window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').userData.animation),'HG_Sit_Intro');
  await arPage.waitForFunction(()=>window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').userData.animation === 'HG_Sit_Loop');
  assert.equal(await arPage.evaluate(()=>window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').userData.animation),'HG_Sit_Loop');
  const walletResponse = await walletClaim;
  assert.equal(walletResponse.status(), 200, 'A verified AR win credits the signed-in wallet');
  const { reward } = await walletResponse.json();
  assert.deepEqual(reward, { amountToman: 100_000, balanceAfter: 100_000, walletHref: '/wallet' });
  const dialog = arPage.getByRole('dialog', { name: 'جایزهٔ برد' });
  await dialog.getByText('جایزه به کیف پولت اضافه شد.').waitFor();
  assert.match(await dialog.locator('.sg-reward-amount').innerText(), /۱۰۰٬۰۰۰\s*تومان/);
  assert.equal(await dialog.getByRole('link', { name: 'مشاهدهٔ کیف پول' }).getAttribute('href'), '/wallet');
  const wallet = await (await arContext.request.get(origin + "/api/wallet")).json();
  assert.equal(wallet.balance, 100_000);
  assert.equal(wallet.transactions.filter(item => item.kind === 'game_reward' && item.amount === 100_000).length, 1);
  assert.equal(await dialog.locator('h2').evaluate(node => node === document.activeElement), true,
    'Opening the reward announces its heading before focusing an action');
  await screenshot(arPage,"ar-caught-simulated-pose");
  await arPage.keyboard.press('Tab');
  const rewardButton = dialog.getByRole('link', { name: 'مشاهدهٔ کیف پول' });
  assert.deepEqual(await rewardButton.evaluate(node => {
    const style = getComputedStyle(node);
    return [node === document.activeElement, style.backgroundColor, style.color, style.outlineColor, style.outlineStyle];
  }), [true, 'rgb(255, 129, 66)', 'rgb(255, 255, 255)', 'rgb(17, 24, 39)', 'solid']);
  await arPage.getByRole('button', {name:'ادامهٔ بازی',exact:true}).click();
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
  await arPage.evaluate(() => { window.__arTest.cameraX = 0; window.__arTest.surface = true; });
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
  console.log('AR with simulated poses: supplied skinned GLB and textures, readable Walk/Run paw motion and authored Sit playback, mesh taps, world anchoring, automatic start/return, bitmap cleanup and camera lifecycle passed.');

  const singleCameraContext = await mockedContext();
  await singleCameraContext.addInitScript(() => {
    navigator.mediaDevices.enumerateDevices = async () => [{kind:'videoinput',deviceId:'main',label:'Back Camera'}];
  });
  const singleCameraPage = await pageFor(singleCameraContext);
  const guestSession = singleCameraPage.waitForResponse(response => response.url() === `${origin}/game/reward/session`);
  await singleCameraPage.getByRole('button',{name:'شروع بازی',exact:true}).click();
  await singleCameraPage.locator('[data-ar-status="scanning"]').waitFor();
  assert.equal((await guestSession).status(), 401, 'A guest can scan and play without an eligible reward session');
  assert.equal(await singleCameraPage.getByRole('link', { name: 'ورود به حساب' }).getAttribute('href'), '/login?next=%2Fgame');
  assert.equal(await singleCameraPage.getByRole('button',{name:'تعویض دوربین',exact:true}).isDisabled(),true,'A single rear camera cannot be cycled');
  await singleCameraContext.close();

  const manualContext = await mockedContext();
  const manualPage = await pageFor(manualContext);
  await manualPage.getByRole('button',{name:'شروع بازی',exact:true}).click();
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
  await moveMockCamera(manualPage, .4);
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
  await agilePage.getByRole('button',{name:'شروع بازی',exact:true}).click();
  await agilePage.locator('[data-ar-status="scanning"]').waitFor();
  await agilePage.evaluate(()=>{window.__arTest.surface='edge';});
  await agilePage.getByText('نشونه رو روی بخشی دورتر از زمین بگیر تا فندق جا برای دویدن داشته باشه.').waitFor();
  assert.equal(await agilePage.locator('[data-game-phase="ready"]').count(),1,'A cramped placement waits for room to run');
  // Exercise the point-cloud floor path, with no SDK surface hit at all.
  await agilePage.evaluate(()=>{window.__arTest.surface='points';});
  await phase(agilePage,'encounter');
  const renderedPose=()=>agilePage.evaluate(()=>{
    const {scene,camera}=window.XR8.Threejs.xrScene();scene.updateMatrixWorld(true);
    const model=scene.getObjectByName('squirrel-model'), p=model.getWorldPosition(new window.THREE.Vector3());
    const screen=model.getObjectByName('head').getWorldPosition(new window.THREE.Vector3());
    screen.y+=.04*model.scale.y;screen.project(camera);
    const anchor=scene.getObjectByName('squirrel-anchor').position.toArray();
    return {world:p.toArray(),anchor,x:(screen.x+1)*innerWidth/2,y:(1-screen.y)*innerHeight/2};
  });
  const roamStart=await renderedPose();
  // Wait for rendered travel rather than assuming an 850 ms wall-clock wait
  // advances the simulation that far on a software-rendered GLB.
  await agilePage.waitForFunction(([x,,z]) => {
    const model=window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model');
    const current=model.getWorldPosition(new window.THREE.Vector3());
    return Math.hypot(current.x-x,current.z-z) > .1;
  },roamStart.world,{timeout:18000});
  for(let attempt=0;attempt<40;attempt++) {
    const p=await renderedPose();
    if(p.x>20 && p.x<370 && p.y>290 && p.y<760) {
      await agilePage.mouse.click(p.x,p.y);
      if(await agilePage.locator('[data-game-phase="playing"]').count()) break;
    }
    await agilePage.waitForTimeout(60);
  }
  await phase(agilePage,'playing');
  const { motion, travel, turns, width, depth } = await agilePage.evaluate(async () => {
    const { scene, camera } = window.XR8.Threejs.xrScene();
    const model = scene.getObjectByName('squirrel-model');
    const anchor = scene.getObjectByName('squirrel-anchor');
    const motion = [];
    let travel = 0, turns = 0, direction = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let screenMinX=Infinity,screenMaxX=-Infinity;
    for (let frame = 0; frame < 600; frame++) {
      await new Promise(requestAnimationFrame);
      if (model.userData.phase !== 'playing') {
        if (motion.length) break;
        continue;
      }
      const point = model.getWorldPosition(new window.THREE.Vector3());
      const screen = point.clone().add(new window.THREE.Vector3(0, .24*model.scale.y, 0)).project(camera);
      const last = motion.at(-1)?.world;
      if (last) {
        const dx = point.x - last[0];
        travel += Math.hypot(dx, point.z - last[2]);
        if (Math.abs(dx) > .002) {
          if (direction && Math.sign(dx) !== direction) turns++;
          direction = Math.sign(dx);
        }
      }
      motion.push({ world: point.toArray(), anchor: anchor.position.toArray(), x: (screen.x + 1) * innerWidth / 2, y: (1 - screen.y) * innerHeight / 2 });
      screenMinX=Math.min(screenMinX,motion.at(-1).x); screenMaxX=Math.max(screenMaxX,motion.at(-1).x);
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
      if (travel > 2 && turns >= 4 && screenMaxX-screenMinX>=innerWidth*.39 && maxZ - minZ > .3) break;
    }
    return { motion, travel, turns, width: maxX - minX, depth: maxZ - minZ };
  });
  for (const sample of motion) {
    assert.deepEqual(sample.anchor,roamStart.anchor,'Fitting the movement zone does not move the world anchor');
    assert.ok(sample.x > 40 && sample.x < 350 && sample.y > 80 && sample.y < 760,'The running model stays in the framed zone');
  }
  assert.ok(travel > 2,`The rendered squirrel follows the floor-space path during the catch, travelled ${travel} in ${motion.length} rendered frames`);
  assert.ok(width > .12,`The squirrel covers the fitted width, observed span ${width}`);
  assert.ok(turns >= 4 && Math.max(...motion.map(point => point.x)) - Math.min(...motion.map(point => point.x)) >= 390 * .39,
    'The runner visibly zigzags back and forth across the portrait view');
  assert.ok(depth > .3,`The squirrel moves toward/away from the phone, observed span ${depth}`);
  assert.ok(motion.every(p=>Math.abs(p.world[1]-motion[0].world[1]) < .001),'Movement remains on the inferred floor');
  assert.equal(await agilePage.evaluate(()=>window.XR8.Threejs.xrScene().scene.getObjectByName('squirrel-model').userData.animation),'HG_Run');
  await screenshot(agilePage,'ar-agile-supplied-model');
  for (const [width,height] of [[844,390],[360,780]]) {
    const previousRound = Number(await agilePage.locator('main').getAttribute('data-round'));
    await agilePage.setViewportSize({width,height});
    await agilePage.waitForFunction(round => Number(document.querySelector('main').dataset.round) > round, previousRound);
    await phase(agilePage,'encounter');
    const resized = await agilePage.evaluate(() => {
      const {scene,camera} = window.XR8.Threejs.xrScene();
      const model = scene.getObjectByName('squirrel-model');
      let mesh; model.traverse(object => {if(object.isSkinnedMesh) mesh=object;});
      const p=new window.THREE.Vector3();
      let maxX=0,maxY=0;
      const count=mesh.geometry.attributes.position.count;
      for(let i=0;i<count;i+=Math.ceil(count/1600)) {
        mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld).project(camera);
        maxX=Math.max(maxX,Math.abs(p.x)); maxY=Math.max(maxY,Math.abs(p.y));
      }
      return {maxX,maxY,anchor:scene.getObjectByName('squirrel-anchor').position.toArray()};
    });
    assert.deepEqual(resized.anchor,roamStart.anchor,'Orientation changes keep the physical floor anchor');
    assert.ok(resized.maxX<1 && resized.maxY<1,`The skinned head, paws and tail stay visible at ${width}×${height}`);
  }
  await agileContext.close();
  const failedModelContext=await mockedContext();let failModel=true;
  await failedModelContext.route('**/game/mascot/*.glb',route=>failModel?route.fulfill({status:503,body:'unavailable'}):route.continue());
  const failedModelPage=await pageFor(failedModelContext);
  await failedModelPage.getByRole('button',{name:'شروع بازی',exact:true}).click();
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
  await cancelledModelPage.getByRole('button',{name:'شروع بازی',exact:true}).click();await requestedModel;
  await cancelledModelPage.getByRole('button',{name:'تمرین در محیط دو بعدی',exact:true}).click();releaseModel();
  await phase(cancelledModelPage,'encounter');
  assert.equal(await cancelledModelPage.evaluate(()=>window.__arTest.runCount),0,'Cancelling a model download cannot start a late camera session');
  await cancelledModelContext.close();
  console.log('Real model roaming/turning, fast depth movement, model download failure/retry and cancellation passed.');

  for (const [flag,message] of [['__arCompatible','برای AR'],['__arDeny','اجازهٔ دوربین']]) {
    const ctx = await mockedContext();
    await ctx.addInitScript(({flag}) => { window[flag] = flag === '__arDeny'; },{flag});
    const page = await pageFor(ctx);
    await page.getByRole('button',{name:'شروع بازی',exact:true}).click();
    await page.locator('[data-ar-status="error"]').waitFor();
    assert.ok((await page.getByRole('alert').innerText()).includes(message));
    await page.getByRole('button',{name:'تمرین در محیط دو بعدی',exact:true}).click();
    await phase(page,'encounter'); await ctx.close();
  }
  const lateContext = await context();
  let releaseEngine;
  const engineGate = new Promise(resolve => { releaseEngine=resolve; });
  await lateContext.route('**/game/vendor/xr/xr.js',async route => { await engineGate; await route.fulfill({status:200,contentType:'text/javascript',body:mockSource}); });
  const latePage = await pageFor(lateContext);
  await latePage.getByRole('button',{name:'شروع بازی',exact:true}).click();
  await latePage.locator('[data-ar-status="loading"]').waitFor();
  await latePage.getByRole('button',{name:'تمرین در محیط دو بعدی',exact:true}).click();
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
  await realPage.getByRole("button",{name:"شروع بازی",exact:true}).click();
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
