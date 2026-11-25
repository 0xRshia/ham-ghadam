"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import Image from "next/image";
import { ArrowUp, LoaderCircle, MapPin, Pause, RotateCcw, ScanLine, SwitchCamera, Trophy } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { squirrelCopy as copy, squirrelArCopy as ar, squirrelWalletRewardCopy as rewardCopy } from "@/locales/squirrel-fa";
import { api, ClientError } from "@/lib/client";
import { type Point } from "@/lib/squirrel-game";
import { currentWorldMovementVersion, initialWorldGame, squirrelMovementVersionHeader, worldSecondsRemaining, type WorldMovementVersion } from "@/lib/squirrel-ar-game";
import { squirrelRewardCreditHeader, squirrelRewardCreditMode, type SquirrelRewardCredit } from "@/lib/squirrel-reward-credit";
import type { ArRuntime, ArSnapshot, SquirrelCharacter } from "@/lib/squirrel-ar-runtime";
import { prepareArCamera, type ArCamera } from "@/lib/squirrel-ar-camera";
import { PracticeGame } from "./practice-game";
import { GameExitLink } from "./game-exit-link";
import { GameBrand } from "./game-brand";
import { WalletReward, type WalletRewardState } from "./wallet-reward";

const digits = (n: number) => n.toLocaleString("fa-IR");
type Status = "idle" | "loading" | "scanning" | "running" | "paused" | "error";
type Gesture = { pointer: number; start: Point; end: Point; time: number };
type MotionPermission = { requestPermission?: () => Promise<string> };
type RewardSession = { id: string; seed: number; expiresAt: number; movementVersion: WorldMovementVersion; reward?: SquirrelRewardCredit };
type RewardClaim = { sessionId: string; proof: NonNullable<ArSnapshot["rewardProof"]> };
type RewardClaimResponse = { reward: SquirrelRewardCredit } | { continueHref: string };
type RewardSessionResponse = { status: "ready"; session: RewardSession } | { status: "signIn" } | null;

// iOS requires these requests to begin inside the actual tap handler, before
// downloading the engine. No camera or motion permission is requested on load.
function motionPermission() {
  const requests = [window.DeviceMotionEvent, window.DeviceOrientationEvent].map(constructor => {
    const permission = constructor as unknown as MotionPermission | undefined;
    return permission?.requestPermission?.().then(result => { if (result !== "granted") throw new Error("motion"); });
  });
  return Promise.all(requests);
}

async function requestRewardSession(): Promise<RewardSessionResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch("/game/reward/session", {
      method: "POST", cache: "no-store", signal: controller.signal,
      headers: {
        [squirrelMovementVersionHeader]: String(currentWorldMovementVersion),
        [squirrelRewardCreditHeader]: squirrelRewardCreditMode,
      },
    });
    if (response.status === 401) return { status: "signIn" };
    if (!response.ok) return null;
    const session = await response.json() as RewardSession;
    // During an app rollout a legacy server can ignore the new header.
    if (session.movementVersion !== currentWorldMovementVersion || "coupon" in session) return null;
    return { status: "ready", session };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function ArGame({ homeHref }: { homeHref: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const runtime = useRef<ArRuntime | null>(null);
  const generation = useRef(0);
  const cameraRequest = useRef<AbortController | null>(null);
  const selectedCamera = useRef<string | undefined>(undefined);
  const gesture = useRef<Gesture | null>(null);
  const lastGame = useRef(initialWorldGame());
  const rewardSession = useRef<RewardSession | null>(null);
  const rewardSessionRequest = useRef<Promise<RewardSessionResponse> | null>(null);
  const rewardClaim = useRef<RewardClaim | null>(null);
  const claimingReward = useRef(false);
  const rewardSignIn = useRef<"required" | "prompted" | null>(null);
  const [view, setView] = useState<"intro" | "ar" | "practice">("intro");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<ArCamera[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [manualDepth, setManualDepth] = useState(2.4);
  const [snapshot, setSnapshot] = useState<ArSnapshot>({ game: initialWorldGame(), started: false, tracking: false, surfaceReady: false, needsRoom: false, floorProgress:0, character:"3d", manual: false, scanSeconds: 0, trackingReason: "INITIALIZING", offscreen: false, distance: 0 });
  const [reward, setReward] = useState<WalletRewardState | null>(null);
  const [rewardOpen, setRewardOpen] = useState(false);
  const rewardLoginHref = `${homeHref}login?next=${encodeURIComponent("/game")}`;
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

  async function beginRewardSession() {
    if (rewardSession.current && (rewardSession.current.reward || rewardSession.current.expiresAt > Date.now())) return;
    const request = rewardSessionRequest.current ??= requestRewardSession();
    const result = await request;
    if (rewardSessionRequest.current !== request) return;
    rewardSessionRequest.current = null;
    if (!result) return;
    rewardClaim.current = null;
    setRewardOpen(false);
    if (result.status === "signIn") {
      rewardSession.current = null;
      rewardSignIn.current ??= "required";
      setReward({ status: "signIn", href: rewardLoginHref });
      return;
    }
    const session = result.session;
    rewardSignIn.current = null;
    rewardSession.current = session;
    lastGame.current = initialWorldGame(session.seed, session.movementVersion);
    setReward(session.reward ? { status: "received", credit: session.reward } : null);
  }

  async function claimReward() {
    const claim = rewardClaim.current;
    if (!claim || claimingReward.current) return;
    claimingReward.current = true;
    setReward({ status: "loading" });
    try {
      const result = await api<RewardClaimResponse>("/game/reward/claim", claim);
      if (rewardClaim.current !== claim) return;
      if ("reward" in result) {
        if (rewardSession.current) rewardSession.current = { ...rewardSession.current, reward: result.reward };
        setReward({ status: "received", credit: result.reward });
      } else if (typeof result.continueHref === "string") {
        setReward({ status: "continue", href: result.continueHref });
      } else {
        setReward({ status: "failed", error: rewardCopy.failed, retryable: false });
      }
    } catch (cause) {
      if (rewardClaim.current !== claim) return;
      const status = cause instanceof ClientError ? cause.status : 0;
      if (status === 401) {
        rewardSession.current = null;
        rewardClaim.current = null;
        rewardSignIn.current = "prompted";
        setReward({ status: "signIn", href: rewardLoginHref });
        return;
      }
      if (status === 410 && rewardSession.current) rewardSession.current.expiresAt = 0;
      setReward({
        status: "failed",
        error: cause instanceof ClientError ? cause.message : rewardCopy.failed,
        retryable: status === 0 || status === 408 || status === 429 || status >= 500,
      });
    } finally {
      claimingReward.current = false;
    }
  }

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
      const initialization = Promise.all([import("@/lib/squirrel-ar-runtime"), motionPermission()]);
      const rewardReady = beginRewardSession();
      const [library] = await initialization;
      const xr = await library.loadArEngine();
      if (current !== generation.current || !canvas.current) return;
      if (!xr.XrDevice.isDeviceBrowserCompatible({ allowedDevices: xr.XrConfig.device().MOBILE })) throw new Error("unsupported");
      const choice = await prepareArCamera(preferred, request.signal);
      if (current !== generation.current || !canvas.current) return;
      selectedCamera.current = choice.selected.deviceId; setCameraId(choice.selected.deviceId); setCameras(choice.cameras);
      character=await library.loadSquirrelCharacter(request.signal);
      await rewardReady;
      if (current !== generation.current || !canvas.current) {character.dispose();return;}
      runtime.current = library.createArRuntime(xr, canvas.current, {
        reducedMotion, cameraId: choice.selected.deviceId, character, previous: lastGame.current,
        rewardSeed: rewardSession.current?.seed,
        onChange(next) {
          if (current !== generation.current) return;
          const caught = next.game.phase === "caught" && next.game.catches > lastGame.current.catches;
          lastGame.current = next.game;
          setSnapshot(next);
          setStatus(next.game.anchor ? "running" : "scanning");
          if (caught && rewardSignIn.current === "required") {
            rewardSignIn.current = "prompted";
            setRewardOpen(true);
          } else if (caught && next.rewardProof && rewardSession.current && !rewardSession.current.reward && !rewardClaim.current) {
            rewardClaim.current = { sessionId: rewardSession.current.id, proof: next.rewardProof };
            setRewardOpen(true);
            if (rewardSession.current.expiresAt <= Date.now()) {
              setReward({ status: "failed", error: rewardCopy.expired, retryable: false });
            } else void claimReward();
          }
        },
        onError: failed,
      });
      character=null; // Ownership transfers to the AR session.
    } catch (cause) { character?.dispose(); failed(cause instanceof DOMException && cause.name === "NotAllowedError" ? "permission" : cause instanceof Error ? cause.message : "camera"); }
  }
  function intro() { stop(); setView("intro"); setStatus("idle"); setError(null); setRewardOpen(false); }
  function practice() { stop(); setView("practice"); setStatus("idle"); setRewardOpen(false); }
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

  if (view === "practice") return <PracticeGame onExit={intro} homeHref={homeHref} />;
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

  return <main className={`sg-game${active ? " sg-active sg-world" : " sg-welcome"}`} dir="rtl" data-ar-status={status} data-tracking={snapshot.tracking ? "normal" : "limited"} data-game-phase={active ? game.phase : "ready"} data-character={snapshot.character} data-round={game.round} data-mode={active ? "ar" : "intro"}>
    <div className="sg-viewport" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}>
      <canvas ref={canvas} className="sg-ar-canvas" hidden={!active} aria-label={ar.title} tabIndex={active ? 0 : -1} onKeyDown={event => { if (event.key === "Enter") runtime.current?.tap({ x:.5,y:.5 }); }} />
      <header className="sg-header">
        <GameExitLink href={homeHref} onExit={stop} tabIndex={modal ? -1 : undefined} />
        {active && <>
          <GameBrand />
          <button className="sg-icon-button" aria-label={copy.pause} onClick={pause} disabled={modal}><Pause size={18} aria-hidden="true" /></button>
        </>}
      </header>
      {!active ? <section className="sg-welcome-content">
        <div className="sg-welcome-story">
          <div className="sg-welcome-mascot">
            <Image src="/game/mascot/fandogh-welcome.png" width={2048} height={2732} alt="" fetchPriority="high" unoptimized />
          </div>
          <div className="sg-welcome-copy"><h1>{ar.title}</h1><p>{ar.intro}</p></div>
        </div>
        <div className="sg-welcome-actions">
          <button className="el-button el-button-primary" onClick={() => void start()}>{ar.start}</button>
          <button className="el-button el-button-secondary" onClick={practice}>{ar.practice}</button>
          <a className="sg-license" href="/game/vendor/xr/LICENSE" target="_blank" rel="noreferrer">{ar.engine} · © 2026 Niantic Spatial</a>
        </div>
      </section> : <>
        <div className="sg-hud"><span className={`sg-mode${snapshot.tracking ? "" : " sg-track-limited"}`}><i/>{snapshot.tracking ? ar.tracking : ar.scanMore}</span><span><Trophy size={15}/>{digits(game.score)}{game.round > 0 && <small> · {copy.round} {digits(game.round)}</small>}</span></div>
        {!modal && <>
          {cameraPicker}
          {reward && <WalletReward state={reward} open={rewardOpen} onOpen={() => setRewardOpen(true)} onClose={() => setRewardOpen(false)} onRetry={() => void claimReward()} onNavigate={stop} />}
          {!result && <div className="sg-ar-guidance" role="status"><h1>{heading}</h1>{!game.anchor && <p>{scanStalled ? ar.scanStalledHint : snapshot.needsRoom ? ar.needsRoom : snapshot.manual ? ar.manualHint : snapshot.tracking ? ar.surfaceHint : ar.scanningHint}</p>}{game.anchor && ["waiting","encounter","playing"].includes(game.phase) && <span className="sg-timer">{digits(seconds)} <small>{copy.seconds}</small></span>}</div>}
          {!game.anchor ? <div className="sg-ar-placement"><span className="sg-scan-crosshair" aria-hidden="true">+</span><div className="sg-ar-place-controls">
            {scanStalled && <div className="sg-ar-recovery" role="alert"><p>{ar.scanRecovery}</p><button className="el-button el-button-secondary" onClick={() => void start()}><RotateCcw size={17}/>{ar.restartTracking}</button></div>}
            {snapshot.tracking && <>
              {snapshot.manual && <label className="sg-ar-depth"><span>{ar.manualDepth}</span><input aria-label={ar.manualDepth} type="range" min="0.7" max="3" step="0.1" value={manualDepth} onChange={event => { const depth=Number(event.target.value); setManualDepth(depth); runtime.current?.manualPlacement(depth); }}/><span>{ar.near} ↔ {ar.far}</span></label>}
              <button className="sg-text-button" onClick={() => runtime.current?.manualPlacement(snapshot.manual ? null : manualDepth)}>{snapshot.manual ? ar.automaticPlacement : ar.manualPlacement}</button>
            </>}
            {snapshot.manual ? <button className="el-button el-button-primary" data-ar-place disabled={!snapshot.surfaceReady || !snapshot.tracking} onClick={() => runtime.current?.place()}><MapPin size={20}/>{ar.place}</button> : <div className="sg-ar-auto" data-ar-auto><ScanLine size={20}/><span>{snapshot.tracking ? ar.autoPlace : ar.startTracking}</span><progress aria-label={ar.floorChecking} max={1} value={snapshot.floorProgress}/></div>}
          </div></div> : <>
            {!result && <><span className="sg-world-crosshair" aria-hidden="true">+</span><button className="sg-reposition" onClick={() => runtime.current?.reposition()}><MapPin size={15}/>{ar.reposition}</button></>}
            {playing && <><button data-world-launcher className="sg-world-launcher" aria-label={copy.ball} disabled={!snapshot.tracking || !!game.shot || !game.balls} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); runtime.current?.throw({x:.5,y:.85},{x:.5,y:.55},250); } }}><ArrowUp size={22}/><span className="sg-ball"><span/><i/></span></button><div className="sg-world-ammo"><span>{digits(game.balls)} {copy.balls}</span>{game.feedback !== "none" && <p>{copy[game.feedback]}</p>}</div></>}
            {result && <section className="sg-ar-result" aria-label={game.phase === "caught" ? copy.caught : copy.escaped}><h2>{game.phase === "caught" ? copy.caught : copy.escaped}</h2>
              <p>{game.phase === "caught" ? `${digits(game.score)} ${copy.score}` : copy.returning}</p>
              {game.phase === "escaped" && <span className="sg-return-count" aria-label={`${digits(seconds)} ${copy.seconds}`}>{digits(seconds)}</span>}
            </section>}
          </>}
          {!snapshot.tracking && !!game.anchor && <section className="sg-tracking-lost" role="alert"><ScanLine size={25}/><strong>{ar.lost}</strong><p>{ar.lostHint}</p></section>}
        </>}
        {modal && <section ref={dialog} className={`sg-pause${status === "loading" ? " sg-ar-loading" : ""}`} role="dialog" aria-modal="true" aria-labelledby="sg-ar-dialog" onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); intro(); }
          if (event.key !== "Tab") return;
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
          const first = controls[0], last = controls[controls.length-1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}><div className="sg-pause-card">
          {status === "loading" ? <><div role="status"><LoaderCircle className="sg-spin" size={26} aria-hidden="true" /><h2 id="sg-ar-dialog">{ar.loading}</h2><p>{ar.loadingHint}</p></div></> : <><h2 id="sg-ar-dialog">{status === "paused" ? copy.paused : copy.retry}</h2><p role={error ? "alert" : undefined}>{error ?? ar.pausedHint}</p><button className="el-button el-button-primary" onClick={() => void start()}>{status === "paused" ? ar.resume : copy.retry}</button></>}
          {status === "error" && cameras.length > 1 && cameraPicker}
          <button className="sg-text-button" onClick={intro}>{ar.back}</button><button className="sg-text-button" onClick={practice}>{ar.practice}</button>
        </div></section>}
      </>}
    </div>
  </main>;
}
