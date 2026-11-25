import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function compile(file) { return ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText; }
const dataUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const common = dataUrl(compile("../lib/squirrel-game.ts"));
const source = compile("../lib/squirrel-ar-game.ts").replace('"./squirrel-game"', JSON.stringify(common));
const { initialWorldGame, placeWorldGame, fitMovementZone, beginWorldCatch, worldTiming, worldEncounterActivity, worldSquirrelPosition, worldShotPosition, ballisticShot, worldThrowGesture, launchWorldBall, advanceWorldGame, sweptBallHit } = await import(dataUrl(source));
const anchor = { x:0, y:0, z:-2 };
function step(state, duration, tracked = true, reducedMotion = true) { for (let t=0;t<duration;t+=16) state = advanceWorldGame(state, Math.min(16,duration-t), tracked, reducedMotion); return state; }
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
const gesture = worldThrowGesture({x:.5,y:.9},{x:.3,y:.5},200);
assert.equal(gesture.aimX,.3);
assert.equal(gesture.aimY,.5,"A flick retains the vertical aim instead of always throwing at the center of the view");
assert.ok(gesture.flightTime < worldThrowGesture({x:.5,y:.9},{x:.5,y:.7},200).flightTime);
assert.equal(launchWorldBall(playing(),null).balls,3);
const placedCountdown=placeWorldGame(initialWorldGame(99),anchor,0);
assert.equal(step(placedCountdown,worldTiming.waiting-50).phase,"waiting");
assert.equal(step(placedCountdown,worldTiming.waiting+40).phase,"entering");
let roaming=encounter();
const startPosition=worldSquirrelPosition(roaming);
const tapped=beginWorldCatch(roaming);
assert.deepEqual(worldSquirrelPosition(tapped),startPosition,"Tap changes speed without teleporting the character");
const immediateRun = step(tapped,128,true,false);
const immediateWalk = step(roaming,128,true,false);
assert.ok(immediateRun.motionTime - tapped.motionTime > (immediateWalk.motionTime - roaming.motionTime) * 3.5,
  "The first chase starts at full pace without an acceleration period");
for (const late of [{ ...tapped, balls: 1, elapsed: 9000 }, { ...tapped, round: 8, balls: 2, elapsed: 5000, score: 525 }]) {
  assert.deepEqual(worldSquirrelPosition(step(late,128,true,false)), worldSquirrelPosition(immediateRun), "Later attempts and rounds do not slow the same chase motion");
}
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
const oldLap = 8000 / 4.25;
assert.ok(distance(tapped, step(tapped, oldLap, true, false)) > .15,
  "The squirrel keeps varying its route instead of repeating the same short orbit");
let running = tapped;
let velocity;
for (let t = 0; t < 19000; t += 16) {
  const next = advanceWorldGame(running, 16, true);
  const a = worldSquirrelPosition(running), b = worldSquirrelPosition(next);
  const nextVelocity = { x: (b.x - a.x) / .016, z: (b.z - a.z) / .016 };
  if (velocity) assert.ok(Math.hypot(nextVelocity.x - velocity.x, nextVelocity.z - velocity.z) < .65,
    "Sharper cuts still change velocity continuously across frames");
  velocity = nextVelocity;
  running = next;
}
const portraitZone = { x: .14, z: .22 };
const portraitRoaming = { ...roaming, zone: portraitZone };
function traveled(state, duration = 2400) {
  let travel = 0;
  for (let elapsed = 0; elapsed < duration; elapsed += 16) {
    const next = advanceWorldGame(state, 16, true);
    travel += distance(state, next);
    state = next;
  }
  return travel;
}
assert.ok(traveled(portraitRoaming) > .3, "Roaming covers ground even in a narrow camera frame");
assert.ok(traveled(beginWorldCatch(portraitRoaming)) > 1, "Running covers ground without expanding the narrow zone");
const widerPortrait = { ...roaming, zone: { x: .24, z: .22 } };
assert.ok(traveled(beginWorldCatch(widerPortrait)) > 1.35, "Preserving lateral room leads to substantial movement on a portrait screen");

const fittedPortrait = { x: .159, z: .257 };
const representativeSeeds = [1, 45, 73, 317, 999, 243523, 0xffffffff];
function seededChase(seed, version, zone = fittedPortrait, encounterMs = 1200) {
  let state = placeWorldGame(initialWorldGame(seed, version), anchor, 0, zone);
  for (const duration of [worldTiming.waiting, worldTiming.entering, encounterMs]) state = advanceWorldGame(state, duration, true);
  return beginWorldCatch(state);
}
for (const elapsed of [0, 8200, 16400]) {
  const travel = version => representativeSeeds.reduce((total, seed) => {
    const chase = advanceWorldGame(seededChase(seed, version), elapsed, true);
    return total + traveled({ ...chase, balls: elapsed ? 1 : 3 }, 2000);
  }, 0);
  const hardDistance = travel(3);
  assert.ok(hardDistance > travel(1), `The hard chase restores the earlier spatial pace at ${elapsed} ms`);
  assert.ok(hardDistance > travel(2) * 1.2, `The hard chase cuts farther and faster than v2 at ${elapsed} ms`);
}

for (const [version, expected] of [
  [1, { x: .6481700937201378, y: 0, z: -2.246825434658281 }],
  [2, { x: .15517111634154038, y: 0, z: -2.5749487063741703 }],
]) {
  const oldChase = seededChase(73, version, { x: .88, z: .63 }, 2650);
  assert.deepEqual(worldSquirrelPosition(advanceWorldGame(oldChase, 1505, true)), expected,
    `Version ${version} still replays its recorded trajectory exactly`);
}
const delays=new Set();
let repeated=initialWorldGame(99);
for(let i=0;i<12;i++) {
  repeated=placeWorldGame(repeated,anchor,0);delays.add(repeated.returnDelay);
  assert.ok(repeated.returnDelay >= worldTiming.returnMin && repeated.returnDelay <= worldTiming.returnMax);
}
assert.ok(delays.size > 8,"Visits use varying intervals rather than a fixed repeated delay");
assert.equal(advanceWorldGame(fast,5000,false,false),fast,"Tracking loss freezes fast movement and timers together");
const fitted = fitMovementZone((x,z) => Math.abs(x) + Math.abs(z) / 2 <= .35);
assert.ok(fitted.x > .2 && fitted.z > .1 && fitted.x + fitted.z / 2 <= .35);
assert.deepEqual(fitMovementZone(() => false),{x:0,z:0});
let bounded = placeWorldGame(initialWorldGame(45), anchor, Math.PI/2, fitted);
let touchedEdge = false;
for (let elapsed=0;elapsed<41000;elapsed+=16) {
  if (bounded.phase === "encounter") bounded=beginWorldCatch(bounded);
  const point=worldSquirrelPosition(bounded);
  assert.ok(Math.abs(point.z-anchor.z) <= fitted.x + 1e-9 && Math.abs(point.x-anchor.x) <= fitted.z + 1e-9, `${bounded.phase} must stay inside the same zone rotated around the anchor`);
  touchedEdge ||= Math.abs(point.z-anchor.z) > fitted.x*.98;
  bounded=advanceWorldGame(bounded,16,true);
}
assert.ok(touchedEdge && bounded.round > 1,"Entry, running and escape all use the fitted zone across rounds");
for (const seed of [1, 45, 73, 99, 317, 1000, 65001]) {
  const waiting = placeWorldGame(initialWorldGame(seed), anchor, 0, portraitZone);
  const entering = advanceWorldGame(waiting, worldTiming.waiting, true);
  const visit = advanceWorldGame(entering, worldTiming.entering, true);
  assert.ok(Math.abs(worldSquirrelPosition(visit).x - worldSquirrelPosition(entering).x) >= portraitZone.x,
    "Every entry moves across at least half the fitted width");
  const fleeing = advanceWorldGame(visit, visit.encounterDuration, true);
  const lastVisible = advanceWorldGame(fleeing, worldTiming.escaping - 1, true);
  assert.ok(Math.abs(worldSquirrelPosition(lastVisible).x - worldSquirrelPosition(fleeing).x) >= portraitZone.x * .99,
    "Escape uses the far side of the fitted width instead of running in place at an edge");
}

const grazingShot = ballisticShot({ x:.18,y:1.1,z:0 }, { x:.18,y:.42,z:-2 }, .45);
const grazingCatch = step(launchWorldBall(playing(),grazingShot),1000);
assert.equal(grazingCatch.phase,"caught","The side of the rendered head can touch the ball even when its center misses the torso");
const nearMiss = ballisticShot({ x:.26,y:1.1,z:0 }, { x:.26,y:.42,z:-2 }, .45);
let missed = step(playing(),6000);
for (let attempt = 0; attempt < 3; attempt++) {
  missed = step(launchWorldBall(missed,nearMiss),1300);
  assert.equal(missed.catches,0,"A near miss never counts after waiting or spending attempts");
}
assert.equal(missed.phase,"escaping");
assert.equal(sweptBallHit({x:0,y:.2,z:0},{x:0,y:.2,z:-1},{center:{x:-.3,y:.2,z:-.5},radius:.1},{x:.3,y:.2,z:-.5}),true,"A ball and joint crossing between frames still collide");
const flightTime = .43;
const projectileStart = {x:0,y:1.5,z:0};
const shotAtFoot = foot => ballisticShot(projectileStart, { ...foot, y:foot.y+.24 }, flightTime);
assert.equal(step(launchWorldBall(tapped,shotAtFoot(startPosition)),1100,true,false).feedback,"miss","Aiming where the squirrel was does not follow it");
const futureFoot = worldSquirrelPosition(step(tapped,flightTime*1000,true,false));
assert.equal(step(launchWorldBall(tapped,shotAtFoot(futureFoot)),1100,true,false).phase,"caught","A correctly led throw still catches the sprinting target");
for (const launchTimes of [[0, 563, 1031, 1532, 3021], [6423, 9125, 11118, 15523, 18223]]) {
  const staleHits = version => {
    let hits = 0;
    for (const seed of representativeSeeds) for (const elapsed of launchTimes) {
      const chase = advanceWorldGame(seededChase(seed, version), elapsed, true);
      const state = { ...chase, balls: elapsed > 6000 ? 1 : 3 };
      const canCatch = leadMs => {
        const foot = worldSquirrelPosition(advanceWorldGame(state, leadMs, true));
        const shot = ballisticShot(projectileStart, { ...foot, y: foot.y + .29 }, flightTime);
        return step(launchWorldBall(state, shot), 1040, true, false).phase === "caught";
      };
      if (canCatch(0)) hits++;
      if (version === 3) assert.ok(canCatch(flightTime * 1000), "An accurate lead can catch even on the last ball late in a round");
    }
    return hits;
  };
  const hardHits = staleHits(3);
  assert.ok(hardHits < staleHits(1) && hardHits <= staleHits(2) - 8,
    "Unled throws are less likely to catch than on either previous movement version, including late attempts");
}
for(const [round,activity] of [[1,"sit"],[2,"legsOut"],[3,"sleepCurled"],[4,"sleepFlat"],[5,"sit"]]) {
  assert.equal(worldEncounterActivity({round,elapsed:1000}),"walk");
  assert.equal(worldEncounterActivity({round,elapsed:3500}),"idle");
  assert.equal(worldEncounterActivity({round,elapsed:6000}),activity);
  assert.equal(worldEncounterActivity({round,elapsed:9500}),"idle");
  assert.equal(worldEncounterActivity({round,elapsed:11000}),"walk");
}
let resting={...encounter(),elapsed:4200,motionTime:3150};
const restingPosition=worldSquirrelPosition(resting);
for(let t=0;t<5000;t+=16)resting=advanceWorldGame(resting,Math.min(16,5000-t),true,false);
assert.deepEqual(worldSquirrelPosition(resting),restingPosition,"Sitting and sleeping stay fixed on the floor instead of sliding along the route");
const waking=beginWorldCatch(resting);
assert.deepEqual(worldSquirrelPosition(waking),restingPosition,"Tapping a resting squirrel wakes it without teleporting");
assert.ok(distance(waking,advanceWorldGame(waking,500,true,false)) > .05,"A tapped resting squirrel immediately resumes the running path");
function distance(a,b){const p=worldSquirrelPosition(a),q=worldSquirrelPosition(b);return Math.hypot(p.x-q.x,p.z-q.z);}
console.log("Spatial game: automatic countdown, roaming, consistent full-speed chase, bounded depth movement, random recurring visits, led hits, scoring and tracking-loss freeze passed.");
