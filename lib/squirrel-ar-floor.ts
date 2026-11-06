import type { Vec3 } from "./squirrel-ar-game";

export type SurfaceHit = { position: Vec3; rotation?: { x:number; y:number; z:number; w:number }; distance:number; type:string };
export type WorldPoint = { position:Vec3; confidence:number };
export type FloorEstimate = { position:Vec3; source:"surface" | "points" };
export type FloorLock = { point:Vec3 | null; stableMs:number; missingMs:number };
export const emptyFloorLock = (): FloorLock => ({point:null,stableMs:0,missingMs:0});
export const floorSettleTime = 900;
const finite = (p:Vec3) => [p.x,p.y,p.z].every(Number.isFinite);

// Floor is inferred from horizontal geometry below the device, rather than
// treating an arbitrary feature on a wall as a usable walking surface.
export function estimateFloor(hits:SurfaceHit[], points:WorldPoint[], camera:Vec3): FloorEstimate | null {
  const below = (p:Vec3) => finite(p) && camera.y-p.y >= .55 && camera.y-p.y <= 2.6 && Math.hypot(p.x-camera.x,p.z-camera.z) < 4;
  const surfaces = hits.filter(hit => {
    const q=hit.rotation;
    return ["ESTIMATED_SURFACE","DETECTED_SURFACE"].includes(hit.type) && below(hit.position) && Number.isFinite(hit.distance) && hit.distance > .6 && hit.distance < 4.8
      && !!q && [q.x,q.y,q.z,q.w].every(Number.isFinite) && Math.abs(q.x*q.x+q.y*q.y+q.z*q.z+q.w*q.w-1) < .05 && 1-2*(q.x*q.x+q.z*q.z) > .92;
  }).sort((a,b)=>a.position.y-b.position.y || Math.abs(a.distance-2)-Math.abs(b.distance-2));
  if (surfaces[0]) return {position:{...surfaces[0].position},source:"surface"};

  // If the SDK has points but no plane, look for a broad horizontal cluster.
  // A lone point or a narrow line cannot unlock automatic placement.
  const usable = points.filter(p=>Number.isFinite(p.confidence) && p.confidence > .1 && below(p.position)).map(p=>p.position).sort((a,b)=>a.y-b.y).slice(0,256);
  for (let i=0;i<usable.length;i++) {
    const cluster = usable.slice(i).filter(p=>p.y-usable[i].y < .07);
    if (cluster.length < 8) continue;
    const xs=cluster.map(p=>p.x), zs=cluster.map(p=>p.z);
    if (Math.max(...xs)-Math.min(...xs) < .3 || Math.max(...zs)-Math.min(...zs) < .3) continue;
    const p=cluster.reduce((a,b)=>({x:a.x+b.x/cluster.length,y:a.y+b.y/cluster.length,z:a.z+b.z/cluster.length}),{x:0,y:0,z:0});
    const covariance=cluster.reduce((v,q)=>({xx:v.xx+(q.x-p.x)**2/cluster.length,zz:v.zz+(q.z-p.z)**2/cluster.length,xz:v.xz+(q.x-p.x)*(q.z-p.z)/cluster.length}),{xx:0,zz:0,xz:0});
    if (covariance.xx*covariance.zz-covariance.xz**2 < .0002) continue;
    return {position:p,source:"points"};
  }
  return null;
}

export function updateFloorLock(lock:FloorLock, estimate:Vec3 | null, elapsed:number, tracked:boolean): FloorLock {
  if (!tracked) return emptyFloorLock();
  const delta=Math.max(0,Math.min(200,elapsed));
  if (!estimate) return lock.missingMs+delta > 600 ? emptyFloorLock() : {...lock,missingMs:lock.missingMs+delta};
  if (!finite(estimate)) return emptyFloorLock();
  if (!lock.point || Math.abs(lock.point.y-estimate.y) > .09) return {point:{...estimate},stableMs:0,missingMs:0};
  return {point:lock.point,stableMs:Math.min(floorSettleTime,lock.stableMs+delta),missingMs:0};
}
