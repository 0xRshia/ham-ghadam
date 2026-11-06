import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function compile(file) { return ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText; }
const dataUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const common = dataUrl(compile("../lib/squirrel-game.ts"));
const source = compile("../lib/squirrel-ar-game.ts").replace('"./squirrel-game"', JSON.stringify(common));
const { initialWorldGame, placeWorldGame, beginWorldCatch, worldTiming, worldSquirrelPosition, worldShotPosition, ballisticShot, worldThrowGesture, launchWorldBall, advanceWorldGame } = await import(dataUrl(source));
const anchor = { x:0, y:0, z:-2 };
function step(state, duration, tracked = true) { for (let t=0;t<duration;t+=16) state = advanceWorldGame(state, Math.min(16,duration-t), tracked, true); return state; }
function encounter() { return step(placeWorldGame(initialWorldGame(73), anchor, 0), worldTiming.waiting+worldTiming.entering+40); }
function playing() { return beginWorldCatch(encounter()); }

assert.equal(step(initialWorldGame(), 10000).phase, "ready", "There is no squirrel before a real placement");
assert.equal(placeWorldGame(initialWorldGame(), {...anchor,x:NaN},0).phase, "ready");
let state = encounter();
assert.equal(state.phase,"encounter");
assert.deepEqual(worldSquirrelPosition(state,true), anchor);
const originalAnchor = { ...anchor };
const placed = placeWorldGame(initialWorldGame(), originalAnchor, 0);
originalAnchor.x=100;
assert.deepEqual(placed.anchor, anchor, "Placement snapshots the world position");
state = step(state, state.encounterDuration);
assert.equal(state.phase,"escaping");
state = step(state, worldTiming.escaping+state.returnDelay+40);
assert.equal(state.round,2);
assert.deepEqual(state.anchor,anchor,"Automatic encounters remain at the placed physical location");

const camera = { x:0,y:1.5,z:0 };
const shot = ballisticShot(camera,{x:0,y:.24,z:-2},.6);
const atRelease = worldShotPosition(shot);
camera.x=5;
assert.deepEqual(worldShotPosition(shot),atRelease,"Moving the phone after release cannot move the ball");
state = launchWorldBall(playing(),shot);
assert.equal(state.balls,2);
assert.equal(launchWorldBall(state,shot),state,"Only one ball can be in flight");
assert.equal(step(state,5000,false),state,"Losing tracking freezes timers and the projectile");
state = step(state,1000);
assert.equal(state.phase,"caught");
assert.equal(state.score,150);
assert.equal(state.catches,1);
const afterCatch = step(state,25000);
assert.equal(afterCatch.score,state.score,"Reward is awarded once while subsequent encounters continue");
assert.equal(afterCatch.catches,1);
assert.ok(afterCatch.round > 1,"A successful catch must not terminate the encounter loop");
state = playing();
const miss = ballisticShot({x:0,y:1.5,z:0},{x:2,y:.24,z:-2},.6);
for(let i=0;i<3;i++) state = step(launchWorldBall(state,miss),1900);
assert.equal(state.phase,"escaped");
assert.equal(state.score,0);
assert.equal(step(playing(),worldTiming.playing).phase,"escaping");
assert.equal(worldThrowGesture({x:.5,y:.9},{x:.5,y:.88},200),null);
assert.equal(worldThrowGesture({x:.5,y:.9},{x:.5,y:1},200),null);
assert.equal(worldThrowGesture({x:.5,y:.9},{x:NaN,y:.5},200),null);
assert.ok(worldThrowGesture({x:.5,y:.9},{x:.5,y:.5},200).range > worldThrowGesture({x:.5,y:.9},{x:.5,y:.7},200).range);
assert.equal(launchWorldBall(playing(),null).balls,3);
const placedCountdown=placeWorldGame(initialWorldGame(99),anchor,0);
assert.equal(step(placedCountdown,worldTiming.waiting-50).phase,"waiting");
assert.equal(step(placedCountdown,worldTiming.waiting+40).phase,"entering");
let roaming=encounter();
const startPosition=worldSquirrelPosition(roaming);
const tapped=beginWorldCatch(roaming);
assert.deepEqual(worldSquirrelPosition(tapped),startPosition,"Tap changes speed without teleporting the character");
let normal=roaming,fast=tapped,normalTravel=0,fastTravel=0,previousNormal=worldSquirrelPosition(normal),previousFast=worldSquirrelPosition(fast);
const positions=[];
for(let t=0;t<2400;t+=16) {
  normal=advanceWorldGame(normal,16,true,false);fast=advanceWorldGame(fast,16,true,false);
  const n=worldSquirrelPosition(normal),f=worldSquirrelPosition(fast);
  normalTravel+=Math.hypot(n.x-previousNormal.x,n.z-previousNormal.z);
  const frameDistance=Math.hypot(f.x-previousFast.x,f.z-previousFast.z);
  fastTravel+=frameDistance;positions.push(f);previousNormal=n;previousFast=f;
  assert.ok(frameDistance < .1,"Agile motion remains continuous across frames");
  assert.ok(Math.abs(f.x-anchor.x) < 1.1 && Math.abs(f.z-anchor.z) < .9,"Roaming stays within the observed patch");
  assert.equal(f.y,anchor.y,"Squirrel remains on the tracked floor");
}
assert.ok(normalTravel > .5,"The encounter roams before being tapped");
assert.ok(fastTravel > normalTravel*1.6,"The catch minigame is appreciably faster");
assert.ok(Math.max(...positions.map(p=>p.x))-Math.min(...positions.map(p=>p.x)) > .8);
assert.ok(Math.max(...positions.map(p=>p.z))-Math.min(...positions.map(p=>p.z)) > .5,"Fast motion uses depth as well as left/right");
const delays=new Set();
let repeated=initialWorldGame(99);
for(let i=0;i<12;i++) {
  repeated=placeWorldGame(repeated,anchor,0);delays.add(repeated.returnDelay);
  assert.ok(repeated.returnDelay >= worldTiming.returnMin && repeated.returnDelay <= worldTiming.returnMax);
}
assert.ok(delays.size > 8,"Visits use varying intervals rather than a fixed repeated delay");
assert.equal(advanceWorldGame(fast,5000,false,false),fast,"Tracking loss freezes fast movement and timers together");
console.log("Spatial game: automatic countdown, roaming, continuous acceleration, fast bounded depth movement, random recurring visits after catch/escape, swept collisions, scoring and tracking-loss freeze passed.");
