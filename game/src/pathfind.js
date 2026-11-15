// Grid pathfinding for the bots: A* over the tile map, then a string-pull so the walk follows
// corners instead of tile centres. Cheap enough to run for four bots once a second.

import { GRID, isWalkable, tileToWorld, worldToTile, segmentBlocked } from './world.js';

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
];

function keyOf(row, col) {
  return row * GRID + col;
}

export function findPath(from, to) {
  const start = worldToTile(from.x, from.z);
  const goal = worldToTile(to.x, to.z);
  if (!isWalkable(start.row, start.col) || !isWalkable(goal.row, goal.col)) return [];

  const open = [start.row * GRID + start.col];
  const came = new Map();
  const gScore = new Map([[keyOf(start.row, start.col), 0]]);
  const fScore = new Map([[keyOf(start.row, start.col), Math.hypot(start.row - goal.row, start.col - goal.col)]]);

  while (open.length) {
    let bestIndex = 0;
    let best = Infinity;
    for (let i = 0; i < open.length; i += 1) {
      const f = fScore.get(open[i]) ?? Infinity;
      if (f < best) { best = f; bestIndex = i; }
    }
    const current = open.splice(bestIndex, 1)[0];
    const row = Math.floor(current / GRID);
    const col = current % GRID;
    if (row === goal.row && col === goal.col) return reconstruct(came, current, from);

    for (const [dr, dc, cost] of DIRS) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || r >= GRID || c >= GRID) continue;
      if (!isWalkable(r, c)) continue;
      if (dr !== 0 && dc !== 0 && (!isWalkable(row + dr, col) || !isWalkable(row, col + dc))) continue;
      const k = keyOf(r, c);
      const tentative = (gScore.get(current) ?? Infinity) + cost;
      if (tentative >= (gScore.get(k) ?? Infinity)) continue;
      came.set(k, current);
      gScore.set(k, tentative);
      fScore.set(k, tentative + Math.hypot(r - goal.row, c - goal.col));
      if (!open.includes(k)) open.push(k);
    }
  }
  return [];
}

function reconstruct(came, current, from) {
  const tiles = [];
  let node = current;
  while (node !== undefined) {
    tiles.push({ row: Math.floor(node / GRID), col: node % GRID });
    node = came.get(node);
  }
  tiles.reverse();
  const points = tiles.map(({ row, col }) => tileToWorld(row, col));
  return smooth(from, points);
}

// String-pull: drop every point the previous one can already see past.
function smooth(from, points) {
  if (points.length <= 2) return points;
  const out = [];
  let anchor = { x: from.x, z: from.z };
  let index = 0;
  while (index < points.length) {
    let furthest = index;
    for (let j = index + 1; j < points.length; j += 1) {
      if (segmentBlocked(anchor.x, anchor.z, points[j].x, points[j].z, 1.1)) break;
      furthest = j;
    }
    out.push(points[furthest]);
    anchor = points[furthest];
    index = furthest + 1;
  }
  return out;
}

// Random walkable tile near a target, used for patrol routes and flanking.
export function randomNearbyTile(target, radius, random = Math.random) {
  const base = worldToTile(target.x, target.z);
  for (let tries = 0; tries < 40; tries += 1) {
    const dr = Math.round((random() * 2 - 1) * radius);
    const dc = Math.round((random() * 2 - 1) * radius);
    if (isWalkable(base.row + dr, base.col + dc)) return tileToWorld(base.row + dr, base.col + dc);
  }
  return tileToWorld(base.row, base.col);
}
