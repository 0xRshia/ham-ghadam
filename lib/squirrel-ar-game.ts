import { gameTiming, type GamePhase, type Point } from "./squirrel-game";

export type Vec3 = { x: number; y: number; z: number };
export type WorldShot = { origin: Vec3; velocity: Vec3; elapsed: number };
export type WorldGame = {
  phase: GamePhase; elapsed: number; playElapsed: number; round: number;
  score: number; catches: number; balls: number; shot: WorldShot | null;
  anchor: Vec3 | null; yaw: number; feedback: "none" | "short" | "miss";
};
export const gravity = 7.5;
export const distance3 = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const initialWorldGame = (): WorldGame => ({ phase: "ready", elapsed: 0, playElapsed: 0, round: 0, score: 0, catches: 0, balls: 3, shot: null, anchor: null, yaw: 0, feedback: "none" });

export function placeWorldGame(state: WorldGame, anchor: Vec3, yaw: number): WorldGame {
  if (![anchor.x, anchor.y, anchor.z, yaw].every(Number.isFinite)) return state;
  return { ...state, anchor: { ...anchor }, yaw, phase: "waiting", elapsed: 0, playElapsed: 0, round: state.round + 1, balls: 3, shot: null, feedback: "none" };
}

export function worldSquirrelPosition(state: WorldGame, reducedMotion = false): Vec3 {
  const anchor = state.anchor ?? { x: 0, y: 0, z: 0 };
  let x = 0, z = 0;
  if (state.phase === "entering") x = -.85 * (1 - clamp(state.elapsed / gameTiming.entering, 0, 1));
  if (state.phase === "escaping") x = 1.5 * clamp(state.elapsed / gameTiming.escaping, 0, 1);
  if (state.phase === "playing" && !reducedMotion) { x = .22 * Math.sin(state.playElapsed / 1100); z = .08 * Math.sin(state.playElapsed / 1800); }
  return { x: anchor.x + x * Math.cos(state.yaw) + z * Math.sin(state.yaw), y: anchor.y, z: anchor.z - x * Math.sin(state.yaw) + z * Math.cos(state.yaw) };
}

export function worldShotPosition(shot: WorldShot): Vec3 {
  const t = shot.elapsed / 1000;
  return { x: shot.origin.x + shot.velocity.x * t, y: shot.origin.y + shot.velocity.y * t - .5 * gravity * t * t, z: shot.origin.z + shot.velocity.z * t };
}

// This is a ballistic arc in world coordinates. Moving the camera after release
// cannot change the trajectory or the collision result.
export function ballisticShot(origin: Vec3, destination: Vec3, flightTime: number): WorldShot {
  return { origin: { ...origin }, velocity: { x: (destination.x - origin.x) / flightTime, y: (destination.y - origin.y) / flightTime + .5 * gravity * flightTime, z: (destination.z - origin.z) / flightTime }, elapsed: 0 };
}

export function worldThrowGesture(start: Point, end: Point, duration: number) {
  const rise = start.y - end.y;
  if (![start.x, start.y, end.x, end.y, duration].every(Number.isFinite) || rise < .08 || duration < 20 || duration > 1800) return null;
  return { aimX: clamp(.5 + (end.x - start.x) / rise * .28, -.2, 1.2), range: clamp(1 + rise * 4.4, 1.2, 4.5), flightTime: clamp(.72 - rise / duration * 100, .42, .68) };
}

export function launchWorldBall(state: WorldGame, shot: WorldShot | null): WorldGame {
  if (state.phase !== "playing" || state.shot || state.balls <= 0) return state;
  if (!shot) return { ...state, feedback: "short" };
  return { ...state, shot, balls: state.balls - 1, feedback: "none" };
}

function sweptHit(from: Vec3, to: Vec3, targetFrom: Vec3, targetTo: Vec3) {
  const a = { x: from.x - targetFrom.x, y: from.y - targetFrom.y - .24, z: from.z - targetFrom.z };
  const b = { x: to.x - targetTo.x, y: to.y - targetTo.y - .24, z: to.z - targetTo.z };
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const length = d.x ** 2 + d.y ** 2 + d.z ** 2;
  const t = length ? clamp(-(a.x * d.x + a.y * d.y + a.z * d.z) / length, 0, 1) : 0;
  return Math.hypot(a.x + d.x * t, a.y + d.y * t, a.z + d.z * t) < .19;
}

export function advanceWorldGame(state: WorldGame, delta: number, tracked: boolean, reducedMotion = false): WorldGame {
  if (!tracked || !state.anchor || !Number.isFinite(delta) || delta <= 0 || ["ready", "caught"].includes(state.phase)) return state;
  let next = { ...state, elapsed: state.elapsed + delta };
  if (state.phase === "playing") {
    next.playElapsed += delta;
    if (state.shot) {
      next.shot = { ...state.shot, elapsed: state.shot.elapsed + delta };
      if (sweptHit(worldShotPosition(state.shot), worldShotPosition(next.shot), worldSquirrelPosition(state, reducedMotion), worldSquirrelPosition(next, reducedMotion))) {
        return { ...next, phase: "caught", elapsed: 0, shot: null, score: state.score + 100 + state.balls * 25, catches: state.catches + 1 };
      }
      if (next.shot.elapsed > 1700 || worldShotPosition(next.shot).y < state.anchor.y - .05) next = { ...next, shot: null, feedback: "miss" };
    }
    if (next.elapsed >= gameTiming.playing || (!next.shot && !next.balls)) return { ...next, phase: "escaping", elapsed: 0, shot: null };
    return next;
  }
  if (state.phase === "escaped" && next.elapsed >= gameTiming.escaped) return placeWorldGame(next, state.anchor, state.yaw);
  const transitions: Partial<Record<GamePhase, GamePhase>> = { waiting: "entering", entering: "encounter", encounter: "escaping", escaping: "escaped" };
  const duration = gameTiming[state.phase as keyof typeof gameTiming];
  if (transitions[state.phase] && next.elapsed >= duration) next = { ...next, phase: transitions[state.phase]!, elapsed: 0 };
  return next;
}
