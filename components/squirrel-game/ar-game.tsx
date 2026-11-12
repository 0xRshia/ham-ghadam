"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowUp, Camera, Crosshair, LoaderCircle, MapPin, Pause, RotateCcw, ScanLine, SwitchCamera, Trophy, X } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { squirrelCopy as copy, squirrelArCopy as ar } from "@/locales/squirrel-fa";
import { type Point } from "@/lib/squirrel-game";
import { initialWorldGame, worldSecondsRemaining } from "@/lib/squirrel-ar-game";
import type { ArRuntime, ArSnapshot, SquirrelCharacter } from "@/lib/squirrel-ar-runtime";
import { prepareArCamera, type ArCamera } from "@/lib/squirrel-ar-camera";
import { PracticeGame } from "./practice-game";
import { Squirrel } from "./squirrel";

const digits = (n: number) => n.toLocaleString("fa-IR");
type Status = "idle" | "loading" | "scanning" | "running" | "paused" | "error";
type Gesture = { pointer: number; start: Point; end: Point; time: number };
type MotionPermission = { requestPermission?: () => Promise<string> };

// iOS requires these requests to begin inside the actual tap handler, before
// downloading the engine. No camera or motion permission is requested on load.
function motionPermission() {
  const requests = [window.DeviceMotionEvent, window.DeviceOrientationEvent].map(constructor => {
    const permission = constructor as unknown as MotionPermission | undefined;
    return permission?.requestPermission?.().then(result => { if (result !== "granted") throw new Error("motion"); });
  });
  return Promise.all(requests);
}

export function ArGame() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const runtime = useRef<ArRuntime | null>(null);
  const generation = useRef(0);
  const cameraRequest = useRef<AbortController | null>(null);
  const selectedCamera = useRef<string | undefined>(undefined);
  const gesture = useRef<Gesture | null>(null);
  const lastGame = useRef(initialWorldGame());
  const [view, setView] = useState<"intro" | "ar" | "practice">("intro");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<ArCamera[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [manualDepth, setManualDepth] = useState(1.5);
  const [snapshot, setSnapshot] = useState<ArSnapshot>({ game: initialWorldGame(), started: false, tracking: false, surfaceReady: false, floorProgress:0, character:"3d", manual: false, scanSeconds: 0, trackingReason: "INITIALIZING", offscreen: false, distance: 0 });
  const reducedMotion = useReducedMotion();
  const stop = useCallback(() => { generation.current++; cameraRequest.current?.abort(); gesture.current = null; runtime.current?.dispose(); runtime.current = null; }, []);
  const pause = useCallback(() => { stop(); setStatus("paused"); }, [stop]);
  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (["loading", "paused", "error"].includes(status)) dialog.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [status]);
  useEffect(() => {
    if (view !== "ar") return;
    const hide = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", pause);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", pause); };
  }, [view, pause]);

  async function start(preferred = selectedCamera.current) {
    stop(); const current = generation.current;
    const request = new AbortController(); cameraRequest.current = request;
    let character: SquirrelCharacter | null=null;
    setView("ar"); setStatus("loading"); setError(null);
    const failed = (code: string) => {
      if (current !== generation.current) return;
      stop(); setStatus("error"); setError(ar[code as keyof typeof ar] ?? ar.camera);
    };
    try {
      const [library] = await Promise.all([import("@/lib/squirrel-ar-runtime"), motionPermission()]);
      const xr = await library.loadArEngine();
      if (current !== generation.current || !canvas.current) return;
      if (!xr.XrDevice.isDeviceBrowserCompatible({ allowedDevices: xr.XrConfig.device().MOBILE })) throw new Error("unsupported");
      const choice = await prepareArCamera(preferred, request.signal);
      if (current !== generation.current || !canvas.current) return;
      selectedCamera.current = choice.selected.deviceId; setCameraId(choice.selected.deviceId); setCameras(choice.cameras);
      character=await library.loadSquirrelCharacter(request.signal);
      if (current !== generation.current || !canvas.current) {character.dispose();return;}
      runtime.current = library.createArRuntime(xr, canvas.current, {
        reducedMotion, cameraId: choice.selected.deviceId, character, previous: lastGame.current,
        onChange(next) { if (current !== generation.current) return; lastGame.current = next.game; setSnapshot(next); setStatus(next.game.anchor ? "running" : "scanning"); },
        onError: failed,
      });
      character=null; // Ownership transfers to the AR session.
    } catch (cause) { character?.dispose(); failed(cause instanceof DOMException && cause.name === "NotAllowedError" ? "permission" : cause instanceof Error ? cause.message : "camera"); }
  }
  function intro() { stop(); setView("intro"); setStatus("idle"); setError(null); }
  function practice() { stop(); setView("practice"); setStatus("idle"); }
  function point(event: PointerEvent): Point {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: (event.clientX-rect.left)/rect.width, y: (event.clientY-rect.top)/rect.height };
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (!snapshot.tracking || snapshot.game.phase !== "playing" || snapshot.game.shot || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (!(event.target instanceof Element) || !event.target.closest("[data-world-launcher]")) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointer: event.pointerId, start: point(event), end: point(event), time: performance.now() };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.pointer !== event.pointerId) return;
    gesture.current.end = point(event); runtime.current?.preview(gesture.current.start, gesture.current.end);
  }
  function cancel() { gesture.current = null; runtime.current?.clearPreview(); }
  function up(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (current?.pointer === event.pointerId) {
      runtime.current?.throw(current.start, point(event), performance.now()-current.time); cancel();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } else if (event.target === canvas.current) runtime.current?.tap(point(event));
  }

  if (view === "practice") return <PracticeGame onExit={intro} />;
  const game = snapshot.game;
  const playing = game.phase === "playing";
  const result = game.phase === "caught" || game.phase === "escaped";
  const seconds = worldSecondsRemaining(game);
  const active = view === "ar";
  const modal = status === "paused" || status === "error" || status === "loading";
  const scanStalled = !game.anchor && !snapshot.tracking && snapshot.scanSeconds >= 12;
  const heading = !game.anchor ? scanStalled ? ar.scanStalled : snapshot.manual ? ar.manualTitle : snapshot.floorProgress > 0 ? ar.floorChecking : snapshot.tracking ? ar.findSurface : ar.scanning : game.phase === "waiting" ? ar.countdown : snapshot.offscreen && !result ? ar.offscreen : game.phase === "encounter" ? ar.tap : playing ? ar.aim : game.phase === "caught" ? copy.caught : game.phase === "escaped" ? copy.escaped : game.phase === "escaping" ? copy.escaping : copy.waiting;
  const cameraPicker = <button type="button" className="sg-ar-camera" aria-label={ar.cameraSwitch} title={ar.cameraSwitch} disabled={cameras.length < 2 || status === "loading"} onClick={() => {
    const next = cameras[(cameras.findIndex(camera => camera.deviceId === cameraId) + 1) % cameras.length];
    if (next) void start(next.deviceId);
  }}><SwitchCamera size={22} aria-hidden="true" /></button>;

  return <main className={`sg-game${active ? " sg-active sg-world" : ""}`} dir="rtl" data-ar-status={status} data-tracking={snapshot.tracking ? "normal" : "limited"} data-game-phase={active ? game.phase : "ready"} data-character={snapshot.character} data-round={game.round} data-mode={active ? "ar" : "intro"}>
    <div className="sg-viewport" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}>
      <canvas ref={canvas} className="sg-ar-canvas" hidden={!active} aria-label={ar.title} tabIndex={active ? 0 : -1} onKeyDown={event => { if (event.key === "Enter") runtime.current?.tap({ x:.5,y:.5 }); }} />
      {!active && <div className="sg-scenery" aria-hidden="true"><div className="sg-window"/><div className="sg-sun"/><div className="sg-hill sg-hill-back"/><div className="sg-hill"/></div>}
      <header className="sg-header">
        <AppLink href="/" className="sg-icon-button" aria-label={copy.close} onClick={stop}><X size={21}/></AppLink>
        <span className="sg-brand"><img src="/brand/hamghadam-wordmark.svg" alt={copy.name} width={82} height={34}/></span>
        {active ? <button className="sg-icon-button" aria-label={copy.pause} onClick={pause} disabled={modal}><Pause size={19}/></button> : <span className="sg-header-tag">AR سه‌بعدی</span>}
      </header>
      {!active ? <section className="sg-intro sg-ar-intro">
        <div className="sg-intro-art"><div className="sg-orbit"/><Squirrel pose="wave"/><span className="sg-speech">{copy.tap}</span></div>
        <div className="sg-intro-copy"><span className="sg-eyebrow">{copy.name}</span><h1>{ar.title}</h1><p>{ar.intro}</p></div>
        <ol className="sg-steps"><li><ScanLine size={21}/><span><strong>{ar.scanStep}</strong><small>{ar.scanStepHint}</small></span></li><li><MapPin size={21}/><span><strong>{ar.placeStep}</strong><small>{ar.placeStepHint}</small></span></li><li><Crosshair size={21}/><span><strong>{ar.catchStep}</strong><small>{ar.catchStepHint}</small></span></li></ol>
        <button className="sg-primary" onClick={() => void start()}><Camera size={21}/>{ar.start}</button>
        <button className="sg-text-button" onClick={practice}>{ar.practice}</button>
        <p className="sg-privacy">{ar.permissions}</p>
        <a className="sg-license" href="/game/vendor/xr/LICENSE" target="_blank" rel="noreferrer">{ar.engine} · © 2026 Niantic Spatial</a>
      </section> : <>
        <div className="sg-hud"><span className={`sg-mode${snapshot.tracking ? "" : " sg-track-limited"}`}><i/>{snapshot.tracking ? ar.tracking : ar.scanMore}</span><span><Trophy size={15}/>{digits(game.score)}{game.round > 0 && <small> · {copy.round} {digits(game.round)}</small>}</span></div>
        {!modal && <>
          {cameraPicker}
          <div className="sg-ar-guidance" role="status"><h1>{heading}</h1>{!game.anchor && <p>{scanStalled ? ar.scanStalledHint : snapshot.manual ? ar.manualHint : snapshot.tracking ? ar.surfaceHint : ar.scanningHint}</p>}{game.anchor && ["waiting","encounter","playing"].includes(game.phase) && <span className="sg-timer">{digits(seconds)} <small>{copy.seconds}</small></span>}</div>
          {!game.anchor ? <div className="sg-ar-placement"><span className="sg-scan-crosshair" aria-hidden="true">+</span><div className="sg-ar-place-controls">
            {scanStalled && <div className="sg-ar-recovery" role="alert"><p>{ar.scanRecovery}</p><button className="sg-secondary" onClick={() => void start()}><RotateCcw size={17}/>{ar.restartTracking}</button></div>}
            {snapshot.tracking && <>
              {snapshot.manual && <label className="sg-ar-depth"><span>{ar.manualDepth}</span><input aria-label={ar.manualDepth} type="range" min="0.7" max="3" step="0.1" value={manualDepth} onChange={event => { const depth=Number(event.target.value); setManualDepth(depth); runtime.current?.manualPlacement(depth); }}/><span>{ar.near} ↔ {ar.far}</span></label>}
              <button className="sg-text-button" onClick={() => runtime.current?.manualPlacement(snapshot.manual ? null : manualDepth)}>{snapshot.manual ? ar.automaticPlacement : ar.manualPlacement}</button>
            </>}
            {snapshot.manual ? <button className="sg-primary" data-ar-place disabled={!snapshot.surfaceReady || !snapshot.tracking} onClick={() => runtime.current?.place()}><MapPin size={20}/>{ar.place}</button> : <div className="sg-ar-auto" data-ar-auto><ScanLine size={20}/><span>{snapshot.tracking ? ar.autoPlace : ar.startTracking}</span><progress aria-label={ar.floorChecking} max={1} value={snapshot.floorProgress}/></div>}
          </div></div> : <>
            {!result && <><span className="sg-world-crosshair" aria-hidden="true">+</span><button className="sg-reposition" onClick={() => runtime.current?.reposition()}><MapPin size={15}/>{ar.reposition}</button></>}
            {playing && <><button data-world-launcher className="sg-world-launcher" aria-label={copy.ball} disabled={!snapshot.tracking || !!game.shot || !game.balls} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); runtime.current?.throw({x:.5,y:.85},{x:.5,y:.55},250); } }}><ArrowUp size={22}/><span className="sg-ball"><span/><i/></span></button><div className="sg-world-ammo"><span>{digits(game.balls)} {copy.balls}</span>{game.feedback !== "none" && <p>{copy[game.feedback]}</p>}</div></>}
            {result && <section className="sg-ar-result" aria-label={game.phase === "caught" ? copy.caught : copy.escaped}><h2>{game.phase === "caught" ? copy.caught : copy.escaped}</h2><p>{game.phase === "caught" ? `${digits(game.score)} ${copy.score}` : `${copy.returning}: ${digits(seconds)}`}</p><strong>{ar.returnsAutomatically}</strong><small>{copy.rewardNote}</small></section>}
          </>}
          {!snapshot.tracking && !!game.anchor && <section className="sg-tracking-lost" role="alert"><ScanLine size={25}/><strong>{ar.lost}</strong><p>{ar.lostHint}</p></section>}
        </>}
        {modal && <section ref={dialog} className="sg-pause" role="dialog" aria-modal="true" aria-labelledby="sg-ar-dialog" onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); intro(); }
          if (event.key !== "Tab") return;
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
          const first = controls[0], last = controls[controls.length-1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}><div className="sg-pause-card">
          {status === "loading" ? <><LoaderCircle className="sg-spin" size={30}/><h2 id="sg-ar-dialog">{ar.loading}</h2><p>{ar.loadingHint}</p></> : <><h2 id="sg-ar-dialog">{status === "paused" ? copy.paused : copy.retry}</h2><p role={error ? "alert" : undefined}>{error ?? ar.pausedHint}</p><button className="sg-primary" onClick={() => void start()}>{status === "paused" ? ar.resume : copy.retry}</button></>}
          {status === "error" && cameras.length > 1 && cameraPicker}
          <button className="sg-text-button" onClick={intro}>{ar.back}</button><button className="sg-text-button" onClick={practice}>{ar.practice}</button>
        </div></section>}
      </>}
    </div>
  </main>;
}
