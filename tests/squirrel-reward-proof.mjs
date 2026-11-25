import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = mkdtempSync(join(tmpdir(), "squirrel-proof-"));
try {
  const load = nodeSourceModules(directory);
  const { replaySquirrelRewardProof } = await load("lib/squirrel-reward-proof.ts");
  const { advanceWorldGame, ballisticShot, beginWorldCatch, initialWorldGame, maxMovementZone, placeWorldGame,
    worldSquirrelPosition, worldTiming } = await load("lib/squirrel-ar-game.ts");
  const seed = 73;
  const anchor = { x: 0, y: 0, z: 0 };

  function fixture(round, reducedMotion) {
    const encounterMs = 2650;
    const launchMs = 1065;
    const impactMs = 440;
    const impactStepMs = 16;
    const zone = reducedMotion ? { x: 0, z: 0 } : maxMovementZone;
    const scale = reducedMotion ? .7 : 1;
    let state = initialWorldGame(seed);
    for (let i = 0; i < round; i++) state = placeWorldGame(state, anchor, 0, zone);
    state = advanceWorldGame(state, worldTiming.waiting, true, reducedMotion);
    state = advanceWorldGame(state, worldTiming.entering, true, reducedMotion);
    state = advanceWorldGame(state, encounterMs, true, reducedMotion);
    state = advanceWorldGame(beginWorldCatch(state), launchMs + impactMs, true, reducedMotion);
    const target = worldSquirrelPosition(state, reducedMotion);
    const launch = ballisticShot({ x: 0, y: 1.4, z: 2 }, { ...target, y: .28 * scale }, impactMs / 1000);
    return { round, encounterMs, launchMs, impactMs, impactStepMs, zone, scale, reducedMotion, origin: launch.origin, velocity: launch.velocity };
  }

  const moving = fixture(1, false);
  assert.equal(replaySquirrelRewardProof(seed, moving), true);
  assert.equal(replaySquirrelRewardProof(seed, fixture(4, false)), true, "Later and re-placed rounds remain canonical");
  assert.equal(replaySquirrelRewardProof(seed, fixture(2, true)), true, "Reduced motion remains eligible for a verified catch");
  assert.equal(replaySquirrelRewardProof(seed, { ...moving, velocity: { ...moving.velocity, x: 12 } }), false, "A physical miss cannot be submitted as a catch");
  assert.ok([5, 11, 45, 71, 122, 5432, 65_001].some(otherSeed => !replaySquirrelRewardProof(otherSeed, moving)), "The moving route depends on the server seed");
  for (const invalid of [
    null, [], { ...moving, round: 0 }, { ...moving, round: 1_000_000 }, { ...moving, round: 1.5 },
    { ...moving, encounterMs: worldTiming.encounterMax }, { ...moving, launchMs: worldTiming.playing - 10 },
    { ...moving, impactStepMs: 0 }, { ...moving, impactStepMs: 65 }, { ...moving, impactMs: 0 },
    { ...moving, velocity: { ...moving.velocity, x: NaN } }, { ...moving, origin: { ...moving.origin, x: Infinity } },
    { ...moving, origin: { ...moving.origin, y: -.5 } }, { ...moving, zone: { x: 5, z: 5 } },
    { ...moving, scale: 50 }, { ...moving, reducedMotion: "true" },
  ]) assert.equal(replaySquirrelRewardProof(seed, invalid), false);
  assert.equal(replaySquirrelRewardProof(-1, moving), false);
  assert.equal(replaySquirrelRewardProof(0x100000000, moving), false);
  console.log("PASS seeded squirrel replay across rounds, reduced motion, rejected misses and bounded proof fields");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
