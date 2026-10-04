# Matrix Bulletproof

A browser game inspired by *The Matrix*. You play NEO, seen from behind, while Agents in front of you open fire. Dodge their bullets, survive the timer and become The One.

**▶ Play it here: https://abzalomarov.github.io/matrix-bulletproof/**

It runs on PC and on phones.

## How to play

- There are **10 levels**, and each one is harder than the last. Agents get more numerous and fire faster bullets, in bursts, and from level 6 they strafe sideways. Later they also aim where you're heading.
- You have **3 lives per level**, and each bullet that hits NEO costs one. Lose all three and you retry the level.
- **Survive until the timer bar fills** to clear the level. Progress is saved in your browser.

| Action | PC | Mobile |
|---|---|---|
| Move | `W` `A` `S` `D` or arrow keys | Virtual joystick |
| **Dodge**: lean back in bullet time (2 per level) | `Space` or `Enter` | DODGE button |
| **Stop**: raise your palm, freeze every bullet and drop it to the ground (1 per level) | `P` | STOP button |
| Pause | `Esc` | ‖ button |
| Sound on/off | `M` | ♪ button |

## Features

- **Real 3D third-person view**, built with [Three.js](https://threejs.org/).
- **Two scenes:**
  - **Lobby:** a dark hall with green digital rain.
  - **Rooftop:** the skyscraper roof where Neo first dodges bullets, with a helipad, water tower and skyline.
- **Matrix moves:**
  - **Dodge:** the famous lean-back, in slow motion.
  - **Stop:** the open-palm move from the end of the film.
  - **Near-miss slow-mo:** time slows for a moment whenever a bullet barely misses.
- **Sound effects generated in code** with the Web Audio API, so there are no audio files:
  - **Gunshots:** booming, and pitched down in bullet time.
  - **Bullet whiz:** panned left or right as bullets fly past.
  - **Bullet-time sweeps** in and out of the dodge.
  - **Palm-stop shockwave**, followed by clinking shells on the floor.

## Run locally

The game uses ES modules, so it has to be served over HTTP; opening the file directly won't work.

```sh
python -m http.server 8000
# then open http://localhost:8000
```

To test a later level, open `index.html?level=10`. This unlocks every level up to the one you choose.

## Project structure

```
index.html        page, HUD and menus
css/style.css     Matrix-green UI
js/main.js        game loop, levels, moves, camera
js/characters.js  NEO and Agent models and animation
js/bullets.js     bullets: flight, hits, freeze and fall
js/scenes.js      Lobby and Rooftop environments
js/sfx.js         procedural sound effects
js/levels.js      difficulty table for the 10 levels
js/input.js       keyboard and virtual joystick
js/effects.js     digital rain and hit flash
js/ui.js          HUD and menu helpers
```

---

A fan project, not affiliated with Warner Bros. or *The Matrix*.
