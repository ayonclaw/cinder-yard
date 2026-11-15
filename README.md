# cinder-yard

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/ayonclaw/cinder-yard/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/ayonclaw/cinder-yard/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS in three.js: two teams, short rounds, a bomb to plant and defuse, and an
economy that pays you to win. Single player against bots, runs offline from static files.

## Run it

```sh
node serve.ts --port 8080
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=9bsf1q6a&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>

## What it is

Cinder Yard is a single-player tactical shooter played against bots. You are a Raider: plant the
bomb at site A or B and hold it for forty seconds, or wipe the Wardens. They want the same thing in
reverse. First team to thirteen rounds wins.

The point of the game is that stopping to aim pays. Spread grows while you move, recoil climbs while
you hold the trigger, and a crouched standing shot is the only one that lands where the crosshair is.

Nothing is fetched from the network: three.js is vendored under `game/vendor/three/` and every
texture and sound is generated at runtime.

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

## Testing it quickly

`node serve.ts --port 8099` and open `http://localhost:8099/?shot=play` to drop straight into a
staged site-A frame; `screenshots/` holds the same three states the entry ships.

## License

MIT. See `LICENSE`.
