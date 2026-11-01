"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowUp, Camera, Crosshair, LoaderCircle, MapPin, Pause, RotateCcw, ScanLine, Trophy, X } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { squirrelCopy as copy, squirrelArCopy as ar } from "@/locales/squirrel-fa";
import { gameTiming, type Point } from "@/lib/squirrel-game";
import { initialWorldGame } from "@/lib/squirrel-ar-game";
import type { ArRuntime, ArSnapshot } from "@/lib/squirrel-ar-runtime";
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
  const gesture = useRef<Gesture | null>(null);
  const lastGame = useRef(initialWorldGame());
  const [view, setView] = useState<"intro" | "ar" | "practice">("intro");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ArSnapshot>({ game: initialWorldGame(), started: false, tracking: false, surfaceReady: false, offscreen: false, distance: 0 });
  const reducedMotion = useReducedMotion();
  const stop = useCallback(() => { generation.current++; gesture.current = null; runtime.current?.dispose(); runtime.current = null; }, []);
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

  async function start() {
    stop(); const current = generation.current;
    setView("ar"); setStatus("loading"); setError(null);
    const failed = (code: string) => {
      if (current !== generation.current) return;
      stop(); setStatus("error"); setError(ar[code as keyof typeof ar] ?? ar.camera);
    };
    try {
      const [library] = await Promise.all([import("@/lib/squirrel-ar-runtime"), motionPermission()]);
      const xr = await library.loadArEngine();
      if (current !== generation.current || !canvas.current) return;
      runtime.current = library.createArRuntime(xr, canvas.current, {
        reducedMotion, previous: lastGame.current,
        onChange(next) { if (current !== generation.current) return; lastGame.current = next.game; setSnapshot(next); setStatus(next.game.anchor ? "running" : "scanning"); },
        onError: failed,
      });
    } catch (cause) { failed(cause instanceof Error ? cause.message : "camera"); }
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
  const seconds = Math.max(0, Math.ceil(((playing ? gameTiming.playing : game.phase === "escaped" ? gameTiming.escaped : gameTiming.encounter)-game.elapsed)/1000));
  const active = view === "ar";
  const modal = status === "paused" || status === "error" || status === "loading";
  const heading = !game.anchor ? snapshot.surfaceReady ? ar.found : ar.scanning : snapshot.offscreen && !result ? ar.offscreen : game.phase === "encounter" ? ar.tap : playing ? ar.aim : game.phase === "caught" ? copy.caught : game.phase === "escaped" ? copy.escaped : game.phase === "escaping" ? copy.escaping : copy.waiting;

  return <main className={`sg-game${active ? " sg-active sg-world" : ""}`} dir="rtl" data-ar-status={status} data-tracking={snapshot.tracking ? "normal" : "limited"} data-game-phase={active ? game.phase : "ready"} data-mode={active ? "ar" : "intro"}>
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
        <div className="sg-hud"><span className={`sg-mode${snapshot.tracking ? "" : " sg-track-limited"}`}><i/>{snapshot.tracking ? ar.tracking : ar.scanMore}</span><span><Trophy size={15}/>{digits(game.score)}</span></div>
        {!modal && <>
          <div className="sg-ar-guidance" role="status"><h1>{heading}</h1>{!game.anchor && <p>{ar.scanningHint}</p>}{snapshot.distance > 0 && <small>{snapshot.distance.toLocaleString("fa-IR", { maximumFractionDigits:1 })} {ar.distance}</small>}{game.anchor && ["encounter","playing"].includes(game.phase) && <span className="sg-timer">{digits(seconds)} <small>{copy.seconds}</small></span>}</div>
          {!game.anchor ? <div className="sg-ar-placement"><span className="sg-scan-crosshair" aria-hidden="true">+</span><button className="sg-primary" data-ar-place disabled={!snapshot.surfaceReady || !snapshot.tracking} onClick={() => runtime.current?.place()}><MapPin size={20}/>{snapshot.surfaceReady ? ar.place : ar.scanMore}</button></div> : <>
            {!result && <><span className="sg-world-crosshair" aria-hidden="true">+</span><button className="sg-reposition" onClick={() => runtime.current?.reposition()}><MapPin size={15}/>{ar.reposition}</button></>}
            {playing && <><button data-world-launcher className="sg-world-launcher" aria-label={copy.ball} disabled={!snapshot.tracking || !!game.shot || !game.balls} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); runtime.current?.throw({x:.5,y:.85},{x:.5,y:.55},250); } }}><ArrowUp size={22}/><span className="sg-ball"><span/><i/></span></button><div className="sg-world-ammo"><span>{digits(game.balls)} {copy.balls}</span>{game.feedback !== "none" && <p>{copy[game.feedback]}</p>}</div></>}
            {result && <section className="sg-ar-result" aria-label={game.phase === "caught" ? copy.caught : copy.escaped}><h2>{game.phase === "caught" ? copy.caught : copy.escaped}</h2><p>{game.phase === "caught" ? `${digits(game.score)} ${copy.score}` : `${copy.returning}: ${digits(seconds)}`}</p><button className="sg-primary" onClick={() => runtime.current?.replay()}><RotateCcw size={18}/>{copy.again}</button><small>{copy.rewardNote}</small></section>}
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
          <button className="sg-text-button" onClick={intro}>{ar.back}</button><button className="sg-text-button" onClick={practice}>{ar.practice}</button>
        </div></section>}
      </>}
    </div>
  </main>;
}
