// Smoke grenades for Citadel Heights: a thrown canister that blooms into a
// pale cloud which genuinely blocks sight. This module owns the projectile,
// the cloud pool and the line-of-sight query; main.js owns the inventory and
// asks blocksLOS() from inside its losClear(), so a bot that could see a foe
// a moment ago loses them the moment the cloud blooms between them. Clouds
// stop bullets not at all — only vision — which is what makes them a
// repositioning tool rather than cover.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SMOKE_PRICE = 200;
const BLOOM_SECONDS = 0.55;
const LIFE_SECONDS = 7.5;
const FADE_SECONDS = 1.6;
const CLOUD_RADIUS = 2.7;
const POOL_SIZE = 4;
const FUSE_SECONDS = 1.15;

// Fixed puff layout inside one cloud (offsets + scale), so every cloud reads
// as the same lumpy mass without any runtime randomness.
const PUFFS = [
  [0, 0, 0, 1.5], [1.1, 0.25, 0.4, 1.05], [-1.05, 0.2, -0.3, 1.0],
  [0.4, 0.55, -0.95, 0.95], [-0.5, 0.5, 0.9, 0.9], [0.9, -0.15, -0.85, 0.85],
  [-0.9, -0.1, 0.75, 0.8],
];
const puffGeo = new THREE.SphereGeometry(1, 12, 10);

export function createSmokeSystem(scene, onBloom) {
  const clouds = [];
  for (let i = 0; i < POOL_SIZE; i += 1) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.stonePale), roughness: 1,
      transparent: true, opacity: 0, depthWrite: false,
    });
    const group = new THREE.Group();
    for (const [x, y, z, s] of PUFFS) {
      const puff = new THREE.Mesh(puffGeo, mat);
      puff.position.set(x, y, z);
      puff.scale.setScalar(s);
      group.add(puff);
    }
    group.visible = false;
    scene.add(group);
    clouds.push({ group, mat, centre: new THREE.Vector3(), age: 0, active: false });
  }

  const canister = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.slateDark), roughness: 0.5, metalness: 0.4 }),
  );
  canister.visible = false;
  scene.add(canister);
  const proj = { active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0 };

  function applyCloud(cloud) {
    const grow = Math.min(1, cloud.age / BLOOM_SECONDS);
    const fade = cloud.age > LIFE_SECONDS - FADE_SECONDS
      ? Math.max(0, (LIFE_SECONDS - cloud.age) / FADE_SECONDS) : 1;
    cloud.group.scale.setScalar(0.35 + 0.65 * grow);
    cloud.mat.opacity = 0.55 * grow * fade;
  }

  function bloomAt(pos, presetAge = 0) {
    // Reuse a free cloud, or the oldest live one when the pool is exhausted.
    let cloud = clouds.find((c) => !c.active) ?? clouds[0];
    if (cloud.active) for (const c of clouds) if (c.age > cloud.age) cloud = c;
    cloud.centre.set(pos.x, 1.25, pos.z);
    cloud.group.position.copy(cloud.centre);
    cloud.age = presetAge;
    cloud.active = true;
    cloud.group.visible = true;
    applyCloud(cloud);
    if (onBloom) onBloom();
    return cloud;
  }

  // Segment vs cloud: the closest approach of the sight line to a bloomed
  // cloud centre, using preallocated temps so perception checks stay free.
  const ab = new THREE.Vector3();
  const ap = new THREE.Vector3();
  function blocksLOS(from, to) {
    ab.subVectors(to, from);
    const lenSq = ab.lengthSq();
    if (lenSq < 0.0001) return false;
    for (const cloud of clouds) {
      if (!cloud.active || cloud.age < BLOOM_SECONDS * 0.5) continue;
      ap.subVectors(cloud.centre, from);
      const t = Math.max(0, Math.min(1, ap.dot(ab) / lenSq));
      const dx = from.x + ab.x * t - cloud.centre.x;
      const dy = from.y + ab.y * t - cloud.centre.y;
      const dz = from.z + ab.z * t - cloud.centre.z;
      if (dx * dx + dy * dy + dz * dz < CLOUD_RADIUS * CLOUD_RADIUS) return true;
    }
    return false;
  }

  function throwFrom(origin, dir) {
    if (proj.active) return false;
    proj.active = true;
    proj.fuse = FUSE_SECONDS;
    proj.pos.copy(origin);
    proj.vel.copy(dir).multiplyScalar(14);
    proj.vel.y += 4;
    canister.visible = true;
    canister.position.copy(proj.pos);
    return true;
  }

  function step(dt) {
    if (proj.active) {
      proj.fuse -= dt;
      proj.vel.y -= 18 * dt;
      proj.pos.addScaledVector(proj.vel, dt);
      if (proj.pos.y < 0.12) {
        proj.pos.y = 0.12;
        proj.vel.y *= -0.3;
        proj.vel.x *= 0.65;
        proj.vel.z *= 0.65;
      }
      canister.position.copy(proj.pos);
      if (proj.fuse <= 0) {
        proj.active = false;
        canister.visible = false;
        bloomAt(proj.pos);
      }
    }
    for (const cloud of clouds) {
      if (!cloud.active) continue;
      cloud.age += dt;
      if (cloud.age >= LIFE_SECONDS) {
        cloud.active = false;
        cloud.group.visible = false;
        continue;
      }
      applyCloud(cloud);
    }
  }

  function reset() {
    proj.active = false;
    canister.visible = false;
    for (const cloud of clouds) {
      cloud.active = false;
      cloud.group.visible = false;
    }
  }

  return { throwFrom, step, blocksLOS, bloomAt, reset, get projectileActive() { return proj.active; } };
}
