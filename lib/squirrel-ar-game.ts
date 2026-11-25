import { type GamePhase, type Point } from "./squirrel-game";

export type Vec3 = { x: number; y: number; z: number };
export type MovementZone = { x: number; z: number };
export type HitSphere = { center: Vec3; radius: number };
export type WorldShot = { origin: Vec3; velocity: Vec3; elapsed: number };
export type WorldGame = {
  phase: GamePhase; elapsed: number; round: number;
  score: number; catches: number; balls: number; shot: WorldShot | null;
  anchor: Vec3 | null; yaw: number; zone: MovementZone; feedback: "none" | "short" | "miss";
  random: number; routeSeed: number; motionTime: number; encounterDuration: number; returnDelay: number; rest: Vec3;
};
export const worldTiming = { waiting: 3000, entering: 900, playing: 20000, escaping: 800, caught: 2200, encounterMin: 10000, encounterMax: 16000, returnMin: 5000, returnMax: 12000 } as const;
export const encounterRoutine = { walkEnd:3000, restStart:4200, restEnd:9200, resumeWalk:10000 } as const;
const movement = { walkRate: 1.75, runRate: 4.25 } as const;
export function worldEncounterActivity(state: Pick<WorldGame,"elapsed" | "round">) {
  if (state.elapsed < encounterRoutine.walkEnd || state.elapsed >= encounterRoutine.resumeWalk) return "walk";
  if (state.elapsed < encounterRoutine.restStart || state.elapsed >= encounterRoutine.restEnd) return "idle";
  return (["sit","legsOut","sleepCurled","sleepFlat"] as const)[Math.max(0,state.round-1)%4];
}
// Integrate only the walking portions, including frames crossing a boundary.
// Resting/sleeping never slides the feet along the world-space route.
function encounterWalkTime(elapsed: number) {
  return Math.min(elapsed,encounterRoutine.walkEnd)+Math.max(0,elapsed-encounterRoutine.resumeWalk);
}
export const gravity = 7.5;
export const worldBallRadius = .045;
export const maxMovementZone: MovementZone = { x: .88, z: .63 };
export const distance3 = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const initialWorldGame = (seed = Math.floor(Math.random()*0xffffffff)): WorldGame => ({ phase: "ready", elapsed: 0, round: 0, score: 0, catches: 0, balls: 3, shot: null, anchor: null, yaw: 0, zone: maxMovementZone, feedback: "none", random: seed >>> 0, routeSeed: seed >>> 0, motionTime: 0, encounterDuration: worldTiming.encounterMin, returnDelay: worldTiming.returnMin, rest: {x:0,y:0,z:0} });
function random(seed: number) { return (Math.imul(seed,1664525)+1013904223) >>> 0; }
function nextRound(state: WorldGame, phase: GamePhase): WorldGame {
  const seed = random(state.random), durationSeed = random(seed), delaySeed = random(durationSeed);
  return { ...state, phase, elapsed:0, motionTime:0, round:state.round+1, balls:3, shot:null, feedback:"none", random:delaySeed, routeSeed:seed,
    encounterDuration: worldTiming.encounterMin + durationSeed/0x100000000*(worldTiming.encounterMax-worldTiming.encounterMin),
    returnDelay: worldTiming.returnMin + delaySeed/0x100000000*(worldTiming.returnMax-worldTiming.returnMin), rest:{x:0,y:0,z:0} };
}

export function placeWorldGame(state: WorldGame, anchor: Vec3, yaw: number, zone = maxMovementZone): WorldGame {
  if (![anchor.x, anchor.y, anchor.z, yaw, zone.x, zone.z].every(Number.isFinite)) return state;
  return nextRound({ ...state, anchor: { ...anchor }, yaw, zone: {
    x: clamp(zone.x, 0, maxMovementZone.x), z: clamp(zone.z, 0, maxMovementZone.z),
  } }, "waiting");
}

// Find a rectangle centered on the anchor. The predicate projects the model's
// footprint at each corner, so the same world-space zone works for every round.
export function fitMovementZone(fits: (x: number, z: number) => boolean): MovementZone {
  const rectangleFits = (x: number, z: number) => [-x, x].every(a => [-z, z].every(b => fits(a, b)));
  if (!rectangleFits(0, 0)) return { x: 0, z: 0 };
  const largest = (limit: number, valid: (n: number) => boolean) => {
    if (valid(limit)) return limit;
    let lower = 0, upper = limit;
    for (let i = 0; i < 9; i++) {
      const middle = (lower + upper) / 2;
      if (valid(middle)) lower = middle;
      else upper = middle;
    }
    return lower;
  };
  const maxWidth = largest(maxMovementZone.x, x => rectangleFits(x, 0));
  const z = largest(maxMovementZone.z, z => rectangleFits(maxWidth * .75, z));
  const x = largest(maxWidth, x => rectangleFits(x, z));
  return { x, z };
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
  if (state.phase === "caught" || (state.phase === "escaping" && reducedMotion)) return state.rest;
  if (reducedMotion) return { x: 0, y: 0, z: 0 };
  const route = routePosition(state);
  let point = { x: clamp(route.x / maxMovementZone.x, -1, 1) * state.zone.x,
    y: 0, z: clamp(route.z / maxMovementZone.z, -1, 1) * state.zone.z };
  if (state.phase === "entering") {
    const progress = clamp(state.elapsed / worldTiming.entering, 0, 1);
    point.x = -state.zone.x + progress * (point.x + state.zone.x);
  }
  if (state.phase === "escaping") {
    const progress = clamp(state.elapsed / worldTiming.escaping, 0, 1);
    const edge = state.routeSeed % 2 ? state.zone.x : -state.zone.x;
    point = { x: state.rest.x + progress * (edge - state.rest.x), y: 0, z: state.rest.z };
  }
  return point;
}
export function worldSquirrelPosition(state: WorldGame, reducedMotion = false): Vec3 {
  const anchor = state.anchor ?? { x: 0, y: 0, z: 0 };
  const {x,z} = localSquirrelPosition(state,reducedMotion);
  return { x: anchor.x + x * Math.cos(state.yaw) + z * Math.sin(state.yaw), y: anchor.y, z: anchor.z - x * Math.sin(state.yaw) + z * Math.cos(state.yaw) };
}
export function beginWorldCatch(state: WorldGame): WorldGame {
  return state.phase === "encounter" ? { ...state, phase: "playing", elapsed: 0 } : state;
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
  return { aimX: end.x, aimY: end.y, flightTime: .55 - clamp((rise - .08) / .55, 0, 1) * .22 };
}

export function launchWorldBall(state: WorldGame, shot: WorldShot | null): WorldGame {
  if (state.phase !== "playing" || state.shot || state.balls <= 0) return state;
  if (!shot) return { ...state, feedback: "short" };
  return { ...state, shot, balls: state.balls - 1, feedback: "none" };
}

export function sweptBallHit(from: Vec3, to: Vec3, targetFrom: HitSphere, targetTo: Vec3) {
  const center = targetFrom.center;
  const a = { x: from.x - center.x, y: from.y - center.y, z: from.z - center.z };
  const b = { x: to.x - targetTo.x, y: to.y - targetTo.y, z: to.z - targetTo.z };
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const length = d.x ** 2 + d.y ** 2 + d.z ** 2;
  const t = length ? clamp(-(a.x * d.x + a.y * d.y + a.z * d.z) / length, 0, 1) : 0;
  return Math.hypot(a.x + d.x * t, a.y + d.y * t, a.z + d.z * t) <= targetFrom.radius + worldBallRadius;
}

type BallContact = (from: Vec3, to: Vec3, next: WorldGame) => boolean;

export function advanceWorldGame(state: WorldGame, delta: number, tracked: boolean, reducedMotion = false, contact?: BallContact): WorldGame {
  if (!tracked || !state.anchor || !Number.isFinite(delta) || delta <= 0 || state.phase === "ready") return state;
  let next = { ...state, elapsed: state.elapsed + delta };
  if (state.phase === "encounter") {
    next.motionTime += (encounterWalkTime(next.elapsed) - encounterWalkTime(state.elapsed)) * movement.walkRate;
  }
  if (state.phase === "playing") {
    next.motionTime += delta * movement.runRate;
    if (state.shot) {
      next.shot = { ...state.shot, elapsed: state.shot.elapsed + delta };
      const from = worldShotPosition(state.shot), to = worldShotPosition(next.shot);
      const hit = contact ? contact(from, to, next) : fallbackContact(from, to, state, next, reducedMotion);
      if (hit) {
        return { ...next, phase: "caught", elapsed: 0, shot: null, rest:localSquirrelPosition(next,reducedMotion), score: state.score + 100 + state.balls * 25, catches: state.catches + 1 };
      }
      if (next.shot.elapsed > 1700 || to.y < state.anchor.y - worldBallRadius) next = { ...next, shot: null, feedback: "miss" };
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

function fallbackContact(from: Vec3, to: Vec3, previous: WorldGame, next: WorldGame, reducedMotion: boolean) {
  const start = worldSquirrelPosition(previous, reducedMotion), end = worldSquirrelPosition(next, reducedMotion);
  return [[.1, .10], [.24, .13], [.40, .15]].some(([height, radius]) =>
    sweptBallHit(from, to, { center: { ...start, y: start.y + height }, radius }, { ...end, y: end.y + height }));
}
