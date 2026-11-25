import * as THREE from "three";

// The source gaits use 7–13 mm paw lifts on a 950 mm character. Bake a more
// readable game gait onto that same rig; never mutate the delivered clips,
// geometry, weights, bind matrices, or the other seven animations.
const profiles = {
  HG_Walk: { stride:.03, lift:.033, crouch:.017, bounce:.009, lean:.065, sway:.025, arm:.08 },
  HG_Run: { stride:.047, lift:.052, crouch:.027, bounce:.018, lean:.12, sway:.04, arm:.15 },
} as const;
type GaitName = keyof typeof profiles;

function rotateWorld(bone: THREE.Bone, rotation: THREE.Quaternion) {
  const world=rotation.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  bone.quaternion.copy(bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
  bone.updateWorldMatrix(false,true);
}

// Two-bone analytic IK, using a pole to keep the knee bending forward. Segment
// lengths stay authored; unreachable targets are clamped instead of stretching.
function solveLeg(upper: THREE.Bone, lower: THREE.Bone, foot: THREE.Bone, target: THREE.Vector3, pole: THREE.Vector3) {
  const a=upper.getWorldPosition(new THREE.Vector3()), b=lower.getWorldPosition(new THREE.Vector3()), c=foot.getWorldPosition(new THREE.Vector3());
  const l1=a.distanceTo(b),l2=b.distanceTo(c),direction=target.clone().sub(a);
  const distance=THREE.MathUtils.clamp(direction.length(),Math.abs(l1-l2)+1e-6,l1+l2-1e-6);
  direction.normalize();
  const bend=pole.clone().sub(a).addScaledVector(direction,-pole.clone().sub(a).dot(direction)).normalize();
  const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
  const knee=a.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
  rotateWorld(upper,new THREE.Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(),knee.sub(a).normalize()));
  const kneeWorld=lower.getWorldPosition(new THREE.Vector3());
  const ankle=foot.getWorldPosition(new THREE.Vector3());
  const reachable=a.clone().addScaledVector(direction,distance);
  rotateWorld(lower,new THREE.Quaternion().setFromUnitVectors(ankle.sub(kneeWorld).normalize(),reachable.sub(kneeWorld).normalize()));
}

export function createSquirrelGaits(scene: THREE.Group, animations: THREE.AnimationClip[]) {
  scene.updateMatrixWorld(true);
  const bones: THREE.Bone[]=[];
  scene.traverse(object=>{if(object instanceof THREE.Bone)bones.push(object);});
  const bone=(name: string)=>{
    const result=bones.find(item=>item.name===name);
    if(!result)throw new Error(`Missing gait joint: ${name}`);
    return result;
  };
  const rest=bones.map(item=>({position:item.position.clone(),quaternion:item.quaternion.clone()}));
  const hips=bone("hips"), sceneRotation=scene.getWorldQuaternion(new THREE.Quaternion());
  const frameRotation=(rotation: THREE.Quaternion)=>sceneRotation.clone().multiply(rotation).multiply(sceneRotation.clone().invert());
  const direction=(vector: THREE.Vector3)=>vector.multiplyScalar(scene.getWorldScale(new THREE.Vector3()).y).applyQuaternion(sceneRotation);
  const legs=([-1,1] as const).map(side=>{
    const suffix=side===1 ? "L" : "R";
    const foot=bone(`foot${suffix}`),toe=bone(`toe${suffix}`);
    return {side,upper:bone(`thigh${suffix}`),lower:bone(`shin${suffix}`),foot,toe,
      ankle:scene.worldToLocal(foot.getWorldPosition(new THREE.Vector3())),
      orientation:sceneRotation.clone().invert().multiply(foot.getWorldQuaternion(new THREE.Quaternion())),toeRotation:toe.quaternion.clone(),
      arm:bone(`upper_arm${suffix}`)};
  });
  const mixer=new THREE.AnimationMixer(scene);
  const results=new Map<string,THREE.AnimationClip>();
  try {
    for(const name of Object.keys(profiles) as GaitName[]) {
      const source=animations.find(clip=>clip.name===name);
      if(!source)throw new Error(`Missing gait: ${name}`);
      const profile=profiles[name],times=source.tracks[0].times;
      const tracks=source.tracks.map(track=>{
        const split=track.name.lastIndexOf("."),target=track.name.slice(0,split),property=track.name.slice(split+1);
        const joint=bones.find(item=>item.name===target || item.uuid===target);
        if(!joint || !["position","quaternion"].includes(property) || track.times.length!==times.length)throw new Error("Unexpected gait channels");
        return {source:track,joint,property,values:new Float32Array(track.values.length)};
      });
      const action=mixer.clipAction(source).reset().setLoop(THREE.LoopOnce,1).play();action.clampWhenFinished=true;
      for(let frame=0;frame<times.length;frame++) {
        mixer.setTime(times[frame]);scene.updateMatrixWorld(true);
        // Restore this sampled source pose after recording. PropertyMixer skips
        // unchanged channels; leaving our edits behind would accumulate them.
        const sampled=bones.map(item=>({position:item.position.clone(),quaternion:item.quaternion.clone()}));
        const phase=times[frame]/source.duration,angle=phase*Math.PI*2;
        const hip=hips.getWorldPosition(new THREE.Vector3()).add(direction(new THREE.Vector3(0,-profile.crouch+profile.bounce*(1-Math.cos(angle*2))/2,0)));
        hips.position.copy(hips.parent!.worldToLocal(hip));
        rotateWorld(hips,frameRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(profile.lean,0,profile.sway*Math.sin(angle)))));
        for(const leg of legs) {
          const p=(phase+(leg.side===1 ? 0 : .5))%1;
          const swing=p>=.55, u=swing ? (p-.55)/.45 : p/.55;
          const lift=swing ? profile.lift*Math.pow(Math.sin(Math.PI*u),1.5) : 0;
          const travel=(swing ? -1 : 1)*profile.stride*Math.cos(Math.PI*u);
          const target=scene.localToWorld(leg.ankle.clone().add(new THREE.Vector3(0,lift,travel)));
          const pole=leg.upper.getWorldPosition(new THREE.Vector3()).add(direction(new THREE.Vector3(leg.side*.01,-.06,.2)));
          solveLeg(leg.upper,leg.lower,leg.foot,target,pole);
          const pitch=swing ? -.12*Math.sin(Math.PI*u) : 0;
          const footRotation=sceneRotation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),pitch)).multiply(leg.orientation);
          leg.foot.quaternion.copy(leg.foot.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(footRotation));
          leg.toe.quaternion.copy(leg.toeRotation);
          rotateWorld(leg.arm,frameRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-leg.side*profile.arm*Math.sin(angle))));
        }
        scene.updateMatrixWorld(true);
        for(const track of tracks) {
          const value=track.property==="position" ? track.joint.position : track.joint.quaternion;
          value.toArray(track.values,frame*(track.property==="position" ? 3 : 4));
        }
        bones.forEach((item,index)=>{item.position.copy(sampled[index].position);item.quaternion.copy(sampled[index].quaternion);});
      }
      const baked=tracks.map(track=>{
        const result=track.source.clone(),size=result.getValueSize();
        track.values.set(track.values.subarray(0,size),track.values.length-size);
        result.values=track.values;return result;
      });
      results.set(name,new THREE.AnimationClip(name,source.duration,baked));
      mixer.stopAllAction();
    }
  } finally {
    mixer.stopAllAction();mixer.uncacheRoot(scene);
    bones.forEach((item,index)=>{item.position.copy(rest[index].position);item.quaternion.copy(rest[index].quaternion);});
    scene.updateMatrixWorld(true);
  }
  return animations.map(clip=>results.get(clip.name) ?? clip);
}
