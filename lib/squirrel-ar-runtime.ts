import * as THREE from "three";
import { createSquirrelModel, disposeScene } from "./squirrel-ar-model";
import { advanceWorldGame, ballisticShot, distance3, initialWorldGame, launchWorldBall, placeWorldGame, worldShotPosition, worldSquirrelPosition, worldThrowGesture, type Vec3, type WorldGame } from "./squirrel-ar-game";
import type { Point } from "./squirrel-game";

type Hit = { position: Vec3; rotation?: { x: number; y: number; z: number; w: number }; distance: number; type: string };
type Reality = { position: Vec3; rotation: { x: number; y: number; z: number; w: number }; intrinsics: number[]; trackingStatus: string; trackingReason?: string };
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
  XrController: { configure: (options: { disableWorldTracking: boolean; scale: "absolute" }) => void; pipelineModule: () => Pipeline; updateCameraProjectionMatrix: (options: { origin: Vec3; facing: THREE.Quaternion }) => void; hitTest: (x: number, y: number, types?: string[]) => Hit[] };
  XrConfig: { device: () => { MOBILE: unknown }; camera: () => { BACK: unknown } };
  XrDevice: { isDeviceBrowserCompatible: (options: { allowedDevices: unknown }) => boolean };
};
declare global { interface Window { XR8?: XR8Api; THREE?: typeof THREE } }

export type ArSnapshot = { game: WorldGame; started: boolean; tracking: boolean; surfaceReady: boolean; offscreen: boolean; distance: number };
export type ArRuntime = { tap: (point: Point) => void; place: () => void; replay: () => void; reposition: () => void; preview: (start: Point, end: Point) => void; throw: (start: Point, end: Point, duration: number) => void; clearPreview: () => void; dispose: () => void };
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
  reducedMotion: boolean; previous?: WorldGame; onChange: (snapshot: ArSnapshot) => void; onError: (error: string) => void;
}): ArRuntime {
  const allowedDevices = xr.XrConfig.device().MOBILE;
  if (!xr.XrDevice.isDeviceBrowserCompatible({ allowedDevices })) throw new Error("unsupported");
  let game: WorldGame = { ...(options.previous ?? initialWorldGame()), phase: "ready", anchor: null, shot: null };
  let scene: THREE.Scene | null = null, camera: THREE.PerspectiveCamera | null = null, renderer: THREE.WebGLRenderer | null = null;
  let started = false, disposed = false, tracked = false, stableFrames = 0, last = 0, lastEmit = 0, lastSurface = 0;
  let candidate: Vec3 | null = null, surfaceReady = false, offscreen = false, distance = 0;
  let lastSummary = "";
  let cameraStream: MediaStream | null = null;
  const content = new THREE.Group(); content.name = "squirrel-ar-content";
  const anchor = new THREE.Group(); anchor.name = "squirrel-anchor"; content.add(anchor);
  const squirrel = createSquirrelModel(); anchor.add(squirrel.root); squirrel.root.visible = false;
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
    const summary = [game.phase, Math.ceil(game.elapsed/1000), game.balls, game.score, game.round, !!game.shot, game.feedback, started, tracked, surfaceReady, offscreen, Math.round(distance*10)].join(":");
    if (force || (summary !== lastSummary && now - lastEmit > 90)) { lastSummary = summary; lastEmit = now; options.onChange({ game: { ...game }, started, tracking: tracked, surfaceReady, offscreen, distance }); }
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
      if (!camera || !tracked || !candidate || !surfaceReady || performance.now()-lastSurface > 250 || game.anchor) return;
      const yaw = Math.atan2(camera.position.x-candidate.x, camera.position.z-candidate.z);
      game = placeWorldGame(game, candidate, yaw);
      anchor.position.copy(candidate); anchor.rotation.y = yaw;
      candidate = null; surfaceReady = false; reticle.visible = false; emit(true);
    },
    tap(point) {
      if (game.phase === "ready") { runtime.place(); return; }
      if (!camera || !tracked || game.phase !== "encounter") return;
      scene?.updateMatrixWorld(true);
      raycaster.setFromCamera(new THREE.Vector2(point.x*2-1, 1-point.y*2), camera);
      if (raycaster.intersectObject(squirrel.root, true).length) { game = { ...game, phase: "playing", elapsed: 0, playElapsed: 0 }; emit(true); }
    },
    replay() { if (game.anchor) { game = placeWorldGame(game, game.anchor, game.yaw); clearPreview(); emit(true); } },
    reposition() { game = { ...game, phase: "ready", anchor: null, shot: null }; candidate = null; surfaceReady = false; stableFrames = 0; clearPreview(); emit(true); },
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
      xr.stop();
      // Keep the cancellation guard installed while a permission prompt is open.
      if (started) xr.clearCameraPipelineModules();
      content.removeFromParent(); disposeScene(content); renderer?.dispose();
    },
  };
  xr.stop(); xr.clearCameraPipelineModules();
  xr.XrController.configure({ disableWorldTracking: false, scale: "absolute" });
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
        started = true; last = performance.now(); emit(true);
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
        tracked = reality?.trackingStatus === "NORMAL" && reality.trackingReason !== "INITIALIZING";
        if (!tracked) { candidate = null; stableFrames = 0; surfaceReady = false; clearPreview(); }
        if (tracked && !game.anchor) {
          // Hits come from the camera's reconstructed environment, never a
          // made-up screen position or an untracked plane in front of the phone.
          let hits = xr.XrController.hitTest(.5,.6);
          if (!hits.length) hits = xr.XrController.hitTest(.5,.6,["FEATURE_POINT"]);
          const valid = hits.filter(hit => [hit.position.x,hit.position.y,hit.position.z,hit.distance].every(Number.isFinite) && hit.distance > .35 && hit.distance < 4 && hit.position.y < camera!.position.y-.12);
          const hit = valid.find(item => item.type === "DETECTED_SURFACE" || item.type === "ESTIMATED_SURFACE") ?? valid.find(item => item.type === "FEATURE_POINT");
          if (hit) {
            stableFrames = candidate && distance3(candidate, hit.position) < .1 ? stableFrames+1 : 0;
            candidate = { ...hit.position }; lastSurface = now; surfaceReady = stableFrames >= 5;
            reticle.position.set(candidate.x,candidate.y+.008,candidate.z);
            reticle.material.color.set(surfaceReady ? 0xb7edb1 : 0xffd39a);
          } else { candidate = null; surfaceReady = false; stableFrames = 0; }
        }
        game = advanceWorldGame(game, delta, tracked, options.reducedMotion);
        const foot = worldSquirrelPosition(game, options.reducedMotion);
        squirrel.root.position.copy(foot).sub(anchor.position).applyAxisAngle(new THREE.Vector3(0,1,0), -game.yaw);
        const visible = !!game.anchor && tracked && ["entering","encounter","playing","escaping","caught"].includes(game.phase);
        squirrel.root.visible = visible; shadow.visible = visible;
        shadow.position.set(squirrel.root.position.x,.006,squirrel.root.position.z);
        squirrel.animate(now/1000, ["entering","escaping","playing"].includes(game.phase), game.phase === "caught", options.reducedMotion);
        reticle.visible = tracked && !game.anchor && !!candidate;
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
  try { const running = xr.run({ canvas, allowedDevices, cameraConfig: { direction: xr.XrConfig.camera().BACK } }); if (running instanceof Promise) running.catch(() => fail("camera")); }
  catch (error) { runtime.dispose(); throw error; }
  return runtime;
}
