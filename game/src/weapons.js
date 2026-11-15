// The armoury of Citadel Heights. Five invented firearms, each with its own price,
// damage, cadence, magazine and accuracy character, plus the Mossfire grenade.
// Spread is the tactical heart: it is tight when the shooter stands still, tighter
// still crouched, and blooms hard while running, jumping or holding the trigger
// down, so the game rewards stopping to aim. This module owns the numbers and the
// view models; main.js owns the rays and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  thornspike: {
    id: 'thornspike', name: 'Thornspike Sidearm', short: 'Thornspike', price: 0, kind: 'pistol',
    damage: 34, headMult: 2.6, mag: 12, reserve: 60, fireGap: 0.17, reloadTime: 1.25,
    spreadStill: 0.004, spreadMove: 0.03, bloomPerShot: 0.004, pellets: 1, range: 70,
    auto: false, sound: 'pistol',
  },
  gatewasp: {
    id: 'gatewasp', name: 'Gatewasp Repeater', short: 'Gatewasp', price: 950, kind: 'smg',
    damage: 22, headMult: 2.2, mag: 32, reserve: 128, fireGap: 0.072, reloadTime: 1.7,
    spreadStill: 0.009, spreadMove: 0.045, bloomPerShot: 0.0035, pellets: 1, range: 55,
    auto: true, sound: 'smg',
  },
  scatter: {
    id: 'scatter', name: 'Rampart Scattergun', short: 'Scattergun', price: 1150, kind: 'scatter',
    damage: 10, headMult: 1.6, mag: 6, reserve: 30, fireGap: 0.88, reloadTime: 2.6,
    spreadStill: 0.035, spreadMove: 0.055, bloomPerShot: 0.01, pellets: 8, range: 26,
    auto: false, sound: 'scatter',
  },
  bulwark: {
    id: 'bulwark', name: 'Bulwark Carbine', short: 'Bulwark', price: 2400, kind: 'rifle',
    damage: 41, headMult: 2.8, mag: 25, reserve: 100, fireGap: 0.108, reloadTime: 1.9,
    spreadStill: 0.0022, spreadMove: 0.032, bloomPerShot: 0.005, pellets: 1, range: 90,
    auto: true, sound: 'rifle',
  },
  longshot: {
    id: 'longshot', name: 'Citadel Longshot', short: 'Longshot', price: 3400, kind: 'sniper',
    damage: 96, headMult: 2.4, mag: 5, reserve: 25, fireGap: 1.15, reloadTime: 2.4,
    spreadStill: 0.0006, spreadMove: 0.05, bloomPerShot: 0.01, pellets: 1, range: 140,
    auto: false, sound: 'sniper', scoped: true,
  },
};
export const BUY_ORDER = ['thornspike', 'gatewasp', 'scatter', 'bulwark', 'longshot'];
export const GRENADE_PRICE = 300;
export const GRENADE_DAMAGE = 85;
export const GRENADE_RADIUS = 4.6;

const darkMetal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.slateDark), roughness: 0.55, metalness: 0.45 });
const paleMetal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.stonePale), roughness: 0.45, metalness: 0.35 });
const goldMetal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.gold), roughness: 0.4, metalness: 0.6 });
const timberMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a4632'), roughness: 0.85 });

function buildViewModel(kind) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  if (kind === 'pistol') {
    add(new THREE.BoxGeometry(0.07, 0.11, 0.24), darkMetal, 0, 0, -0.05);
    add(new THREE.BoxGeometry(0.06, 0.16, 0.09), timberMat, 0, -0.11, 0.05);
    add(new THREE.BoxGeometry(0.02, 0.03, 0.02), goldMetal, 0, 0.07, -0.16);
  } else if (kind === 'smg') {
    add(new THREE.BoxGeometry(0.08, 0.1, 0.4), darkMetal, 0, 0, -0.08);
    add(new THREE.BoxGeometry(0.04, 0.04, 0.26), paleMetal, 0, 0.02, -0.38);
    add(new THREE.BoxGeometry(0.05, 0.2, 0.07), darkMetal, 0, -0.14, -0.02);
    add(new THREE.BoxGeometry(0.07, 0.07, 0.18), timberMat, 0, -0.02, 0.18);
  } else if (kind === 'scatter') {
    add(new THREE.BoxGeometry(0.09, 0.1, 0.34), timberMat, 0, 0, 0.02);
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.46, 10), paleMetal, 0, 0.03, -0.3).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 10), darkMetal, 0, -0.03, -0.28).rotation.x = Math.PI / 2;
  } else if (kind === 'sniper') {
    add(new THREE.BoxGeometry(0.07, 0.09, 0.52), darkMetal, 0, 0, -0.1);
    add(new THREE.BoxGeometry(0.03, 0.03, 0.5), paleMetal, 0, 0.02, -0.55);
    add(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 10), darkMetal, 0, 0.09, -0.12).rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.06, 0.08, 0.24), timberMat, 0, -0.03, 0.24);
    add(new THREE.BoxGeometry(0.05, 0.18, 0.07), darkMetal, 0, -0.13, 0.02);
  } else {
    add(new THREE.BoxGeometry(0.085, 0.1, 0.44), darkMetal, 0, 0, -0.08);
    add(new THREE.BoxGeometry(0.04, 0.04, 0.34), paleMetal, 0, 0.03, -0.42);
    add(new THREE.BoxGeometry(0.05, 0.17, 0.07), darkMetal, 0, -0.13, 0);
    add(new THREE.BoxGeometry(0.07, 0.08, 0.2), timberMat, 0, -0.02, 0.24);
    add(new THREE.BoxGeometry(0.02, 0.04, 0.02), goldMetal, 0, 0.07, -0.3);
  }
  g.position.set(0.25, -0.22, -0.45);
  return g;
}

export function createArsenal(camera) {
  const models = {};
  for (const id of BUY_ORDER) {
    models[id] = buildViewModel(WEAPONS[id].kind);
    models[id].visible = false;
    camera.add(models[id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.gold), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.25, -0.19, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.gold), 0, 6);
  flashLight.position.set(0.25, -0.15, -0.7);
  camera.add(flashLight);

  const owned = { thornspike: true };
  const ammo = {};
  for (const id of BUY_ORDER) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  const state = {
    current: 'thornspike', cooldown: 0, reloadLeft: 0, flashLeft: 0,
    bloom: 0, kick: 0, grenades: 0, scoped: false,
  };

  function def() { return WEAPONS[state.current]; }
  function cur() { return ammo[state.current]; }

  function showModel() {
    for (const id of BUY_ORDER) models[id].visible = id === state.current;
  }
  showModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flashLeft = Math.max(0, state.flashLeft - dt);
    // Bloom bleeds off briskly once the trigger is released: short, controlled
    // bursts settle back to a tight cone in about half a second, while holding
    // the trigger down keeps the cone wide. Tap fire is a real technique here.
    state.bloom = Math.max(0, state.bloom - dt * 0.085);
    state.kick += (0 - state.kick) * Math.min(1, dt * 13);
    const model = models[state.current];
    const reloadDip = state.reloadLeft > 0 ? Math.sin(Math.min(1, 1 - state.reloadLeft / def().reloadTime) * Math.PI) * 0.5 : 0;
    model.position.z = -0.45 + state.kick;
    model.position.y = -0.22 - reloadDip * 0.12 + (state.scoped ? 0.06 : 0);
    model.rotation.x = state.kick * 2.4 + reloadDip;
    model.position.x = state.scoped ? 0 : 0.25;
    flash.visible = state.flashLeft > 0;
    if (flash.visible) flash.rotation.z = state.flashLeft * 40;
    flashLight.intensity = state.flashLeft > 0 ? 16 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const a = cur();
        const take = Math.min(def().mag - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
        return 'reloaded';
      }
    }
    return null;
  }

  return {
    state,
    owned,
    ammo,
    def,
    cur,
    step,
    owns(id) { return !!owned[id]; },
    buy(id) {
      owned[id] = true;
      ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    },
    equip(id) {
      if (!owned[id] || state.current === id) return;
      state.current = id;
      state.reloadLeft = 0;
      state.bloom = 0;
      showModel();
    },
    ready() { return cur().mag > 0 && state.cooldown === 0 && state.reloadLeft === 0; },
    dryReady() { return state.cooldown === 0 && state.reloadLeft === 0; },
    pullTrigger() {
      const d = def();
      cur().mag -= 1;
      state.cooldown = d.fireGap;
      state.flashLeft = 0.055;
      state.kick = d.kind === 'sniper' ? 0.11 : d.kind === 'scatter' ? 0.09 : 0.05;
      state.bloom = Math.min(0.05, state.bloom + d.bloomPerShot);
    },
    reload() {
      const a = cur();
      if (state.reloadLeft > 0 || a.mag >= def().mag || a.reserve === 0) return false;
      state.reloadLeft = def().reloadTime;
      return true;
    },
    // Accuracy model: still and crouched is the tightest cone; running, airborne
    // or sustained fire opens it up fast.
    spread({ speed, crouching, airborne }) {
      const d = def();
      let s = d.spreadStill + Math.min(1, speed / 5.4) * d.spreadMove + state.bloom;
      if (crouching) s *= 0.55;
      if (airborne) s *= 1.9;
      if (state.scoped) s *= 0.4;
      return s;
    },
    refillAll() {
      for (const id of BUY_ORDER) {
        if (owned[id]) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.bloom = 0;
    },
    forceFlash() { state.flashLeft = 0.06; },
  };
}
