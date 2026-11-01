import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function compile(file) { return ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText; }
const dataUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const common = dataUrl(compile("../lib/squirrel-game.ts"));
const source = compile("../lib/squirrel-ar-game.ts").replace('"./squirrel-game"', JSON.stringify(common));
const { initialWorldGame, placeWorldGame, worldSquirrelPosition, worldShotPosition, ballisticShot, worldThrowGesture, launchWorldBall, advanceWorldGame } = await import(dataUrl(source));
const anchor = { x:0, y:0, z:-2 };
function step(state, duration, tracked = true) { for (let t=0;t<duration;t+=16) state = advanceWorldGame(state, Math.min(16,duration-t), tracked, true); return state; }
function encounter() { return step(placeWorldGame(initialWorldGame(), anchor, 0), 1850); }
function playing() { return { ...encounter(), phase:"playing", elapsed:0, playElapsed:0 }; }

assert.equal(step(initialWorldGame(), 10000).phase, "ready", "There is no squirrel before a real placement");
assert.equal(placeWorldGame(initialWorldGame(), {...anchor,x:NaN},0).phase, "ready");
let state = encounter();
assert.equal(state.phase,"encounter");
assert.deepEqual(worldSquirrelPosition(state), anchor);
const originalAnchor = { ...anchor };
const placed = placeWorldGame(initialWorldGame(), originalAnchor, 0);
originalAnchor.x=100;
assert.deepEqual(placed.anchor, anchor, "Placement snapshots the world position");
state = step(state, 5200);
assert.equal(state.phase,"escaping");
state = step(state, 6000);
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
assert.equal(step(state,10000),state,"Reward is awarded once");
state = playing();
const miss = ballisticShot({x:0,y:1.5,z:0},{x:2,y:.24,z:-2},.6);
for(let i=0;i<3;i++) state = step(launchWorldBall(state,miss),1900);
assert.equal(state.phase,"escaped");
assert.equal(state.score,0);
assert.equal(step(playing(),20000).phase,"escaping");
assert.equal(worldThrowGesture({x:.5,y:.9},{x:.5,y:.88},200),null);
assert.equal(worldThrowGesture({x:.5,y:.9},{x:.5,y:1},200),null);
assert.equal(worldThrowGesture({x:.5,y:.9},{x:NaN,y:.5},200),null);
assert.ok(worldThrowGesture({x:.5,y:.9},{x:.5,y:.5},200).range > worldThrowGesture({x:.5,y:.9},{x:.5,y:.7},200).range);
assert.equal(launchWorldBall(playing(),null).balls,3);
console.log("Spatial game: anchored placement, 3D hit/miss and ballistics, tracking-loss freeze, gestures, escape/return, scoring and release-pose independence passed.");
