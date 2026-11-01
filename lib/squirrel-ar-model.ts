import * as THREE from "three";

// A lightweight, articulated version of the angular orange mascot. Feet are at
// local y=0; the model is 46 cm high when the tracker has estimated metric scale.
export function createSquirrelModel() {
  const root = new THREE.Group();
  root.name = "squirrel-model";
  const body = new THREE.Group(); root.add(body);
  const orange = new THREE.MeshStandardMaterial({ color: 0xe77c19, roughness: .88, flatShading: true });
  const darkOrange = new THREE.MeshStandardMaterial({ color: 0xb74c0d, roughness: .9 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xffedc9, roughness: 1 });
  const brown = new THREE.MeshStandardMaterial({ color: 0x3b2417, roughness: .8 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .8 });
  function ellipsoid(parent: THREE.Object3D, material: THREE.Material, xyz: number[], scale: number[]) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), material);
    mesh.position.set(xyz[0], xyz[1], xyz[2]); mesh.scale.set(scale[0], scale[1], scale[2]); parent.add(mesh); return mesh;
  }
  ellipsoid(body, orange, [0,.22,0], [.075,.12,.06]);
  ellipsoid(body, cream, [0,.22,.051], [.047,.095,.016]);
  const head = new THREE.Group(); head.position.set(0,.365,0); body.add(head);
  const headMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(.105, 0), orange);
  headMesh.scale.set(1.1,.83,.8); head.add(headMesh);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.032,.085,3), orange);
    ear.position.set(side*.071,.058,-.013); ear.rotation.z = -side*.23; head.add(ear);
    const inside = new THREE.Mesh(new THREE.ConeGeometry(.015,.051,3), cream);
    inside.position.copy(ear.position).add(new THREE.Vector3(0,.003,.014)); inside.rotation.copy(ear.rotation); head.add(inside);
    ellipsoid(head, cream, [side*.053,-.012,.062], [.041,.04,.021]);
    ellipsoid(head, white, [side*.045,.013,.069], [.023,.032,.013]);
    ellipsoid(head, brown, [side*.04,.013,.081], [.009,.021,.006]);
  }
  ellipsoid(head, cream, [0,-.044,.068], [.044,.02,.022]);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.018,.022,3), brown);
  nose.rotation.x = Math.PI/2; nose.position.set(0,-.019,.092); head.add(nose);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(.018,.019,.009), white);
  tooth.position.set(0,-.055,.087); head.add(tooth);
  const tail = new THREE.Group(); tail.position.set(0,.09,-.04); body.add(tail);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,0), new THREE.Vector3(.05,.06,-.1), new THREE.Vector3(.09,.20,-.16),
    new THREE.Vector3(.065,.30,-.14), new THREE.Vector3(-.02,.31,-.11), new THREE.Vector3(-.065,.24,-.1), new THREE.Vector3(-.03,.18,-.09),
  ]);
  tail.add(new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 28, .048, 8, false), darkOrange));
  const stripe = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 28, .012, 6, false), orange);
  stripe.position.z = .046; tail.add(stripe);
  const legs: THREE.Group[] = [], arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side*.042,.12,0); body.add(leg); legs.push(leg);
    ellipsoid(leg, orange, [0,-.048,0], [.019,.064,.022]);
    ellipsoid(leg, orange, [0,-.105,.025], [.03,.015,.049]);
    const arm = new THREE.Group(); arm.position.set(side*.065,.28,0); body.add(arm); arms.push(arm);
    arm.rotation.z = side*.15;
    ellipsoid(arm, orange, [0,-.04,.005], [.015,.055,.018]);
    ellipsoid(arm, cream, [0,-.09,.01], [.018,.023,.022]);
  }
  return { root, animate(time: number, running: boolean, caught: boolean, reduced: boolean) {
    const swing = reduced ? 0 : Math.sin(time * (running ? 16 : 2));
    body.position.y = running && !reduced ? Math.abs(swing) * .015 : 0;
    tail.rotation.z = swing * .09;
    head.rotation.z = running ? 0 : swing * .035;
    legs.forEach((leg, index) => { leg.rotation.x = running ? swing * (index ? -.6 : .6) : 0; });
    arms.forEach((arm, index) => { arm.rotation.z = caught ? (index ? -2.6 : 2.6) : index ? .15 : -.15; arm.rotation.x = running ? swing * (index ? .6 : -.6) : 0; });
  } };
}

export function disposeScene(scene: THREE.Object3D) {
  const materials = new Set<THREE.Material>(); const geometries = new Set<THREE.BufferGeometry>();
  scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Line) { geometries.add(object.geometry); const material = object.material; (Array.isArray(material) ? material : [material]).forEach(item => materials.add(item)); } });
  geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
}
