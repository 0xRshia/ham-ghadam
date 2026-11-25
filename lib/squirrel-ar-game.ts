import { squirrelZigzag, type GamePhase, type Point } from "./squirrel-game";

export type Vec3 = { x: number; y: number; z: number };
export type MovementZone = { x: number; z: number; centerX?: number; centerZ?: number };
export type HitSphere = { center: Vec3; radius: number };
export type WorldShot = { origin: Vec3; velocity: Vec3; elapsed: number };
export type WorldMovementVersion = 1 | 2 | 3 | 4;
export const currentWorldMovementVersion = 4;
export const squirrelPlacementScales: readonly number[] = [1, .9, .8, .7, .6, .55, .5, .45, .4, .35];
export const squirrelMovementVersionHeader = "X-Hamghadam-Squirrel-Version";
export type WorldGame = {
  phase: GamePhase; elapsed: number; round: number;
  score: number; catches: number; balls: number; shot: WorldShot | null;
  anchor: Vec3 | null; yaw: number; zone: MovementZone; feedback: "none" | "short" | "miss";
  random: number; routeSeed: number; movementVersion: WorldMovementVersion; motionTime: number;
  encounterDuration: number; returnDelay: number; rest: Vec3;
};
export const worldTiming = { waiting: 3000, entering: 900, playing: 20000, escaping: 800, caught: 2200, encounterMin: 10000, encounterMax: 16000, returnMin: 5000, returnMax: 12000 } as const;
export const encounterRoutine = { walkEnd:3000, restStart:4200, restEnd:9200, resumeWalk:10000 } as const;
const walkRate: Record<WorldMovementVersion, number> = {1:1.75, 2:1.75, 3:1.75, 4:3.9};
const runRate: Record<WorldMovementVersion, number> = { 1: 4.25, 2: 4.65, 3: 6.35, 4: 6.8 };
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
const originalMaxZone = { x: .88, z: .63 };
export const maxMovementZone = { x: 1.65, z: 1.25 };
export const minChaseZone: MovementZone = { x: .16, z: .12 };
export function movementZoneLimit(version: WorldMovementVersion) {
  return version < 4 ? originalMaxZone : maxMovementZone;
}
export const distance3 = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const initialWorldGame = (
  seed = Math.floor(Math.random()*0xffffffff), movementVersion: WorldMovementVersion = currentWorldMovementVersion,
): WorldGame => ({ phase: "ready", elapsed: 0, round: 0, score: 0, catches: 0, balls: 3, shot: null, anchor: null, yaw: 0, zone: movementZoneLimit(movementVersion), feedback: "none", random: seed >>> 0, routeSeed: seed >>> 0, movementVersion, motionTime: 0, encounterDuration: worldTiming.encounterMin, returnDelay: worldTiming.returnMin, rest: {x:0,y:0,z:0} });
function random(seed: number) { return (Math.imul(seed,1664525)+1013904223) >>> 0; }
function nextRound(state: WorldGame, phase: GamePhase): WorldGame {
  const seed = random(state.random), durationSeed = random(seed), delaySeed = random(durationSeed);
  return { ...state, phase, elapsed:0, motionTime:0, round:state.round+1, balls:3, shot:null, feedback:"none", random:delaySeed, routeSeed:seed,
    encounterDuration: worldTiming.encounterMin + durationSeed/0x100000000*(worldTiming.encounterMax-worldTiming.encounterMin),
    returnDelay: worldTiming.returnMin + delaySeed/0x100000000*(worldTiming.returnMax-worldTiming.returnMin), rest:{x:0,y:0,z:0} };
}

export function placeWorldGame(state: WorldGame, anchor: Vec3, yaw: number, zone: MovementZone = movementZoneLimit(state.movementVersion)): WorldGame {
  const cx = zone.centerX ?? 0, cz = zone.centerZ ?? 0;
  if (![anchor.x, anchor.y, anchor.z, yaw, zone.x, zone.z, cx, cz].every(Number.isFinite)) return state;
  const limit = movementZoneLimit(state.movementVersion);
  const x = clamp(zone.x, 0, limit.x), z = clamp(zone.z, 0, limit.z);
  const fitted: MovementZone = { x, z };
  if (state.movementVersion >= 4) {
    fitted.centerX = clamp(cx, -Math.min(x, limit.x-x), Math.min(x, limit.x-x));
    fitted.centerZ = clamp(cz, -Math.min(z, limit.z-z), Math.min(z, limit.z-z));
  }
  return nextRound({ ...state, anchor: { ...anchor }, yaw, zone: fitted }, "waiting");
}

// Frustum planes inset by the animated character. The floor pivot fits wherever
// a*x + b*z + clearance >= 0 in the placement's local axes.
export type FloorBoundary = { a: number; b: number; clearance: number };
export function fitMovementZone(boundaries: FloorBoundary[]): MovementZone {
  const empty = { x: 0, z: 0 };
  if (boundaries.some(edge => edge.clearance < 0)) return empty;
  let far = -maxMovementZone.z, near = maxMovementZone.z;
  for (const { b, clearance } of boundaries) {
    if (b > 1e-8) far = Math.max(far, -clearance / b);
    if (b < -1e-8) near = Math.min(near, -clearance / b);
  }
  function slice(z: number) {
    let left = -maxMovementZone.x, right = maxMovementZone.x;
    for (const { a, b, clearance } of boundaries) {
      if (Math.abs(a) < 1e-8) continue;
      const edge = -(clearance + b * z) / a;
      if (a > 0) left = Math.max(left, edge);
      else right = Math.min(right, edge);
    }
    return { left, right, z };
  }
  // At fixed near/far depths, the widest inscribed rectangle is exactly the
  // intersection of the two slices. A convex frustum then contains every point
  // between its four corners. Keep the original floor anchor inside the route.
  const samples = 30;
  const farSlices = Array.from({ length: samples + 1 }, (_, i) => slice(far * i / samples));
  const nearSlices = Array.from({ length: samples + 1 }, (_, i) => slice(near * i / samples));
  let best: MovementZone = empty, bestArea = 0;
  for (const f of farSlices) for (const n of nearSlices) {
    const left = Math.max(f.left, n.left), right = Math.min(f.right, n.right);
    if (left > 0 || right < 0) continue;
    const x = (right - left) / 2, z = (n.z - f.z) / 2;
    if (x * z <= bestArea) continue;
    bestArea = x * z;
    best = { x, z, centerX: (left + right) / 2, centerZ: (f.z + n.z) / 2 };
  }
  return best;
}

// Preserve the exact path for reward sessions issued before the new movement.
function legacyRoutePosition({ routeSeed, motionTime, zone }: WorldGame): Vec3 {
  const time = motionTime / 1000, index = Math.floor(time), u = time - index;
  const points = [-1, 0, 1, 2].map(offset => {
    const vertex = (index + offset + 8) % 8;
    const angle = vertex * Math.PI / 4 + (routeSeed % 628) / 100;
    const radius = .68 + (random(routeSeed + vertex * 73) % 100) / 500;
    return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius * .72 };
  });
  const interpolate = (key: "x" | "z") => {
    const [a, b, c, d] = points.map(point => point[key]);
    return .5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  };
  return { x: clamp(interpolate("x") / originalMaxZone.x, -1, 1) * zone.x,
    y: 0, z: clamp(interpolate("z") / originalMaxZone.z, -1, 1) * zone.z };
}
function weaveRoutePosition({ routeSeed, motionTime, zone }: WorldGame): Vec3 {
  const time = motionTime / 1000;
  const phase = routeSeed / 0x100000000;
  const variation = random(routeSeed) / 0x100000000;
  const sweep = 2 * Math.PI * (time / (8.6 + 1.4 * variation) + phase);
  const dodge = 2 * Math.PI * (time / (3.8 + .7 * phase) + variation);
  const depth = 2 * Math.PI * (time / (12.7 + 1.8 * phase) + variation);
  // Cross the floor in both directions. Independent timing changes the depth
  // on each pass, while overlapping waves keep turns smooth at the zone edges.
  return {
    x: zone.x * (.86 * Math.sin(sweep) + .13 * Math.sin(dodge)),
    y: 0,
    z: zone.z * (.27 * Math.sin(depth) + .69 * Math.cos(sweep)),
  };
}
function routePosition(state: WorldGame): Vec3 {
  if (state.movementVersion === 1) return legacyRoutePosition(state);
  if (state.movementVersion === 2) return weaveRoutePosition(state);
  const { routeSeed, motionTime, zone } = state;
  if (state.movementVersion === 4) {
    // A wider patch needs a longer stride to keep each turn visible on screen.
    const legMs = (3150 + routeSeed % 530) * Math.max(1, zone.x / .60, zone.z / .52);
    const start = random(routeSeed) / 0x100000000 * 20;
    const point = squirrelZigzag(routeSeed, start + motionTime / legMs);
    return { x: (zone.centerX ?? 0) + point.x * zone.x, y: 0, z: (zone.centerZ ?? 0) + point.y * zone.z };
  }
  const time = motionTime / 1000;
  const phase = routeSeed / 0x100000000;
  const variation = random(routeSeed) / 0x100000000;
  const sweep = 2 * Math.PI * (time / (7.6 + 1.1 * variation) + phase);
  const cut = 2 * Math.PI * (time / (3.35 + variation) + variation);
  const depth = 2 * Math.PI * (time / (6.9 + 2.5 * phase) + phase + variation);
  // Fast cross-cuts vary the turn timing and distance from the viewer. The
  // combined reach of each pair stays within the fitted floor rectangle.
  return {
    x: zone.x * (.79 * Math.sin(sweep) + .20 * Math.sin(cut)),
    y: 0,
    z: zone.z * (.65 * Math.cos(sweep) + .32 * Math.sin(depth)),
  };
}
function localSquirrelPosition(state: WorldGame, reducedMotion = false): Vec3 {
  if (state.phase === "caught" || (state.phase === "escaping" && reducedMotion)) return state.rest;
  if (reducedMotion && state.movementVersion < 4) return { x: 0, y: 0, z: 0 };
  if (state.phase === "entering") {
    const point = routePosition(state);
    if (reducedMotion) return point;
    const progress = clamp(state.elapsed / worldTiming.entering, 0, 1);
    const cx = state.zone.centerX ?? 0;
    const edge = cx + (point.x > cx ? -state.zone.x : state.zone.x);
    return { ...point, x: edge + progress * (point.x - edge) };
  }
  if (state.phase === "escaping") {
    const progress = clamp(state.elapsed / worldTiming.escaping, 0, 1);
    const cx = state.zone.centerX ?? 0;
    const edge = cx + (state.rest.x > cx ? -state.zone.x : state.zone.x);
    const away = (state.zone.centerZ ?? 0) - state.zone.z * .8;
    return { x: state.rest.x + progress * (edge - state.rest.x), y: 0, z: state.rest.z + progress * (away - state.rest.z) };
  }
  return routePosition(state);
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
    next.motionTime += (encounterWalkTime(next.elapsed) - encounterWalkTime(state.elapsed)) * walkRate[state.movementVersion];
  }
  if (state.phase === "playing") {
    next.motionTime += delta * runRate[state.movementVersion];
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
