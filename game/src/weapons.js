// Weapon definitions and the firing state machine. Nothing here touches the scene: a weapon
// returns the shots it fires and the combat module resolves them, which keeps ballistics testable.

export const WEAPONS = {
  hornet: {
    id: 'hornet',
    name: 'Hornet-9',
    kind: 'pistol',
    price: 0,
    damage: 26,
    pellets: 1,
    rpm: 400,
    magSize: 13,
    reserve: 52,
    reloadTime: 1.5,
    spreadStill: 0.006,
    spreadMove: 0.05,
    recoil: 0.014,
    recoilKick: 1.5,
    range: 60,
    falloffStart: 22,
    falloffEnd: 48,
    armorPen: 0.55,
    moveSpeed: 1.0,
    sound: { heavy: false },
    selectable: true,
  },
  vesper: {
    id: 'vesper',
    name: 'Vesper SMG',
    kind: 'smg',
    price: 1250,
    damage: 21,
    pellets: 1,
    rpm: 800,
    magSize: 30,
    reserve: 90,
    reloadTime: 2.1,
    spreadStill: 0.012,
    spreadMove: 0.055,
    recoil: 0.011,
    recoilKick: 1.1,
    range: 55,
    falloffStart: 16,
    falloffEnd: 40,
    armorPen: 0.6,
    moveSpeed: 0.98,
    sound: { heavy: false },
    selectable: true,
  },
  rhino: {
    id: 'rhino',
    name: 'Rhino-57',
    kind: 'rifle',
    price: 2700,
    damage: 34,
    pellets: 1,
    rpm: 600,
    magSize: 30,
    reserve: 90,
    reloadTime: 2.6,
    spreadStill: 0.004,
    spreadMove: 0.085,
    recoil: 0.019,
    recoilKick: 2.1,
    range: 80,
    falloffStart: 32,
    falloffEnd: 70,
    armorPen: 0.82,
    moveSpeed: 0.9,
    sound: { heavy: true },
    selectable: true,
  },
  breaker: {
    id: 'breaker',
    name: 'Breaker-12',
    kind: 'shotgun',
    price: 1100,
    damage: 11,
    pellets: 8,
    rpm: 78,
    magSize: 7,
    reserve: 28,
    reloadTime: 0.65,
    reloadPerShell: true,
    spreadStill: 0.055,
    spreadMove: 0.075,
    recoil: 0.05,
    recoilKick: 4.2,
    range: 28,
    falloffStart: 7,
    falloffEnd: 22,
    armorPen: 0.45,
    moveSpeed: 0.94,
    sound: { heavy: true },
    selectable: true,
  },
  talon: {
    id: 'talon',
    name: 'Talon',
    kind: 'knife',
    price: 0,
    damage: 55,
    pellets: 1,
    rpm: 120,
    magSize: Infinity,
    reserve: 0,
    reloadTime: 0,
    spreadStill: 0,
    spreadMove: 0,
    recoil: 0,
    recoilKick: 0.6,
    range: 1.9,
    falloffStart: 2,
    falloffEnd: 3,
    armorPen: 0.9,
    moveSpeed: 1.08,
    melee: true,
    sound: { heavy: false },
    selectable: false,
  },
};

export const GRENADE = {
  id: 'frag',
  name: 'Splinter',
  price: 300,
  fuse: 2.2,
  radius: 7.5,
  maxDamage: 95,
  carry: 1,
};

export const BUY_MENU = [
  { id: 'vesper', label: 'Vesper SMG', price: WEAPONS.vesper.price, category: 'Primary' },
  { id: 'breaker', label: 'Breaker-12', price: WEAPONS.breaker.price, category: 'Primary' },
  { id: 'rhino', label: 'Rhino-57', price: WEAPONS.rhino.price, category: 'Primary' },
  { id: 'armor', label: 'Plate carrier', price: 650, category: 'Gear' },
  { id: 'kit', label: 'Defuse kit', price: 400, category: 'Gear', defendersOnly: true },
  { id: 'frag', label: 'Splinter grenade', price: GRENADE.price, category: 'Gear', max: 1 },
];

// Spread and recoil both grow while the trigger is held and the body is moving, so a player who
// stops to aim really does hit more: that is the whole point of the gunplay criterion.
export class WeaponState {
  constructor(id) {
    this.def = WEAPONS[id];
    this.mag = this.def.magSize;
    this.reserve = this.def.reserve;
    this.reloadTimer = 0;
    this.cooldown = 0;
    this.bloom = 0;
  }

  get needsReload() { return this.mag <= 0; }
  get isReloading() { return this.reloadTimer > 0; }

  startReload() {
    if (this.isReloading) return false;
    if (this.def.melee) return false;
    if (this.mag >= this.def.magSize) return false;
    if (this.reserve <= 0) return false;
    this.reloadTimer = this.def.reloadTime;
    return true;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    this.bloom = Math.max(0, this.bloom - dt * 3.2);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        if (this.def.reloadPerShell) {
          this.mag = Math.min(this.def.magSize, this.mag + 1);
          this.reserve -= 1;
          if (this.mag < this.def.magSize && this.reserve > 0) this.reloadTimer = this.def.reloadTime;
        } else {
          const needed = this.def.magSize - this.mag;
          const take = Math.min(needed, this.reserve);
          this.mag += take;
          this.reserve -= take;
        }
        return 'reloaded';
      }
    }
    return null;
  }

  canFire() {
    return this.cooldown <= 0 && !this.isReloading && (this.def.melee || this.mag > 0);
  }

  fire({ moving, crouched, airborne }) {
    if (!this.canFire()) return null;
    if (!this.def.melee) this.mag -= 1;
    this.cooldown = 60 / this.def.rpm;
    const movementPenalty = moving ? this.def.spreadMove : this.def.spreadStill;
    const stance = crouched ? 0.72 : 1;
    const air = airborne ? 2.4 : 1;
    const spread = (movementPenalty * stance * air) + this.bloom * this.def.spreadStill;
    this.bloom = Math.min(1.6, this.bloom + 0.22);
    return { spread, pellets: this.def.pellets, bloomKick: this.def.recoilKick * (crouched ? 0.75 : 1) };
  }
}
