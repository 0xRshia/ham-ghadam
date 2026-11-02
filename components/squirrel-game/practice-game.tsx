"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowUp, Check, Hand, Pause, Play, RotateCcw, Trophy, X } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { advanceGame, beginCatch, gameTiming, initialGame, launchPoint, nextRound, planThrow, shotPosition, squirrelPosition, throwBall, type Point } from "@/lib/squirrel-game";
import { squirrelCopy as copy, squirrelArCopy as ar } from "@/locales/squirrel-fa";
import { Squirrel } from "./squirrel";

const digits = (value: number) => value.toLocaleString("fa-IR");
type Gesture = { pointer: number; start: Point; end: Point; time: number };

function Ball({ small = false }: { small?: boolean }) {
  return <span className={`sg-ball${small ? " sg-ball-small" : ""}`} aria-hidden="true"><span /><i /></span>;
}

export function PracticeGame({ onExit }: { onExit: () => void }) {
  const arenaRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLButtonElement>(null);
  const ballRef = useRef<HTMLButtonElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const replayRef = useRef<HTMLButtonElement>(null);
  const [game, setGame] = useState(() => nextRound(initialGame()));
  const [paused, setPaused] = useState(false);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [keyboardAim, setKeyboardAim] = useState(0);
  const reducedMotion = useReducedMotion();
  const suspended = paused;
  const active = true;
  const gamePlaying = game.phase === "playing";
  const caught = game.phase === "caught";
  const result = game.phase === "caught" || game.phase === "escaped";

  const clearGesture = useCallback(() => { gestureRef.current = null; setGesture(null); }, []);

  useEffect(() => {
    if (!active || suspended || caught) return;
    let frame = 0, last = performance.now();
    const tick = (now: number) => {
      if (now - last >= 30) {
        const delta = Math.min(now - last, 64);
        last = now;
        setGame(state => advanceGame(state, delta, reducedMotion));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, suspended, reducedMotion, caught]);

  useEffect(() => {
    const hide = () => {
      if (document.hidden) { setPaused(true); clearGesture(); }
    };
    const leave = () => { setPaused(true); clearGesture(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    window.addEventListener("resize", clearGesture);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("resize", clearGesture);
    };
  }, [clearGesture]);

  useEffect(() => {
    if (!active) return;
    if (suspended) resumeRef.current?.focus({ preventScroll: true });
    else if (game.phase === "encounter") targetRef.current?.focus({ preventScroll: true });
    else if (game.phase === "playing") ballRef.current?.focus({ preventScroll: true });
    else if (game.phase === "caught" || game.phase === "escaped") replayRef.current?.focus({ preventScroll: true });
  }, [active, suspended, game.phase]);

  function pause() {
    setPaused(true);
    clearGesture();
  }

  function replay() { clearGesture(); setKeyboardAim(0); setGame(state => nextRound(state)); }

  function point(event: PointerEvent): Point {
    const rect = arenaRef.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!gamePlaying || game.shot || suspended || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (!(event.target instanceof Element) || !event.target.closest("[data-launcher]")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event);
    const next = { pointer: event.pointerId, start: p, end: p, time: performance.now() };
    gestureRef.current = next;
    setGesture(next);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (gestureRef.current?.pointer !== event.pointerId) return;
    const next = { ...gestureRef.current, end: point(event) };
    gestureRef.current = next;
    setGesture(next);
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = gestureRef.current;
    if (!current || current.pointer !== event.pointerId) return;
    clearGesture();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!suspended) setGame(state => throwBall(state, planThrow(current.start, point(event), performance.now() - current.time)));
  }

  const target = squirrelPosition(game, reducedMotion);
  const projectile = game.shot && shotPosition(game.shot);
  const preview = gesture && planThrow(gesture.start, gesture.end, 250);
  const previewPoints = preview && Array.from({ length: 18 }, (_, i) => shotPosition({ ...preview, elapsed: preview.duration * i / 17 }));
  const remaining = gamePlaying ? Math.max(0, Math.ceil((gameTiming.playing - game.elapsed) / 1000)) : Math.max(0, Math.ceil((gameTiming.encounter - game.elapsed) / 1000));
  const returning = Math.max(0, Math.ceil((gameTiming.escaped - game.elapsed) / 1000));
  const visibleSquirrel = ["entering", "encounter", "playing", "escaping"].includes(game.phase);
  const headline = game.phase === "waiting" ? copy.waiting : game.phase === "entering" ? copy.entering : game.phase === "encounter" ? copy.encounter : gamePlaying ? copy.playing : game.phase === "escaping" ? copy.escaping : "";
  const announced = game.phase === "caught" ? copy.caught : game.phase === "escaped" ? copy.escaped : headline;

  return <main className={`sg-game${active ? " sg-active" : ""}${suspended ? " sg-suspended" : ""}`} data-game-phase={game.phase} data-mode="practice" dir="rtl">
    <div className="sg-viewport">
      <div className="sg-scenery" aria-hidden="true"><div className="sg-window" /><div className="sg-sun" /><div className="sg-hill sg-hill-back" /><div className="sg-hill" /><div className="sg-leaf sg-leaf-one" /><div className="sg-leaf sg-leaf-two" /><div className="sg-dots" /></div>
      <div className="sg-camera-shade" aria-hidden="true" />
      <header className="sg-header">
        <AppLink href="/" className="sg-icon-button" aria-label={copy.close}><X size={21} /></AppLink>
        <span className="sg-brand"><img src="/brand/hamghadam-wordmark.svg" alt={copy.name} width="82" height="34" /></span>
        {active ? <button className="sg-icon-button" type="button" aria-label={copy.pause} onClick={pause} disabled={suspended}><Pause size={19} /></button> : <span className="sg-header-tag">{copy.prototype}</span>}
      </header>

      <>
        <div className="sg-hud"><span className="sg-mode"><i />{ar.practiceLabel}</span><span>{copy.round} <b>{digits(game.round)}</b></span><span><Trophy size={15} /> <b>{digits(game.score)}</b></span></div>
        <div className="sg-game-heading" aria-hidden="true"><h1>{headline}</h1>{(game.phase === "encounter" || gamePlaying) && <span className="sg-timer">{digits(remaining)} <small>{copy.seconds}</small></span>}{game.phase === "waiting" && <p>{copy.waitingHint}</p>}</div>
        <div className="sg-arena" ref={arenaRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={clearGesture} onLostPointerCapture={clearGesture}>
          {game.phase === "waiting" && <div className="sg-wait-pulse" aria-hidden="true"><span /><span /><span /></div>}
          {visibleSquirrel && <button ref={targetRef} className={`sg-target sg-target-${game.phase}`} type="button" disabled={game.phase !== "encounter" || suspended} style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }} onClick={() => setGame(state => beginCatch(state))} aria-label={copy.tap}>
            <div className="sg-target-art"><Squirrel pose={game.phase === "entering" || game.phase === "escaping" ? "run" : game.phase === "encounter" ? "wave" : "idle"} /></div>
            {game.phase === "encounter" && <span className="sg-target-label"><Hand size={16} />{copy.tap}</span>}
            {gamePlaying && <span className="sg-target-ring" aria-hidden="true" />}
          </button>}
          {gamePlaying && <>
            <svg className="sg-aim" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {previewPoints ? <polyline points={previewPoints.map(p => `${p.x * 100},${p.y * 100}`).join(" ")} fill="none" stroke="white" strokeWidth=".65" strokeDasharray="1 2" strokeLinecap="round" /> : !game.shot && <path d={`M50 83L${50 + keyboardAim * 100} 56`} stroke="white" opacity=".55" strokeWidth=".6" strokeDasharray="1 2" />}
            </svg>
            {projectile && game.shot ? <div className="sg-projectile" style={{ left: `${projectile.x * 100}%`, top: `${projectile.y * 100}%`, scale: 1 - Math.min(1, game.shot.elapsed / game.shot.duration) * 0.48 }}><Ball /></div> : <button ref={ballRef} type="button" data-launcher className="sg-launcher" aria-label={copy.ball} disabled={suspended || game.balls === 0} style={{ left: `${launchPoint.x * 100}%`, top: `${launchPoint.y * 100}%` }} onClick={event => {
              if (event.detail === 0 && !suspended) setGame(state => throwBall(state, planThrow(launchPoint, { x: 0.5 + keyboardAim, y: 0.55 }, 240)));
            }} onKeyDown={event => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setKeyboardAim(aim => Math.max(-0.35, Math.min(0.35, aim + (event.key === "ArrowLeft" ? -0.05 : 0.05)))); }
            }}><span className="sg-launcher-halo" /><Ball /><ArrowUp className="sg-launcher-arrow" size={22} /></button>}
          </>}
        </div>
        {!result && <footer className="sg-game-footer">{gamePlaying ? <><div className="sg-ammo" aria-label={`${copy.balls}: ${digits(game.balls)}`}>{[0, 1, 2].map(index => <span className={index < game.balls ? "" : "sg-spent"} key={index}><Ball small /></span>)}</div><p>{game.feedback !== "none" ? copy[game.feedback] : copy.throwHint}</p><small className="sg-keyboard-hint">{copy.keyboardHint}</small></> : <p>{copy.stepFindHint}</p>}</footer>}
        {result && <section className={`sg-result ${game.phase === "caught" ? "sg-win" : ""}`} aria-labelledby="sg-result-title">
          <div className="sg-result-art"><Squirrel pose={game.phase === "caught" ? "caught" : "idle"} />{game.phase === "caught" && <span className="sg-success-seal"><Check size={24} /></span>}</div>
          <span className="sg-eyebrow">{game.phase === "caught" ? copy.stepCatch : copy.name}</span>
          <h2 id="sg-result-title">{game.phase === "caught" ? copy.caught : copy.escaped}</h2>
          <p>{game.phase === "caught" ? copy.caughtHint : copy.escapedHint}</p>
          {game.phase === "caught" ? <div className="sg-result-score"><span><strong>{digits(game.score)}</strong>{copy.score}</span><span><strong>{digits(game.catches)}</strong>{copy.catches}</span></div> : <p className="sg-returning">{copy.returning}: {digits(returning)} {copy.seconds}</p>}
          <button ref={replayRef} className="sg-primary" type="button" onClick={replay} disabled={suspended}><RotateCcw size={18} />{copy.again}</button>
          <small>{copy.rewardNote}</small>
        </section>}
        {suspended && <section className="sg-pause" role="dialog" aria-modal="true" aria-labelledby="sg-pause-title" onKeyDown={event => {
          if (event.key === "Tab") {
            const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}><div className="sg-pause-card"><span className="sg-pause-icon"><Pause size={28} /></span><h2 id="sg-pause-title">{copy.paused}</h2><p>{copy.pausedHint}</p><button ref={resumeRef} className="sg-primary" type="button" onClick={() => setPaused(false)}><Play size={18} />{copy.resume}</button><button className="sg-text-button" type="button" onClick={onExit}>{ar.back}</button></div></section>}
      </>
      <p className="sg-sr-only" role="status" aria-live="polite" aria-atomic="true">{active ? suspended ? copy.paused : announced : ""}</p>
    </div>
  </main>;
}
