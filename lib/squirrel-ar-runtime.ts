import * as THREE from "three";
import { createSquirrelModel, disposeScene } from "./squirrel-ar-model";
import { createSquirrelBillboard } from "./squirrel-ar-billboard";
import { emptyFloorLock, estimateFloor, floorSettleTime, updateFloorLock, type SurfaceHit, type WorldPoint } from "./squirrel-ar-floor";
import { advanceWorldGame, ballisticShot, beginWorldCatch, initialWorldGame, launchWorldBall, placeWorldGame, worldShotPosition, worldSquirrelPosition, worldThrowGesture, type Vec3, type WorldGame } from "./squirrel-ar-game";
import type { Point } from "./squirrel-game";
import { bindArCamera } from "./squirrel-ar-camera";

type Reality = { position: Vec3; rotation: { x: number; y: number; z: number; w: number }; intrinsics: number[]; trackingStatus: string; trackingReason?: string; worldPoints?:WorldPoint[] };
type Pipeline = {
  name: string;
  onStart?: (args: { canvasWidth: number; canvasHeight: number }) => void;
  onUpdate?: (args: { processCpuResult?: { reality?: Reality } }) => void;
  onCameraStatusChange?: (args: { status: string; stream?: MediaStream }) => void;
  onException?: (error: unknown) => void;
};
export type XR8Api = {
  loadChunk: (chunk: string) => Promise<void>;
  run: (options: { canvas: HTMLCanvasElement; allowedDevices: unknown; cameraConfig: { direction: unknown } }) => void | Promise<void>;
  stop: () => void;
  clearCameraPipelineModules: () => void;
  addCameraPipelineModules: (modules: Pipeline[]) => void;
  GlTextureRenderer: { pipelineModule: () => Pipeline };
  Threejs: { pipelineModule: () => Pipeline; xrScene: () => { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer } };
  XrController: { configure: (options: { disableWorldTracking: boolean; scale: "responsive"; enableWorldPoints:boolean }) => void; pipelineModule: () => Pipeline; updateCameraProjectionMatrix: (options: { origin: Vec3; facing: THREE.Quaternion }) => void; hitTest: (x: number, y: number, types?: string[]) => SurfaceHit[] };
  XrConfig: { device: () => { MOBILE: unknown }; camera: () => { BACK: unknown } };
  XrDevice: { isDeviceBrowserCompatible: (options: { allowedDevices: unknown }) => boolean };
};
declare global { interface Window { XR8?: XR8Api; THREE?: typeof THREE } }

export type ArSnapshot = { game: WorldGame; started: boolean; tracking: boolean; surfaceReady: boolean; floorProgress:number; character:"2d" | "3d"; manual: boolean; scanSeconds: number; trackingReason: string; offscreen: boolean; distance: number };
export type ArRuntime = { tap: (point: Point) => void; place: () => void; manualPlacement: (distance: number | null) => void; replay: () => void; reposition: () => void; preview: (start: Point, end: Point) => void; throw: (start: Point, end: Point, duration: number) => void; clearPreview: () => void; dispose: () => void };
let enginePromise: Promise<XR8Api> | null = null;

export async function loadArEngine(): Promise<XR8Api> {
  if (!window.isSecureContext) throw new Error("insecure");
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
  window.THREE = THREE;
  if (!enginePromise) enginePromise = new Promise<XR8Api>((resolve, reject) => {
    if (window.XR8) { resolve(window.XR8); return; }
    const script = document.createElement("script");
    script.src = "/game/vendor/xr/xr.js"; script.async = true;
    script.dataset.preloadChunks = "slam";
    const timeout = window.setTimeout(() => fail(), 45000);
    function cleanup() { clearTimeout(timeout); window.removeEventListener("xrloaded", loaded); script.onerror = null; }
    function loaded() { if (window.XR8) { cleanup(); resolve(window.XR8); } }
    function fail() { cleanup(); script.remove(); reject(new Error("load")); }
    window.addEventListener("xrloaded", loaded); script.onerror = fail;
    document.head.appendChild(script);
  }).then(async xr => { await xr.loadChunk("slam"); return xr; }).catch(error => { enginePromise = null; throw error; });
  return enginePromise;
}

export function createArRuntime(xr: XR8Api, canvas: HTMLCanvasElement, options: {
  reducedMotion: boolean; cameraId: string; previous?: WorldGame; onChange: (snapshot: ArSnapshot) => void; onError: (error: string) => void;
}): ArRuntime {
  const allowedDevices = xr.XrConfig.device().MOBILE;
  if (!xr.XrDevice.isDeviceBrowserCompatible({ allowedDevices })) throw new Error("unsupported");
  let game: WorldGame = { ...(options.previous ?? initialWorldGame()), phase: "ready", anchor: null, shot: null };
  let scene: THREE.Scene | null = null, camera: THREE.PerspectiveCamera | null = null, renderer: THREE.WebGLRenderer | null = null;
  let started = false, disposed = false, tracked = false, last = 0, lastEmit = 0, lastSurface = 0, lastFloorCheck=0;
  let floorLock=emptyFloorLock();
  let candidate: Vec3 | null = null, surfaceReady = false, offscreen = false, distance = 0;
  let manualDistance: number | null = null, scanStart = performance.now(), scanSeconds = 0, trackingReason = "INITIALIZING";
  let lastSummary = "";
  let cameraStream: MediaStream | null = null;
  let releaseCamera = () => {};
  const content = new THREE.Group(); content.name = "squirrel-ar-content";
  const anchor = new THREE.Group(); anchor.name = "squirrel-anchor"; content.add(anchor);
  let squirrel: ReturnType<typeof createSquirrelBillboard> | ReturnType<typeof createSquirrelModel>;
  try { squirrel=createSquirrelBillboard(); } catch { squirrel=createSquirrelModel(); }
  const character="hit" in squirrel ? "2d" : "3d";
  anchor.add(squirrel.root); squirrel.root.visible = false;
  const reticle = new THREE.Mesh(new THREE.RingGeometry(.07,.09,40), new THREE.MeshBasicMaterial({ color: 0xffd39a, side: THREE.DoubleSide, depthWrite: false }));
  reticle.rotation.x = -Math.PI/2; reticle.visible = false; content.add(reticle);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.14,24), new THREE.MeshBasicMaterial({ color: 0x352513, transparent: true, opacity: .17, depthWrite: false }));
  shadow.rotation.x = -Math.PI/2; shadow.visible = false; anchor.add(shadow);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.045,14,12), new THREE.MeshStandardMaterial({ color: 0xff943d, roughness: .6 }));
  ball.visible = false; content.add(ball);
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffe1ad, dashSize: .06, gapSize: .04, transparent: true, opacity: .85 }));
  line.visible = false; content.add(line);
  const raycaster = new THREE.Raycaster();
  const lights = new THREE.Group(); lights.add(new THREE.HemisphereLight(0xfff6e4,0x75644c,2.6));
  const sun = new THREE.DirectionalLight(0xffffff,2.3); sun.position.set(2,4,3); lights.add(sun); content.add(lights);

  function emit(force = false) {
    if (disposed) return;
    const now = performance.now();
    const floorProgress=Math.round(floorLock.stableMs/floorSettleTime*20)/20;
    const summary = [game.phase, Math.ceil(game.elapsed/1000), game.balls, game.score, game.round, !!game.shot, game.feedback, started, tracked, surfaceReady, floorProgress, manualDistance, scanSeconds, trackingReason, offscreen, Math.round(distance*10)].join(":");
    if (force || (summary !== lastSummary && now - lastEmit > 90)) { lastSummary = summary; lastEmit = now; options.onChange({ game: { ...game }, started, tracking: tracked, surfaceReady, floorProgress, character, manual: manualDistance !== null, scanSeconds, trackingReason, offscreen, distance }); }
  }
  function fail(code: string) { if (!disposed) { options.onError(code); runtime.dispose(); } }
  const cameraEnded = () => fail("camera");
  function size() {
    const rect = canvas.parentElement!.getBoundingClientRect(); const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(rect.width*ratio)); canvas.height = Math.max(1, Math.round(rect.height*ratio));
  }
  const resize = new ResizeObserver(size); resize.observe(canvas); size();
  const contextLost = (event: Event) => { event.preventDefault(); fail("camera"); };
  canvas.addEventListener("webglcontextlost", contextLost);
  function shotFor(start: Point, end: Point, duration: number) {
    if (!camera || !tracked) return null;
    const gesture = worldThrowGesture(start, end, duration); if (!gesture) return null;
    camera.updateMatrixWorld();
    raycaster.setFromCamera(new THREE.Vector2((gesture.aimX-.5)*2, 0), camera);
    const origin = new THREE.Vector3(0,-.13,-.18).applyQuaternion(camera.quaternion).add(camera.position);
    const destination = raycaster.ray.at(gesture.range, new THREE.Vector3());
    return ballisticShot(origin, destination, gesture.flightTime);
  }
  function clearPreview() { line.visible = false; }
  const runtime: ArRuntime = {
    place() {
      if (!camera || !tracked || !candidate || !surfaceReady || performance.now()-lastSurface > 700 || game.anchor) return;
      const yaw = Math.atan2(camera.position.x-candidate.x, camera.position.z-candidate.z);
      game = placeWorldGame(game, candidate, yaw);
      anchor.position.copy(candidate); anchor.rotation.y = yaw;
      candidate = null; surfaceReady = false; reticle.visible = false; emit(true);
    },
    manualPlacement(depth) {
      manualDistance = depth === null ? null : Math.max(.7, Math.min(3, depth));
      candidate = null; surfaceReady = false; floorLock=emptyFloorLock(); emit(true);
    },
    tap(point) {
      if (game.phase === "ready") { runtime.place(); return; }
      if (!camera || !tracked || game.phase !== "encounter") return;
      scene?.updateMatrixWorld(true);
      raycaster.setFromCamera(new THREE.Vector2(point.x*2-1, 1-point.y*2), camera);
      const hits=raycaster.intersectObject(squirrel.root,true);
      if ("hit" in squirrel ? squirrel.hit(hits) : hits.length > 0) { game = beginWorldCatch(game); emit(true); }
    },
    replay() { if (game.anchor) { game = placeWorldGame(game, game.anchor, game.yaw); clearPreview(); emit(true); } },
    reposition() { game = { ...game, phase: "ready", anchor: null, shot: null }; candidate = null; surfaceReady = false; floorLock=emptyFloorLock(); scanStart = performance.now(); clearPreview(); emit(true); },
    preview(start, end) {
      const shot = shotFor(start, end, 250);
      if (!shot || game.phase !== "playing" || game.shot) { clearPreview(); return; }
      const points = Array.from({ length: 30 }, (_, i) => new THREE.Vector3().copy(worldShotPosition({ ...shot, elapsed: i*25 })));
      line.geometry.dispose(); line.geometry = new THREE.BufferGeometry().setFromPoints(points); line.computeLineDistances(); line.visible = true;
    },
    throw(start, end, duration) { if (!tracked) return; game = launchWorldBall(game, shotFor(start, end, duration)); clearPreview(); emit(true); },
    clearPreview,
    dispose() {
      if (disposed) return; disposed = true; resize.disconnect(); canvas.removeEventListener("webglcontextlost", contextLost);
      cameraStream?.getTracks().forEach(track => { track.removeEventListener("ended", cameraEnded); track.stop(); });
      cameraStream = null;
      try { xr.stop(); } finally { releaseCamera(); }
      // Keep the cancellation guard installed while a permission prompt is open.
      if (started) xr.clearCameraPipelineModules();
      content.removeFromParent(); disposeScene(content); renderer?.dispose();
    },
  };
  xr.stop(); xr.clearCameraPipelineModules();
  try {
  releaseCamera = bindArCamera(options.cameraId);
  // Relative world tracking does not require a metric floor/height estimate.
  xr.XrController.configure({ disableWorldTracking: false, scale: "responsive", enableWorldPoints:true });
  xr.addCameraPipelineModules([
    xr.GlTextureRenderer.pipelineModule(), xr.Threejs.pipelineModule(), xr.XrController.pipelineModule(),
    {
      name: "hamghadam-world-game",
      onStart() {
        if (disposed) { xr.stop(); xr.clearCameraPipelineModules(); return; }
        ({ scene, camera, renderer } = xr.Threejs.xrScene());
        scene.add(content); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setPixelRatio(1);
        camera.position.set(0,1.5,0);
        xr.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
        started = true; last = scanStart = performance.now(); emit(true);
      },
      onCameraStatusChange({ status, stream }) {
        if (disposed) { stream?.getTracks().forEach(track => track.stop()); if (status === "hasStream" || status === "hasVideo") xr.stop(); return; }
        if (stream) { cameraStream = stream; stream.getTracks().forEach(track => track.addEventListener("ended", cameraEnded, { once: true })); }
        if (status === "failed") fail("permission");
      },
      onException(error) { console.error("AR session failed", error); fail("camera"); },
      onUpdate({ processCpuResult }) {
        if (disposed || !started || !camera) return;
        const now = performance.now(), delta = Math.min(64, Math.max(0, now-last)); last = now;
        const reality = processCpuResult?.reality;
        trackingReason = reality?.trackingReason ?? "INITIALIZING";
        scanSeconds = game.anchor ? 0 : Math.floor((now-scanStart)/1000);
        tracked = reality?.trackingStatus === "NORMAL" && reality.trackingReason !== "INITIALIZING";
        if (!tracked) { candidate = null; floorLock=emptyFloorLock(); surfaceReady = false; clearPreview(); }
        if (tracked && !game.anchor) {
          if (manualDistance !== null) {
            // User-chosen depth, clearly labelled manual in the UI. The point
            // uses the real SLAM camera pose and becomes fixed only on Place.
            camera.updateMatrixWorld();
            raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
            candidate = raycaster.ray.at(manualDistance, new THREE.Vector3());
            surfaceReady = true; lastSurface = now;
          } else if (now-lastFloorCheck >= 100) {
            const elapsed=lastFloorCheck ? now-lastFloorCheck : 100; lastFloorCheck=now;
            const hits=[[.5,.65],[.35,.75],[.65,.75],[.5,.85]].flatMap(([x,y])=>xr.XrController.hitTest(x,y,["ESTIMATED_SURFACE","DETECTED_SURFACE"]));
            const estimate=estimateFloor(hits,reality?.worldPoints ?? [],camera.position);
            let point=estimate?.position ?? null;
            if (point && estimate?.source === "points") {
              camera.updateMatrixWorld(); raycaster.setFromCamera(new THREE.Vector2(0,-.3),camera);
              point=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-point.y),new THREE.Vector3());
            }
            if (point) {
              const projection=new THREE.Vector3(point.x,point.y,point.z).project(camera);
              if (projection.z < -1 || projection.z > 1 || Math.abs(projection.x) > .85 || Math.abs(projection.y) > .9 || camera.position.distanceTo(point) > 4.8) point=null;
            }
            if (floorLock.point) {
              const previous=new THREE.Vector3().copy(floorLock.point).project(camera);
              if (Math.abs(previous.x) > .9 || Math.abs(previous.y) > .95 || previous.z > 1) floorLock=emptyFloorLock();
            }
            floorLock=updateFloorLock(floorLock,point,elapsed,tracked);
            candidate=floorLock.point;
            if (point) lastSurface=now;
            surfaceReady=!!candidate && floorLock.stableMs >= floorSettleTime && floorLock.missingMs === 0;
            if (surfaceReady) runtime.place();
          }
          if (candidate) reticle.position.set(candidate.x,candidate.y+.008,candidate.z);
          reticle.material.color.set(surfaceReady ? 0xb7edb1 : 0xffd39a);
        }
        game = advanceWorldGame(game, delta, tracked, options.reducedMotion);
        const foot = worldSquirrelPosition(game, options.reducedMotion);
        const previousFoot=squirrel.root.position.clone();
        squirrel.root.position.copy(foot).sub(anchor.position).applyAxisAngle(new THREE.Vector3(0,1,0), -game.yaw);
        squirrel.root.rotation.y=Math.atan2(camera.position.x-foot.x,camera.position.z-foot.z)-game.yaw;
        const movement=squirrel.root.position.clone().sub(previousFoot).applyAxisAngle(new THREE.Vector3(0,1,0),game.yaw);
        const horizontal=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion).dot(movement);
        if (Math.abs(horizontal) > .0001) squirrel.root.userData.facing=horizontal < 0 ? -1 : 1;
        const visible = !!game.anchor && tracked && ["entering","encounter","playing","escaping","caught"].includes(game.phase);
        squirrel.root.visible = visible; shadow.visible = visible;
        shadow.position.set(squirrel.root.position.x,.006,squirrel.root.position.z);
        if (visible) squirrel.animate(now/1000, ["entering","encounter","escaping","playing"].includes(game.phase), game.phase === "caught", options.reducedMotion);
        reticle.visible = tracked && ((!game.anchor && !!candidate) || game.phase === "waiting");
        if (game.anchor && game.phase === "waiting") { reticle.position.set(game.anchor.x,game.anchor.y+.008,game.anchor.z); reticle.material.color.set(0xb7edb1); }
        ball.visible = tracked && !!game.shot;
        if (game.shot) ball.position.copy(worldShotPosition(game.shot));
        if (game.anchor) {
          const target = new THREE.Vector3(foot.x,foot.y+.24,foot.z);
          distance = camera.position.distanceTo(target); target.project(camera);
          offscreen = target.z > 1 || target.z < -1 || Math.abs(target.x) > .9 || Math.abs(target.y) > .85;
        } else { distance = candidate ? camera.position.distanceTo(candidate) : 0; offscreen = false; }
        emit();
      },
    },
  ]);
  const running = xr.run({ canvas, allowedDevices, cameraConfig: { direction: xr.XrConfig.camera().BACK } }); if (running instanceof Promise) running.catch(() => fail("camera"));
  }
  catch (error) { runtime.dispose(); throw error; }
  return runtime;
}
