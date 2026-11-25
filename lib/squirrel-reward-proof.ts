import {
  advanceWorldGame, beginWorldCatch, initialWorldGame, maxMovementZone, placeWorldGame, sweptBallHit,
  worldBallRadius, worldShotPosition, worldSquirrelPosition, worldTiming, type MovementZone, type Vec3,
} from "./squirrel-ar-game";

// Times are tracked game milliseconds. Trajectories use the placement's local axes.
export type SquirrelRewardProof = {
  round: number;
  encounterMs: number;
  launchMs: number;
  impactMs: number;
  impactStepMs: number;
  origin: Vec3;
  velocity: Vec3;
  zone: MovementZone;
  scale: number;
  reducedMotion: boolean;
};

const localAnchor = { x: 0, y: 0, z: 0 };
const maxFrameMs = 64;
const maxFlightMs = 1700;
const maxRound = 256;
// A collision envelope for limbs, body, head and raised tail. The client checks
// the model's articulated spheres, while this replay checks physical plausibility.
const silhouette = [[.10, .18], [.25, .30], [.44, .39]] as const;

function fields(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numberWithin(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function vector(value: unknown, bound: number): value is Vec3 {
  return fields(value) && numberWithin(value.x, -bound, bound)
    && numberWithin(value.y, -bound, bound) && numberWithin(value.z, -bound, bound);
}

export function replaySquirrelRewardProof(seed: number, proof: unknown): proof is SquirrelRewardProof {
  if (!numberWithin(seed, 0, 0xffffffff) || !Number.isInteger(seed) || !fields(proof)) return false;
  const { round, encounterMs, launchMs, impactMs, impactStepMs, origin, velocity, zone, scale, reducedMotion } = proof;
  if (!numberWithin(round, 1, maxRound) || !Number.isInteger(round)
    || !numberWithin(encounterMs, 0, worldTiming.encounterMax)
    || !numberWithin(launchMs, 0, worldTiming.playing) || launchMs === worldTiming.playing
    || !numberWithin(impactMs, 0, maxFlightMs + maxFrameMs)
    || !numberWithin(impactStepMs, 0, maxFrameMs) || impactStepMs === 0
    || !vector(origin, 10) || origin.y < -worldBallRadius
    || !vector(velocity, 35) || !numberWithin(Math.hypot(velocity.x, velocity.y, velocity.z), .1, 35)
    || !fields(zone) || !numberWithin(zone.x, 0, maxMovementZone.x) || !numberWithin(zone.z, 0, maxMovementZone.z)
    || (scale !== .7 && scale !== .8 && scale !== .9 && scale !== 1) || typeof reducedMotion !== "boolean") return false;

  const beforeImpactMs = impactMs - impactStepMs;
  if (beforeImpactMs < 0 || beforeImpactMs > maxFlightMs || launchMs + beforeImpactMs >= worldTiming.playing) return false;
  const shot = { origin, velocity, elapsed: beforeImpactMs };
  if (worldShotPosition(shot).y < -worldBallRadius) return false;

  let game = initialWorldGame(seed);
  for (let index = 0; index < round; index++) {
    // Natural encounters and manual re-placement each advance the same seeded round sequence.
    game = placeWorldGame(game, localAnchor, 0, { x: zone.x, z: zone.z });
  }
  if (encounterMs >= game.encounterDuration) return false;
  game = advanceWorldGame(game, worldTiming.waiting, true, reducedMotion);
  game = advanceWorldGame(game, worldTiming.entering, true, reducedMotion);
  game = advanceWorldGame(game, encounterMs, true, reducedMotion);
  game = beginWorldCatch(game);
  game = advanceWorldGame(game, launchMs + beforeImpactMs, true, reducedMotion);
  const start = worldSquirrelPosition(game, reducedMotion);
  return advanceWorldGame({ ...game, shot }, impactStepMs, true, reducedMotion, (from, to, next) => {
    const end = worldSquirrelPosition(next, reducedMotion);
    return silhouette.some(([height, radius]) => sweptBallHit(from, to,
      { center: { ...start, y: height * scale }, radius: radius * scale }, { ...end, y: height * scale }));
  }).phase === "caught";
}
