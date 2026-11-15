// Citadel Heights: boot, the fixed-step simulation, and the round state machine.
// The Gilded Wardens (the player and three bot allies) attack uphill and win a
// round by wiping out the Ashen Covenant or by planting the gate-charge at the
// main gate and letting it blow. The Ashen win by wiping the Wardens out, by
// running the clock down, or by defusing a planted charge. Between rounds a short
// buy phase turns earnings into better guns. Screenshot mode (?shot=start|play|end
// &seed=N) stages one deterministic still frame instead of playing.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld, GATE_ZONE, GATE_ZONE_RADIUS, WARDEN_SPAWNS, ASHEN_SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS, BUY_ORDER, GRENADE_PRICE, GRENADE_DAMAGE, GRENADE_RADIUS } from './weapons.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const ROUND_TIME = 100;
const BUY_TIME = 10;
const CHARGE_TIME = 35;
const PLANT_SECONDS = 3;
const ROUNDS_TOTAL = 12;
const ROUNDS_TO_WIN = 7;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = mulberry32(shot ? seedParam * 7919 + 13 : (Date.now() % 2147483647) | 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 34, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

const world = createWorld(scene);
const player = createPlayer(world.colliders);
const arsenal = createArsenal(camera);
const bots = createBots(scene, rng);
const hud = createHud();
const audio = createAudio();
const input = createInput(renderer.domElement, onLockChange);

const ALLY_NAMES = ['Bram', 'Sella', 'Odo'];
const ASHEN_NAMES = ['Vex', 'Morvain', 'Skarn', 'Ysolde'];
const botSpawns = [];
bots.spawn({ name: 'Bram', team: 'warden', post: WARDEN_SPAWNS[0], startNode: 1, role: 'ground' });
botSpawns.push({ post: WARDEN_SPAWNS[0], goalNode: 12 });
bots.spawn({ name: 'Sella', team: 'warden', post: WARDEN_SPAWNS[2], startNode: 3, role: 'ground' });
botSpawns.push({ post: WARDEN_SPAWNS[2], goalNode: 13 });
bots.spawn({ name: 'Odo', team: 'warden', post: WARDEN_SPAWNS[3], startNode: 0, role: 'ground' });
botSpawns.push({ post: WARDEN_SPAWNS[3], goalNode: 14 });
bots.spawn({ name: 'Vex', team: 'ashen', post: ASHEN_SPAWNS[0], startNode: 12, role: 'ground' });
botSpawns.push({ post: ASHEN_SPAWNS[0], goalNode: 12 });
bots.spawn({ name: 'Morvain', team: 'ashen', post: ASHEN_SPAWNS[1], startNode: 13, role: 'ground' });
botSpawns.push({ post: ASHEN_SPAWNS[1], goalNode: 13 });
bots.spawn({ name: 'Skarn', team: 'ashen', post: ASHEN_SPAWNS[2], startNode: 10, role: 'post' });
botSpawns.push({ post: ASHEN_SPAWNS[2], goalNode: 10 });
bots.spawn({ name: 'Ysolde', team: 'ashen', post: ASHEN_SPAWNS[3], startNode: 11, role: 'post' });
botSpawns.push({ post: ASHEN_SPAWNS[3], goalNode: 11 });

// ---- shared combat plumbing -------------------------------------------------
const raycaster = new THREE.Raycaster();
const tmpDir = new THREE.Vector3();
const tmpFrom = new THREE.Vector3();
const tmpTo = new THREE.Vector3();

function losClear(from, to) {
  tmpDir.subVectors(to, from);
  const dist = tmpDir.length();
  if (dist < 0.001) return true;
  tmpDir.divideScalar(dist);
  raycaster.set(from, tmpDir);
  raycaster.far = dist;
  const hit = raycaster.intersectObjects(world.shootables, false)[0];
  return !hit || hit.distance >= dist - 0.7;
}

function blockedAt(x, z, y) {
  for (const b of world.colliders) {
    if (b.max.y <= y + 0.45 || b.min.y >= y + 1.4) continue;
    if (x > b.min.x - 0.32 && x < b.max.x + 0.32 && z > b.min.z - 0.32 && z < b.max.z + 0.32) return true;
  }
  return false;
}

// Reusable foe descriptors so the bot step never allocates in its hot loop.
const playerFoe = { pos: player.state.position, eyePos: new THREE.Vector3(), alive: true, isPlayer: true, ref: null };
const botFoes = bots.bots.map((bot) => ({
  pos: bot.pos, eyePos: new THREE.Vector3(), alive: true, isPlayer: false, ref: bot,
}));
const foesForAshen = [...botFoes.filter((f) => f.ref.team === 'warden'), playerFoe];
const foesForWarden = botFoes.filter((f) => f.ref.team === 'ashen');
function refreshFoes() {
  playerFoe.alive = G.playerAlive;
  playerFoe.eyePos.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  for (let i = 0; i < bots.bots.length; i += 1) {
    const bot = bots.bots[i];
    botFoes[i].alive = bot.alive;
    botFoes[i].eyePos.set(bot.pos.x, bot.pos.y + 1.52, bot.pos.z);
  }
}

// Tracers: a small pool of glowing lines, reused round after round.
const tracerPool = [];
{
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  for (let i = 0; i < 26; i += 1) {
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.gold), transparent: true, opacity: 0 });
    const line = new THREE.Line(geo.clone(), mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracerPool.push({ line, life: 0 });
  }
}
let tracerIdx = 0;
function tracer(from, to, colour) {
  const t = tracerPool[tracerIdx];
  tracerIdx = (tracerIdx + 1) % tracerPool.length;
  const attr = t.line.geometry.getAttribute('position');
  attr.setXYZ(0, from.x, from.y, from.z);
  attr.setXYZ(1, to.x, to.y, to.z);
  attr.needsUpdate = true;
  t.line.material.color.set(colour);
  t.line.visible = true;
  t.life = 0.07;
}
function stepTracers(dt) {
  for (const t of tracerPool) {
    if (!t.line.visible) continue;
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
    if (t.life <= 0) t.line.visible = false;
  }
}

// The gate-charge prop and the grenade projectile.
const chargeMesh = new THREE.Group();
{
  const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.34),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.slateDark), roughness: 0.6, metalness: 0.3 }));
  boxMesh.position.y = 0.15;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.36),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.gold), roughness: 0.4, metalness: 0.6 }));
  band.position.y = 0.2;
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a3c') });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), lampMat);
  lamp.position.y = 0.36;
  chargeMesh.add(boxMesh, band, lamp);
  chargeMesh.userData.lamp = lampMat;
  chargeMesh.visible = false;
  scene.add(chargeMesh);
}
const grenadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.moss), roughness: 0.7 }));
grenadeMesh.visible = false;
scene.add(grenadeMesh);
const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.gold), 0, 16);
scene.add(blastLight);
const grenade = { active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0 };

// ---- match state -------------------------------------------------------------
const G = {
  phase: 'menu', // menu | buy | live | planted | roundEnd | matchEnd
  round: 1, scoreW: 0, scoreA: 0,
  money: 800, playerHp: 100, playerAlive: true,
  kills: 0, deaths: 0, plants: 0,
  roundTimer: ROUND_TIME, buyTimer: 0, endTimer: 0,
  plantProgress: 0, planted: false, chargeTimer: 0, beepAt: 0,
  time: 0, started: false, winner: null,
};
const body = player.state;

function aliveCount(team) {
  let n = team === 'warden' && G.playerAlive ? 1 : 0;
  for (const bot of bots.bots) if (bot.alive && bot.team === team) n += 1;
  return n;
}

function syncHud() {
  const a = arsenal.cur();
  hud.setHealth(G.playerHp);
  hud.setMoney(G.money);
  hud.setAmmo(a.mag, a.reserve, arsenal.def().name, arsenal.state.grenades);
  hud.setScore(G.scoreW, G.scoreA);
  hud.setAlive(aliveCount('warden'), aliveCount('ashen'));
  hud.setRound(G.round, ROUNDS_TOTAL);
}

function buyRows() {
  const rows = BUY_ORDER.map((id, i) => ({
    key: `${i + 1}`, label: `${WEAPONS[id].name} — dmg ${WEAPONS[id].damage} · mag ${WEAPONS[id].mag}`,
    price: WEAPONS[id].price, owned: arsenal.owns(id), affordable: G.money >= WEAPONS[id].price,
  }));
  rows.push({ key: '6', label: 'Mossfire Grenade — area blast', price: GRENADE_PRICE, owned: false, affordable: G.money >= GRENADE_PRICE });
  return rows;
}
function showBuyPanel() {
  hud.showBuy({ money: G.money, rows: buyRows(), phaseText: G.phase === 'buy' ? `BUY PHASE — ${Math.ceil(G.buyTimer)}s` : 'LOADOUT' });
}

function startMatch() {
  G.scoreW = 0;
  G.scoreA = 0;
  G.round = 1;
  G.money = 800;
  G.kills = 0;
  G.deaths = 0;
  G.plants = 0;
  startRound();
}

function startRound() {
  G.playerHp = 100;
  G.playerAlive = true;
  G.planted = false;
  G.plantProgress = 0;
  G.roundTimer = ROUND_TIME;
  G.buyTimer = BUY_TIME;
  G.phase = 'buy';
  G.winner = null;
  chargeMesh.visible = false;
  botCtx.objective.planted = false;
  grenade.active = false;
  grenadeMesh.visible = false;
  world.resetGate();
  player.placeAt(WARDEN_SPAWNS[1], 0);
  bots.reset(botSpawns);
  arsenal.refillAll();
  hud.hideBoard();
  hud.setObjective('Buy phase — keys 1–5 weapons, 6 grenade');
  hud.showBanner(`ROUND ${G.round}`, 'Gilded Wardens attack · Ashen Covenant defend', 2200);
  showBuyPanel();
  syncHud();
}

function endRound(winner, reason) {
  if (G.phase === 'roundEnd' || G.phase === 'matchEnd') return;
  G.phase = 'roundEnd';
  G.endTimer = 4.6;
  G.winner = winner;
  if (winner === 'warden') { G.scoreW += 1; G.money += 1400; } else { G.scoreA += 1; G.money += 900; }
  audio.horn(winner === 'warden');
  hud.hideBuy();
  hud.setPlantProgress(null);
  hud.showBoard({
    title: winner === 'warden' ? 'WARDENS TAKE THE ROUND' : 'ASHEN HOLD THE ROUND',
    lines: [
      { head: true, text: `Gilded Wardens ${G.scoreW} — ${G.scoreA} Ashen Covenant` },
      { text: reason },
      { text: `Your ledger — kills ${G.kills} · deaths ${G.deaths} · plants ${G.plants}` },
      { text: `Funds for next round: $${G.money}` },
      { text: G.round >= ROUNDS_TOTAL || G.scoreW >= ROUNDS_TO_WIN || G.scoreA >= ROUNDS_TO_WIN ? 'The match is decided.' : `Round ${G.round + 1} begins shortly…` },
    ],
  });
  syncHud();
}

function checkRoundEnd() {
  if (G.phase !== 'live' && G.phase !== 'planted') return;
  if (aliveCount('ashen') === 0) endRound('warden', 'The Ashen Covenant were wiped out in the courtyard.');
  else if (aliveCount('warden') === 0) endRound('ashen', 'The Gilded Wardens were wiped out below the walls.');
}

// ---- player combat -------------------------------------------------------------
const shootDir = new THREE.Vector3();
const muzzle = new THREE.Vector3();
function fireWeapon() {
  if (!arsenal.ready()) return;
  const def = arsenal.def();
  arsenal.pullTrigger();
  audio.shot(def.sound);
  bots.hearShot(body.position);
  camera.getWorldDirection(muzzle);
  muzzle.multiplyScalar(0.6).add(camera.position);
  const spreadNow = arsenal.spread({ speed: player.groundSpeed(), crouching: body.crouching, airborne: !body.onGround });
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    camera.getWorldDirection(shootDir);
    shootDir.x += (rng() * 2 - 1) * spreadNow;
    shootDir.y += (rng() * 2 - 1) * spreadNow;
    shootDir.z += (rng() * 2 - 1) * spreadNow;
    shootDir.normalize();
    raycaster.set(camera.position, shootDir);
    raycaster.far = def.range;
    const targets = world.shootables.concat(bots.hitMeshes);
    const hit = raycaster.intersectObjects(targets, false)[0];
    const end = hit ? hit.point : tmpTo.copy(shootDir).multiplyScalar(def.range).add(camera.position);
    tracer(muzzle, end, PALETTE.gold);
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      if (bot.alive) {
        const part = hit.object.userData.part;
        let dmg = def.damage * (part === 'head' ? def.headMult : 1);
        const dist = hit.distance;
        if (dist > def.range * 0.55) dmg *= Math.max(0.35, 1 - (dist - def.range * 0.55) / def.range);
        const killed = bots.damage(bot, dmg);
        hud.hitMarker(killed);
        if (killed) {
          G.money += 300;
          if (bot.team === 'ashen') G.kills += 1;
          hud.feed(`${bot.team === 'ashen' ? 'You' : 'A Warden'} felled ${bot.name} — ${def.short}`, bot.team === 'ashen');
          audio.kill();
        } else audio.hit();
        syncHud();
      }
    }
  }
  player.recoil(def.kind === 'sniper' ? 0.035 : def.kind === 'scatter' ? 0.026 : 0.011 + rng() * 0.005, (rng() * 2 - 1) * 0.004);
  if (arsenal.cur().mag === 0) arsenal.reload();
}

function damagePlayer(amount, sourceName) {
  if (!G.playerAlive || G.phase === 'roundEnd' || G.phase === 'matchEnd') return;
  G.playerHp -= amount;
  hud.hurtFlash();
  audio.hurt();
  if (G.playerHp <= 0) {
    G.playerHp = 0;
    G.playerAlive = false;
    G.deaths += 1;
    hud.feed(`${sourceName} felled you`, false);
    hud.showBanner('YOU FELL', 'Your Wardens fight on without you', 2200);
  }
  syncHud();
}

function botShoot(bot, foe) {
  const eye = tmpFrom.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
  const target = foe.eyePos;
  tracer(eye, target, bot.team === 'warden' ? '#ffe9b0' : '#b7d99a');
  if (rng() > 0.35 && bot.pos.distanceTo(body.position) < 26) audio.shot('smg');
  // Hit chance falls with range and with how fast the target is moving; a
  // crouched target is a smaller one. Reaction time already gated the burst.
  const dist = eye.distanceTo(target);
  let chance = bot.accuracy - dist * 0.006;
  if (foe.isPlayer) {
    chance -= Math.min(0.22, player.groundSpeed() * 0.035);
    if (body.crouching) chance -= 0.1;
    if (!body.onGround) chance -= 0.12;
  } else {
    chance -= 0.06;
  }
  chance = Math.max(0.06, Math.min(0.72, chance));
  if (rng() > chance) return;
  const head = rng() < 0.12;
  const dmg = bot.damage * (head ? 2.1 : 1) * (0.8 + rng() * 0.45);
  if (foe.isPlayer) {
    damagePlayer(dmg, bot.name);
  } else if (foe.ref.alive) {
    const killed = bots.damage(foe.ref, dmg);
    if (killed) {
      hud.feed(`${bot.name} felled ${foe.ref.name}`, bot.team === 'ashen');
      checkRoundEnd();
    }
  }
}

const botCtx = {
  get time() { return G.time; },
  losClear,
  blockedAt,
  foesOf(bot) { return bot.team === 'ashen' ? foesForAshen : foesForWarden; },
  onBotShoot: botShoot,
  objective: { planted: false, chargePos: GATE_ZONE },
  onDefuse() {
    chargeMesh.visible = false;
    G.planted = false;
    endRound('ashen', 'The gate-charge was defused at the doors.');
  },
};

function throwGrenade() {
  if (arsenal.state.grenades <= 0 || grenade.active) return;
  arsenal.state.grenades -= 1;
  grenade.active = true;
  grenade.fuse = 1.5;
  grenade.pos.copy(camera.position);
  camera.getWorldDirection(grenade.vel);
  grenade.vel.multiplyScalar(15);
  grenade.vel.y += 4.5;
  grenadeMesh.visible = true;
  audio.throwWhoosh();
  syncHud();
}

function explodeGrenade() {
  grenade.active = false;
  grenadeMesh.visible = false;
  blastLight.position.copy(grenade.pos);
  blastLight.intensity = 60;
  audio.grenade();
  const hurt = (pos, apply) => {
    const d = pos.distanceTo(grenade.pos);
    if (d < GRENADE_RADIUS) apply(GRENADE_DAMAGE * (1 - d / GRENADE_RADIUS) + 8);
  };
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    tmpTo.set(bot.pos.x, bot.pos.y + 1, bot.pos.z);
    hurt(tmpTo, (dmg) => {
      const killed = bots.damage(bot, dmg);
      if (killed) {
        hud.feed(`Mossfire felled ${bot.name}`, bot.team === 'ashen');
        if (bot.team === 'ashen') { G.kills += 1; G.money += 200; }
      }
    });
  }
  tmpTo.copy(body.position);
  hurt(tmpTo, (dmg) => damagePlayer(dmg * 0.6, 'Your own Mossfire'));
  checkRoundEnd();
  syncHud();
}

function stepGrenade(dt) {
  if (!grenade.active) return;
  grenade.fuse -= dt;
  grenade.vel.y -= 18 * dt;
  grenade.pos.addScaledVector(grenade.vel, dt);
  if (grenade.pos.y < 0.12) {
    grenade.pos.y = 0.12;
    grenade.vel.y *= -0.35;
    grenade.vel.x *= 0.7;
    grenade.vel.z *= 0.7;
  }
  grenadeMesh.position.copy(grenade.pos);
  if (grenade.fuse <= 0) explodeGrenade();
}

// ---- the simulation step --------------------------------------------------------
function step(dt) {
  G.time += dt;
  const inRound = G.phase === 'buy' || G.phase === 'live' || G.phase === 'planted';

  if (G.phase === 'buy') {
    G.buyTimer -= dt;
    showBuyPanel();
    if (G.buyTimer <= 0) {
      G.phase = 'live';
      hud.hideBuy();
      hud.setObjective('Plant the gate-charge at the main gate — or wipe out the Ashen');
      hud.showBanner('ROUND LIVE', 'The gate-charge is yours to plant', 1500);
    }
  }

  if (G.phase === 'live') {
    G.roundTimer -= dt;
    if (G.roundTimer <= 0) endRound('ashen', 'Time ran out with the gate still shut.');
  }

  if (G.phase === 'planted') {
    G.chargeTimer -= dt;
    const lampRate = G.chargeTimer < 8 ? 12 : 5;
    chargeMesh.userData.lamp.color.setHex(Math.sin(G.time * lampRate) > 0 ? 0xff5a3c : 0x571f14);
    if (G.time >= G.beepAt) {
      audio.plantBeep(G.chargeTimer < 8);
      G.beepAt = G.time + (G.chargeTimer < 8 ? 0.32 : 0.8);
    }
    world.setRingPulse(G.time);
    if (G.chargeTimer <= 0) {
      audio.explosion();
      blastLight.position.set(GATE_ZONE.x, 2, GATE_ZONE.z);
      blastLight.intensity = 120;
      chargeMesh.visible = false;
      G.planted = false;
      endRound('warden', 'The gate-charge blew the main gate off its hinges.');
    }
  }
  if (G.phase === 'roundEnd') {
    world.blastGate(dt);
    G.endTimer -= dt;
    if (G.endTimer <= 0) {
      const matchOver = G.round >= ROUNDS_TOTAL || G.scoreW >= ROUNDS_TO_WIN || G.scoreA >= ROUNDS_TO_WIN;
      if (matchOver) {
        G.phase = 'matchEnd';
        hud.hideBoard();
        hud.showOverlay('matchEnd', {
          title: G.scoreW > G.scoreA ? 'THE GATE FALLS' : 'THE WALLS HOLD',
          copy: `Final score — Gilded Wardens ${G.scoreW}, Ashen Covenant ${G.scoreA}. Your ledger: ${G.kills} kills, ${G.deaths} deaths, ${G.plants} plants.`,
        });
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        G.round += 1;
        startRound();
      }
    }
  }

  // Planting the charge: alive, in the ring, holding F, still.
  if (G.phase === 'live' && G.playerAlive) {
    const dx = body.position.x - GATE_ZONE.x;
    const dz = body.position.z - GATE_ZONE.z;
    const inZone = Math.hypot(dx, dz) <= GATE_ZONE_RADIUS;
    if (inZone && input.state.keys.has('KeyF')) {
      G.plantProgress += dt / PLANT_SECONDS;
      if (Math.random() < dt * 6) audio.planting();
      hud.setPlantProgress(Math.min(1, G.plantProgress), 'PLANTING THE GATE-CHARGE');
      if (G.plantProgress >= 1) {
        G.planted = true;
        G.plants += 1;
        G.money += 300;
        G.phase = 'planted';
        G.chargeTimer = CHARGE_TIME;
        G.beepAt = 0;
        botCtx.objective.planted = true;
        chargeMesh.position.set(body.position.x, 0, body.position.z);
        chargeMesh.visible = true;
        hud.setPlantProgress(null);
        hud.setObjective('Charge planted — guard it until it blows');
        hud.showBanner('CHARGE PLANTED', '35 seconds to detonation', 1800);
        audio.plantBeep(true);
      }
    } else {
      G.plantProgress = Math.max(0, G.plantProgress - dt * 1.4);
      hud.setPlantProgress(inZone ? Math.max(0.001, G.plantProgress) : null, inZone ? 'HOLD F TO PLANT' : '');
    }
  }

  if (inRound) {
    if (G.playerAlive && G.phase !== 'buy') player.step(dt, input.state.keys);
    else if (G.playerAlive) player.step(dt, new Set()); // frozen feet during buy, eyes free
    refreshFoes();
    if (G.phase !== 'buy') bots.step(dt, botCtx);
    const w = arsenal.step(dt);
    if (w === 'reloaded') audio.reloadEnd();
    stepGrenade(dt);
    checkRoundEnd();
  }
  stepTracers(dt);
  blastLight.intensity = Math.max(0, blastLight.intensity - dt * 260);
  hud.setTimer(G.phase === 'planted' ? G.chargeTimer : G.roundTimer, (G.phase === 'live' && G.roundTimer < 20) || (G.phase === 'planted' && G.chargeTimer < 10));
}

// ---- frame loop ------------------------------------------------------------------
let accumulator = 0;
let lastTime = performance.now();
let frozen = false;

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  const targetFov = arsenal.state.scoped && arsenal.def().scoped ? 34 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.35;
    camera.updateProjectionMatrix();
  }
}

function handlePressed(pressed) {
  if (G.phase === 'buy') {
    for (let i = 0; i < BUY_ORDER.length; i += 1) {
      if (!pressed.has(`Digit${i + 1}`)) continue;
      const id = BUY_ORDER[i];
      if (arsenal.owns(id)) { arsenal.equip(id); audio.buy(); }
      else if (G.money >= WEAPONS[id].price) {
        G.money -= WEAPONS[id].price;
        arsenal.buy(id);
        arsenal.equip(id);
        audio.buy();
        hud.feed(`Bought the ${WEAPONS[id].name}`, true);
      } else audio.denied();
      syncHud();
      showBuyPanel();
    }
    if (pressed.has('Digit6')) {
      if (G.money >= GRENADE_PRICE && arsenal.state.grenades < 2) {
        G.money -= GRENADE_PRICE;
        arsenal.state.grenades += 1;
        audio.buy();
      } else audio.denied();
      syncHud();
      showBuyPanel();
    }
    return;
  }
  if (G.phase !== 'live' && G.phase !== 'planted') return;
  for (let i = 0; i < BUY_ORDER.length; i += 1) {
    if (pressed.has(`Digit${i + 1}`) && arsenal.owns(BUY_ORDER[i])) arsenal.equip(BUY_ORDER[i]);
  }
  if (pressed.has('KeyG')) throwGrenade();
  syncHud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (input.state.locked || shot) player.look(look.x, look.y);
    handlePressed(input.takePressed());
    arsenal.state.scoped = input.state.aiming && arsenal.def().scoped;
    if (input.state.locked && (G.phase === 'live' || G.phase === 'planted') && G.playerAlive) {
      if (input.state.firing) {
        if (arsenal.ready()) fireWeapon();
        else if (arsenal.dryReady() && arsenal.cur().mag === 0) { audio.dryFire(); arsenal.reload(); }
      }
      if (input.state.keys.has('KeyR') && arsenal.reload()) audio.reloadStart();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    const spreadNow = arsenal.spread({ speed: player.groundSpeed(), crouching: body.crouching, airborne: !body.onGround });
    hud.setCrosshairSpread(6 + spreadNow * 620);
  }
  renderer.render(scene, camera);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    G.started = true;
    hud.hideOverlay();
    audio.unlock();
  } else if (G.phase !== 'roundEnd' && G.phase !== 'matchEnd' && G.started) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (G.phase === 'matchEnd' || G.phase === 'menu') startMatch();
  input.requestLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- screenshot staging -----------------------------------------------------------
function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function placeBot(bot, x, y, z, yaw) {
  bot.pos.set(x, y, z);
  bot.group.position.set(x, y, z);
  bot.group.rotation.set(0, yaw, 0);
  bot.yaw = yaw;
}

function runShot(name) {
  bots.reset(botSpawns);
  hud.hideOverlay();
  hud.hideBoard();
  hud.hideBuy();
  if (name === 'start') {
    player.placeAt(new THREE.Vector3(0.8, 0, 15.2), 0);
    aimAt(new THREE.Vector3(0, 2.2, -16));
    G.money = 800;
    G.phase = 'buy';
    G.buyTimer = BUY_TIME;
    showBuyPanel();
    hud.showOverlay('start');
    hud.setObjective('Plant the gate-charge at the main gate');
    hud.setTimer(ROUND_TIME, false);
    syncHud();
  } else if (name === 'play') {
    player.placeAt(new THREE.Vector3(4.4, 0, 5.4), 0);
    arsenal.buy('bulwark');
    arsenal.equip('bulwark');
    arsenal.cur().mag = 17;
    arsenal.state.grenades = 1;
    G.playerHp = 72;
    G.money = 2650;
    G.round = 6;
    G.scoreW = 3;
    G.scoreA = 2;
    // Stage a mid-round fight: Vex in the open by the plinth, Morvain pushing the
    // east lane, Skarn on the tower, Bram covering from the west crates.
    placeBot(bots.bots[3], 0.9, 0, -6.4, Math.PI);
    placeBot(bots.bots[4], 7.6, 0, -1.5, Math.PI * 0.9);
    placeBot(bots.bots[0], -5.2, 0, 4.2, 0.4);
    placeBot(bots.bots[1], 8.6, 0, 9.5, Math.PI + 0.4);
    // Ysolde is already down (the kill-feed line tells that story), so the alive
    // counts agree with the fight being staged.
    bots.bots[6].alive = false;
    bots.bots[6].group.rotation.x = -1.5;
    aimAt(new THREE.Vector3(0.9, 1.3, -6.4));
    arsenal.forceFlash();
    tracer(new THREE.Vector3(4.1, 1.5, 4.6), new THREE.Vector3(1.1, 1.35, -6.2), PALETTE.gold);
    tracer(new THREE.Vector3(0.7, 1.5, -5.6), new THREE.Vector3(3.6, 1.45, 3.4), '#b7d99a');
    hud.hitMarker(false);
    hud.setObjective('Plant the gate-charge at the main gate — or wipe out the Ashen');
    hud.setTimer(47, false);
    hud.feed('Sella felled Ysolde — Longshot', true);
    syncHud();
    hud.setHealth(72);
  } else {
    // end: the gate is blown, the scoreboard tells the round's story.
    player.placeAt(new THREE.Vector3(2.6, 0, -7.5), 0);
    aimAt(new THREE.Vector3(0, 3.2, -18.5));
    world.blastGate(2);
    G.scoreW = 5;
    G.scoreA = 3;
    G.round = 8;
    G.kills = 6;
    G.deaths = 3;
    G.plants = 2;
    G.money = 3900;
    placeBot(bots.bots[3], -1.8, 0, -13.4, Math.PI);
    bots.bots[3].alive = false;
    bots.bots[3].group.rotation.x = -1.5;
    placeBot(bots.bots[0], -3.4, 0, -10.5, 0.2);
    hud.showBoard({
      title: 'WARDENS TAKE THE ROUND',
      lines: [
        { head: true, text: 'Gilded Wardens 5 — 3 Ashen Covenant' },
        { text: 'The gate-charge blew the main gate off its hinges.' },
        { text: 'Your ledger — kills 6 · deaths 3 · plants 2' },
        { text: 'Funds for next round: $3900' },
        { text: 'Round 9 begins shortly…' },
      ],
    });
    hud.setObjective('Gate breached');
    hud.setTimer(0, false);
    syncHud();
  }
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

syncCamera();
syncHud();
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
