// The player: a capsule that accelerates, slides along the map, crouches and jumps, plus the
// camera that follows it (eye height, view bob and recoil are all offsets on the same rig).

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { resolveCircle } from './world.js';
import { WeaponState, WEAPONS } from './weapons.js';

export class Player {
  constructor(team = 'attackers') {
    this.team = team;
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.height = PLAYER.standHeight;
    this.eyeHeight = PLAYER.standEye;
    this.crouching = false;
    this.onGround = true;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.money = 0;
    this.hasKit = false;
    this.grenades = 0;
    this.weapon = new WeaponState('hornet');
    this.nextWeapon = null;
    this.stepTimer = 0;
    this.bobPhase = 0;
    this.recoil = { x: 0, y: 0 };
    this.thirdPerson = false;
    this.camera = new THREE.PerspectiveCamera(74, 16 / 9, 0.05, 220);
    this.camera.rotation.order = 'YXZ';
  }

  spawnAt(point) {
    this.position.x = point.x;
    this.position.z = point.z;
    this.position.y = 0;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.height = PLAYER.standHeight;
    this.eyeHeight = PLAYER.standEye;
    this.health = 100;
    this.alive = true;
    this.crouching = false;
    this.recoil.x = 0;
    this.recoil.y = 0;
  }

  giveWeapon(id) {
    this.nextWeapon = new WeaponState(id);
    this.weapon = this.nextWeapon;
    return this.weapon;
  }

  look(dx, dy, sensitivity = 0.0022) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const limit = Math.PI / 2 - 0.02;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  addRecoil(kick, spreadSeed) {
    this.pitch += kick * 0.012 * (0.7 + Math.random() * 0.6);
    this.yaw += (Math.random() - 0.5) * kick * 0.006 * (0.5 + spreadSeed);
    this.recoil.x += kick * 0.02;
  }

  update(dt, input, active, onFootstep) {
    if (!this.alive) return;
    const wantCrouch = input.down('ControlLeft') || input.down('KeyC');
    this.crouching = wantCrouch;
    // Crouch and eye height ease rather than snap, so the camera does not jolt.
    const targetHeight = this.crouching ? PLAYER.crouchHeight : PLAYER.standHeight;
    this.height += (targetHeight - this.height) * Math.min(1, dt * 12);
    const targetEye = this.crouching ? PLAYER.crouchEye : PLAYER.standEye;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 12);

    let forward = 0;
    let strafe = 0;
    if (active) {
      if (input.down('KeyW')) forward += 1;
      if (input.down('KeyS')) forward -= 1;
      if (input.down('KeyD')) strafe += 1;
      if (input.down('KeyA')) strafe -= 1;
    }
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wishX = (-sin * forward) + (cos * strafe);
    let wishZ = (-cos * forward) - (sin * strafe);
    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 1e-4) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    // Each weapon caps its own top speed, so a pistol beats a rifle through a doorway.
    const speedCap = (this.crouching ? PLAYER.crouchSpeed : PLAYER.walkSpeed) * (this.weapon?.def?.moveSpeed ?? 1);
    const accel = this.onGround ? PLAYER.accel : PLAYER.airAccel;
    if (wishLength > 1e-4) {
      this.velocity.x += wishX * accel * dt;
      this.velocity.z += wishZ * accel * dt;
    }
    // Ground friction, applied only when the player is not pushing the stick.
    if (this.onGround) {
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (speed > 0) {
        const drop = PLAYER.friction * dt * (wishLength > 1e-4 ? 0.45 : 1);
        const scale = Math.max(0, speed - drop * speed) / speed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
    }

    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontal > speedCap) {
      const scale = speedCap / horizontal;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    if (active && input.wasPressed('Space') && this.onGround) {
      this.velocity.y = PLAYER.jumpSpeed;
      this.onGround = false;
    }
    this.velocity.y -= PLAYER.gravity * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    const resolved = resolveCircle(this.position.x, this.position.z, PLAYER.radius);
    this.position.x = resolved.x;
    this.position.z = resolved.z;

    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      this.onGround = true;
    }

    // Footsteps: one every stride, timed off the actual speed so crouch-walking is silent.
    const flatSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && flatSpeed > 1.4) {
      this.stepTimer -= dt * flatSpeed;
      this.bobPhase += dt * flatSpeed * 1.9;
      if (this.stepTimer <= 0) {
        this.stepTimer = this.crouching ? 4.4 : 2.6;
        onFootstep?.(this.position, this.crouching ? 0.5 : 1);
      }
    }

    if (this.weapon) {
      const event = this.weapon.update(dt);
      if (event === 'reloaded') this.weaponReloaded = true;
    }
    this.recoil.x *= Math.max(0, 1 - dt * 9);
    this.recoil.y *= Math.max(0, 1 - dt * 9);
  }

  get eyePosition() {
    return { x: this.position.x, y: this.position.y + this.eyeHeight, z: this.position.z };
  }

  get forwardVector() {
    const cosPitch = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cosPitch,
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cosPitch,
    };
  }

  syncCamera(shaking = 0) {
    const bob = Math.sin(this.bobPhase * 2) * 0.014 + Math.sin(this.bobPhase) * 0.02;
    this.camera.position.set(
      this.position.x,
      this.position.y + this.eyeHeight + bob,
      this.position.z,
    );
    this.camera.rotation.set(this.pitch - this.recoil.x * 0.35 + shaking, this.yaw + this.recoil.y * 0.2, 0);
  }

  viewWeaponTransform() {
    return {
      x: 0.26,
      y: -0.23 + Math.sin(this.bobPhase) * 0.008,
      z: -0.42,
      kick: this.recoil.x,
      kind: WEAPONS[this.weapon?.def?.id ?? 'hornet']?.kind ?? 'pistol',
    };
  }
}
