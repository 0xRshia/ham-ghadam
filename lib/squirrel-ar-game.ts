import { type GamePhase, type Point } from "./squirrel-game";

export type Vec3 = { x: number; y: number; z: number };
export type WorldShot = { origin: Vec3; velocity: Vec3; elapsed: number };
export type WorldGame = {
  phase: GamePhase; elapsed: number; playElapsed: number; round: number;
  score: number; catches: number; balls: number; shot: WorldShot | null;
  anchor: Vec3 | null; yaw: number; feedback: "none" | "short" | "miss";
  random: number; routeSeed: number; motionTime: number; encounterDuration: number; returnDelay: number; rest: Vec3;
};
export const worldTiming = { waiting: 3000, entering: 900, playing: 20000, escaping: 800, caught: 2200, encounterMin: 10000, encounterMax: 16000, returnMin: 5000, returnMax: 12000 } as const;
export const gravity = 7.5;
export const distance3 = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const initialWorldGame = (seed = Math.floor(Math.random()*0xffffffff)): WorldGame => ({ phase: "ready", elapsed: 0, playElapsed: 0, round: 0, score: 0, catches: 0, balls: 3, shot: null, anchor: null, yaw: 0, feedback: "none", random: seed >>> 0, routeSeed: seed >>> 0, motionTime: 0, encounterDuration: worldTiming.encounterMin, returnDelay: worldTiming.returnMin, rest: {x:0,y:0,z:0} });
function random(seed: number) { return (Math.imul(seed,1664525)+1013904223) >>> 0; }
function nextRound(state: WorldGame, phase: GamePhase): WorldGame {
  const seed = random(state.random), durationSeed = random(seed), delaySeed = random(durationSeed);
  return { ...state, phase, elapsed:0, playElapsed:0, motionTime:0, round:state.round+1, balls:3, shot:null, feedback:"none", random:delaySeed, routeSeed:seed,
    encounterDuration: worldTiming.encounterMin + durationSeed/0x100000000*(worldTiming.encounterMax-worldTiming.encounterMin),
    returnDelay: worldTiming.returnMin + delaySeed/0x100000000*(worldTiming.returnMax-worldTiming.returnMin), rest:{x:0,y:0,z:0} };
}

export function placeWorldGame(state: WorldGame, anchor: Vec3, yaw: number): WorldGame {
  if (![anchor.x, anchor.y, anchor.z, yaw].every(Number.isFinite)) return state;
  return nextRound({ ...state, anchor: { ...anchor }, yaw }, "waiting");
}

function routePoint(seed: number, index: number) {
  const angle = ((index+8)%8)*Math.PI/4 + (seed%628)/100;
  const radius = .68 + (random(seed+((index+8)%8)*73)%100)/500;
  return {x:Math.sin(angle)*radius, z:Math.cos(angle)*radius*.72};
}
function routePosition(state: WorldGame) {
  const t = state.motionTime/1000, index = Math.floor(t), u = t-index;
  const points = [-1,0,1,2].map(offset => routePoint(state.routeSeed,index+offset));
  const interpolate = (key: "x" | "z") => {
    const [a,b,c,d] = points.map(p=>p[key]);
    return .5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u);
  };
  return {x:interpolate("x"),y:0,z:interpolate("z")};
}
function localSquirrelPosition(state: WorldGame, reducedMotion = false): Vec3 {
  let point = reducedMotion ? {x:0,y:0,z:0} : routePosition(state);
  if (state.phase === "entering") { const p=clamp(state.elapsed/worldTiming.entering,0,1); point = { ...point, x:point.x-(1-p)*1.8 }; }
  if (state.phase === "caught") point = state.rest;
  if (state.phase === "escaping") { const p=clamp(state.elapsed/worldTiming.escaping,0,1); point = {x:state.rest.x+p*(state.routeSeed%2 ? 2 : -2),y:0,z:state.rest.z-p*.3}; }
  return point;
}
export function worldSquirrelPosition(state: WorldGame, reducedMotion = false): Vec3 {
  const anchor = state.anchor ?? { x: 0, y: 0, z: 0 };
  const {x,z} = localSquirrelPosition(state,reducedMotion);
  return { x: anchor.x + x * Math.cos(state.yaw) + z * Math.sin(state.yaw), y: anchor.y, z: anchor.z - x * Math.sin(state.yaw) + z * Math.cos(state.yaw) };
}
export function beginWorldCatch(state: WorldGame): WorldGame {
  return state.phase === "encounter" ? {...state,phase:"playing",elapsed:0,playElapsed:0} : state;
}
function escape(state: WorldGame, reduced: boolean): WorldGame { return {...state,phase:"escaping",elapsed:0,shot:null,rest:localSquirrelPosition(state,reduced)}; }
export function worldSecondsRemaining(state: WorldGame) {
  const duration = state.phase === "waiting" ? worldTiming.waiting : state.phase === "playing" ? worldTiming.playing : state.phase === "encounter" ? state.encounterDuration : state.phase === "escaped" ? state.returnDelay : state.phase === "caught" ? worldTiming.caught : 0;
  return Math.max(0,Math.ceil((duration-state.elapsed)/1000));
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
  if (!tracked || !state.anchor || !Number.isFinite(delta) || delta <= 0 || state.phase === "ready") return state;
  let next = { ...state, elapsed: state.elapsed + delta };
  if (state.phase === "encounter" || state.phase === "playing") {
    // Continue the same path on tap, then smoothly accelerate into fast dodges.
    const speed = state.phase === "playing" ? 1.05+1.7*Math.min(1,state.playElapsed/450) : 1.05;
    next.motionTime += delta*speed;
  }
  if (state.phase === "playing") {
    next.playElapsed += delta;
    if (state.shot) {
      next.shot = { ...state.shot, elapsed: state.shot.elapsed + delta };
      if (sweptHit(worldShotPosition(state.shot), worldShotPosition(next.shot), worldSquirrelPosition(state, reducedMotion), worldSquirrelPosition(next, reducedMotion))) {
        return { ...next, phase: "caught", elapsed: 0, shot: null, rest:localSquirrelPosition(next,reducedMotion), score: state.score + 100 + state.balls * 25, catches: state.catches + 1 };
      }
      if (next.shot.elapsed > 1700 || worldShotPosition(next.shot).y < state.anchor.y - .05) next = { ...next, shot: null, feedback: "miss" };
    }
    if (next.elapsed >= worldTiming.playing || (!next.shot && !next.balls)) return escape(next,reducedMotion);
    return next;
  }
  if (state.phase === "encounter" && next.elapsed >= state.encounterDuration) return escape(next,reducedMotion);
  if (state.phase === "caught" && next.elapsed >= worldTiming.caught) return escape(next,reducedMotion);
  if (state.phase === "escaped" && next.elapsed >= state.returnDelay) return nextRound(next,"entering");
  if (state.phase === "waiting" && next.elapsed >= worldTiming.waiting) return {...next,phase:"entering",elapsed:0};
  if (state.phase === "entering" && next.elapsed >= worldTiming.entering) return {...next,phase:"encounter",elapsed:0};
  if (state.phase === "escaping" && next.elapsed >= worldTiming.escaping) return {...next,phase:"escaped",elapsed:0};
  return next;
}
