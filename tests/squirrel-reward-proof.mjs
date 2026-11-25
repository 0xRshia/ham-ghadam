import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = mkdtempSync(join(tmpdir(), "squirrel-proof-"));
try {
  const load = nodeSourceModules(directory);
  const { replaySquirrelRewardProof } = await load("lib/squirrel-reward-proof.ts");
  const { advanceWorldGame, ballisticShot, beginWorldCatch, currentWorldMovementVersion, initialWorldGame, movementZoneLimit, placeWorldGame,
    worldSquirrelPosition, worldTiming } = await load("lib/squirrel-ar-game.ts");
  const seed = 73;
  const anchor = { x: 0, y: 0, z: 0 };

  function fixture(round, reducedMotion, movementVersion = currentWorldMovementVersion, placement, scale = reducedMotion ? .7 : 1) {
    const encounterMs = 2650;
    const launchMs = 1065;
    const impactMs = 440;
    const impactStepMs = 16;
    const zone = placement ?? (reducedMotion && movementVersion < 4 ? { x: 0, z: 0 } : movementZoneLimit(movementVersion));
    let state = initialWorldGame(seed, movementVersion);
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
  const older = fixture(1, false, 1);
  assert.equal(replaySquirrelRewardProof(seed, older, 1), true, "A moving catch from the previous browser bundle can still claim its original reward");
  assert.equal(replaySquirrelRewardProof(seed, { ...older, movementVersion: 1 }), false, "A proof cannot request a legacy movement version");
  const previous = fixture(1, false, 2);
  assert.equal(replaySquirrelRewardProof(seed, previous, 2), true, "An in-flight v2 wallet challenge still replays against its own movement path");
  assert.equal(replaySquirrelRewardProof(seed, { ...previous, movementVersion: 2 }), false, "A version supplied by the client cannot downgrade a current challenge");
  assert.equal(replaySquirrelRewardProof(seed, fixture(1, false, 3), 3), true, "An in-flight version 3 session can finish on its original path");
  for (const scale of [.6, .55, .5, .45, .4, .35]) {
    assert.ok(replaySquirrelRewardProof(seed, fixture(1, false, 4, {x:.3,z:.5}, scale)),
      `A led catch at portrait scale ${scale} can earn a reward`);
  }
  assert.equal(replaySquirrelRewardProof(seed, fixture(1, false, 3, undefined, .4), 3), false);
  assert.equal(replaySquirrelRewardProof(seed, fixture(4, false)), true, "Later and re-placed rounds remain canonical");
  assert.equal(replaySquirrelRewardProof(seed, fixture(2, true)), true, "Reduced motion remains eligible for a verified catch");
  assert.equal(replaySquirrelRewardProof(seed, fixture(2, true, 3), 3), true, "Old reduced-motion sessions keep their original stationary replay");
  assert.equal(replaySquirrelRewardProof(seed, { ...moving, zone: { x: 0, z: 0 }, reducedMotion: true }), false, "A new session must have room to run");
  const shifted = fixture(1, false, 4, { x:.23, z:.68, centerX:.18, centerZ:-.54 });
  assert.ok(replaySquirrelRewardProof(seed, shifted), "A led throw on an offset floor patch replays at the correct world point");
  assert.equal(replaySquirrelRewardProof(seed, { ...shifted, zone:{...shifted.zone,centerZ:5} }),false);
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
