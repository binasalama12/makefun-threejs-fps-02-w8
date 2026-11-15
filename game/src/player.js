// The player's body: acceleration and friction on the ground, weaker control in
// the air, gravity, a jump, and a crouch that genuinely lowers the eye and the
// hitbox. Collision resolves one axis at a time against the world's boxes, with a
// small step-up assist so the tower stairs and crate tops climb smoothly. Standing
// still is the accurate stance, and this module reports the speed so the weapon
// can price movement into its spread.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.74;
const CROUCH_HEIGHT = 1.14;
const STAND_EYE = 1.62;
const CROUCH_EYE = 1.04;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const GROUND_ACCEL = 40;
const AIR_ACCEL = 8;
const FRICTION = 10;
const GRAVITY = 21;
const JUMP_SPEED = 6.6;
const STEP_UP = 0.82;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(0, 0, 15.4),
    velocity: new THREE.Vector3(),
    yaw: 0, // facing north (-z), toward the gate
    pitch: 0,
    eye: STAND_EYE,
    height: STAND_HEIGHT,
    onGround: true,
    crouching: false,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }

  function look(dx, dy, sensitivity = 0.0021) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function tryMoveAxis(axis, delta) {
    if (delta === 0) return;
    const nx = state.position.x + (axis === 'x' ? delta : 0);
    const nz = state.position.z + (axis === 'z' ? delta : 0);
    if (!overlaps(nx, state.position.y, nz, state.height, 0.04)) {
      state.position.x = nx;
      state.position.z = nz;
      return;
    }
    // Step-up: if the blocking box's top is within a stair's rise, climb onto it.
    const hit = overlaps(nx, state.position.y, nz, state.height, 0.04);
    if (hit && hit.max.y - state.position.y <= STEP_UP && state.velocity.y <= 0.5) {
      const lifted = hit.max.y;
      if (!overlaps(nx, lifted, nz, state.height, 0.02)) {
        state.position.set(nx, lifted, nz);
        state.velocity.y = 0;
        state.onGround = true;
        return;
      }
    }
    if (axis === 'x') state.velocity.x = 0; else state.velocity.z = 0;
  }

  function step(dt, keys) {
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch && !state.crouching) {
      state.crouching = true;
      state.height = CROUCH_HEIGHT;
    } else if (!wantCrouch && state.crouching
      && !overlaps(state.position.x, state.position.y, state.position.z, STAND_HEIGHT, 0.02)) {
      state.crouching = false;
      state.height = STAND_HEIGHT;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 11);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const maxSpeed = state.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, (state.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / maxSpeed);
    state.velocity.x += (wish.x * maxSpeed - state.velocity.x) * blend;
    state.velocity.z += (wish.z * maxSpeed - state.velocity.z) * blend;
    if (state.onGround && wish.lengthSq() === 0) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      state.velocity.x *= damp;
      state.velocity.z *= damp;
    }
    if (keys.has('Space') && state.onGround) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    state.velocity.y -= GRAVITY * dt;

    tryMoveAxis('x', state.velocity.x * dt);
    tryMoveAxis('z', state.velocity.z * dt);

    state.position.y += state.velocity.y * dt;
    state.onGround = false;
    const hit = overlaps(state.position.x, state.position.y, state.position.z, state.height, 0);
    if (hit && state.velocity.y <= 0 && state.position.y < hit.max.y && hit.max.y - state.position.y < 1.1) {
      state.position.y = hit.max.y;
      state.velocity.y = 0;
      state.onGround = true;
    } else if (hit && state.velocity.y > 0) {
      state.position.y = hit.min.y - state.height - 0.01;
      state.velocity.y = 0;
    }
    if (state.position.y <= 0) {
      state.position.y = 0;
      state.velocity.y = 0;
      state.onGround = true;
    }
    state.velocity.y = Math.max(-32, state.velocity.y);
  }

  return {
    state,
    step,
    look,
    recoil,
    groundSpeed() { return Math.hypot(state.velocity.x, state.velocity.z); },
    placeAt(pos, yaw) {
      state.position.copy(pos);
      state.velocity.set(0, 0, 0);
      state.yaw = yaw;
      state.pitch = 0;
      state.crouching = false;
      state.height = STAND_HEIGHT;
      state.eye = STAND_EYE;
    },
  };
}
