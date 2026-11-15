// One palette for the whole map: a cold industrial yard at dusk, lit by hot work lamps.
// Every texture is drawn here with the 2D canvas, so the game ships no image files and every
// surface still gets real detail instead of flat colour. Materials are built once, never per frame.

import * as THREE from 'three';

export const COLORS = {
  ground: 0x272b2f,
  wall: 0x555b62,
  wallTrim: 0x717880,
  containerA: 0x8a4b2a,
  containerB: 0x2f5d63,
  containerC: 0x6d6238,
  crate: 0x7a6a4c,
  lamp: 0xffd9a0,
  accent: 0xff9f43,
  siteA: 0x5cb6d8,
  siteB: 0xd2705c,
  hazard: 0xd7a53c,
  blood: 0x7a1f1f,
};

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function texture(draw, { size = 512, repeat = [1, 1] } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  return tex;
}

// Value noise block: cheap grain that reads as concrete, asphalt or rust once repeated.
function grain(ctx, size, amount, alpha) {
  for (let i = 0; i < amount; i += 1) {
    const v = Math.random() * 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    const r = Math.random() * 2.2 + 0.4;
    ctx.fillRect(Math.random() * size, Math.random() * size, r, r);
  }
}

function asphaltTexture() {
  return texture((ctx, size) => {
    ctx.fillStyle = '#23272b';
    ctx.fillRect(0, 0, size, size);
    grain(ctx, size, 14000, 0.11);
    // Aggregate speckles and a few tar seams.
    for (let i = 0; i < 90; i += 1) {
      ctx.fillStyle = `rgba(${140 + Math.random() * 60},${140 + Math.random() * 50},${130 + Math.random() * 50},0.16)`;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 1.6 + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(12,14,16,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      let x = Math.random() * size;
      let y = Math.random() * size;
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s += 1) {
        x += (Math.random() - 0.5) * 60;
        y += (Math.random() - 0.5) * 60;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, { size: 512, repeat: [8, 8] });
}

function concreteTexture() {
  return texture((ctx, size) => {
    ctx.fillStyle = '#4c5259';
    ctx.fillRect(0, 0, size, size);
    grain(ctx, size, 11000, 0.13);
    // Formwork board lines and vertical seams: this is what makes a wall read as cast concrete.
    for (let y = 0; y < size; y += 96) {
      ctx.fillStyle = 'rgba(22,25,28,0.5)';
      ctx.fillRect(0, y, size, 2);
      ctx.fillStyle = 'rgba(200,205,210,0.05)';
      ctx.fillRect(0, y + 2, size, 2);
    }
    for (let x = 0; x < size; x += 192) {
      ctx.fillStyle = 'rgba(20,23,26,0.4)';
      ctx.fillRect(x, 0, 2, size);
    }
    // Water staining running down from the top.
    for (let i = 0; i < 12; i += 1) {
      const x = Math.random() * size;
      const gradient = ctx.createLinearGradient(x, 0, x, size);
      gradient.addColorStop(0, 'rgba(18,20,22,0.34)');
      gradient.addColorStop(1, 'rgba(18,20,22,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, Math.random() * 8 + 3, size);
    }
  }, { size: 512, repeat: [1, 1] });
}

function corrugatedTexture(base) {
  return texture((ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const ribs = 22;
    const width = size / ribs;
    for (let i = 0; i < ribs; i += 1) {
      const x = i * width;
      const gradient = ctx.createLinearGradient(x, 0, x + width, 0);
      gradient.addColorStop(0, 'rgba(0,0,0,0.42)');
      gradient.addColorStop(0.35, 'rgba(255,255,255,0.09)');
      gradient.addColorStop(0.62, 'rgba(0,0,0,0.05)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, width, size);
    }
    // Rust blooms and paint scuffs.
    for (let i = 0; i < 60; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 12 + 3;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, 'rgba(120,58,26,0.5)');
      gradient.addColorStop(1, 'rgba(120,58,26,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    grain(ctx, size, 7000, 0.1);
  }, { size: 512, repeat: [1, 1] });
}

function woodTexture() {
  return texture((ctx, size) => {
    ctx.fillStyle = '#6f5a3a';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 48) {
      ctx.fillStyle = `rgba(${40 + Math.random() * 30},${30 + Math.random() * 22},${18 + Math.random() * 14},0.5)`;
      ctx.fillRect(0, y, size, 45);
      ctx.strokeStyle = 'rgba(20,14,8,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05) * 2 + 8);
      ctx.stroke();
    }
    grain(ctx, size, 8000, 0.1);
  }, { size: 512, repeat: [1, 1] });
}

function hazardTexture() {
  return texture((ctx, size) => {
    ctx.fillStyle = '#26292d';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#d7a53c';
    ctx.save();
    ctx.translate(0, 0);
    for (let i = -size; i < size * 2; i += 48) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 24, 0);
      ctx.lineTo(i + 24 - size, size);
      ctx.lineTo(i - size, size);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    grain(ctx, size, 3000, 0.14);
  }, { size: 256, repeat: [2, 1] });
}

// The site plate: a painted ring with the site letter, glowing, so both sites read at a glance.
function siteTexture(letter, color) {
  return texture((ctx, size) => {
    ctx.fillStyle = '#1b1e22';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.floor(size * 0.46)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, size / 2, size / 2 + size * 0.02);
    grain(ctx, size, 1600, 0.1);
  }, { size: 256, repeat: [1, 1] });
}

// Sky: a dusk gradient with a low sun band, drawn once and wrapped around a dome.
function skyTexture() {
  const width = 32;
  const height = 256;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#10161f');
  gradient.addColorStop(0.42, '#1d2833');
  gradient.addColorStop(0.62, '#3d3a38');
  gradient.addColorStop(0.78, '#7a5334');
  gradient.addColorStop(1, '#241c18');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

export function buildMaterials() {
  const std = (options) => new THREE.MeshStandardMaterial(options);
  const asphalt = asphaltTexture();
  const concrete = concreteTexture();
  const corrA = corrugatedTexture('#8a4b2a');
  const corrB = corrugatedTexture('#2f5d63');
  const corrC = corrugatedTexture('#6d6238');
  const wood = woodTexture();
  const hazard = hazardTexture();

  return {
    ground: std({ map: asphalt, color: 0xffffff, roughness: 0.96, metalness: 0.05 }),
    wall: std({ map: concrete, color: 0xffffff, roughness: 0.92, metalness: 0.04 }),
    wallTrim: std({ map: hazard, color: 0xffffff, roughness: 0.8, metalness: 0.15 }),
    containerA: std({ map: corrA, color: 0xffffff, roughness: 0.72, metalness: 0.28 }),
    containerB: std({ map: corrB, color: 0xffffff, roughness: 0.72, metalness: 0.28 }),
    containerC: std({ map: corrC, color: 0xffffff, roughness: 0.75, metalness: 0.22 }),
    crate: std({ map: wood, color: 0xffffff, roughness: 0.9, metalness: 0.02 }),
    accent: std({ color: COLORS.accent, emissive: COLORS.accent, emissiveIntensity: 1.1, roughness: 0.4 }),
    siteA: std({ map: siteTexture('A', '#5cb6d8'), emissive: 0x1c4a5c, emissiveIntensity: 0.7, roughness: 0.55 }),
    siteB: std({ map: siteTexture('B', '#d2705c'), emissive: 0x5c211c, emissiveIntensity: 0.7, roughness: 0.55 }),
    sky: skyTexture(),
  };
}

export const MATERIAL_BY_NAME = {
  wall: 'wall',
  trim: 'wallTrim',
  containerA: 'containerA',
  containerB: 'containerB',
  containerC: 'containerC',
  crate: 'crate',
  accent: 'accent',
  siteA: 'siteA',
  siteB: 'siteB',
};
