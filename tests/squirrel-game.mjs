import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../lib/squirrel-game.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { initialGame, nextRound, beginCatch, advanceGame, throwBall, planThrow, launchPoint, gameTiming, squirrelPosition, practiceGeometry } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
function step(state, milliseconds, reduced = true) {
  for (let remaining = milliseconds; remaining > 0; remaining -= 16) state = advanceGame(state, Math.min(16, remaining), reduced);
  return state;
}
function encounter() { return step(nextRound(initialGame(11)), gameTiming.waiting + gameTiming.entering + 32); }

let state = encounter();
assert.equal(state.phase, "encounter");
assert.equal(beginCatch(initialGame()).phase, "ready", "Cannot start a challenge before the encounter");
state = step(state, gameTiming.encounter);
assert.equal(state.phase, "escaping", "An ignored squirrel visibly runs away");
state = step(state, gameTiming.escaping + 32);
assert.equal(state.phase, "escaped");
state = step(state, gameTiming.escaped + 32);
assert.equal(state.round, 2, "Missed encounters return automatically");
assert.equal(state.catches, 0);

state = beginCatch(encounter());
for (const [end, duration] of [[{x:.5,y:.89},200],[{x:.5,y:1},200],[{x:.5,y:.5},2000],[{x:NaN,y:.4},200]]) {
  const invalid = planThrow(launchPoint, end, duration);
  assert.equal(invalid, null);
  assert.equal(throwBall(state, invalid).balls, 3, "Invalid gestures do not consume attempts");
}
const aimed = planThrow(launchPoint, { x: .5, y: .55 }, 250);
state = throwBall(state, aimed);
assert.equal(state.balls, 2);
assert.equal(throwBall(state, aimed), state, "Only one ball may be in flight");
state = step(state, 1000);
assert.equal(state.phase, "caught", "An aimed swipe must be able to catch the squirrel");
assert.equal(state.catches, 1);
assert.equal(state.score, 150);
assert.deepEqual(step(state, 10000), state, "A catch is awarded only once");
const movingSquirrel = beginCatch(encounter());
assert.deepEqual(squirrelPosition(movingSquirrel), squirrelPosition(encounter()), "Tapping the practice squirrel starts the chase without teleporting");
const firstDodgeMs = 280;
const firstDodge = squirrelPosition(step(movingSquirrel, firstDodgeMs, false));
const secondDodge = squirrelPosition(step(movingSquirrel, 840, false));
assert.ok(firstDodge.x > .76 && secondDodge.x < .24 && Math.abs(secondDodge.y-firstDodge.y) > .06,
  "Practice sprints across both sides before crossing to a different depth");
const untapped=encounter(), strolling=step(untapped,1450,false);
assert.notDeepEqual(squirrelPosition(strolling),squirrelPosition(untapped),"The squirrel is already traversing the arena before the tap");
assert.deepEqual(squirrelPosition(beginCatch(strolling)),squirrelPosition(strolling),"Tapping mid-stride keeps the current position");
for (const [width, height] of [[304, 317], [374, 593], [828, 234], [624, 124], [1264, 649]]) {
  const field = practiceGeometry(width, height);
  const track = [];
  for (const phase of ["entering", "encounter", "playing", "escaping"]) {
    for (let time = 0; time <= gameTiming[phase]; time += 16) {
      const point = squirrelPosition({ ...movingSquirrel, phase, elapsed: time, playElapsed: phase === "playing" ? time : 0 }, false, field);
      const halfWidth = field.spriteWidth / (2 * width), halfHeight = field.spriteWidth * 340 / (600 * height);
      assert.ok(point.x - halfWidth >= 0 && point.x + halfWidth <= 1, `${phase} fits the frame horizontally at ${width}×${height}`);
      assert.ok(point.y - halfHeight >= 0 && point.y + halfHeight <= 1, `${phase} fits the frame vertically at ${width}×${height}`);
      if (phase === "playing") {
        track.push(point);
        if (Math.abs(point.x - launchPoint.x) < field.launcherLane) assert.ok(point.y <= field.launcherTop);
      }
    }
  }
  const range = axis => Math.max(...track.map(point => point[axis])) - Math.min(...track.map(point => point[axis]));
  assert.ok(range("x") > .60 && range("y") > .43, `Large two-axis runway at ${width}×${height}`);
  const final = { ...movingSquirrel, playElapsed: 790 };
  assert.deepEqual(squirrelPosition({ ...final, phase: "escaping", elapsed: 0 }, false, field), squirrelPosition(final, false, field), "Escape starts from the final visible position");
}
assert.deepEqual(squirrelPosition(step(movingSquirrel, 1100), true), { x: .5, y: .43 }, "Reduced motion keeps the practice target in place");
const laterRound=beginCatch(step(nextRound(untapped),gameTiming.waiting+gameTiming.entering+32,false));
assert.notEqual(laterRound.seed,movingSquirrel.seed,"Each round chooses a fresh route");
assert.equal(step({...laterRound,balls:1},firstDodgeMs,false).playElapsed-laterRound.playElapsed,
  step(movingSquirrel,firstDodgeMs,false).playElapsed-movingSquirrel.playElapsed,"Misses and later rounds preserve running speed");
const ledThrow = planThrow(launchPoint, { x: .40, y: .55 }, 250);
assert.equal(step(throwBall(movingSquirrel, ledThrow), 1000, false).phase, "caught", "Aiming ahead still catches the faster moving target");
const edgeThrow = { end: {x:.612,y:.43}, elapsed:0, duration:700 };
let narrowMiss = step(beginCatch(encounter()), 7000);
for (let attempt = 0; attempt < 3; attempt++) {
  narrowMiss = step(throwBall(narrowMiss,edgeThrow), 750);
  assert.equal(narrowMiss.catches,0,"The same near miss remains a miss on every attempt, even late in the round");
}
assert.equal(narrowMiss.phase,"escaping");
const replay = nextRound(state);
assert.equal(replay.catches, 1);
assert.equal(replay.balls, 3);
assert.equal(replay.score, 150);

state = beginCatch(encounter());
const miss = planThrow(launchPoint, { x: 1.2, y: .6 }, 250);
for (let attempt = 0; attempt < 3; attempt++) state = step(throwBall(state, miss), 860);
assert.equal(state.phase, "escaping", "Three misses end the challenge");
assert.equal(state.catches, 0);
assert.equal(step(beginCatch(encounter()), gameTiming.playing).phase, "escaping", "The minigame has a real time limit");
assert.equal(advanceGame(state, NaN), state);
console.log("Squirrel game: encounter, escape/return, gesture validation, hit/miss, attempts, timeout and scoring passed.");
