import * as THREE from "three";
import { fitMovementZone, minChaseZone, squirrelPlacementScales, type MovementZone, type Vec3 } from "./squirrel-ar-game";

// Horizontal radius about the model pivot, at scale 1. These bands enclose
// all nine skinned poses through a complete turn, including Sleep_Flat's tail.
export const squirrelSilhouette = [
  [-.008, .08, .54], [.08, .16, .58], [.16, .24, .54],
  [.24, .48, .415], [.48, .56, .35], [.56, .58, .12],
] as const;

export function frameSquirrelPlacement(point: Vec3, yaw: number, view: THREE.Camera, viewportHeight: number, perspective = true) {
  view.updateMatrixWorld();
  const origin = new THREE.Vector3(point.x, point.y, point.z);
  const projection = new THREE.Matrix4().makeScale(1 / .97, 1 / .96, 1)
    .multiply(view.projectionMatrix).multiply(view.matrixWorldInverse);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(projection);
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const planes = frustum.planes.map(plane => {
    const { x, y, z } = plane.normal;
    const silhouetteInset = Math.min(...squirrelSilhouette.map(([low, high, radius]) =>
      y * (y > 0 ? low : high) - radius * Math.hypot(x, z)));
    return { a: plane.normal.dot(right), b: plane.normal.dot(forward), distance: plane.distanceToPoint(origin), silhouetteInset };
  });
  const footY = origin.clone().project(view).y;
  // Moving across the short dimension stays achievable on a wide landscape camera.
  const shorterSide = Math.min(1, view.projectionMatrix.elements[0] / view.projectionMatrix.elements[5]);
  let best: { zone: MovementZone; scale: number; score: number } | null = null;
  const projected = (x: number, z: number, y: number) => new THREE.Vector3(point.x, point.y + y, point.z)
    .addScaledVector(right, x).addScaledVector(forward, z).project(view);

  for (const scale of squirrelPlacementScales) {
    const bounds = planes.map(plane => ({ ...plane, clearance: plane.distance + scale * plane.silhouetteInset }));
    const fitted = fitMovementZone(bounds, perspective);
    if (fitted.x < minChaseZone.x || fitted.z < minChaseZone.z) continue;
    const cx = fitted.centerX ?? 0, cz = fitted.centerZ ?? 0;
    const near = cz + fitted.z, far = cz - fitted.z;
    const centerY = .24 * scale;
    const pixels = Math.abs(projected(0, 0, .56 * scale).y - footY) * viewportHeight / 2;
    // Scales are tried from largest to smallest. Keep the squirrel readable on a phone.
    if (best && pixels < Math.min(46, viewportHeight * .14)) break;
    const farEdge = fitted.farEdge ?? { x: fitted.x, centerX: cx };
    if (farEdge.x < minChaseZone.x) continue;
    const widthAt = (x: number, halfWidth: number, z: number) =>
      Math.abs(projected(x + halfWidth, z, centerY).x - projected(x - halfWidth, z, centerY).x) / 2;
    const width = Math.min(widthAt(cx, fitted.x, near), widthAt(farEdge.centerX, farEdge.x, far));
    const depth = Math.abs(projected(cx, near, centerY).y - projected(farEdge.centerX, far, centerY).y) / 2;
    const score = Math.min(1, width / (.80 * shorterSide), depth / .42, pixels / Math.min(50, viewportHeight * .14));
    if (!best || score > best.score) best = { zone: fitted, scale, score };
    if (score === 1) break;
  }
  return best;
}
