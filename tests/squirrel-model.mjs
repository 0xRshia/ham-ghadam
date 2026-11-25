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
  for(const [name,minLift,minStride] of [["HG_Walk",5,9],["HG_Run",8,14]]) {
    const clip=gameClips.find(clip=>clip.name===name),player=new THREE.AnimationMixer(gltf.scene);
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
  const gameUrl=`data:text/javascript;base64,${Buffer.from(gameCode).toString("base64")}`;
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
  }
  let disposed=0;mesh.geometry.addEventListener("dispose",()=>disposed++);
  character.dispose();character.dispose();assert.equal(disposed,1,"Asset disposal is idempotent");
} finally {fs.rmSync(temp,{recursive:true,force:true});}
console.log("Supplied squirrel: textures, rig, all nine visible gameplay clips, skinned-vertex movement in normal/reduced motion, ground contact, scale, turning, catch transitions and cleanup passed.");
