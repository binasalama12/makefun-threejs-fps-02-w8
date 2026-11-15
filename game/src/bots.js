// The fighters. Each bot is a low stone-and-cloth figure with a torso, a head and
// a gun, dressed gold for the Gilded Wardens and moss for the Ashen Covenant.
// Their brains are deliberately simple and readable: walk the waypoint web toward
// an assignment, keep line-of-sight checks honest through the world's walls, and
// when an enemy is seen, stop or strafe and fire in short bursts whose accuracy
// depends on range and on how fast the target is moving. A bot that hears a shot
// nearby turns toward it. Two Ashen hold high posts (the tower top and the guard
// loft) and only rotate and fire. Bots on the ground also channel the defuse when
// a charge is planted and no Warden stands guard.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS } from './world.js';
import { range } from './rng.js';

const BOT_SPEED = 3.4;
const SIGHT_RANGE = 34;
const HEAR_RANGE = 17;
const EYE = 1.52;

const torsoGeo = new THREE.BoxGeometry(0.54, 0.8, 0.3);
const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
const legGeo = new THREE.BoxGeometry(0.2, 0.62, 0.24);
const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.62);
const shoulderGeo = new THREE.BoxGeometry(0.62, 0.14, 0.34);

export function createBots(scene, rng) {
  const goldMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.gold), roughness: 0.6, metalness: 0.3 });
  const goldCloth = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7d6a3e'), roughness: 0.9 });
  const mossMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.moss), roughness: 0.9 });
  const mossDarkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.mossDark), roughness: 0.95 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.slateDark), roughness: 0.7, metalness: 0.3 });

  const bots = [];
  const hitMeshes = [];

  function buildFigure(team) {
    const g = new THREE.Group();
    const cloth = team === 'warden' ? goldCloth : mossMat;
    const trim = team === 'warden' ? goldMat : mossDarkMat;
    const torso = new THREE.Mesh(torsoGeo, cloth);
    torso.position.y = 1.06;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.66;
    head.userData.part = 'head';
    const shoulders = new THREE.Mesh(shoulderGeo, trim);
    shoulders.position.y = 1.42;
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.14, 0.31, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.14, 0.31, 0);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.18, 1.24, -0.3);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.32), trim);
    band.position.y = 1.28;
    g.add(torso, head, shoulders, legL, legR, gun, band);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    return { group: g, torso, head, legL, legR };
  }

  function spawn({ name, team, post, startNode, role }) {
    const fig = buildFigure(team);
    fig.group.position.copy(post);
    scene.add(fig.group);
    const bot = {
      name, team, role,
      group: fig.group, torso: fig.torso, head: fig.head, legL: fig.legL, legR: fig.legR,
      pos: post.clone(), yaw: team === 'warden' ? 0 : Math.PI,
      hp: 100, alive: true, fall: 0, walkPhase: rng() * 6,
      node: startNode, goalNode: startNode, homeNode: startNode, altNode: startNode, patrolTimer: 10, holdPos: post.clone(),
      state: role === 'post' ? 'hold' : 'advance',
      burstLeft: 0, burstWait: range(rng, 0.2, 0.9), fireCd: 0,
      reaction: 0, targetSeenAt: -9, lastKnown: null, alertPos: null,
      defusing: 0, strafeDir: 1, strafeFlip: 0,
      damage: team === 'warden' ? 11 : 12,
      accuracy: team === 'warden' ? 0.5 : 0.52,
    };
    fig.torso.userData.bot = bot;
    fig.head.userData.bot = bot;
    hitMeshes.push(fig.torso, fig.head);
    bots.push(bot);
    return bot;
  }

  function nearestNode(pos) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i += 1) {
      const d = WAYPOINTS[i].p.distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // Breadth-first hop across the waypoint web toward a destination node.
  function nextHop(from, to) {
    if (from === to) return to;
    const prev = new Map([[from, -1]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === to) break;
      for (const n of WAYPOINTS[cur].next) {
        if (!prev.has(n)) { prev.set(n, cur); queue.push(n); }
      }
    }
    if (!prev.has(to)) return from;
    let cur = to;
    while (prev.get(cur) !== from && prev.get(cur) !== -1) cur = prev.get(cur);
    return cur;
  }

  // Patrol pairings: a ground bot works two assignments in turn instead of
  // camping one node all round, so lanes are re-watched and pushes meet fresh
  // angles. Keys and values are waypoint indices.
  const PATROL_PAIR = { 12: 6, 6: 12, 13: 7, 7: 13, 14: 4, 4: 14, 15: 14, 10: 12, 11: 13 };

  function reset(spawns) {
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      const s = spawns[i];
      bot.pos.copy(s.post);
      bot.group.position.copy(s.post);
      bot.group.rotation.set(0, bot.team === 'warden' ? 0 : Math.PI, 0);
      bot.hp = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.state = bot.role === 'post' ? 'hold' : 'advance';
      bot.node = nearestNode(s.post);
      bot.goalNode = s.goalNode;
      bot.homeNode = s.goalNode;
      bot.altNode = PATROL_PAIR[s.goalNode] ?? s.goalNode;
      bot.patrolTimer = range(rng, 9, 15);
      bot.burstLeft = 0;
      bot.burstWait = range(rng, 0.2, 0.9);
      bot.reaction = 0;
      bot.lastKnown = null;
      bot.alertPos = null;
      bot.defusing = 0;
    }
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    if (bot.hp > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    return true;
  }

  // ctx supplies the world queries and the combat callbacks main.js owns:
  //   losClear(from, to), foesOf(bot) -> [{pos, eyePos, alive, isPlayer, ref}],
  //   onBotShoot(bot, foe), objective: { planted, chargePos }
  function step(dt, ctx) {
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.45);
        bot.group.rotation.x = -bot.fall * 1.5;
        bot.group.position.y = bot.pos.y - bot.fall * 0.1;
        continue;
      }
      bot.group.rotation.x = 0;
      const eye = new THREE.Vector3(bot.pos.x, bot.pos.y + EYE, bot.pos.z);

      // --- perception: nearest visible foe, refreshed every step ---
      let foe = null;
      let foeDist = Infinity;
      for (const f of ctx.foesOf(bot)) {
        if (!f.alive) continue;
        const d = eye.distanceTo(f.eyePos);
        if (d > SIGHT_RANGE || d >= foeDist) continue;
        if (ctx.losClear(eye, f.eyePos)) { foe = f; foeDist = d; }
      }
      if (foe) {
        bot.lastKnown = foe.pos.clone();
        bot.targetSeenAt = ctx.time;
        bot.reaction += dt;
      } else {
        bot.reaction = 0;
        if (bot.alertPos && eye.distanceTo(bot.alertPos) < 2.4) bot.alertPos = null;
      }

      // --- decide a walking goal ---
      let goal = null;
      let wantFire = false;
      if (bot.role === 'post') {
        goal = null;
        if (foe) { bot.yaw = Math.atan2(-(foe.pos.x - bot.pos.x), -(foe.pos.z - bot.pos.z)); wantFire = true; }
      } else if (ctx.objective.planted && bot.team === 'ashen') {
        // Defenders converge on the charge; one channels the defuse up close.
        const chargePos = ctx.objective.chargePos;
        if (bot.pos.distanceTo(chargePos) > 1.7) goal = chargePos;
        else {
          bot.defusing += dt;
          bot.yaw += dt * 0.4;
          if (bot.defusing >= 5 && ctx.onDefuse) ctx.onDefuse(bot);
        }
        if (foe && foeDist < 12) wantFire = true;
      } else if (foe) {
        wantFire = true;
        bot.yaw = Math.atan2(-(foe.pos.x - bot.pos.x), -(foe.pos.z - bot.pos.z));
        // Keep a fighting distance: back off if crowded, close if far.
        if (foeDist < 6) goal = new THREE.Vector3(bot.pos.x - (foe.pos.x - bot.pos.x), bot.pos.y, bot.pos.z - (foe.pos.z - bot.pos.z));
        else if (foeDist > 20) goal = foe.pos;
        else {
          // Strafe sideways while fighting, flipping direction now and then.
          bot.strafeFlip -= dt;
          if (bot.strafeFlip <= 0) { bot.strafeDir = rng() > 0.5 ? 1 : -1; bot.strafeFlip = range(rng, 0.7, 1.6); }
          const px = Math.cos(bot.yaw) * bot.strafeDir;
          const pz = -Math.sin(bot.yaw) * bot.strafeDir;
          goal = new THREE.Vector3(bot.pos.x + px * 2.2, bot.pos.y, bot.pos.z + pz * 2.2);
        }
      } else if (bot.lastKnown && ctx.time - bot.targetSeenAt < 4) {
        goal = bot.lastKnown;
      } else if (bot.alertPos) {
        goal = bot.alertPos;
      } else {
        // Patrol/advance along the web toward the current assignment. The
        // assignment swaps between its two paired nodes on a timer, so a bot
        // holds a lane for a while, then repositions to its second watch.
        bot.patrolTimer -= dt;
        if (bot.patrolTimer <= 0) {
          bot.goalNode = bot.goalNode === bot.homeNode ? bot.altNode : bot.homeNode;
          bot.patrolTimer = range(rng, 11, 17);
        }
        const dest = WAYPOINTS[bot.goalNode].p;
        if (bot.pos.distanceTo(dest) < 1.6) {
          goal = null; // arrived: hold and watch until the patrol swap
        } else {
          const hop = nextHop(nearestNode(bot.pos), bot.goalNode);
          goal = WAYPOINTS[hop].p;
        }
      }

      // --- firing: bursts after a short reaction, then a pause ---
      bot.fireCd = Math.max(0, bot.fireCd - dt);
      if (wantFire && foe && bot.reaction > 0.38) {
        if (bot.burstLeft > 0) {
          if (bot.fireCd === 0) {
            bot.fireCd = 0.13;
            bot.burstLeft -= 1;
            ctx.onBotShoot(bot, foe);
          }
        } else {
          bot.burstWait -= dt;
          if (bot.burstWait <= 0) {
            bot.burstLeft = 3 + Math.floor(rng() * 3);
            bot.burstWait = range(rng, 0.45, 1.0);
          }
        }
      } else {
        bot.burstLeft = 0;
        bot.burstWait = Math.max(bot.burstWait, 0.25);
      }

      // --- walking ---
      if (goal) {
        const dx = goal.x - bot.pos.x;
        const dz = goal.z - bot.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.25) {
          const speed = wantFire ? BOT_SPEED * 0.55 : BOT_SPEED;
          const stepLen = Math.min(dist, speed * dt);
          const nx = bot.pos.x + (dx / dist) * stepLen;
          const nz = bot.pos.z + (dz / dist) * stepLen;
          if (!ctx.blockedAt(nx, nz, bot.pos.y)) { bot.pos.x = nx; bot.pos.z = nz; }
          else if (!ctx.blockedAt(nx, bot.pos.z, bot.pos.y)) bot.pos.x = nx;
          else if (!ctx.blockedAt(bot.pos.x, nz, bot.pos.y)) bot.pos.z = nz;
          if (!foe) bot.yaw = Math.atan2(-dx, -dz);
          bot.walkPhase += dt * 8;
        }
      }
      const swing = Math.sin(bot.walkPhase) * 0.4;
      bot.legL.rotation.x = swing;
      bot.legR.rotation.x = -swing;
      bot.group.position.copy(bot.pos);
      bot.group.rotation.y = bot.yaw;
    }
  }

  function hearShot(pos) {
    for (const bot of bots) {
      if (!bot.alive || bot.role === 'post') continue;
      if (bot.pos.distanceTo(pos) < HEAR_RANGE && !bot.lastKnown) bot.alertPos = pos.clone();
    }
  }

  return { bots, hitMeshes, spawn, reset, damage, step, hearShot, nearestNode };
}
