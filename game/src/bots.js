// Bot opponents: they path through the map, hold angles, react to what they see and hear, and
// shoot in bursts with an aim error that shrinks when they stop moving. One state machine, one job.

import * as THREE from 'three';
import { BOTS, PLAYER, HIT } from './config.js';
import { findPath, randomNearbyTile } from './pathfind.js';
import { resolveCircle, segmentBlocked, SITE_WORLD } from './world.js';
import { WeaponState, WEAPONS } from './weapons.js';
import { raycastBots, damageFor } from './combat.js';

const TMP = new THREE.Vector3();

export const BOT_NAMES = {
  attackers: ['Kestrel', 'Anvil', 'Pike', 'Rook', 'Sable'],
  defenders: ['Warden', 'Bastion', 'Ember', 'Lattice', 'Cinder'],
};

// A readable silhouette at range: helmet, vest with a team stripe, arms, legs and a rifle. Team
// colour sits on the cloth and the visor so friend and enemy are told apart in one glance.
function botMesh(team) {
  const group = new THREE.Group();
  const attacker = team === 'attackers';
  const cloth = new THREE.MeshStandardMaterial({
    color: attacker ? 0x7c4426 : 0x2f5d63,
    roughness: 0.88,
    metalness: 0.04,
  });
  const vest = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.7, metalness: 0.25 });
  const rig = new THREE.MeshStandardMaterial({ color: 0x33383d, roughness: 0.55, metalness: 0.45 });
  const visor = new THREE.MeshStandardMaterial({
    color: attacker ? 0xff9a4a : 0x63c8d8,
    emissive: attacker ? 0xff7a2a : 0x3fa8bd,
    emissiveIntensity: 1.2,
    roughness: 0.3,
  });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.56, 0.3), cloth);
  torso.position.y = 1.2;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.36), vest);
  plate.position.y = 1.24;
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.32), vest);
  shoulders.position.y = 1.44;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), rig);
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), vest);
  helmet.position.y = 1.63;
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.055, 0.05), visor);
  goggles.position.set(0, 1.64, -0.14);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.3), cloth);
  hips.position.y = 0.9;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.82, 0.2), rig);
  legL.position.set(-0.12, 0.45, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.82, 0.2), rig);
  legR.position.set(0.12, 0.45, 0);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.13), cloth);
  armL.position.set(0.16, 1.24, -0.2);
  armL.rotation.x = -0.5;
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.13), cloth);
  armR.position.set(-0.12, 1.22, -0.24);
  armR.rotation.x = -1.1;
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), rig);
  rifle.position.set(0.06, 1.2, -0.42);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.3), rig);
  barrel.position.set(0.06, 1.21, -0.8);

  for (const part of [torso, plate, shoulders, head, helmet, goggles, hips, legL, legR, armL, armR, rifle, barrel]) {
    part.castShadow = true;
    group.add(part);
  }
  group.userData.parts = { torso, head, legs: legL, rifle, legR, armL };
  return group;
}

export class Bot {
  constructor(team, index, spawn) {
    this.team = team;
    this.index = index;
    this.name = (BOT_NAMES[team] ?? BOT_NAMES.attackers)[index % 5];
    this.position = { x: spawn.x, y: 0, z: spawn.z };
    this.velocity = { x: 0, z: 0 };
    this.yaw = team === 'attackers' ? 0 : Math.PI;
    this.pitch = 0;
    this.eyeHeight = PLAYER.standEye;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.weapon = new WeaponState(team === 'attackers' ? 'vesper' : 'rhino');
    this.money = 900;
    this.mesh = botMesh(team);
    this.mesh.visible = false;
    this.state = 'push';
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.target = null;
    this.targetVisibleAt = 0;
    this.lastSeen = null;
    this.reactionTimer = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.aimErrorYaw = 0;
    this.aimErrorPitch = 0;
    this.investigate = null;
    this.role = 'rifler';
    this.hasBomb = false;
    this.plantTimer = 0;
    this.defuseTimer = 0;
    this.stuckTimer = 0;
    this.stepTimer = 0;
  }

  get eyePosition() {
    return { x: this.position.x, y: this.position.y + this.eyeHeight, z: this.position.z };
  }

  get forwardVector() {
    const cosPitch = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cosPitch, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cosPitch };
  }

  spawnAt(point) {
    this.position.x = point.x;
    this.position.z = point.z;
    this.position.y = 0;
    this.velocity.x = 0;
    this.velocity.z = 0;
    this.health = 100;
    this.alive = true;
    this.state = 'push';
    this.path = [];
    this.pathIndex = 0;
    this.target = null;
    this.lastSeen = null;
    this.plantTimer = 0;
    this.defuseTimer = 0;
    this.mesh.visible = true;
    this.mesh.position.set(point.x, 0, point.z);
  }

  die() {
    this.alive = false;
    this.mesh.visible = false;
    this.state = 'dead';
    this.target = null;
  }

  takeDamage(amount, part, from) {
    if (!this.alive) return false;
    let damage = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, damage * 0.5);
      this.armor -= absorbed;
      damage -= absorbed;
    }
    this.health -= damage;
    // Being shot at makes a bot turn and fight, even when it never saw the shooter.
    if (from && !this.target) {
      this.investigate = { x: from.x, z: from.z };
      this.lastSeen = { x: from.x, z: from.z };
      this.reactionTimer = Math.min(this.reactionTimer, 0.12);
    }
    if (this.health <= 0) {
      this.die();
      return { killed: true, part };
    }
    return { killed: false, part };
  }

  hear(position, loudness) {
    if (!this.alive) return;
    const distance = Math.hypot(position.x - this.position.x, position.z - this.position.z);
    if (distance > BOTS.hearRadius * loudness) return;
    if (!this.investigate || this.state === 'hold') this.investigate = { x: position.x, z: position.z };
  }

  // Vision: a cone plus a clear line of sight at eye height, so crates hide a crouched player.
  canSee(other) {
    if (!other || !other.alive) return false;
    const eye = this.eyePosition;
    const targetEye = other.position.y + (other.eyeHeight ?? 1.6);
    const dx = other.position.x - eye.x;
    const dz = other.position.z - eye.z;
    const distance = Math.hypot(dx, dz);
    if (distance > BOTS.viewDistance) return false;
    const dot = (-Math.sin(this.yaw) * dx - Math.cos(this.yaw) * dz) / Math.max(0.001, distance);
    if (dot < Math.cos(BOTS.fov / 2)) return false;
    // Bodies behind a crate are hidden; a standing target is visible over a 1.15 m crate.
    const shooterHeight = Math.max(eye.y, targetEye * 0.5 + 0.6);
    if (segmentBlocked(eye.x, eye.z, other.position.x, other.position.z, Math.min(eye.y, targetEye))) return false;
    if (segmentBlocked(eye.x, eye.z, other.position.x, other.position.z, shooterHeight - 0.9)) return false;
    return true;
  }

  think(ctx) {
    const { enemies, dt, now, bomb } = ctx;
    // Perception, at most ~15 Hz: pick the closest visible enemy and start the reaction clock.
    let visible = null;
    let visibleDistance = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      if (!this.canSee(enemy)) continue;
      const distance = Math.hypot(enemy.position.x - this.position.x, enemy.position.z - this.position.z);
      if (distance < visibleDistance) { visible = enemy; visibleDistance = distance; }
    }
    if (visible) {
      if (this.target !== visible) {
        this.target = visible;
        // Reaction time: the bot does not fire the instant it sees you.
        this.reactionTimer = BOTS.reactionMin + Math.random() * (BOTS.reactionMax - BOTS.reactionMin);
      }
      this.lastSeen = { x: visible.position.x, z: visible.position.z };
      this.investigate = null;
      if (this.state !== 'plant' && this.state !== 'defuse') this.state = 'engage';
    } else if (this.state === 'engage') {
      this.state = this.investigate ? 'investigate' : 'push';
      if (!this.investigate) this.target = null;
    }

    // Objective duties outrank a fight only while nothing is visible.
    if (bomb?.state === 'planted' && this.team === 'defenders' && !visible) {
      if (this.state !== 'defuse') {
        this.state = 'defuse';
        this.path = [];
        this.repathTimer = 0;
      }
    }

    switch (this.state) {
      case 'engage':
        this.engage(visible, dt, ctx);
        break;
      case 'investigate':
        this.walkTo(this.investigate, dt, 1.15);
        if (this.investigate && Math.hypot(this.investigate.x - this.position.x, this.investigate.z - this.position.z) < 1.2) {
          this.investigate = null;
          this.state = 'push';
        }
        this.scan(dt);
        break;
      case 'defuse':
        this.defuseBomb(bomb, dt, ctx);
        break;
      case 'plant':
        this.plantBomb(bomb, dt, ctx);
        break;
      default:
        this.advance(ctx, dt);
        break;
    }

    this.repathTimer -= dt;
    if (this.state !== 'defuse') this.moveAlongPath(dt);
    this.weapon.update(dt);
    if (this.weapon.needsReload && !this.weapon.isReloading) this.weapon.startReload();
    this.syncMesh();
  }

  engage(target, dt, ctx) {
    if (!target) { this.state = 'push'; return; }
    const eye = this.eyePosition;
    const dx = target.position.x - eye.x;
    const dy = (target.position.y + (target.eyeHeight ?? 1.6) * 0.86) - eye.y;
    const dz = target.position.z - eye.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));

    // Aim error is smaller when standing still: this is what makes stopping to shoot pay.
    const moving = Math.hypot(this.velocity.x, this.velocity.z) > 0.9;
    const errorScale = moving ? BOTS.aimErrorMove : BOTS.aimErrorStill;
    this.aimErrorYaw = this.aimErrorYaw * 0.92 + (Math.random() - 0.5) * errorScale * 0.5;
    this.aimErrorPitch = this.aimErrorPitch * 0.92 + (Math.random() - 0.5) * errorScale * 0.5;

    this.yaw = turnTowards(this.yaw, wantYaw + this.aimErrorYaw, dt * BOTS.aimSpeed);
    this.pitch = turnTowards(this.pitch, wantPitch + this.aimErrorPitch, dt * BOTS.aimSpeed);

    const aligned = Math.abs(angleDelta(this.yaw, wantYaw)) < 0.09;
    this.reactionTimer -= dt;
    this.burstPause -= dt;
    if (this.reactionTimer <= 0 && aligned && this.burstPause <= 0) {
      if (this.burstLeft <= 0) this.burstLeft = BOTS.burst;
      const shot = this.weapon.fire({ moving, crouched: false, airborne: false });
      if (shot) {
        this.burstLeft -= 1;
        if (this.burstLeft <= 0) this.burstPause = BOTS.burstPause;
        ctx.onBotShot(this, shot, target);
      }
      if (this.weapon.needsReload) this.weapon.startReload();
    }

    // Strafe a little while shooting so a duel is not a standing trade.
    if (ctx.rng() < 0.4) {
      const strafe = ctx.rng() < 0.5 ? 1 : -1;
      this.position.x += Math.cos(this.yaw) * strafe * dt * 1.6;
      this.position.z -= Math.sin(this.yaw) * strafe * dt * 1.6;
      const resolved = resolveCircle(this.position.x, this.position.z, PLAYER.radius);
      this.position.x = resolved.x;
      this.position.z = resolved.z;
    }
  }

  advance(ctx, dt) {
    const goal = this.objectivePoint(ctx);
    if (!goal) return;
    if (this.repathTimer <= 0 || this.path.length === 0) {
      this.path = findPath(this.position, goal);
      this.pathIndex = 0;
      this.repathTimer = BOTS.repathEvery;
    }
    this.scan(dt);
    if (this.hasBomb && ctx.bomb && ctx.bomb.state === 'carried') {
      const site = this.assignedSite(ctx);
      if (site && Math.hypot(site.x - this.position.x, site.z - this.position.z) < 2.2) {
        this.state = 'plant';
      }
    }
  }

  objectivePoint(ctx) {
    if (this.team === 'attackers') {
      if (ctx.bomb && ctx.bomb.state === 'planted') return ctx.bomb.position;
      const site = this.assignedSite(ctx);
      if (site) return site;
      return SITE_WORLD[0];
    }
    const hold = this.holdPoint(ctx);
    return hold;
  }

  assignedSite(ctx) {
    const site = SITE_WORLD[ctx.attackingSite ?? 0] ?? SITE_WORLD[0];
    return { x: site.x, z: site.z };
  }

  // Defenders hold an angle near their site; every few seconds they shift a little so they are
  // never in the same doorway twice.
  holdPoint(ctx) {
    if (!this.holdTarget || this.repathTimer <= 0) {
      const site = SITE_WORLD[this.index % SITE_WORLD.length];
      this.holdTarget = randomNearbyTile(site, 3, ctx.rng);
    }
    return this.holdTarget;
  }

  defuseBomb(bomb, dt, ctx) {
    if (!bomb || bomb.state !== 'planted') { this.state = 'push'; return; }
    const distance = Math.hypot(bomb.position.x - this.position.x, bomb.position.z - this.position.z);
    if (distance > 1.5) {
      // Repath on a timer, not every frame: a path recomputed 240 times a second makes the bot
      // jitter in place and never actually walk anywhere.
      if (this.repathTimer <= 0 || this.path.length === 0) {
        this.path = findPath(this.position, bomb.position);
        this.pathIndex = 0;
        this.repathTimer = BOTS.repathEvery;
      }
      this.moveAlongPath(dt);
      return;
    }
    this.path = [];
    this.yaw = turnTowards(this.yaw, Math.atan2(-(bomb.position.x - this.position.x), -(bomb.position.z - this.position.z)), dt * 6);
    this.defuseTimer += dt;
    ctx.onDefuseTick?.(this, this.defuseTimer);
    if (this.defuseTimer >= (this.hasKit ? 4.5 : 7)) {
      ctx.onDefused?.(this);
      this.defuseTimer = 0;
    }
  }

  plantBomb(bomb, dt, ctx) {
    this.plantTimer += dt;
    ctx.onPlantTick?.(this, this.plantTimer);
    if (this.plantTimer >= 3.4) {
      ctx.onPlanted?.(this);
      this.plantTimer = 0;
      this.state = 'push';
    }
  }

  // Idle head turn, so a bot holding an angle is not a statue.
  scan(dt) {
    this.yaw += Math.sin(performance.now() / 1400 + this.index) * dt * 0.55;
  }

  walkTo(goal, dt, speedScale = 1) {
    if (!goal) return;
    const dx = goal.x - this.position.x;
    const dz = goal.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) return;
    const speed = PLAYER.walkSpeed * 0.78 * speedScale;
    this.velocity.x = (dx / distance) * speed;
    this.velocity.z = (dz / distance) * speed;
    this.yaw = turnTowards(this.yaw, Math.atan2(-dx, -dz), dt * 4.2);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    const resolved = resolveCircle(this.position.x, this.position.z, PLAYER.radius);
    this.position.x = resolved.x;
    this.position.z = resolved.z;
  }

  moveAlongPath(dt) {
    if (!this.path.length || this.state === 'engage' || this.state === 'plant') return;
    const point = this.path[this.pathIndex];
    if (!point) { this.path = []; return; }
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.35) {
      this.pathIndex += 1;
      if (this.pathIndex >= this.path.length) { this.path = []; }
      return;
    }
    const speed = PLAYER.walkSpeed * 0.76;
    this.velocity.x = (dx / distance) * speed;
    this.velocity.z = (dz / distance) * speed;
    if (this.state !== 'engage') this.yaw = turnTowards(this.yaw, Math.atan2(-dx, -dz), dt * 3.4);
    const before = { x: this.position.x, z: this.position.z };
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    const resolved = resolveCircle(this.position.x, this.position.z, PLAYER.radius);
    this.position.x = resolved.x;
    this.position.z = resolved.z;
    // If two ticks of movement moved us nowhere, the path is stale: ask for a new one.
    if (Math.hypot(this.position.x - before.x, this.position.z - before.z) < 0.002) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.6) { this.repathTimer = 0; this.stuckTimer = 0; }
    } else {
      this.stuckTimer = 0;
    }
  }

  syncMesh() {
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    this.mesh.rotation.y = this.yaw;
    const parts = this.mesh.userData.parts;
    if (parts) {
      // A cheap two-frame leg swing driven by the clock, enough to read as walking.
      const walk = Math.sin(performance.now() / 150 + this.index) * 0.09;
      parts.legs.position.z = walk;
      parts.legR.position.z = -walk;
      parts.torso.position.y = 1.2 + Math.abs(walk) * 0.02;
    }
  }
}

export function turnTowards(current, target, maxStep) {
  const delta = angleDelta(current, target);
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
