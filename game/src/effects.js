// Pooled visual effects: tracers, impact sparks, blood puffs and muzzle flashes. Every object is
// created once at start-up and reused, so the hot path allocates nothing.

import * as THREE from 'three';

const TRACER_COUNT = 48;
const SPARK_COUNT = 96;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.tracerIndex = 0;
    this.sparks = [];
    this.sparkIndex = 0;

    const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85 });
    for (let i = 0; i < TRACER_COUNT; i += 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geometry, tracerMaterial);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }

    const sparkGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xfff1c9 });
    const bloodMaterial = new THREE.MeshBasicMaterial({ color: 0x9a2626 });
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      const mesh = new THREE.Mesh(sparkGeometry, i % 3 === 0 ? bloodMaterial : sparkMaterial);
      mesh.visible = false;
      scene.add(mesh);
      this.sparks.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
    }

    this.flashLight = new THREE.PointLight(0xffcf8a, 0, 12, 2);
    scene.add(this.flashLight);
    this.flashLife = 0;
  }

  tracer(from, to) {
    const item = this.tracers[this.tracerIndex];
    this.tracerIndex = (this.tracerIndex + 1) % this.tracers.length;
    const positions = item.line.geometry.attributes.position;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    item.line.visible = true;
    item.life = 0.06;
  }

  burst(point, count, isBlood = false) {
    for (let i = 0; i < count; i += 1) {
      const spark = this.sparks[this.sparkIndex];
      this.sparkIndex = (this.sparkIndex + 1) % this.sparks.length;
      const spread = isBlood ? 2.6 : 4.2;
      spark.mesh.position.copy(point);
      spark.mesh.visible = true;
      spark.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      spark.vx = (Math.random() - 0.5) * spread;
      spark.vy = Math.random() * spread * 0.8 + 0.6;
      spark.vz = (Math.random() - 0.5) * spread;
      spark.life = 0.28 + Math.random() * 0.22;
    }
  }

  muzzle(position) {
    this.flashLight.position.copy(position);
    this.flashLight.intensity = 9;
    this.flashLife = 0.06;
  }

  update(dt) {
    for (const item of this.tracers) {
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0) item.line.visible = false;
    }
    for (const spark of this.sparks) {
      if (spark.life <= 0) continue;
      spark.life -= dt;
      if (spark.life <= 0) { spark.mesh.visible = false; continue; }
      spark.vy -= 9 * dt;
      spark.mesh.position.x += spark.vx * dt;
      spark.mesh.position.y += spark.vy * dt;
      spark.mesh.position.z += spark.vz * dt;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.flashLight.intensity = 0;
    }
  }
}
