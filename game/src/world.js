// The map, its collision, and its lighting. "Cinder Yard" is an original dockside yard:
// two bomb sites in the north, a mid bridge between them, two long lanes down the flanks and a
// crate-strewn south yard for the attackers. Laid out as a tile grid (24 x 24 tiles, 1.6 m each)
// so both the collision and the bots' pathfinding read one source of truth.

import * as THREE from 'three';
import { buildMaterials, COLORS } from './palette.js';

export const TILE = 1.6;
export const GRID = 24;

// Tile kinds. '#' wall, 'c' low crate cover (1.15 m: blocks bodies and low bullets, not sight),
// '.' open floor, 'A'/'B' bomb site floor, 's'/'d' spawn floor.
const WALL = '#';
const CRATE = 'c';

// Rectangles filled with one tile kind: [rowStart, rowEnd, colStart, colEnd] inclusive.
const FILLS = [
  ['#', 0, 0, 0, 23],
  ['#', 23, 23, 0, 23],
  ['#', 0, 23, 0, 0],
  ['#', 0, 23, 23, 23],

  // Walls that fence the north sites off from the spawn bridge, with a door at each end.
  ['#', 2, 8, 8, 9],
  ['#', 2, 8, 14, 15],

  // The two long flank walls: they make Long A and Long B real lanes with corners.
  ['#', 10, 18, 3, 3],
  ['#', 10, 18, 20, 20],

  // Mid choke: two short walls either side of the bridge mouth, so mid can be held.
  ['#', 10, 12, 10, 10],
  ['#', 10, 12, 13, 13],

  // South yard dividers, giving the attackers three ways out of spawn.
  ['#', 19, 19, 4, 7],
  ['#', 19, 19, 16, 19],
  ['#', 14, 16, 8, 8],
  ['#', 14, 16, 15, 15],

  // Site floors.
  ['A', 2, 5, 2, 6],
  ['B', 2, 5, 17, 21],

  // Spawns.
  ['d', 1, 2, 10, 13],
  ['s', 21, 22, 10, 13],

  // Crate cover: sites, mid, lanes and the yard.
  ['c', 2, 2, 2, 2],
  ['c', 4, 4, 6, 6],
  ['c', 2, 2, 21, 21],
  ['c', 4, 4, 21, 21],
  ['c', 11, 11, 11, 11],
  ['c', 8, 8, 12, 12],
  ['c', 13, 13, 5, 5],
  ['c', 16, 16, 18, 18],
  ['c', 16, 16, 5, 5],
  ['c', 18, 18, 11, 12],
  ['c', 6, 6, 1, 2],
  ['c', 6, 6, 21, 22],
  ['c', 20, 20, 2, 3],
  ['c', 20, 20, 20, 21],
];

export const SITES = [
  { name: 'A', row: 3, col: 4 },
  { name: 'B', row: 3, col: 19 },
];

// Props: the big readable shapes that make the yard look like a yard. Each one is solid (it blocks
// bodies and paths) but is drawn as its own prop rather than a plain wall, and its footprint is
// pushed into the grid as 'p' so pathfinding and line of sight treat it exactly like a wall.
export const PROPS = [
  { kind: 'container', row: 21, col: 2, rows: 1, cols: 3, h: 2.7 },
  { kind: 'container', row: 21, col: 19, rows: 1, cols: 3, h: 2.7 },
  { kind: 'container', row: 6, col: 1, rows: 1, cols: 2, h: 2.7 },
  { kind: 'container', row: 6, col: 21, rows: 1, cols: 2, h: 2.7 },
  { kind: 'container', row: 14, col: 1, rows: 1, cols: 2, h: 2.7 },
  { kind: 'container', row: 14, col: 21, rows: 1, cols: 2, h: 2.7 },
  { kind: 'pillar', row: 7, col: 6, rows: 1, cols: 1, h: 3.2 },
  { kind: 'pillar', row: 7, col: 17, rows: 1, cols: 1, h: 3.2 },
  { kind: 'pillar', row: 16, col: 6, rows: 1, cols: 1, h: 3.2 },
  { kind: 'pillar', row: 16, col: 17, rows: 1, cols: 1, h: 3.2 },
  { kind: 'barrier', row: 5, col: 3, rows: 1, cols: 1, h: 1.1 },
  { kind: 'barrier', row: 5, col: 20, rows: 1, cols: 1, h: 1.1 },
  { kind: 'drum', row: 12, col: 7, rows: 1, cols: 1, h: 1.15 },
  { kind: 'drum', row: 12, col: 16, rows: 1, cols: 1, h: 1.15 },
  { kind: 'drum', row: 20, col: 8, rows: 1, cols: 1, h: 1.15 },
  { kind: 'drum', row: 20, col: 15, rows: 1, cols: 1, h: 1.15 },
  { kind: 'pallet', row: 17, col: 2, rows: 1, cols: 2, h: 0.8 },
  { kind: 'pallet', row: 17, col: 20, rows: 1, cols: 2, h: 0.8 },
  { kind: 'barrier', row: 9, col: 6, rows: 1, cols: 1, h: 1.1 },
  { kind: 'barrier', row: 9, col: 17, rows: 1, cols: 1, h: 1.1 },
];

function makeGrid() {
  const grid = Array.from({ length: GRID }, () => new Array(GRID).fill('.'));
  for (const [kind, r0, r1, c0, c1] of FILLS) {
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        if (r >= 0 && r < GRID && c >= 0 && c < GRID) grid[r][c] = kind;
      }
    }
  }
  for (const prop of PROPS) {
    for (let r = prop.row; r < prop.row + prop.rows; r += 1) {
      for (let c = prop.col; c < prop.col + prop.cols; c += 1) {
        if (r > 0 && r < GRID - 1 && c > 0 && c < GRID - 1) grid[r][c] = 'p';
      }
    }
  }
  return grid;
}

export const GRID_TILES = makeGrid();

export function tileAt(row, col) {
  if (row < 0 || col < 0 || row >= GRID || col >= GRID) return WALL;
  return GRID_TILES[row][col];
}

export function isBlocked(row, col) {
  const t = tileAt(row, col);
  return t === WALL || t === CRATE || t === 'p';
}

export function isWalkable(row, col) {
  return !isBlocked(row, col);
}

// World coordinates: the grid is centred on the origin so the map reads the same from any side.
export function tileToWorld(row, col) {
  return {
    x: (col - (GRID - 1) / 2) * TILE,
    z: (row - (GRID - 1) / 2) * TILE,
  };
}

export function worldToTile(x, z) {
  return {
    row: Math.round(z / TILE + (GRID - 1) / 2),
    col: Math.round(x / TILE + (GRID - 1) / 2),
  };
}

// Colliders: one merged box per horizontal run of solid tiles, which keeps the count small
// (the gate counts files, and the renderer counts draw calls, not boxes).
function makeColliders() {
  const boxes = [];
  for (let r = 0; r < GRID; r += 1) {
    let runStart = -1;
    let runKind = null;
    for (let c = 0; c <= GRID; c += 1) {
      const t = c < GRID ? tileAt(r, c) : '.';
      const solid = t === WALL || t === CRATE;
      if (solid && runStart === -1) {
        runStart = c;
        runKind = t;
      } else if ((!solid || t !== runKind) && runStart !== -1) {
        const z = (r - (GRID - 1) / 2) * TILE;
        const x0 = (runStart - (GRID - 1) / 2) * TILE - TILE / 2;
        const x1 = (c - 1 - (GRID - 1) / 2) * TILE + TILE / 2;
        boxes.push({
          minX: x0,
          maxX: x1,
          minZ: z - TILE / 2,
          maxZ: z + TILE / 2,
          height: runKind === CRATE ? 1.15 : 3.2,
          kind: runKind,
        });
        runStart = solid ? c : -1;
        runKind = solid ? t : null;
      }
    }
  }
  for (const prop of PROPS) {
    const { x: cx, z: cz } = tileToWorld(prop.row, prop.col);
    const halfW = (prop.cols * TILE) / 2;
    const halfD = (prop.rows * TILE) / 2;
    boxes.push({
      minX: cx - halfW,
      maxX: cx + halfW,
      minZ: cz - halfD,
      maxZ: cz + halfD,
      height: prop.h,
      kind: 'prop',
    });
  }
  return boxes;
}

export const COLLIDERS = makeColliders();

// Spawn lists, in world coordinates, spread over the spawn tiles.
function spawnsFor(kind) {
  const out = [];
  for (let r = 0; r < GRID; r += 1) {
    for (let c = 0; c < GRID; c += 1) {
      if (tileAt(r, c) === kind) out.push(tileToWorld(r, c));
    }
  }
  return out;
}

export const ATTACKER_SPAWNS = spawnsFor('s');
export const DEFENDER_SPAWNS = spawnsFor('d');

export const SITE_WORLD = SITES.map((site) => ({ ...site, ...tileToWorld(site.row, site.col) }));

export function nearestOpenTile(x, z) {
  const { row, col } = worldToTile(x, z);
  if (isWalkable(row, col)) return { row, col };
  for (let radius = 1; radius < 6; radius += 1) {
    for (let dr = -radius; dr <= radius; dr += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        if (isWalkable(row + dr, col + dc)) return { row: row + dr, col: col + dc };
      }
    }
  }
  return { row, col };
}

// A segment/box test used for both bullets and bot vision: the segment is tested in the XZ plane
// and only boxes taller than the shot's height block it.
export function segmentBlocked(ax, az, bx, bz, height = 1.6) {
  const dx = bx - ax;
  const dz = bz - az;
  const steps = Math.max(2, Math.ceil(Math.hypot(dx, dz) / 0.35));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = ax + dx * t;
    const z = az + dz * t;
    for (const box of COLLIDERS) {
      if (box.height < height) continue;
      if (x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ) return true;
    }
  }
  return false;
}

// Circle against the box list, resolved on the axis of least penetration.
export function resolveCircle(x, z, radius) {
  let px = x;
  let pz = z;
  for (const box of COLLIDERS) {
    const closestX = Math.max(box.minX, Math.min(px, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
    const dx = px - closestX;
    const dz = pz - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    if (distSq > 1e-8) {
      const dist = Math.sqrt(distSq);
      px = closestX + (dx / dist) * radius;
      pz = closestZ + (dz / dist) * radius;
    } else {
      const toLeft = px - box.minX;
      const toRight = box.maxX - px;
      const toBack = pz - box.minZ;
      const toFront = box.maxZ - pz;
      const min = Math.min(toLeft, toRight, toBack, toFront);
      if (min === toLeft) px = box.minX - radius;
      else if (min === toRight) px = box.maxX + radius;
      else if (min === toBack) pz = box.minZ - radius;
      else pz = box.maxZ + radius;
    }
  }
  return { x: px, z: pz };
}

// Geometry: one merged mesh per material keeps the draw calls low and the look coherent.
export function buildWorld(scene) {
  const materials = buildMaterials();
  scene.background = materials.sky;
  scene.backgroundIntensity = 0.9;
  scene.fog = new THREE.Fog(0x2a2a2c, 42, 96);

  const hemi = new THREE.HemisphereLight(0xc3d4e0, 0x3a4046, 1.35);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x9db4c9, 0.85);
  fill.position.set(20, 16, -18);
  scene.add(fill);
  const key = new THREE.DirectionalLight(0xffe0b0, 2.3);
  key.position.set(-18, 26, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 80;
  scene.add(key);

  scene.environmentIntensity = 0.5;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID * TILE, GRID * TILE), materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Painted lane markings: they read as a yard without needing a texture.
  const paint = new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.9 });
  for (const col of [3, 11, 12, 20]) {
    const { x } = tileToWorld(0, col);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, GRID * TILE - 3), paint);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.01, 0);
    scene.add(line);
  }

  const groups = new Map();
  const addBox = (geometry, material, x, y, z) => {
    const key2 = material.uuid;
    if (!groups.has(key2)) groups.set(key2, { material, items: [] });
    groups.get(key2).items.push({ geometry, x, y, z });
  };

  for (const box of COLLIDERS) {
    const w = box.maxX - box.minX;
    const d = box.maxZ - box.minZ;
    const h = box.height;
    const mat = box.kind === CRATE ? materials.crate : materials.wall;
    addBox(new THREE.BoxGeometry(w, h, d), mat, (box.minX + box.maxX) / 2, h / 2, (box.minZ + box.maxZ) / 2);
  }

  // Props: containers with corrugated ribs, concrete pillars, jersey barriers, drums and pallets.
  const propMaterials = {
    containerStripe: new THREE.MeshStandardMaterial({ map: materials.crate.map, color: 0xb06a34, roughness: 0.7, metalness: 0.2 }),
    containerRib: new THREE.MeshStandardMaterial({ map: materials.wall.map, color: 0x59636b, roughness: 0.85, metalness: 0.25 }),
    concrete: new THREE.MeshStandardMaterial({ map: materials.wall.map, color: 0x8a8f92, roughness: 0.95 }),
    barrier: new THREE.MeshStandardMaterial({ map: materials.wall.map, color: 0x9a9d98, roughness: 0.9 }),
    barrierTop: new THREE.MeshStandardMaterial({ map: materials.wallTrim.map, color: 0xc8a24a, roughness: 0.8 }),
    drum: new THREE.MeshStandardMaterial({ map: materials.containerC.map, color: 0x7d8f6c, roughness: 0.65, metalness: 0.45 }),
    pallet: new THREE.MeshStandardMaterial({ map: materials.crate.map, color: 0x8a6b44, roughness: 0.95 }),
  };
  const props = new THREE.Group();
  for (const prop of PROPS) {
    const { x: cx, z: cz } = tileToWorld(prop.row, prop.col);
    const width = prop.cols * TILE;
    const depth = prop.rows * TILE;
    if (prop.kind === 'container') {
      const bodyMap = [materials.containerA, materials.containerB, materials.containerC];
      const bodyMaterial = bodyMap[(prop.row + prop.col) % bodyMap.length];
      const body = new THREE.Mesh(new THREE.BoxGeometry(width - 0.06, prop.h, depth - 0.06), bodyMaterial);
      body.position.set(cx, prop.h / 2, cz);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(width - 0.02, 0.16, depth - 0.02), propMaterials.containerStripe);
      stripe.position.set(cx, prop.h * 0.62, cz);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(width - 0.1, 0.09, depth - 0.1), propMaterials.containerRib);
      roof.position.set(cx, prop.h + 0.05, cz);
      props.add(body, stripe, roof);
    } else if (prop.kind === 'pillar') {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.05, prop.h, 1.05), propMaterials.concrete);
      shaft.position.set(cx, prop.h / 2, cz);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 1.3), propMaterials.concrete);
      cap.position.set(cx, prop.h - 0.1, cz);
      props.add(shaft, cap);
    } else if (prop.kind === 'barrier') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, prop.h * 0.7, depth * 0.92), propMaterials.barrier);
      body.position.set(cx, prop.h * 0.35, cz);
      const top = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 0.14, depth * 0.96), propMaterials.barrierTop);
      top.position.set(cx, prop.h * 0.78, cz);
      props.add(body, top);
    } else if (prop.kind === 'drum') {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, prop.h, 12), propMaterials.drum);
      drum.position.set(cx, prop.h / 2, cz);
      props.add(drum);
    } else {
      const stack = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, prop.h, depth * 0.9), propMaterials.pallet);
      stack.position.set(cx, prop.h / 2, cz);
      props.add(stack);
    }
  }
  // Box/cylinder UVs arrive as 0..1 per face; rescale them to world size so a container does not
  // stretch one texel across three metres.
  props.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const geo = child.geometry;
    const uv = geo.attributes.uv;
    if (!uv) return;
    const p = geo.parameters ?? {};
    const w = p.width ?? 1;
    const h = p.height ?? 1;
    const d = p.depth ?? 1;
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, uv.getX(i) * Math.max(w, d) / 1.9, uv.getY(i) * Math.max(h, d) / 1.9);
    }
    uv.needsUpdate = true;
  });
  scene.add(props);

  // Site markers: a lit plate on the floor, which is what a player sees first.
  for (const site of SITE_WORLD) {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(TILE * 1.7, 0.07, TILE * 1.7),
      site.name === 'A' ? materials.siteA : materials.siteB,
    );
    plate.position.set(site.x, 0.035, site.z);
    plate.receiveShadow = true;
    scene.add(plate);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(TILE * 0.92, TILE * 1.02, 32),
      new THREE.MeshBasicMaterial({
        color: site.name === 'A' ? COLORS.siteA : COLORS.siteB,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.075, site.z);
    scene.add(ring);
  }

  for (const { material, items } of groups.values()) {
    const merged = mergeBoxes(items);
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Work lamps: hot pools of light at the three chokepoints.
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.55, metalness: 0.6 });
  for (const [x, z, height] of [[0, -16, 6.4], [-14, 2, 5.6], [14, 2, 5.6], [0, 12, 5.0]]) {
    const lamp = new THREE.PointLight(0xffd9a0, 46, 28, 2);
    lamp.position.set(x, height - 0.5, z);
    scene.add(lamp);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, height, 8), steel);
    pole.position.set(x, height / 2, z);
    pole.castShadow = true;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.09, 0.09), steel);
    arm.position.set(x + 0.42, height - 0.1, z);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.26, 10, 1, true), steel);
    shade.position.set(x + 0.8, height - 0.3, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), materials.accent);
    bulb.position.set(x + 0.8, height - 0.42, z);
    scene.add(pole, arm, shade, bulb);
  }

  return { materials, colliders: COLLIDERS };
}

// Merge boxes into one geometry. UVs are rebuilt per face from the world size of that face, so a
// texture tiles at a constant real-world scale (1 unit = one tile) no matter how long a wall run is;
// without this the merged mesh would have no UVs at all and every map would sample one texel.
function mergeBoxes(items) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let offset = 0;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const item of items) {
    const geo = item.geometry;
    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal.array;
    const idx = geo.index ? geo.index.array : null;
    const w = item.geometry.parameters.width;
    const h = item.geometry.parameters.height;
    const d = item.geometry.parameters.depth;
    for (let i = 0; i < pos.length; i += 3) {
      v.set(pos[i] + item.x, pos[i + 1] + item.y, pos[i + 2] + item.z);
      n.set(nor[i], nor[i + 1], nor[i + 2]);
      positions.push(v.x, v.y, v.z);
      normals.push(n.x, n.y, n.z);
      // Project the vertex onto the two axes of the face it belongs to.
      if (Math.abs(n.y) > 0.5) uvs.push(v.x / 1.9, v.z / 1.9);
      else if (Math.abs(n.x) > 0.5) uvs.push(v.z / 1.9, v.y / 1.9);
      else uvs.push(v.x / 1.9, v.y / 1.9);
    }
    if (idx) {
      for (let i = 0; i < idx.length; i += 1) indices.push(idx[i] + offset);
    } else {
      for (let i = 0; i < pos.length / 3; i += 1) indices.push(i + offset);
    }
    offset += pos.length / 3;
    void w; void h; void d;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setIndex(indices);
  merged.computeBoundingSphere();
  return merged;
}
