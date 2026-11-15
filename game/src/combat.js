// Hit resolution: ray against bot hitboxes (head sphere, chest and limb boxes) with a world
// occlusion test first, damage falloff over distance, armour and the damage multipliers in config.

import { HIT } from './config.js';
import { segmentBlocked } from './world.js';

const HEAD_RADIUS = 0.185;

export function raycastBots(origin, dir, maxDistance, bots, ignoreTeam = null) {
  let best = null;
  for (const bot of bots) {
    if (bot.dead || bot.team === ignoreTeam) continue;
    const hit = rayVsBody(origin, dir, bot, maxDistance);
    if (!hit) continue;
    if (segmentBlocked(origin.x, origin.z, hit.point.x, hit.point.z, origin.y)) continue;
    if (!best || hit.distance < best.distance) best = { ...hit, bot };
  }
  return best;
}

function rayVsBody(origin, dir, bot, maxDistance) {
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const bx = bot.position.x;
  const bz = bot.position.z;

  // Head: a sphere at eye height, tested first so a head and a chest overlap resolve to the head.
  const headY = bot.position.y + bot.eyeHeight - 0.09;
  const headHit = raySphere(ox, oy, oz, dir.x, dir.y, dir.z, bx, headY, bz, HEAD_RADIUS, maxDistance);
  const chestTop = bot.position.y + bot.eyeHeight - 0.22;
  const chestBottom = bot.position.y + 0.95;
  const chestHit = rayBox(ox, oy, oz, dir.x, dir.y, dir.z, bx - 0.27, chestBottom, bz - 0.21, bx + 0.27, chestTop, bz + 0.21, maxDistance);
  const legHit = rayBox(ox, oy, oz, dir.x, dir.y, dir.z, bx - 0.24, bot.position.y, bz - 0.19, bx + 0.24, bot.position.y + 0.95, bz + 0.19, maxDistance);

  const candidates = [];
  if (headHit) candidates.push({ distance: headHit, part: 'head' });
  if (chestHit) candidates.push({ distance: chestHit, part: 'chest' });
  if (legHit) candidates.push({ distance: legHit, part: 'legs' });
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.distance - b.distance);
  const chosen = candidates[0];
  return {
    distance: chosen.distance,
    part: chosen.part,
    point: {
      x: ox + dir.x * chosen.distance,
      y: oy + dir.y * chosen.distance,
      z: oz + dir.z * chosen.distance,
    },
  };
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius, maxDistance) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return null;
  const thc = Math.sqrt(r2 - d2);
  const t0 = tca - thc;
  const t1 = tca + thc;
  if (t1 < 0) return null;
  const t = t0 >= 0 ? t0 : t1;
  return t <= maxDistance ? t : null;
}

export function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, maxDistance) {
  let tmin = 0;
  let tmax = maxDistance;
  for (const [o, d, lo, hi] of [[ox, dx, minX, maxX], [oy, dy, minY, maxY], [oz, dz, minZ, maxZ]]) {
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const inv = 1 / d;
    let t0 = (lo - o) * inv;
    let t1 = (hi - o) * inv;
    if (t0 > t1) { const swap = t0; t0 = t1; t1 = swap; }
    tmin = Math.max(tmin, t0);
    tmax = Math.min(tmax, t1);
    if (tmin > tmax) return null;
  }
  return tmin;
}

// Damage: base * hitbox multiplier * distance falloff, then armour takes a share off the top
// (a plate carrier saves more against a rifle than against a shotgun slug).
export function damageFor(weapon, part, distance, hasArmor) {
  const hitMultiplier = HIT[part] ?? HIT.chest;
  let falloff = 1;
  if (distance > weapon.falloffStart) {
    const span = Math.max(0.001, weapon.falloffEnd - weapon.falloffStart);
    falloff = Math.max(0.35, 1 - (distance - weapon.falloffStart) / span);
  }
  let damage = weapon.damage * hitMultiplier * falloff;
  if (hasArmor) damage *= 1 - (1 - weapon.armorPen) * 0.5;
  return Math.max(1, Math.round(damage));
}
