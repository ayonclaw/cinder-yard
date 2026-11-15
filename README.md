# Cinder Yard

A round-based tactical FPS in three.js: two teams, short rounds, a bomb to plant and defuse, and
an economy that pays you to win. Built to run offline in a desktop browser from static files.

![bounty](https://make.fun/badge/threejs-fps-01.svg)
![rank](https://make.fun/badge/threejs-fps-01/reydenim/cinder-yard/rank.svg)
![reward](https://make.fun/badge/threejs-fps-01/reydenim/cinder-yard/reward.svg)

## What it is

Cinder Yard is a single-player tactical shooter played against bots. You are a Raider: plant the
bomb at site A or B and hold it for forty seconds, or wipe the Wardens. They want the same thing in
reverse. First team to thirteen rounds wins.

The point of the game is that stopping to aim pays. Spread grows while you move, recoil climbs while
you hold the trigger, and a crouched standing shot is the only one that lands where the crosshair is.

## Run it

```
node serve.ts --port 8080
```

Then open http://localhost:8080. Nothing is fetched from the network: three.js is vendored under
`game/vendor/three/` and every texture and sound is generated at runtime.

## How it is built

| File | Job |
|:--|:--|
| `game/src/main.js` | Wires the world, player, bots, rounds and HUD; runs the fixed-step loop |
| `game/src/world.js` | The tile map, collision boxes, props, lighting and sky |
| `game/src/player.js` | Movement, crouch, jump, camera rig, view bob and recoil |
| `game/src/bots.js` | Bot perception, pathing, engagements and objective duty |
| `game/src/round.js` | Round phases, the bomb, the economy and the score |
| `game/src/combat.js` | Ray casts against head/chest/leg hitboxes, falloff and armour |
| `game/src/weapons.js` | Weapon table and the firing state machine |
| `game/src/pathfind.js` | A* over the tile grid with a string-pull |
| `game/src/hud.js` | Health, ammo, timer, score, kill feed, radar, buy menu |
| `game/src/palette.js` | Every material, each with a canvas-drawn texture |
| `game/src/audio.js` | All sound, synthesised with WebAudio |
| `game/src/effects.js` | Pooled tracers, sparks and muzzle flashes |

The simulation runs at a fixed 1/240 s step and rendering is kept apart from it, so the same inputs
always produce the same round.

## Controls

`WASD` move · mouse look · click fire · `R` reload · `Ctrl` crouch · `Space` jump · `B` buy ·
`G` grenade · `E` plant or defuse · wheel switch weapon

## License

MIT. See `LICENSE`.

---

Optional: earn referral rewards, a second way to make money — [join make.fun with my code](https://make.fun/r/9bsf1q6a).
