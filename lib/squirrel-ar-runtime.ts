import * as THREE from "three";
import { disposeScene, squirrelModelHeight, type SquirrelCharacter } from "./squirrel-ar-model";
export { loadSquirrelCharacter, type SquirrelCharacter } from "./squirrel-ar-model";
import { emptyFloorLock, estimateFloor, floorSettleTime, updateFloorLock, type SurfaceHit, type WorldPoint } from "./squirrel-ar-floor";
import { advanceWorldGame, ballisticShot, beginWorldCatch, fitMovementZone, initialWorldGame, launchWorldBall, placeWorldGame, sweptBallHit, worldBallRadius, worldShotPosition, worldSquirrelPosition, worldThrowGesture, type Vec3, type WorldGame } from "./squirrel-ar-game";
import type { Point } from "./squirrel-game";
import { bindArCamera } from "./squirrel-ar-camera";
import type { SquirrelRewardProof } from "./squirrel-reward-proof";

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

export type ArSnapshot = { game: WorldGame; started: boolean; tracking: boolean; surfaceReady: boolean; floorProgress:number; character:"3d"; manual: boolean; scanSeconds: number; trackingReason: string; offscreen: boolean; distance: number; rewardProof?: SquirrelRewardProof };
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
  reducedMotion: boolean; cameraId: string; character: SquirrelCharacter; previous?: WorldGame; rewardSeed?: number;
  onChange: (snapshot: ArSnapshot) => void; onError: (error: string) => void;
}): ArRuntime {
  const allowedDevices = xr.XrConfig.device().MOBILE;
  if (!xr.XrDevice.isDeviceBrowserCompatible({ allowedDevices })) throw new Error("unsupported");
  let game: WorldGame = { ...(options.previous ?? initialWorldGame(options.rewardSeed)), phase: "ready", anchor: null, shot: null };
  let encounterMs: number | undefined;
  let pendingProof: Omit<SquirrelRewardProof, "impactMs" | "impactStepMs"> | undefined;
  let rewardProof: SquirrelRewardProof | undefined;
  let scene: THREE.Scene | null = null, camera: THREE.PerspectiveCamera | null = null, renderer: THREE.WebGLRenderer | null = null;
  let started = false, disposed = false, tracked = false, last = 0, lastEmit = 0, lastSurface = 0, lastFloorCheck=0;
  let floorLock=emptyFloorLock();
  let candidate: Vec3 | null = null, surfaceReady = false, offscreen = false, distance = 0;
  let manualDistance: number | null = null, scanStart = performance.now(), scanSeconds = 0, trackingReason = "INITIALIZING";
  let lastSummary = "";
  let cameraStream: MediaStream | null = null;
  let releaseCamera = () => {};
  let desiredHeading=0;
  const content = new THREE.Group(); content.name = "squirrel-ar-content";
  const anchor = new THREE.Group(); anchor.name = "squirrel-anchor"; content.add(anchor);
  const squirrel=options.character;
  const character="3d";
  anchor.add(squirrel.root); squirrel.root.visible = false;
  const reticle = new THREE.Mesh(new THREE.RingGeometry(.07,.09,40), new THREE.MeshBasicMaterial({ color: 0xffd39a, side: THREE.DoubleSide, depthWrite: false }));
  reticle.rotation.x = -Math.PI/2; reticle.visible = false; content.add(reticle);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.14,24), new THREE.MeshBasicMaterial({ color: 0x352513, transparent: true, opacity: .17, depthWrite: false }));
  shadow.rotation.x = -Math.PI/2; shadow.visible = false; anchor.add(shadow);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(worldBallRadius,14,12), new THREE.MeshStandardMaterial({ color: 0xff943d, roughness: .6 }));
  ball.visible = false; content.add(ball);
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffe1ad, dashSize: .06, gapSize: .04, transparent: true, opacity: .85 }));
  line.visible = false; content.add(line);
  const raycaster = new THREE.Raycaster();
  const up = new THREE.Vector3(0, 1, 0);
  const lights = new THREE.Group(); lights.add(new THREE.HemisphereLight(0xfff6e4,0x75644c,2.6));
  const sun = new THREE.DirectionalLight(0xffffff,2.3); sun.position.set(2,4,3); lights.add(sun); content.add(lights);

  function emit(force = false) {
    if (disposed) return;
    const now = performance.now();
    const floorProgress=Math.round(floorLock.stableMs/floorSettleTime*20)/20;
    const summary = [game.phase, Math.ceil(game.elapsed/1000), game.balls, game.score, game.round, !!game.shot, game.feedback, started, tracked, surfaceReady, floorProgress, manualDistance, scanSeconds, trackingReason, offscreen, Math.round(distance*10)].join(":");
    if (force || (summary !== lastSummary && now - lastEmit > 90)) { lastSummary = summary; lastEmit = now; options.onChange({ game: { ...game }, started, tracking: tracked, surfaceReady, floorProgress, character, manual: manualDistance !== null, scanSeconds, trackingReason, offscreen, distance, rewardProof }); }
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

  function framePlacement(point: Vec3, yaw: number, view: THREE.Camera) {
    view.updateMatrixWorld();
    const sample = new THREE.Vector3();
    const cosine = Math.cos(yaw), sine = Math.sin(yaw);
    // Use each silhouette's widest section at its actual height. A box just
    // as wide at the feet would make a portrait route unnecessarily narrow.
    const silhouette = [[0, .16], [.2, .20], [.21, .42], [.5, .42], [squirrelModelHeight + .04, .33]]
      .flatMap(([y, radius]) => Array.from({ length: 12 }, (_, i) => ({
        x: radius * Math.cos(i * Math.PI / 6), y, z: radius * Math.sin(i * Math.PI / 6),
      })));
    const fits = (x: number, z: number, scale: number) => {
      const floorX = point.x + x * cosine + z * sine;
      const floorZ = point.z - x * sine + z * cosine;
      return silhouette.every(offset => {
        sample.set(floorX + offset.x * scale, point.y + offset.y * scale, floorZ + offset.z * scale).project(view);
        return sample.z > -1 && sample.z < 1 && Math.abs(sample.x) <= .97 && Math.abs(sample.y) <= .95;
      });
    };
    // Keep the authored size where the frame affords it. A close or narrow
    // placement can pick a smaller size once to leave room for movement.
    const minSize = .7;
    const scale = [1, .9, .8].find(scale => options.reducedMotion ? fits(0, 0, scale)
      : [-.24, .24].every(x => [-.22, .22].every(z => fits(x, z, scale)))) ?? minSize;
    return { scale, zone: fitMovementZone((x, z) => fits(x, z, scale)) };
  }

  function drawSquirrel(next: WorldGame, delta: number, previousPhase: WorldGame["phase"], view: THREE.Camera) {
    const foot = worldSquirrelPosition(next, options.reducedMotion);
    const localPosition = new THREE.Vector3().copy(foot).sub(anchor.position).applyAxisAngle(up, -next.yaw);
    const movement = localPosition.clone().sub(squirrel.root.position).applyAxisAngle(up, next.yaw);
    squirrel.root.position.copy(localPosition);
    if (next.phase === "caught" && previousPhase !== "caught") {
      desiredHeading = Math.atan2(view.position.x - foot.x, view.position.z - foot.z) - next.yaw;
    } else if (!options.reducedMotion && movement.lengthSq() > .000001 && ["entering", "encounter", "playing", "escaping"].includes(next.phase)) {
      desiredHeading = Math.atan2(movement.x, movement.z) - next.yaw;
    }
    const visible = !!next.anchor && tracked && ["entering", "encounter", "playing", "escaping", "caught"].includes(next.phase);
    squirrel.root.visible = visible;
    shadow.visible = visible;
    shadow.position.set(localPosition.x, .006, localPosition.z);
    if (visible) squirrel.update(next, delta, options.reducedMotion, movement.length() / Math.max(.001, delta / 1000), desiredHeading);
    return foot;
  }

  const screenPoint = ({ x, y }: Point) => new THREE.Vector2(x * 2 - 1, 1 - y * 2);
  function shotFor(start: Point, end: Point, duration: number) {
    const view = camera;
    if (!view || !tracked || !game.anchor || game.phase !== "playing") return null;
    const gesture = worldThrowGesture(start, end, duration);
    if (!gesture) return null;
    view.updateMatrixWorld();
    raycaster.setFromCamera(screenPoint(start), view);
    const origin = raycaster.ray.at(.28, new THREE.Vector3());
    raycaster.setFromCamera(screenPoint({ x: gesture.aimX, y: gesture.aimY }), view);
    // The fixed placement sets the depth. Target position and prior attempts
    // do not steer the ball, so the player has to lead a moving squirrel.
    const depthPoint = new THREE.Vector3().copy(game.anchor);
    depthPoint.y += .24 * squirrel.root.scale.y;
    const depth = Math.max(.35, -depthPoint.applyMatrix4(view.matrixWorldInverse).z);
    const direction = raycaster.ray.direction.clone().transformDirection(view.matrixWorldInverse);
    const destination = raycaster.ray.at(depth / -direction.z, new THREE.Vector3());
    return ballisticShot(origin, destination, gesture.flightTime);
  }
  function clearPreview() { line.visible = false; }
  const runtime: ArRuntime = {
    place() {
      if (!camera || !tracked || !candidate || !surfaceReady || performance.now()-lastSurface > 700 || game.anchor) return;
      const yaw = Math.atan2(camera.position.x-candidate.x, camera.position.z-candidate.z);
      const placement = framePlacement(candidate, yaw, camera);
      game = placeWorldGame(game, candidate, yaw, placement.zone);
      squirrel.root.scale.setScalar(placement.scale);
      shadow.scale.setScalar(placement.scale);
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
      if (hits.length > 0) { encounterMs = game.elapsed; game = beginWorldCatch(game); emit(true); }
    },
    replay() { if (game.anchor) { game = placeWorldGame(game, game.anchor, game.yaw, game.zone); pendingProof = undefined; clearPreview(); emit(true); } },
    reposition() { game = { ...game, phase: "ready", anchor: null, shot: null }; pendingProof = undefined; candidate = null; surfaceReady = false; floorLock=emptyFloorLock(); scanStart = performance.now(); clearPreview(); emit(true); },
    preview(start, end) {
      const shot = shotFor(start, end, 250);
      if (!shot || game.phase !== "playing" || game.shot) { clearPreview(); return; }
      const points = Array.from({ length: 30 }, (_, i) => new THREE.Vector3().copy(worldShotPosition({ ...shot, elapsed: i*25 })));
      line.geometry.dispose(); line.geometry = new THREE.BufferGeometry().setFromPoints(points); line.computeLineDistances(); line.visible = true;
    },
    throw(start, end, duration) {
      if (!tracked) return;
      const launched = launchWorldBall(game, shotFor(start, end, duration));
      if (options.rewardSeed !== undefined && !game.shot && launched.shot && game.anchor && encounterMs !== undefined) {
        const origin = new THREE.Vector3().copy(launched.shot.origin).sub(game.anchor).applyAxisAngle(up, -game.yaw);
        const velocity = new THREE.Vector3().copy(launched.shot.velocity).applyAxisAngle(up, -game.yaw);
        pendingProof = {
          round: game.round, encounterMs, launchMs: game.elapsed, zone: { ...game.zone },
          origin: { x: origin.x, y: origin.y, z: origin.z }, velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
          scale: squirrel.root.scale.x, reducedMotion: options.reducedMotion,
        };
      }
      game = launched;
      clearPreview(); emit(true);
    },
    clearPreview,
    dispose() {
      if (disposed) return; disposed = true; resize.disconnect(); canvas.removeEventListener("webglcontextlost", contextLost);
      cameraStream?.getTracks().forEach(track => { track.removeEventListener("ended", cameraEnded); track.stop(); });
      cameraStream = null;
      try { xr.stop(); } finally { releaseCamera(); }
      // Keep the cancellation guard installed while a permission prompt is open.
      if (started) xr.clearCameraPipelineModules();
      content.removeFromParent(); squirrel.dispose(); disposeScene(content); renderer?.dispose();
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
        renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1;
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
        const view = camera;
        const previousPhase = game.phase;
        const previousShot = game.shot;
        let drewPlayingFrame = false;
        let foot: Vec3 = worldSquirrelPosition(game, options.reducedMotion);
        game = advanceWorldGame(game, delta, tracked, options.reducedMotion, (from, to, next) => {
          const previous = squirrel.hitSpheres();
          foot = drawSquirrel(next, delta, previousPhase, view);
          drewPlayingFrame = true;
          const current = squirrel.hitSpheres();
          return previous.some((sphere, index) => sweptBallHit(from, to, sphere, current[index].center));
        });
        const caught = game.phase === "caught" && previousPhase === "playing";
        if (caught && pendingProof && previousShot) {
          rewardProof = { ...pendingProof, impactMs: previousShot.elapsed + delta, impactStepMs: delta };
        }
        if (!game.shot) pendingProof = undefined;
        if (!drewPlayingFrame || game.phase !== "playing") foot = drawSquirrel(game, drewPlayingFrame ? 0 : delta, previousPhase, view);
        reticle.visible = tracked && ((!game.anchor && !!candidate) || game.phase === "waiting");
        if (game.anchor && game.phase === "waiting") { reticle.position.set(game.anchor.x,game.anchor.y+.008,game.anchor.z); reticle.material.color.set(0xb7edb1); }
        ball.visible = tracked && !!game.shot;
        if (game.shot) ball.position.copy(worldShotPosition(game.shot));
        if (game.anchor) {
          const target = new THREE.Vector3(foot.x, foot.y + .24 * squirrel.root.scale.y, foot.z);
          distance = camera.position.distanceTo(target); target.project(camera);
          offscreen = target.z > 1 || target.z < -1 || Math.abs(target.x) > .9 || Math.abs(target.y) > .85;
        } else { distance = candidate ? camera.position.distanceTo(candidate) : 0; offscreen = false; }
        emit(caught);
      },
    },
  ]);
  const running = xr.run({ canvas, allowedDevices, cameraConfig: { direction: xr.XrConfig.camera().BACK } }); if (running instanceof Promise) running.catch(() => fail("camera"));
  }
  catch (error) { runtime.dispose(); throw error; }
  return runtime;
}
