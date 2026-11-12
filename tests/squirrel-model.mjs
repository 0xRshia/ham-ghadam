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
for(const clip of gltf.animations) {
  assert.equal(clip.tracks.length,68);
  const declared=manifest.clips.find(item=>item.name===clip.name);
  assert.ok(Math.abs(clip.duration-declared.duration) < .000001);
  mixer.stopAllAction();mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce,1).play().clampWhenFinished=true;
  for(const phase of [0,.25,.5,.75,.9999]) {
    mixer.setTime(clip.duration*phase);gltf.scene.updateMatrixWorld(true);mesh.computeBoundingBox();
    const bounds=new THREE.Box3().setFromObject(gltf.scene);
    assert.ok(bounds.min.toArray().concat(bounds.max.toArray()).every(Number.isFinite),`${clip.name} has finite skinning`);
    assert.ok(bounds.min.y > -.003 && bounds.min.y < .01,`${clip.name} keeps the original ground contact`);
    assert.ok(bounds.max.y < 1.05 && bounds.max.y > .4,`${clip.name} retains the character's shape`);
  }
}
mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);

const work=path.join(root,"work");fs.mkdirSync(work,{recursive:true});const temp=fs.mkdtempSync(path.join(work,"squirrel-model-test-"));
try {
  const code=ts.transpileModule(fs.readFileSync(path.join(root,"lib/squirrel-ar-model.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
    .replace("../public/game/mascot/manifest.json",pathToFileURL(path.join(root,"public/game/mascot/manifest.json")).href);
  const file=path.join(temp,"model.mjs");fs.writeFileSync(file,code);
  const {createSquirrelCharacter,squirrelGameClip,squirrelModelUrl}=await import(pathToFileURL(file).href);
  assert.equal(squirrelModelUrl,`/game/mascot/${manifest.file}`);
  const character=createSquirrelCharacter(gltf);
  const state={phase:"encounter",elapsed:0,round:1};
  character.update(state,16,false,.5,0);
  assert.equal(character.root.userData.animation,"HG_Walk");
  character.root.updateMatrixWorld(true);mesh.computeBoundingBox();
  const bounds=new THREE.Box3().setFromObject(character.root);
  assert.ok(Math.abs(bounds.max.y-.56) < .01 && Math.abs(bounds.min.y) < .002,"The model is normalized once, with its feet on the anchor");
  mesh.boundingBox=new THREE.Box3(new THREE.Vector3(-4,-4,-4),new THREE.Vector3(4,4,4));
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
  character.update(state,16,true,0,0);
  const paused=mesh.skeleton.bones.map(bone=>bone.quaternion.toArray());
  character.update(state,5000,true,0,0);
  assert.deepEqual(mesh.skeleton.bones.map(bone=>bone.quaternion.toArray()),paused,"Reduced motion pauses the authored animation");
  let disposed=0;mesh.geometry.addEventListener("dispose",()=>disposed++);
  character.dispose();character.dispose();assert.equal(disposed,1,"Asset disposal is idempotent");
} finally {fs.rmSync(temp,{recursive:true,force:true});}
console.log("Supplied squirrel: embedded textures, 34-joint skin, nine real clips, original ground contact, normalized scale, gait/turning, catch intro-to-loop, reduced motion and cleanup passed.");
