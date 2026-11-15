// The Citadel Heights map: a stone fortress courtyard on a hill. The Gilded Wardens
// attack uphill from the south terrace; the Ashen Covenant hold the main gate in
// the north wall. A squat watchtower on the west side and a guard loft on the east
// give the fight its vertical layer, with open lanes down the middle and along
// both flanks. Every solid is a plain box: the same box is the visible mesh, the
// player collider and the surface that stops a bullet.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MATS = {};
function materials() {
  if (MATS.slate) return MATS;
  const defs = {
    slate: { c: PALETTE.slate, r: 0.95 },
    slateDark: { c: PALETTE.slateDark, r: 0.97 },
    stonePale: { c: PALETTE.stonePale, r: 0.9 },
    gold: { c: PALETTE.gold, r: 0.5, m: 0.55 },
    goldDim: { c: PALETTE.goldDim, r: 0.6, m: 0.4 },
    moss: { c: PALETTE.moss, r: 1.0 },
    mossDark: { c: PALETTE.mossDark, r: 1.0 },
    timber: { c: '#5a4632', r: 0.9 },
    ground: { c: '#4c5548', r: 1.0 },
  };
  for (const [name, d] of Object.entries(defs)) {
    MATS[name] = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.c), roughness: d.r, metalness: d.m ?? 0.02 });
  }
  return MATS;
}

// Named places the rest of the game reasons about.
export const GATE_ZONE = new THREE.Vector3(0, 0, -14.6);
export const GATE_ZONE_RADIUS = 2.6;
export const WARDEN_SPAWNS = [
  new THREE.Vector3(-3.4, 0, 14.6), new THREE.Vector3(0, 0, 15.4),
  new THREE.Vector3(3.4, 0, 14.6), new THREE.Vector3(0, 0, 13.2),
];
export const ASHEN_SPAWNS = [
  new THREE.Vector3(-6.5, 0, -12.6), new THREE.Vector3(6.5, 0, -12.6),
  new THREE.Vector3(-15, 4.5, -2), new THREE.Vector3(14, 3, -8),
];
// Waypoint web across the courtyard. Bots walk these nodes; edges are implicit:
// each node lists the nodes it can walk straight to.
export const WAYPOINTS = [
  { p: new THREE.Vector3(0, 0, 13.5), next: [1, 2, 3] },
  { p: new THREE.Vector3(-7, 0, 8), next: [0, 4, 8] },
  { p: new THREE.Vector3(0, 0, 7.5), next: [0, 4, 5] },
  { p: new THREE.Vector3(7, 0, 8), next: [0, 5, 9] },
  { p: new THREE.Vector3(-5.5, 0, 0.5), next: [1, 2, 6, 10] },
  { p: new THREE.Vector3(5.5, 0, 0.5), next: [2, 3, 7, 11] },
  { p: new THREE.Vector3(-5.5, 0, -6.5), next: [4, 7, 12] },
  { p: new THREE.Vector3(5.5, 0, -6.5), next: [5, 6, 13] },
  { p: new THREE.Vector3(-10.5, 0, 3.5), next: [1, 10] },
  { p: new THREE.Vector3(11.5, 0, 4.5), next: [3, 11] },
  { p: new THREE.Vector3(-10.5, 0, -5), next: [8, 4, 12] },
  { p: new THREE.Vector3(11.5, 0, -4), next: [9, 5, 13] },
  { p: new THREE.Vector3(-6, 0, -12.4), next: [6, 10, 14] },
  { p: new THREE.Vector3(6, 0, -12.4), next: [7, 11, 14] },
  { p: new THREE.Vector3(0, 0, -11.6), next: [12, 13, 15] },
  { p: new THREE.Vector3(0, 0, -14.6), next: [14] },
];

export function createWorld(scene) {
  const mats = materials();
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
    mesh.position.set(x, y, z);
    if (opts.ry) mesh.rotation.y = opts.ry;
    mesh.castShadow = !opts.noShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!opts.decor) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }
  function trim(w, h, d, x, y, z, mat) { return box(w, h, d, x, y, z, mat, { decor: true, noShadow: true }); }

  // Ground slab and the hill apron falling away outside the walls.
  box(44, 0.4, 40, 0, -0.2, 0, 'ground');
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(46, 60, 10, 8), mats.mossDark);
  apron.position.set(0, -5.4, 0);
  apron.receiveShadow = true;
  group.add(apron);

  // Perimeter walls (height 5.4). North wall is split for the main gate.
  box(0.5, 5.4, 38, -21, 2.7, 0, 'slate');
  box(0.5, 5.4, 38, 21, 2.7, 0, 'slate');
  box(44, 5.4, 0.5, 0, 2.7, 18.5, 'slate');
  box(17.5, 5.4, 0.5, -12.2, 2.7, -18.5, 'slate');
  box(17.5, 5.4, 0.5, 12.2, 2.7, -18.5, 'slate');
  // Crenellations along the south and side walls.
  for (let x = -19; x <= 19; x += 3.2) trim(1.6, 0.7, 0.7, x, 5.75, 18.5, 'slateDark');
  for (let z = -16; z <= 16; z += 3.2) { trim(0.7, 0.7, 1.6, -21, 5.75, z, 'slateDark'); trim(0.7, 0.7, 1.6, 21, 5.75, z, 'slateDark'); }

  // The main gate: two gold-banded pillars, a heavy lintel, and twin timber doors
  // bound in faded gold. The doors swing open when the charge blows.
  box(1.6, 7, 1.4, -3.6, 3.5, -18.5, 'slateDark');
  box(1.6, 7, 1.4, 3.6, 3.5, -18.5, 'slateDark');
  trim(1.7, 0.5, 1.5, -3.6, 5.2, -18.5, 'gold');
  trim(1.7, 0.5, 1.5, 3.6, 5.2, -18.5, 'gold');
  box(8.8, 1.1, 1.4, 0, 7.4, -18.5, 'slateDark');
  trim(8.8, 0.28, 1.5, 0, 6.8, -18.5, 'goldDim');
  const doorGeoL = new THREE.BoxGeometry(2.8, 5.6, 0.35);
  doorGeoL.translate(1.4, 0, 0);
  const doorGeoR = new THREE.BoxGeometry(2.8, 5.6, 0.35);
  doorGeoR.translate(-1.4, 0, 0);
  const doorL = new THREE.Mesh(doorGeoL, mats.timber);
  doorL.position.set(-2.85, 2.8, -18.5);
  const doorR = new THREE.Mesh(doorGeoR, mats.timber);
  doorR.position.set(2.85, 2.8, -18.5);
  doorL.castShadow = doorR.castShadow = true;
  group.add(doorL, doorR);
  colliders.push(new THREE.Box3().setFromObject(doorL), new THREE.Box3().setFromObject(doorR));
  shootables.push(doorL, doorR);
  trim(2.8, 0.3, 0.42, -1.45, 4.4, -18.5, 'goldDim');
  trim(2.8, 0.3, 0.42, 1.45, 4.4, -18.5, 'goldDim');

  // The plant marker: a gold ring inlaid in the stones before the gate.
  const ring = new THREE.Mesh(new THREE.RingGeometry(GATE_ZONE_RADIUS - 0.22, GATE_ZONE_RADIUS, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.gold), transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(GATE_ZONE.x, 0.02, GATE_ZONE.z);
  group.add(ring);

  // West watchtower: a solid stone keep with a fighting top, reached by six stone
  // steps up its east face. Parapets guard the top on three sides.
  box(8, 4.5, 10, -15.5, 2.25, -1, 'slate');
  trim(8.4, 0.35, 10.4, -15.5, 4.65, -1, 'stonePale');
  box(8, 0.8, 0.4, -15.5, 5.2, -5.8, 'slateDark');
  box(0.4, 0.8, 10, -19.3, 5.2, -1, 'slateDark');
  box(8, 0.8, 0.4, -15.5, 5.2, 3.8, 'slateDark');
  trim(0.5, 1.6, 0.5, -15.5, 5.6, -1, 'goldDim'); // beacon post
  for (let i = 0; i < 6; i += 1) {
    box(2.4, 0.75 * (i + 1), 1.5, -10.2, 0.375 * (i + 1), 3.6 - i * 1.45, 'stonePale');
  }
  // Tower door arch facing the courtyard (visual inset).
  trim(1.8, 3, 0.2, -11.4, 1.5, -1, 'slateDark');

  // East guard loft: a lower platform with a timber rail, climbed by crates.
  box(6.5, 3, 6.5, 14.5, 1.5, -8, 'slate');
  trim(6.9, 0.3, 6.9, 14.5, 3.15, -8, 'stonePale');
  box(6.5, 0.7, 0.35, 14.5, 3.65, -11.1, 'timber');
  box(0.35, 0.7, 6.5, 11.4, 3.65, -8, 'timber');
  box(1.4, 1, 1.4, 10.2, 0.5, -5.4, 'timber');
  box(1.4, 2, 1.4, 10.2, 1, -7.6, 'timber');

  // Central plinth with the old bell post: hard cover in the middle lane.
  box(3.4, 1, 3.4, 0, 0.5, -3.5, 'stonePale');
  box(0.7, 2.4, 0.7, 0, 2.2, -3.5, 'slateDark');
  trim(1.7, 0.35, 0.35, 0, 3.5, -3.5, 'goldDim');
  const bell = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.8, 10), mats.gold);
  bell.position.set(0, 3, -3.5);
  bell.castShadow = true;
  group.add(bell);

  // Scattered cover: crates, low walls and mossy blocks across the lanes.
  const cover = [
    [1.5, 1.1, 1.5, -6.2, 0.55, 5.6, 'timber'], [1.5, 1.1, 1.5, -4.6, 0.55, 5.6, 'timber'],
    [1.5, 2.2, 1.5, -5.4, 1.1, 5.6, 'timber'],
    [1.5, 1.1, 1.5, 6.4, 0.55, 6.8, 'timber'], [1.5, 1.1, 1.5, 6.4, 0.55, 5.2, 'timber'],
    [4.4, 1.15, 0.7, -8.6, 0.57, -12.8, 'slate'], [4.4, 1.15, 0.7, 8.6, 0.57, -12.8, 'slate'],
    [0.7, 1.15, 4.2, -12.8, 0.57, 9.5, 'slate'], [0.7, 1.15, 4.2, 13.2, 0.57, 10.5, 'slate'],
    [2, 0.9, 2, -2.8, 0.45, -9.6, 'moss'], [2, 0.9, 2, 3.4, 0.45, -8.2, 'moss'],
    [1.5, 1.1, 1.5, 1.8, 0.55, 11.8, 'timber'], [1.5, 1.1, 1.5, -8.8, 0.55, -3.4, 'timber'],
    [1.5, 1.1, 1.5, 9.4, 0.55, -0.6, 'timber'], [2.2, 0.8, 1.1, 0.4, 0.4, 3.4, 'moss'],
  ];
  for (const c of cover) box(...c);

  // Moss patches and worn gold inlay lines dress the courtyard floor.
  const patchGeo = new THREE.PlaneGeometry(3.4, 2.4);
  const patchMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.moss), roughness: 1 });
  const patchSpots = [[-9, 12.5, 0.4], [8.5, -2, 1.2], [-3, -6.5, 2.1], [12, 12, 0.9], [-13, -9, 1.7], [4, 1.5, 2.8]];
  for (const [x, z, r] of patchSpots) {
    const patch = new THREE.Mesh(patchGeo, patchMat);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = r;
    patch.position.set(x, 0.015, z);
    patch.receiveShadow = true;
    group.add(patch);
  }
  trim(0.3, 0.02, 30, 0, 0.012, 1, 'goldDim');

  // Light: low warm sun from the south-west, cool sky fill, and a gold point light
  // at the gate so the objective always reads.
  const hemi = new THREE.HemisphereLight(new THREE.Color('#aebfd0'), new THREE.Color(PALETTE.mossDark), 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffe3b3'), 2.3);
  sun.position.set(-14, 20, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const gateGlow = new THREE.PointLight(new THREE.Color(PALETTE.gold), 30, 13, 1.6);
  gateGlow.position.set(0, 3.4, -16.4);
  scene.add(gateGlow);

  let gateOpen = 0;
  return {
    colliders,
    shootables,
    group,
    ring,
    setRingPulse(t) { ring.material.opacity = 0.4 + 0.3 * Math.sin(t * 4); },
    // Slides the gate doors aside and drops the lintel trim glow after a blast.
    blastGate(dt) {
      gateOpen = Math.min(1, gateOpen + dt * 0.7);
      doorL.rotation.y = -gateOpen * 1.9;
      doorR.rotation.y = gateOpen * 1.9;
      gateGlow.intensity = 30 * (1 - gateOpen) + 6;
      return gateOpen;
    },
    resetGate() {
      gateOpen = 0;
      doorL.rotation.y = 0;
      doorR.rotation.y = 0;
      gateGlow.intensity = 30;
    },
  };
}
