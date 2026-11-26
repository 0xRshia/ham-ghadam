import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import sharp from "sharp";

const root=path.resolve(import.meta.dirname,"..");
const manifest=JSON.parse(fs.readFileSync(path.join(root,"public/game/mascot/manifest.json"),"utf8"));
const data=fs.readFileSync(path.join(root,"public/game/mascot",manifest.file));
assert.equal(data.byteLength,manifest.bytes);
assert.equal(createHash("sha256").update(data).digest("hex"),manifest.sha256);
assert.ok(data.byteLength < 8*1024*1024,"The runtime model fits the mobile download budget");
const jsonLength=data.readUInt32LE(12), json=JSON.parse(data.subarray(20,20+jsonLength));
const binStart=20+jsonLength+8;
assert.ok(json.extensionsRequired.includes("EXT_meshopt_compression"));
assert.equal(json.skins[0].joints.length,34);
assert.ok(manifest.geometry.triangles <= 120000);
assert.ok(json.buffers.every(buffer=>!buffer.uri),"All model buffers are self-contained");
for (const image of json.images) {
  assert.equal(image.mimeType,"image/webp");
  const view=json.bufferViews[image.bufferView];
  const metadata=await sharp(data.subarray(binStart+(view.byteOffset??0),binStart+(view.byteOffset??0)+view.byteLength)).metadata();
  assert.ok(metadata.width <= 2048 && metadata.height <= 2048);
}
const expectedClips=["HG_Idle","HG_Walk","HG_Run","HG_Sit_Intro","HG_Sit_Loop","HG_Sit_LegsOut_Intro","HG_Sit_LegsOut_Loop","HG_Sleep_Curled","HG_Sleep_Flat"];
assert.deepEqual(json.animations.map(clip=>clip.name),expectedClips);

// Use the same GLTFLoader and bundled Meshopt decoder as the browser. Node has
// no image decoder; actual WebP materials are separately exercised in Playwright.
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(()=>({name:"EXT_texture_webp",loadTexture:async()=>new THREE.Texture()}));
const gltf=await loader.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),"");
let mesh;gltf.scene.traverse(object=>{if(object.isSkinnedMesh)mesh=object;});
assert.equal(mesh.skeleton.bones.length,34);
assert.ok(mesh.material.map && mesh.material.normalMap && mesh.material.roughnessMap);
const mixer=new THREE.AnimationMixer(gltf.scene);
const sampledVertices=Array.from({length:256},(_,i)=>Math.floor(i/256*mesh.geometry.attributes.position.count));
const skinPose=()=>sampledVertices.map(index=>mesh.getVertexPosition(index,new THREE.Vector3()));
const skinDifference=(before,after)=>Math.max(...after.map((point,index)=>point.distanceTo(before[index])));
for(const clip of gltf.animations) {
  assert.equal(clip.tracks.length,68);
  const declared=manifest.clips.find(item=>item.name===clip.name);
  assert.ok(Math.abs(clip.duration-declared.duration) < .000001);
  mixer.stopAllAction();mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce,1).play().clampWhenFinished=true;
  let firstPose,displacement=0;
  for(const phase of [0,.25,.5,.75,.9999]) {
    mixer.setTime(clip.duration*phase);gltf.scene.updateMatrixWorld(true);mesh.computeBoundingBox();
    const bounds=new THREE.Box3().setFromObject(gltf.scene);
    assert.ok(bounds.min.toArray().concat(bounds.max.toArray()).every(Number.isFinite),`${clip.name} has finite skinning`);
    assert.ok(bounds.min.y > -.003 && bounds.min.y < .01,`${clip.name} keeps the original ground contact`);
    assert.ok(bounds.max.y < 1.05 && bounds.max.y > .4,`${clip.name} retains the character's shape`);
    const pose=skinPose();
    if (!firstPose) firstPose=pose;
    else displacement=Math.max(displacement,skinDifference(firstPose,pose));
  }
  assert.ok(displacement > .0001,`${clip.name} deforms actual skinned vertices`);
}
mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);

const work=path.join(root,"work");fs.mkdirSync(work,{recursive:true});const temp=fs.mkdtempSync(path.join(work,"squirrel-model-test-"));
try {
  const gaitCode=ts.transpileModule(fs.readFileSync(path.join(root,"lib/squirrel-ar-gait.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  fs.writeFileSync(path.join(temp,"gait.mjs"),gaitCode);
  const {createSquirrelGaits}=await import(pathToFileURL(path.join(temp,"gait.mjs")).href);
  const signature=clips=>clips.map(clip=>clip.tracks.map(track=>createHash("sha256").update(Buffer.from(track.values.buffer,track.values.byteOffset,track.values.byteLength)).digest("hex")));
  const originalKeys=signature(gltf.animations);
  const gameClips=createSquirrelGaits(gltf.scene,gltf.animations);
  assert.deepEqual(signature(gltf.animations),originalKeys,"Game gait baking never edits the delivered clip data");
  for(let i=0;i<gameClips.length;i++)if(!["HG_Walk","HG_Run"].includes(gameClips[i].name))assert.equal(gameClips[i],gltf.animations[i],"Other seven authored clips remain unchanged");
  mesh.computeBoundingBox();
  const originalHeight=new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y;
  const jointIndices=mesh.geometry.attributes.skinIndex,jointWeights=mesh.geometry.attributes.skinWeight;
  const feet=["footL","footR"].map(name=>{
    const bone=mesh.skeleton.bones.findIndex(bone=>bone.name===name),ids=[];
    for(let i=0;i<jointIndices.count;i++)for(let k=0;k<4;k++)if(jointIndices.getComponent(i,k)===bone && jointWeights.getComponent(i,k)>.6)ids.push(i);
    assert.ok(ids.length>100,"Each paw has a representative surface region");
    return ids.filter((_,i)=>i%Math.ceil(ids.length/128)===0);
  });
  const head = mesh.skeleton.bones.find(bone => bone.name === "head");
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert());
  function headElevations(clip) {
    const player = new THREE.AnimationMixer(gltf.scene);
    player.clipAction(clip).play();
    const result = [.1, .25, .5, .75, .9].map(phase => {
      player.setTime(clip.duration * phase);
      return Math.asin(facing.clone().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())).y);
    });
    player.stopAllAction(); player.uncacheRoot(gltf.scene);
    return result;
  }
  for(const [name,minLift,minStride] of [["HG_Walk",5,9],["HG_Run",8,14]]) {
    const clip=gameClips.find(clip=>clip.name===name),player=new THREE.AnimationMixer(gltf.scene);
    const originalGaze = headElevations(gltf.animations.find(animation => animation.name === name));
    const lift = headElevations(clip).map((angle, frame) => (angle - originalGaze[frame]) * 180 / Math.PI);
    assert.ok(Math.min(...lift) >= (name === "HG_Run" ? 19 : 10), `${name} lifts the articulated head through each stride: ${lift}`);
    player.clipAction(clip).reset().setLoop(THREE.LoopOnce,1).play().clampWhenFinished=true;
    const centers=feet.map(()=>[]);let lowest=Infinity;
    for(let sample=0;sample<=48;sample++) {
      player.setTime(clip.duration*sample/48);gltf.scene.updateMatrixWorld(true);
      feet.forEach((ids,side)=>{
        const center=new THREE.Vector3();
        for(const id of ids){const point=mesh.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);center.add(point);lowest=Math.min(lowest,point.y);}
        centers[side].push(center.divideScalar(ids.length));
      });
    }
    for(const points of centers) {
      const pixels=new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3()).multiplyScalar(180/originalHeight);
      assert.ok(pixels.y>=minLift,`${name} needs at least ${minLift}px paw lift at actual 180px game size; got ${pixels.y}`);
      assert.ok(pixels.z>=minStride,`${name} needs at least ${minStride}px visible stride from the side; got ${pixels.z}`);
    }
    assert.ok(lowest>-.002,`${name} keeps paws above the floor`);
    player.stopAllAction();player.uncacheRoot(gltf.scene);gltf.scene.updateMatrixWorld(true);
  }
  const gameCode=ts.transpileModule(fs.readFileSync(path.join(root,"lib/squirrel-ar-game.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const practiceCode=ts.transpileModule(fs.readFileSync(path.join(root,"lib/squirrel-game.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const practiceUrl=`data:text/javascript;base64,${Buffer.from(practiceCode).toString("base64")}`;
  const gameUrl=`data:text/javascript;base64,${Buffer.from(gameCode.replace('"./squirrel-game"',JSON.stringify(practiceUrl))).toString("base64")}`;
  const framingFile = path.join(temp,"framing.mjs");
  const framingCode = ts.transpileModule(fs.readFileSync(path.join(root,"lib/squirrel-ar-framing.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  fs.writeFileSync(framingFile,framingCode.replace('"./squirrel-ar-game"',JSON.stringify(gameUrl)));
  const {frameSquirrelPlacement,squirrelSilhouette} = await import(pathToFileURL(framingFile).href);
  const {initialWorldGame, placeWorldGame, worldSquirrelPosition, zoneCrossSection, beginWorldCatch, advanceWorldGame, worldTiming} = await import(gameUrl);
  for(const [width,height,offset,depth,oldX,oldZ] of [[390,844,0,1.56,.139,.223],[360,780,.13,1.65,.054,.15],[844,390,0,2,.88,.63]]) {
    const camera = new THREE.PerspectiveCamera(58,width/height,.01,100);
    camera.position.set(0,1.5,0); camera.lookAt(0,.24,-2); camera.updateMatrixWorld();
    const anchor = new THREE.Vector3(offset,0,-depth), yaw = Math.atan2(-offset,depth);
    const {zone,scale} = frameSquirrelPlacement(anchor,yaw,camera,height);
    assert.ok(zone.x>oldX*1.18 && zone.z>oldZ*1.25,"The framed zone grows in both directions on the same camera and real anchor");
    for (const side of [-1,1]) for (const dz of [-zone.z,zone.z]) {
      const edge = zoneCrossSection(zone, zone.centerZ + dz);
      const corner = new THREE.Vector3(edge.centerX + side * edge.x,0,zone.centerZ+dz).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(anchor);
      for(const [low,high,radius] of squirrelSilhouette) for(const y of [low,high]) for(let i=0;i<32;i++) {
        const angle=2*Math.PI*i/32;
        const p=new THREE.Vector3(radius*Math.cos(angle),y,radius*Math.sin(angle)).multiplyScalar(scale).add(corner).project(camera);
        assert.ok(Math.abs(p.x)<.971 && Math.abs(p.y)<.961 && p.z<1 && p.z>-1,`All poses and headings fit every route corner at ${width}×${height}`);
      }
    }
  }
  // Measure the projected torso while the real chase runs. Floor dimensions by
  // themselves missed a very narrow crossing on portrait phones.
  const chaseViews = [
    { width: 384, height: 700, range: 2 }, // XR8 fixture's normal floor hit
    { width: 384, height: 700, range: 1.56 },
    { width: 390, height: 606, range: 1.7 }, // Portrait game under Safari browser controls
    { width: 360, height: 780, range: 1.65, offset: .13 },
    { width: 384, height: 700, range: 1.7, offset: -.15, eye: 1.15, lookY: .12, lookZ: -1.65, roll: .06 },
    { width: 844, height: 390, range: 2 },
  ];
  for (const { width, height, range, offset = 0, eye = 1.5, lookY = .24, lookZ = -2, roll = 0 } of chaseViews) {
    const camera = new THREE.PerspectiveCamera(58, width / height, .01, 100);
    camera.position.set(0, eye, 0); camera.lookAt(0, lookY, lookZ); camera.rotateZ(roll); camera.updateMatrixWorld();
    const anchor = new THREE.Vector3(offset, 0, -range), yaw = Math.atan2(-offset, range);
    const { zone, scale } = frameSquirrelPlacement(anchor, yaw, camera, height);
    const head = anchor.clone().add(new THREE.Vector3(0, .56 * scale, 0)).project(camera);
    const silhouetteHeight = Math.abs(head.y - anchor.clone().project(camera).y) * height / 2;
    assert.ok(silhouetteHeight >= 42, "The character stays readable at its placement point");
    for (const seed of [1, 13, 363, 74232, 265403]) {
      let state = placeWorldGame(initialWorldGame(seed), anchor, yaw, zone);
      state = advanceWorldGame(state, worldTiming.waiting, true);
      state = beginWorldCatch(advanceWorldGame(state, worldTiming.entering, true));
      const torso = new THREE.Vector3(), route = new THREE.Box3();
      for (; state.phase === "playing"; state = advanceWorldGame(state, 64, true)) {
        torso.copy(worldSquirrelPosition(state));
        torso.y += .24 * scale;
        route.expandByPoint(torso.project(camera));
      }
      const span = route.getSize(new THREE.Vector3());
      assert.ok(span.x / 2 >= (width > height ? .50 : .57),
        `The actual chase crosses the screen at ${width}×${height}, range ${range}, seed ${seed}`);
      assert.ok(span.y / 2 >= (width > height ? .28 : .34),
        `The chase uses the near and far parts of the screen at ${width}×${height}, range ${range}, seed ${seed}`);
    }
  }
  const code=ts.transpileModule(fs.readFileSync(path.join(root,"lib/squirrel-ar-model.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
    .replace("../public/game/mascot/manifest.json",pathToFileURL(path.join(root,"public/game/mascot/manifest.json")).href)
    .replace('"./squirrel-ar-game"',JSON.stringify(gameUrl))
    .replace('"./squirrel-ar-gait"','"./gait.mjs"');
  const file=path.join(temp,"model.mjs");fs.writeFileSync(file,code);
  const {createSquirrelCharacter,squirrelGameClip,squirrelModelUrl}=await import(pathToFileURL(file).href);
  assert.equal(squirrelModelUrl,`/game/mascot/${manifest.file}`);
  const character=createSquirrelCharacter(gltf);
  const state={phase:"encounter",elapsed:0,round:1};
  character.root.updateMatrixWorld(true);mesh.computeBoundingBox();
  const bounds=new THREE.Box3().setFromObject(character.root);
  assert.ok(Math.abs(bounds.max.y-.56) < .01 && Math.abs(bounds.min.y) < .002,"The model is normalized once, with its feet on the anchor");
  mesh.boundingBox=new THREE.Box3(new THREE.Vector3(-4,-4,-4),new THREE.Vector3(4,4,4));
  character.update(state,16,false,.5,0);
  assert.equal(character.root.userData.animation,"HG_Walk");
  const before=mesh.skeleton.bones.map(bone=>bone.quaternion.toArray());
  for(let i=0;i<12;i++)character.update(state,16,false,.5,0);
  const after=mesh.skeleton.bones.map(bone=>bone.quaternion.toArray());
  assert.notDeepEqual(after,before,"Authored walk animation actually moves the skeleton");
  character.update({...state,phase:"playing"},16,false,1.5,Math.PI/2);
  assert.equal(character.root.userData.animation,"HG_Run");
  assert.ok(character.root.rotation.y > 0 && character.root.rotation.y < Math.PI/2,"Turning eases toward the movement direction");
  assert.equal(squirrelGameClip({...state,phase:"caught",elapsed:0}),"HG_Sit_Intro");
  assert.equal(squirrelGameClip({...state,phase:"caught",elapsed:1100}),"HG_Sit_Loop");
  assert.equal(squirrelGameClip({...state,phase:"caught",round:2,elapsed:0}),"HG_Sit_LegsOut_Intro");
  assert.equal(squirrelGameClip({...state,phase:"caught",round:2,elapsed:1100}),"HG_Sit_LegsOut_Loop");
  character.update({...state,phase:"caught",elapsed:0},16,false,0,0);
  for(let i=0;i<65;i++)character.update({...state,phase:"caught",elapsed:i*16},16,false,0,0);
  assert.equal(character.root.userData.animation,"HG_Sit_Loop","The one-shot catch intro hands over to its matching loop");
  const animationCases=[
    ["HG_Idle","encounter",3200,1], ["HG_Walk","encounter",1000,1], ["HG_Run","playing",1000,1],
    ["HG_Sit_Intro","encounter",4400,1], ["HG_Sit_Loop","encounter",6200,1],
    ["HG_Sit_LegsOut_Intro","encounter",4400,2], ["HG_Sit_LegsOut_Loop","encounter",6200,2],
    ["HG_Sleep_Curled","encounter",6200,3], ["HG_Sleep_Flat","encounter",6200,4],
  ];
  assert.deepEqual(animationCases.map(([,phase,elapsed,round])=>squirrelGameClip({phase,elapsed,round})),expectedClips,"All nine clips have visible gameplay states");
  for (const reduced of [false,true]) for (const [clip,phase,elapsed,round] of animationCases) {
    const poseState={phase,elapsed,round};
    for(let i=0;i<20;i++)character.update(poseState,16,reduced,1,0);
    const before=skinPose();
    for(let i=0;i<25;i++)character.update(poseState,16,reduced,1,0);
    assert.equal(character.root.userData.animation,clip);
    assert.ok(skinDifference(before,skinPose()) > .00001,`${clip} actually deforms the mesh with reduced motion ${reduced}`);
    const vertex = new THREE.Vector3(), count=mesh.geometry.attributes.position.count;
    for (let i=0;i<count;i+=Math.ceil(count/2700)) {
      mesh.getVertexPosition(i,vertex).applyMatrix4(mesh.matrixWorld);
      assert.ok(squirrelSilhouette.some(([low,high,radius]) => vertex.y>=low && vertex.y<=high && Math.hypot(vertex.x,vertex.z)<=radius),
        `${clip} fits the framing silhouette including the raised head and extended tail`);
    }
  }
  let disposed=0;mesh.geometry.addEventListener("dispose",()=>disposed++);
  character.dispose();character.dispose();assert.equal(disposed,1,"Asset disposal is idempotent");
} finally {fs.rmSync(temp,{recursive:true,force:true});}
console.log("Supplied squirrel: textures, rig, all nine visible gameplay clips, skinned-vertex movement in normal/reduced motion, ground contact, scale, turning, catch transitions and cleanup passed.");
