[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/binasalama12/makefun-threejs-fps-02-w8/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/binasalama12/makefun-threejs-fps-02-w8/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# Citadel Heights

A round-based tactical first-person shooter built on three.js, set in a stone
fortress on a hill. You lead the **Gilded Wardens** uphill against the **Ashen
Covenant**, who hold the main gate. Win a round by wiping out the defenders or by
planting the **gate-charge** inside the gold ring before the gate and guarding it
until it blows the doors open. The Ashen win by wiping out your squad, running
the clock down, or defusing the charge. First to 7 rounds, or the best of 12,
takes the citadel.

## How to play

Serve the `game/` folder with any static file server and open `index.html` in a
desktop browser, then click **Enter the citadel** to lock the mouse and play.

Every round opens with a 10-second buy phase. Earnings from kills, plants and
round wins buy better guns:

| Key | Weapon | Price | Character |
| --- | --- | --- | --- |
| 1 | Thornspike Sidearm | free | Steady starter pistol |
| 2 | Gatewasp Repeater | $950 | Fast, loose submachine gun |
| 3 | Rampart Scattergun | $1150 | Eight-pellet room clearer |
| 4 | Bulwark Carbine | $2400 | Accurate all-round rifle |
| 5 | Citadel Longshot | $3400 | One-shot bolt gun, right-click to scope |
| 6 | Mossfire Grenade | $300 | Area blast, thrown with G |

Accuracy is the game's core bargain: spread is tight when you stand still,
tighter when you crouch, and blooms hard while running, jumping or holding the
trigger down. Stop, settle, then shoot.

## Controls

- **W A S D** — move · **Mouse** — look · **Left click** — fire
- **R** — reload · **Ctrl / C** — crouch · **Space** — jump
- **1–5** — buy in the buy phase, equip afterwards · **6** — buy a grenade
- **G** — throw Mossfire grenade · **F (hold)** — plant the gate-charge
- **Right mouse** — scope with the Longshot

## The map

One original fortress courtyard in slate stone, faded gold and moss green: a
central bell plinth splitting two mid lanes, a west watchtower reached by stone
steps (its top is the best overwatch on the field — and an Ashen marksman starts
there), an east guard loft, crate clusters and low walls for cover, and the
gold-banded main gate at the north end where the charge must go down.

## Features

- Full round loop: buy phase, live round, planted-charge endgame, scoreboard,
  match end at 7 round wins or after 12 rounds
- Seven fighters a round: you plus three Warden bots against four Ashen bots
  with waypoint patrols, line-of-sight perception, hearing, burst fire, strafing,
  high-post holders and a defuse routine
- Five distinct weapons plus a grenade, headshot multipliers, damage falloff,
  tracers, recoil and a movement-priced spread model
- Complete HUD: health, funds, ammunition, round clock, team scores, alive
  counts, objective line, kill feed, plant progress and buy panel
- Sound is synthesised live with WebAudio — gunfire, reloads, planting beeps, the
  gate blast — with no audio files and no network requests
- Deterministic screenshot mode: open the game with `?shot=start|play|end&seed=N`
  to stage a still frame (menu/loadout, mid-round action, end-of-round board)

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` via `vendor/makefun-threejs.ts`
- `game/` — the playable game: static ES modules, three.js 0.187.0 vendored under
  `game/vendor/three/`, no build step
- `screenshots/` — renders of the game taken from its own screenshot mode
