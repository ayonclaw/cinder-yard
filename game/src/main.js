// Cinder Yard: the game entry point. It wires the map, the player, the bots, rounds and the HUD
// together and runs one fixed-step simulation per frame, with rendering kept apart from the sim.

import * as THREE from 'three';
import { STEP, MAX_FRAME, ROUND, PLAYER, MONEY, BOTS } from './config.js';
import { buildWorld, ATTACKER_SPAWNS, DEFENDER_SPAWNS, SITE_WORLD, segmentBlocked, resolveCircle } from './world.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { Effects } from './effects.js';
import { Sound } from './audio.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Round, EVENTS } from './round.js';
import { raycastBots, damageFor } from './combat.js';
import { GRENADE, WEAPONS, WeaponState, BUY_MENU } from './weapons.js';

const TEAM_SIZE = 4;

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.world = buildWorld(this.scene);
    this.effects = new Effects(this.scene);
    this.sound = new Sound();
    this.hud = new Hud();
    this.input = new Input(this.canvas);
    this.round = new Round();
    this.rng = Math.random;

    this.player = new Player('attackers');
    this.player.money = MONEY.start;
    this.player.spawnAt(ATTACKER_SPAWNS[2] ?? ATTACKER_SPAWNS[0]);
    this.scene.add(this.player.camera);

    this.bots = [];
    this.grenades = [];
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.running = false;
    this.buyOpen = false;
    this.shake = 0;
    this.bombMesh = this.makeBombMesh();
    this.viewModel = this.makeViewModel();
    this.player.camera.add(this.viewModel);
    this.screenshotMode = new URLSearchParams(location.search).get('shot');
    this.pendingPlant = 0;
    this.pendingDefuse = 0;

    this.spawnTeams();
    this.bindEvents();
    this.hud.setRound(1);
    this.hud.setScore(0, 0);
    this.hud.setMoney(this.player.money);

    if (this.screenshotMode) {
      this.runScreenshotMode(this.screenshotMode);
    } else {
      this.hud.showOverlay('Cinder Yard', 'Four rounds of bots, a bomb to plant and a buy menu. Click to play.');
      this.hud.setBanner('CINDER YARD', 'Plant the bomb at A or B, or stop them — first to 13 rounds', 'neutral');
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  spawnTeams() {
    for (const bot of this.bots) this.scene.remove(bot.mesh);
    this.bots = [];
    for (let i = 0; i < TEAM_SIZE - 1; i += 1) {
      const spawn = ATTACKER_SPAWNS[(i + 1) % ATTACKER_SPAWNS.length];
      const bot = new Bot('attackers', i, spawn);
      this.scene.add(bot.mesh);
      this.bots.push(bot);
    }
    for (let i = 0; i < TEAM_SIZE; i += 1) {
      const spawn = DEFENDER_SPAWNS[i % DEFENDER_SPAWNS.length];
      const bot = new Bot('defenders', i, spawn);
      this.scene.add(bot.mesh);
      this.bots.push(bot);
    }
    this.bombCarrier = this.bots.find((bot) => bot.team === 'attackers') ?? null;
    if (this.bombCarrier) this.bombCarrier.hasBomb = true;
  }

  makeBombMesh() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.2, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.4 }),
    );
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xff5a3c, emissive: 0xff5a3c, emissiveIntensity: 1.4 }),
    );
    light.position.set(0.11, 0.06, 0.1);
    body.castShadow = true;
    group.add(body, light);
    group.visible = false;
    this.scene.add(group);
    return group;
  }

  // First-person weapon: a receiver, handguard, optic and two hands, plus a muzzle flash that is
  // only made visible for a few frames after a shot. It hangs off the camera, never the world.
  makeViewModel() {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.42, metalness: 0.75 });
    const polymer = new THREE.MeshStandardMaterial({ color: 0x3c3f43, roughness: 0.85, metalness: 0.1 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x8a6247, roughness: 0.8 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb257, emissiveIntensity: 1.4 });

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.095, 0.34), metal);
    receiver.position.set(0, 0, -0.02);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.07, 0.26), polymer);
    handguard.position.set(0, 0.004, -0.3);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 10), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.008, -0.46);
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.07), metal);
    brake.position.set(0, 0.008, -0.57);
    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.19, 0.085), polymer);
    magazine.position.set(0, -0.12, 0.02);
    magazine.rotation.x = 0.22;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.075), wood);
    grip.position.set(0, -0.1, 0.15);
    grip.rotation.x = -0.3;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.22), polymer);
    stock.position.set(0, 0.005, 0.24);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.2), metal);
    rail.position.set(0, 0.062, -0.12);
    const opticBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.075), metal);
    opticBody.position.set(0, 0.095, -0.1);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), glow);
    dot.position.set(0, 0.1, -0.07);
    const handFront = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.11), skin);
    handFront.position.set(-0.01, -0.055, -0.28);
    handFront.rotation.z = 0.2;
    const handRear = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.1), skin);
    handRear.position.set(0.012, -0.105, 0.12);
    const flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.19, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd07a, transparent: true, opacity: 0.9 }),
    );
    flash.rotation.x = -Math.PI / 2;
    flash.position.set(0, 0.008, -0.66);
    flash.visible = false;

    group.add(receiver, handguard, barrel, brake, magazine, grip, stock, rail, opticBody, dot, handFront, handRear, flash);
    group.userData.flash = flash;
    group.position.set(0.24, -0.2, -0.42);
    group.rotation.y = -0.05;
    return group;
  }

  bindEvents() {
    this.input.onLockChange = (locked) => {
      if (locked) {
        this.running = true;
        this.hud.hideOverlay();
        this.sound.start();
      }
    };
    this.hud.el.play?.addEventListener('click', () => {
      this.sound.start();
      this.input.requestLock();
      if (this.round.phase === 'ended' && this.round.matchOver) {
        this.newMatch();
      }
    });
    this.canvas.addEventListener('click', () => {
      if (!this.input.locked && !this.screenshotMode) this.input.requestLock();
    });
  }

  newMatch() {
    this.round = new Round();
    this.spawnTeams();
    this.player.money = MONEY.start;
    this.player.spawnAt(ATTACKER_SPAWNS[2] ?? ATTACKER_SPAWNS[0]);
    this.player.health = 100;
    this.player.armor = 0;
    this.player.alive = true;
    this.player.giveWeapon('hornet');
    this.hud.setBanner('', '');
    this.startRound();
  }

  startRound() {
    const attackerSpawns = [...ATTACKER_SPAWNS];
    let spawnIndex = 0;
    this.player.spawnAt(attackerSpawns[spawnIndex++ % attackerSpawns.length]);
    this.player.health = 100;
    this.player.alive = true;
    for (const bot of this.bots) {
      const pool = bot.team === 'attackers' ? attackerSpawns : DEFENDER_SPAWNS;
      bot.spawnAt(pool[spawnIndex++ % pool.length]);
      bot.mesh.visible = true;
      if (bot.team === 'defenders') {
        bot.holdTarget = null;
        bot.investigate = null;
      }
    }
    this.bombCarrier = this.bots.find((bot) => bot.team === 'attackers' && bot.alive) ?? null;
    for (const bot of this.bots) bot.hasBomb = bot === this.bombCarrier;
    if (!this.bombCarrier) this.player.hasBomb = true;
    else this.player.hasBomb = false;
    this.bombMesh.visible = false;
    this.grenades = [];
    this.round.begin();
    this.hud.setRound(this.round.round);
    this.hud.setScore(this.round.scores.attackers, this.round.scores.defenders);
    this.hud.setHealth(this.player.health, this.player.armor);
    this.sound.roundStart();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.player.camera.aspect = width / Math.max(1, height);
    this.player.camera.updateProjectionMatrix();
  }

  frame(time) {
    const delta = Math.min(MAX_FRAME, (time - this.lastTime) / 1000);
    this.lastTime = time;
    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator >= STEP && steps < 12) {
      this.step(STEP);
      this.accumulator -= STEP;
      steps += 1;
    }
    this.render(delta);
  }

  // One simulation step: everything below is deterministic given the same inputs.
  step(dt) {
    const input = this.input;
    const live = this.round.phase === 'live';

    if (input.locked && !this.buyOpen) {
      const look = input.takeLook();
      this.player.look(look.x, look.y);
    }

    if (input.wasPressed('KeyB') && this.round.buyOpen && this.player.alive) {
      this.toggleBuy(!this.buyOpen);
    }
    if (this.buyOpen && (!this.round.buyOpen || input.wasPressed('Escape'))) this.toggleBuy(false);

    this.player.update(dt, input, live && this.player.alive && !this.buyOpen && input.locked, (position, loudness) => {
      this.broadcastSound(position, loudness);
      this.sound.footstep();
    });

    if (live && this.player.alive && input.locked && !this.buyOpen) {
      this.handleFire(dt);
      this.handleGrenade();
      this.handleObjective(dt);
      if (input.wasPressed('KeyR') && this.player.weapon.startReload()) this.sound.reloadStart();
      const wheel = input.takeWheel();
      if (wheel !== 0) this.cycleWeapon(wheel);
    }

    const enemies = [this.player, ...this.bots.filter((bot) => bot.alive)];
    const ctx = {
      enemies: enemies.filter((actor) => actor.team !== this.player.team),
      dt,
      now: performance.now() / 1000,
      rng: this.rng,
      bomb: this.round.bomb,
      attackingSite: this.round.attackingSite,
      onBotShot: (bot, shot, target) => this.resolveBotShot(bot, shot, target),
      onPlanted: (bot) => this.onBombPlanted(bot),
      onDefused: (bot) => this.onBombDefused(bot),
      onPlantTick: () => {},
      onDefuseTick: () => {},
    };
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      if (this.screenshotMode) { bot.syncMesh(); continue; }
      const teamEnemies = enemies.filter((actor) => actor.team !== bot.team);
      ctx.enemies = teamEnemies;
      bot.think(ctx);
    }

    this.updateGrenades(dt);
    this.round.update(dt, {
      attackersAlive: [this.player, ...this.bots].filter((actor) => actor.team === 'attackers' && actor.alive).length,
      defendersAlive: this.bots.filter((bot) => bot.team === 'defenders' && bot.alive).length,
    });
    this.drainRoundEvents();
    this.effects.update(dt);
    this.hud.update(dt);
    this.updateBombVisual();
    input.endFrame();
  }

  handleFire(dt) {
    const weapon = this.player.weapon;
    if (!this.input.fireHeld && !(weapon.def.melee && this.input.firePressed)) return;
    if (!weapon.canFire()) {
      if (this.input.firePressed && weapon.needsReload) {
        this.sound.dryFire();
        weapon.startReload();
      }
      return;
    }
    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    const shot = weapon.fire({
      moving: speed > 1.1,
      crouched: this.player.crouching,
      airborne: !this.player.onGround,
    });
    if (!shot) return;
    this.sound.shot(weapon.def);
    this.player.addRecoil(shot.bloomKick, shot.spread);
    this.fireProjectiles(this.player, shot, weapon.def);
    this.viewKick = Math.min(1, (this.viewKick ?? 0) + 0.55);
    this.flashTimer = 0.055;
    if (this.viewModel?.userData.flash) this.viewModel.userData.flash.visible = true;
    if (weapon.def.melee) this.sound.tone?.(220, 0.08, 0.08, 'triangle');
  }

  // Shared ray path for the player and the bots: one spread cone, then a hit test per pellet.
  fireProjectiles(shooter, shot, def) {
    const origin = shooter.eyePosition;
    const forward = shooter.forwardVector;
    const targets = [this.player, ...this.bots];
    for (let pellet = 0; pellet < shot.pellets; pellet += 1) {
      const spread = shot.spread;
      const dir = {
        x: forward.x + (Math.random() - 0.5) * spread * 2,
        y: forward.y + (Math.random() - 0.5) * spread * 2,
        z: forward.z + (Math.random() - 0.5) * spread * 2,
      };
      const length = Math.hypot(dir.x, dir.y, dir.z) || 1;
      dir.x /= length; dir.y /= length; dir.z /= length;
      const hit = raycastBots(origin, dir, def.range, targets, shooter.team);
      const end = hit
        ? hit.point
        : { x: origin.x + dir.x * def.range, y: origin.y + dir.y * def.range, z: origin.z + dir.z * def.range };
      this.effects.tracer(origin, end);
      if (hit) {
        const damage = damageFor(def, hit.part, hit.distance, hit.bot.armor > 0);
        this.effects.burst(hit.point, hit.part === 'head' ? 8 : 5, true);
        if (hit.bot === this.player) {
          // The player is not a Bot: its damage path is its own, with the hurt vignette.
          this.damagePlayer(damage, shooter);
        } else {
          const result = hit.bot.takeDamage(damage, hit.part, origin);
          if (shooter === this.player) {
            this.hud.hit(hit.part === 'head');
            this.sound.hit(hit.part === 'head');
          }
          if (result.killed) this.onKill(shooter, hit.bot, def, hit.part);
        }
      } else {
        this.effects.burst(end, 3, false);
      }
    }
    this.effects.muzzle({ x: origin.x, y: origin.y - 0.08, z: origin.z });
  }

  // Player damage: armour soaks half of it, then health, then the round is told about a death.
  damagePlayer(amount, from) {
    if (!this.player.alive) return;
    let damage = amount;
    if (this.player.armor > 0) {
      const absorbed = Math.min(this.player.armor, damage * 0.5);
      this.player.armor -= absorbed;
      damage -= absorbed;
    }
    this.player.health -= damage;
    this.hud.hurt(damage);
    this.sound.hurt();
    this.shake = Math.min(0.5, this.shake + 0.12);
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.onKill(from ?? this.bots[0], this.player, { name: 'rifle' }, 'chest');
    }
  }

  resolveBotShot(bot, shot, target) {
    this.sound.shot(bot.weapon.def, Math.hypot(bot.position.x - this.player.position.x, bot.position.z - this.player.position.z));
    this.broadcastSound(bot.eyePosition, 1);
    this.fireProjectiles(bot, shot, bot.weapon.def);
  }

  onKill(shooter, victim, def, part) {
    const headshot = part === 'head';
    if (shooter === this.player) {
      const reward = MONEY.kill + (headshot ? MONEY.headshotBonus : 0);
      this.player.money = Math.min(MONEY.max, this.player.money + reward);
      this.hud.addFeed(`You ${headshot ? 'headshot' : 'eliminated'} ${victim.name} +$${reward}`, 'good');
      this.hud.setMoney(this.player.money);
      this.sound.kill();
    } else if (victim === this.player) {
      this.hud.addFeed(`${shooter.name} eliminated you`, 'bad');
      this.player.alive = false;
      this.sound.hurt();
    } else {
      this.hud.addFeed(`${shooter.name} eliminated ${victim.name}`, 'neutral');
    }
    if (victim !== this.player && victim.hasBomb) {
      victim.hasBomb = false;
      const nextCarrier = this.bots.find((bot) => bot.team === 'attackers' && bot.alive && bot !== victim);
      if (nextCarrier) {
        nextCarrier.hasBomb = true;
        this.bombCarrier = nextCarrier;
      } else {
        this.player.hasBomb = true;
      }
    }
    if (victim === this.player) this.showDeath();
    if (this.round.phase === 'live') this.checkTeamWipe();
  }

  checkTeamWipe() {
    const attackers = [this.player, ...this.bots].filter((actor) => actor.team === 'attackers' && actor.alive).length;
    const defenders = this.bots.filter((bot) => bot.team === 'defenders' && bot.alive).length;
    if (attackers === 0 && this.round.bomb.state === 'carried') {
      this.round.endRound('defenders', 'elimination');
      this.round.roundReward('defenders', 'elimination');
    } else if (defenders === 0) {
      this.round.roundReward('attackers', 'elimination');
      if (this.round.bomb.state === 'planted') return;
      this.round.endRound('attackers', 'elimination');
    }
  }

  showDeath() {
    const attackerAlive = this.bots.some((bot) => bot.team === 'attackers' && bot.alive);
    this.hud.showOverlay('You are down', attackerAlive ? 'Your team fights on — watch the round play out.' : 'The round is lost. Next round starts shortly.', attackerAlive ? 'Spectating' : 'Waiting');
    if (!attackerAlive && this.input.locked) document.exitPointerLock?.();
  }

  handleGrenade() {
    if (!this.input.wasPressed('KeyG') || (this.player.grenades ?? 0) <= 0) return;
    this.player.grenades -= 1;
    const origin = this.player.eyePosition;
    const forward = this.player.forwardVector;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x4d5a46, roughness: 0.7 }),
    );
    mesh.position.set(origin.x, origin.y, origin.z);
    this.scene.add(mesh);
    this.grenades.push({
      mesh,
      velocity: { x: forward.x * 17, y: forward.y * 17 + 3.4, z: forward.z * 17 },
      fuse: GRENADE.fuse,
      owner: this.player,
    });
    this.sound.tone(300, 0.06, 0.1, 'square');
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i -= 1) {
      const grenade = this.grenades[i];
      grenade.velocity.y -= 17 * dt;
      grenade.mesh.position.x += grenade.velocity.x * dt;
      grenade.mesh.position.y += grenade.velocity.y * dt;
      grenade.mesh.position.z += grenade.velocity.z * dt;
      if (grenade.mesh.position.y < 0.08) {
        grenade.mesh.position.y = 0.08;
        grenade.velocity.y *= -0.34;
        grenade.velocity.x *= 0.72;
        grenade.velocity.z *= 0.72;
      }
      const resolved = resolveCircle(grenade.mesh.position.x, grenade.mesh.position.z, 0.1);
      if (resolved.x !== grenade.mesh.position.x || resolved.z !== grenade.mesh.position.z) {
        grenade.velocity.x *= -0.45;
        grenade.velocity.z *= -0.45;
        grenade.mesh.position.x = resolved.x;
        grenade.mesh.position.z = resolved.z;
      }
      grenade.fuse -= dt;
      if (grenade.fuse <= 0) this.explodeGrenade(grenade, i);
    }
  }

  explodeGrenade(grenade, index) {
    const point = grenade.mesh.position.clone();
    this.scene.remove(grenade.mesh);
    this.grenades.splice(index, 1);
    this.sound.explosion();
    this.effects.burst(point, 26, false);
    this.shake = 0.35;
    const actors = [this.player, ...this.bots];
    for (const actor of actors) {
      if (!actor.alive || actor.team === grenade.owner.team) continue;
      const distance = Math.hypot(actor.position.x - point.x, actor.position.z - point.z);
      if (distance > GRENADE.radius) continue;
      if (segmentBlocked(point.x, point.z, actor.position.x, actor.position.z, 1.2)) continue;
      const falloff = 1 - distance / GRENADE.radius;
      const damage = Math.round(GRENADE.maxDamage * falloff * falloff);
      if (damage <= 0) continue;
      if (actor === this.player) {
        this.player.health -= damage;
        this.hud.hurt(damage);
        if (this.player.health <= 0) this.onKill(grenade.owner, this.player, GRENADE, 'chest');
      } else {
        const result = actor.takeDamage(damage, 'chest', point);
        if (result.killed) this.onKill(grenade.owner, actor, GRENADE, 'chest');
      }
    }
  }

  handleObjective(dt) {
    const holdingE = this.input.down('KeyE');
    const bomb = this.round.bomb;
    const onSite = SITE_WORLD.find((site) => Math.hypot(site.x - this.player.position.x, site.z - this.player.position.z) < 2.6);

    if (this.player.hasBomb && onSite && holdingE) {
      this.pendingPlant += dt;
      this.hud.setBanner('PLANTING', `Hold E — ${Math.max(0, ROUND.plantTime - this.pendingPlant).toFixed(1)}s`, 'hot');
      if (this.pendingPlant >= ROUND.plantTime) {
        this.pendingPlant = 0;
        this.onBombPlanted(this.player, onSite);
        this.hud.setBanner('', '');
      }
      return;
    }
    if (this.pendingPlant > 0) {
      this.pendingPlant = 0;
      this.hud.setBanner('', '');
    }

    if (bomb.state === 'planted' && this.player.team === 'defenders') {
      const onBomb = Math.hypot(bomb.position.x - this.player.position.x, bomb.position.z - this.player.position.z) < 1.6;
      if (onBomb && holdingE) {
        this.pendingDefuse += dt;
        const total = this.player.hasKit ? ROUND.defuseKitTime : ROUND.defuseTime;
        this.hud.setBanner('DEFUSING', `Hold E — ${Math.max(0, total - this.pendingDefuse).toFixed(1)}s`, 'cold');
        if (this.pendingDefuse >= total) {
          this.pendingDefuse = 0;
          this.round.defuse(this.player);
          this.hud.setBanner('', '');
        }
        return;
      }
      if (this.pendingDefuse > 0) {
        this.pendingDefuse = 0;
        this.hud.setBanner('', '');
      }
    }
  }

  onBombPlanted(owner, site) {
    const position = site ?? this.round.bomb.position ?? owner.position;
    this.round.plant(position, owner, 'attackers');
    this.bombMesh.position.set(position.x, 0.12, position.z);
    this.bombMesh.visible = true;
    if (owner === this.player) {
      this.player.hasBomb = false;
      this.player.money = Math.min(MONEY.max, this.player.money + MONEY.plantReward);
      this.hud.addFeed('Bomb planted +$300', 'good');
      this.hud.setMoney(this.player.money);
    } else {
      owner.hasBomb = false;
      this.hud.addFeed(`${owner.name} planted the bomb`, 'warn');
    }
    this.sound.planted();
    this.hud.setBanner('BOMB PLANTED', 'Hold the site for 40 seconds', 'hot');
    setTimeout(() => this.hud.setBanner('', ''), 2600);
  }

  onBombDefused(owner) {
    this.round.defuse(owner);
    this.bombMesh.visible = false;
    this.sound.defused();
  }

  updateBombVisual() {
    if (this.round.bomb.state !== 'planted') return;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / (this.round.bomb.timer < 10 ? 90 : 260));
    this.bombMesh.children[1].material.emissiveIntensity = 0.6 + pulse * 1.8;
  }

  broadcastSound(position, loudness) {
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      if (bot.team === 'defenders') bot.hear(position, loudness);
    }
  }

  drainRoundEvents() {
    while (this.round.events.length) {
      const event = this.round.events.shift();
      if (event.type === EVENTS.ROUND_END) {
        const reward = this.round.roundReward(event.winner, event.reason);
        const won = event.winner === 'attackers';
        this.player.money = Math.min(MONEY.max, this.player.money + (won ? reward.win : reward.loss));
        this.hud.setMoney(this.player.money);
        this.hud.setScore(this.round.scores.attackers, this.round.scores.defenders);
        this.hud.setBanner(
          won ? 'ROUND WON' : 'ROUND LOST',
          `${event.reason === 'bomb' ? 'The bomb went off' : event.reason === 'defuse' ? 'Bomb defused' : event.reason === 'time' ? 'Time ran out' : 'Team eliminated'} · +$${won ? reward.win : reward.loss}`,
          won ? 'good' : 'bad',
        );
        won ? this.sound.roundWin() : this.sound.roundLoss();
      }
      if (event.type === EVENTS.BOMB_EXPLODED) {
        this.sound.explosion();
        this.effects.burst(this.bombMesh.position, 30, false);
        this.bombMesh.visible = false;
      }
      if (event.type === EVENTS.MATCH_END) {
        const won = event.winner === 'attackers';
        this.hud.showOverlay(won ? 'Match won' : 'Match lost', `${this.round.scores.attackers} — ${this.round.scores.defenders}`, 'Play again');
        document.exitPointerLock?.();
        this.sound.roundWin();
      }
      if (event.type === EVENTS.ROUND_START && this.round.round > 1) {
        this.startRound();
      }
      if (event.type === EVENTS.BOMB_DEFUSED) {
        this.bombMesh.visible = false;
      }
    }
  }

  toggleBuy(open) {
    this.buyOpen = open;
    if (open) {
      this.hud.showBuyMenu(BUY_MENU, this.player.money, (id) => this.buy(id), this.player);
      this.input.keys.clear();
      document.exitPointerLock?.();
    } else {
      this.hud.hideBuyMenu();
      if (!this.screenshotMode) this.input.requestLock();
    }
  }

  buy(id) {
    const result = this.round.buy(id, this.player);
    if (!result.ok) {
      this.hud.addFeed(result.why, 'bad');
      this.sound.dryFire();
      return;
    }
    if (WEAPONS[id]) {
      this.player.giveWeapon(id);
      if (id === 'breaker' || id === 'vesper' || id === 'rhino') this.player.weapon.def.selectable = true;
    } else if (id === 'armor') {
      this.player.armor = 100;
    } else if (id === 'kit') {
      this.player.hasKit = true;
    } else if (id === 'frag') {
      this.player.grenades = (this.player.grenades ?? 0) + 1;
    }
    this.hud.setMoney(this.player.money);
    this.hud.showBuyMenu(BUY_MENU, this.player.money, (next) => this.buy(next), this.player);
    this.sound.buy();
  }

  cycleWeapon(direction) {
    const order = ['hornet', 'vesper', 'breaker', 'rhino'];
    const current = order.indexOf(this.player.weapon.def.id);
    const next = order[(current + (direction > 0 ? 1 : order.length - 1)) % order.length];
    if (WEAPONS[next]) this.player.giveWeapon(next);
  }

  render(dt) {
    if (!this.screenshotMode && !this.input.locked) {
      this.player.syncCamera(0);
    } else {
      this.player.syncCamera(this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.02 : 0);
    }
    this.shake = Math.max(0, this.shake - dt * 1.4);

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0 && this.viewModel?.userData.flash) this.viewModel.userData.flash.visible = false;
    }
    const kick = this.viewKick ?? 0;
    if (this.viewModel) {
      const restingZ = -0.42;
      this.viewModel.position.set(0.24, -0.2 - kick * 0.012, restingZ + kick * 0.05);
      this.viewModel.rotation.x = kick * 0.12;
      if (this.player.weapon?.def?.melee) this.viewModel.visible = false;
      else this.viewModel.visible = this.player.alive && !this.buyOpen;
    }
    this.viewKick = Math.max(0, kick - dt * 5.5);

    this.hud.setHealth(this.player.health, this.player.armor);
    this.hud.setAmmo(this.player.weapon);
    this.hud.setTimer(this.round.timeLeft, this.round.phase);
    this.hud.setBomb(this.round.bomb, this.player.team);
    this.hud.setCrosshairSpread(this.player.weapon?.bloom ?? 0);
    if (this.hud.drawRadar && Math.random() < 0.35) this.hud.drawRadar(this.player, this.bots, this.round.bomb);
    this.renderer.render(this.scene, this.player.camera);
  }

  // Deterministic staging for the entry's screenshots: ?shot=start|play|end drives the frame the
  // camera sees, so a screenshot is a real render of a real game state, never a mock-up.
  runScreenshotMode(mode) {
    this.screenshotMode = mode;
    this.hud.hideOverlay();
    document.body.classList.add('screenshot');
    this.round.begin();
    this.round.startLive();
    this.player.hasBomb = true;
    const aimAt = (target, pitch = 0) => {
      this.player.yaw = Math.atan2(-(target.x - this.player.position.x), -(target.z - this.player.position.z));
      this.player.pitch = pitch;
    };
    if (mode === 'start') {
      this.player.spawnAt(ATTACKER_SPAWNS[3] ?? ATTACKER_SPAWNS[0]);
      this.player.money = 4400;
      this.player.giveWeapon('rhino');
      this.player.armor = 100;
      aimAt({ x: 0, z: -2 }, -0.02);
      this.round.timeLeft = 112;
      const mate = this.bots.find((bot) => bot.team === 'attackers');
      if (mate) mate.spawnAt({ x: this.player.position.x - 1.9, z: this.player.position.z - 3.2 });
      const enemy = this.bots.find((bot) => bot.team === 'defenders');
      if (enemy) enemy.spawnAt({ x: -0.4, z: -8.5 });
      this.hud.setBanner('ROUND 1', 'First to 13 · buy time open', 'neutral');
      this.hud.addFeed('Raiders spawned · plant at A or B', 'neutral');
    } else if (mode === 'play') {
      const site = SITE_WORLD[0];
      this.player.spawnAt({ x: site.x + 0.4, z: site.z + 6.4 });
      this.player.money = 3250;
      this.player.armor = 100;
      this.player.health = 72;
      this.player.giveWeapon('rhino');
      this.player.weapon.mag = 21;
      aimAt({ x: site.x, z: site.z - 1.2 }, -0.04);
      this.round.attackingSite = 0;
      this.round.timeLeft = 78;
      this.round.bomb.state = 'carried';
      this.round.bomb.carrier = this.bots.find((bot) => bot.team === 'attackers');
      const enemy = this.bots.find((bot) => bot.team === 'defenders');
      if (enemy) {
        enemy.spawnAt({ x: site.x + 1.6, z: site.z - 2.6 });
        enemy.yaw = Math.atan2(-(this.player.position.x - enemy.position.x), -(this.player.position.z - enemy.position.z));
      }
      const mate = this.bots.find((bot) => bot.team === 'attackers');
      if (mate) mate.spawnAt({ x: site.x - 3.2, z: site.z + 2.2 });
      this.hud.setBanner('PLANT THE BOMB', 'Site A — clear the site and hold E', 'hot');
      this.hud.addFeed('You eliminated Warden', 'good');
    } else if (mode === 'end') {
      const site = SITE_WORLD[1];
      this.player.spawnAt({ x: site.x - 1.0, z: site.z + 5.6 });
      this.player.money = 5200;
      this.player.armor = 60;
      this.player.health = 88;
      this.player.giveWeapon('vesper');
      aimAt({ x: site.x, z: site.z }, -0.08);
      this.round.scores = { attackers: 12, defenders: 9 };
      this.round.round = 22;
      this.round.phase = 'ended';
      this.round.timeLeft = ROUND.endDelay;
      this.round.bomb = { state: 'planted', position: { x: site.x, z: site.z }, timer: 6.4, carrier: null, defuser: null };
      this.bombMesh.position.set(site.x, 0.12, site.z);
      this.bombMesh.visible = true;
      this.hud.setRound(22);
      this.hud.setScore(12, 9);
      this.hud.setBanner('ROUND WON', 'Bomb detonated at site B · +$3500', 'good');
      this.hud.addFeed('Bomb exploded', 'warn');
    }
    this.hud.setScore(this.round.scores.attackers, this.round.scores.defenders);
    this.hud.setRound(this.round.round);
    this.hud.setMoney(this.player.money);
    this.hud.setTimer(this.round.timeLeft, this.round.phase);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const start = () => {
    try {
      window.__game = new Game();
    } catch (error) {
      const el = document.getElementById('overlay-copy');
      if (el) el.textContent = `Could not start: ${error.message}`;
      throw error;
    }
  };
  if (document.readyState === 'loading') window.addEventListener('load', start, { once: true });
  else start();
});
