import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import asset from "../public/game/mascot/manifest.json" with { type: "json" };
import { encounterRoutine, worldEncounterActivity, type WorldGame } from "./squirrel-ar-game";
import { createSquirrelGaits } from "./squirrel-ar-gait";

export const squirrelModelUrl = `/game/mascot/${asset.file}`;
export const squirrelModelHeight = .56;
export const squirrelClipNames = ["HG_Idle","HG_Walk","HG_Run","HG_Sit_Intro","HG_Sit_Loop","HG_Sit_LegsOut_Intro","HG_Sit_LegsOut_Loop","HG_Sleep_Curled","HG_Sleep_Flat"] as const;
export type SquirrelClip = typeof squirrelClipNames[number];
type PoseState = Pick<WorldGame,"phase" | "elapsed" | "round">;

export function squirrelGameClip(state: PoseState): SquirrelClip {
  if (["entering","playing","escaping"].includes(state.phase)) return "HG_Run";
  if (state.phase === "encounter") {
    const activity=worldEncounterActivity(state);
    if (activity === "walk") return "HG_Walk";
    if (activity === "sleepCurled") return "HG_Sleep_Curled";
    if (activity === "sleepFlat") return "HG_Sleep_Flat";
    if (activity === "idle") return "HG_Idle";
    const intro=state.elapsed-encounterRoutine.restStart < 1000;
    return activity === "legsOut" ? intro ? "HG_Sit_LegsOut_Intro" : "HG_Sit_LegsOut_Loop" : intro ? "HG_Sit_Intro" : "HG_Sit_Loop";
  }
  if (state.phase === "caught") {
    const legsOut=state.round%2 === 0;
    return state.elapsed < 1000 ? legsOut ? "HG_Sit_LegsOut_Intro" : "HG_Sit_Intro" : legsOut ? "HG_Sit_LegsOut_Loop" : "HG_Sit_Loop";
  }
  return "HG_Idle";
}

export type SquirrelCharacter = ReturnType<typeof createSquirrelCharacter>;

export async function loadSquirrelCharacter(signal: AbortSignal): Promise<SquirrelCharacter> {
  let gltf: GLTF | null=null;
  try {
    signal.throwIfAborted();
    const response=await fetch(squirrelModelUrl,{signal});
    if (!response.ok) throw new Error("model");
    const data=await response.arrayBuffer(); signal.throwIfAborted();
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    gltf=await loader.parseAsync(data,"/game/mascot/");
    signal.throwIfAborted();
    const character=createSquirrelCharacter(gltf); gltf=null;
    return character;
  } catch (error) {
    if (gltf) disposeScene(gltf.scene);
    if (signal.aborted) throw signal.reason;
    console.error("Could not load the supplied squirrel model",error);
    throw new Error("model");
  }
}

export function createSquirrelCharacter(gltf: GLTF) {
  const clips=new Map(createSquirrelGaits(gltf.scene,gltf.animations).map(clip=>[clip.name,clip]));
  if (squirrelClipNames.some(name=>!clips.has(name))) throw new Error("model");
  const meshes: THREE.SkinnedMesh[]=[];
  gltf.scene.traverse(object=>{if (object instanceof THREE.SkinnedMesh) meshes.push(object);});
  if (!meshes.length) throw new Error("model");
  gltf.scene.updateMatrixWorld(true);
  meshes.forEach(mesh=>mesh.computeBoundingBox());
  const bounds=new THREE.Box3().setFromObject(gltf.scene), height=bounds.max.y-bounds.min.y;
  if (!Number.isFinite(height) || height <= 0) throw new Error("model");
  const pelvisRoot=meshes[0].skeleton.bones.find(bone=>bone.name === "root");
  if (!pelvisRoot) throw new Error("model");
  const pivot=pelvisRoot.getWorldPosition(new THREE.Vector3());
  // Preserve the mesh transform, inverse bind matrices and bone keys as a unit.
  // Normalize outside the authored scene, with its feet on the AR anchor.
  const root=new THREE.Group(); root.name="squirrel-model";
  const visual=new THREE.Group(); visual.name="squirrel-asset"; visual.scale.setScalar(squirrelModelHeight/height);
  gltf.scene.position.add(new THREE.Vector3(-pivot.x,-bounds.min.y,-pivot.z));
  visual.add(gltf.scene); root.add(visual);
  root.userData.character="3d"; root.userData.asset=asset.file;
  root.userData.clips=[...squirrelClipNames];
  for (const mesh of meshes) {
    mesh.frustumCulled=false;
    // A conservative bound covers the supplied standing, sitting and sleep
    // poses. Stale bind-pose bounds must not reject a valid animated-mesh tap.
    mesh.boundingBox=new THREE.Box3(new THREE.Vector3(-4,-4,-4),new THREE.Vector3(4,4,4)); mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(),4);
  }
  const mixer=new THREE.AnimationMixer(gltf.scene);
  const actions=new Map(squirrelClipNames.map(name=>[name,mixer.clipAction(clips.get(name)!)]));
  let current: THREE.AnimationAction | null=null, disposed=false, headingSet=false;

  function play(name: SquirrelClip) {
    if (disposed) return;
    const next=actions.get(name)!;
    if (next === current) return;
    const previous=current; current=next;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
    const once=name.endsWith("_Intro");
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat,once ? 1 : Infinity);
    next.clampWhenFinished=once; next.play();
    if (previous) next.crossFadeFrom(previous,.2,false);
    mixer.update(0); root.userData.animation=name;
  }
  play("HG_Idle");
  return {
    root,
    play,
    update(state: PoseState,deltaMs: number,reduced: boolean,speed=0,heading?: number) {
      if (disposed) return;
      play(squirrelGameClip(state));
      if (heading !== undefined && Number.isFinite(heading)) {
        const difference=Math.atan2(Math.sin(heading-root.rotation.y),Math.cos(heading-root.rotation.y));
        root.rotation.y += difference*(headingSet && !reduced ? 1-Math.exp(-deltaMs/100) : 1); headingSet=true;
      }
      if (current) {
        // Reduced motion limits travel/turning in the game; it must not turn
        // the entire rig into a still model. Keep one-shot intros at real speed
        // so their one-second handover to the sitting loop stays synchronized.
        const once=current.getClip().name.endsWith("_Intro");
        const gait=root.userData.animation === "HG_Run" ? THREE.MathUtils.clamp(speed/.9,.95,1.65) : 1;
        current.paused=false;
        current.setEffectiveTimeScale(gait*(reduced && !once ? .75 : 1));
      }
      mixer.update(Math.max(0,Math.min(deltaMs,64))/1000);
      // Flush the authored bone pose before AR rendering and mesh picking.
      root.updateWorldMatrix(true,true);
      meshes.forEach(mesh=>mesh.skeleton.update());
      root.userData.phase=state.phase;
    },
    dispose() {
      if (disposed) return; disposed=true;
      mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
      root.removeFromParent(); disposeScene(root);
    },
  };
}

export function disposeScene(scene: THREE.Object3D) {
  const materials=new Set<THREE.Material>(), geometries=new Set<THREE.BufferGeometry>(), textures=new Set<THREE.Texture>(), skeletons=new Set<THREE.Skeleton>(), bitmaps=new Set<ImageBitmap>();
  scene.traverse(object=>{
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material=>materials.add(material));
    }
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  materials.forEach(material=>{for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);});
  textures.forEach(texture=>{if (typeof ImageBitmap !== "undefined" && texture.source.data instanceof ImageBitmap) bitmaps.add(texture.source.data);});
  geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());skeletons.forEach(value=>value.dispose());bitmaps.forEach(value=>value.close());
}
