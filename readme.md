# Abyssal Reckoning

A zero-dependency HTML5 Canvas and procedural Web Audio API acoustic stealth submarine game. Pilot a deep-sea vessel through pitch-black caverns by balancing three sensory tradeoffs: **Sonar Ping** (acoustic navigation that attracts sound-hunting predators), **Directional Lamp** (true visual clarity that drains finite battery and awakens light-sensitive threats), and **Silent Drift** (zero-noise coasting subject to ocean currents and inertial dead-reckoning drift).

- **Live Deployment:** `http://100.58.2.55:14980/final/`
- **Prototype (Part One):** `http://100.58.2.55:14980/partOne/`

---

## 1. Core Mechanics & Controls

### The Sensory Triangle

| Tool                 | Input                     | What It Gives You                                                                                                                       | What It Costs / Risk                                                                                    |
| :------------------- | :------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| **Sonar Ping**       | `SPACE` / `Left Click`    | Expanding acoustic wave that returns stereo-panned harmonic echoes, spikes the Hydrophone HUD ring, and leaves 3–5 brief phosphor dots. | Emits a loud noise spike (`650px` radius) that draws **Listeners** and **Hunters** to the ping origin.  |
| **Directional Lamp** | `F` / `Right Click`       | High-contrast illumination cone (`380px`) revealing rock gaps, lethal mine radii, battery salvage, and enemy silhouettes.               | Costs `6` battery on burst + `10/sec` held. Awakens **Lurker Moths** within line-of-sight (`400px`).    |
| **Silent Coasting**  | Release Thrust + Lamp Off | Drops acoustic noise to `0 dB`, preserves momentum, and repairs hull leaks after 3 seconds.                                             | Subject to thermal currents and accumulates **Inertial Dead-Reckoning Drift Error** until recalibrated. |

### Tactical Systems & Controls

- **Steering & Thrust:** `W/A/S/D` or `Arrow Keys` (or **Mouse Aim** + `W/S` throttle). Going above 50% throttle emits continuous thruster noise.
- **Tactical Decoy Buoy (`Q`):** Launches a transponder buoy along your heading that stops after `180px` and fires 3 automated sonar pings, luring sound-sensitive predators away from your route (2 per dive).
- **Phosphor Tether & Overcharge (`E`):** Your sub leaves a faint bioluminescent breadcrumb trail. Pressing `E` severs and consumes the trail to restore `+15%` Lamp Battery and drops a 5-second acoustic decoy pulse at the tail end (breaking **Apex Hunter** trail locks).
- **Emergency Hull Repair (`R` or Coast Still 3s):** Wall scrapes and enemy bites cause a noisy bilge-pump leak that continuously alerts nearby enemies until patched in silence.
- **Audio / Accessibility Controls:** `M` to Mute/Unmute, `P` or `ESC` to Pause/View Acoustic Legend, plus an on-screen **Audio-Visual Assist** toggle for laptop speakers.

### Harmonic Echo Signatures

- **Cyan (`#00f0ff`) — Stone Walls:** Low, dull 160Hz resonant thud.
- **Amber (`#ffaa00`) — Bio-Mines:** Sharp, dissonant 880Hz + 1240Hz metallic FM bell ring.
- **Crimson (`#ff2a55`) — Predators (Flesh):** Wet, hollow 220Hz organic warble with vibrato.
- **Green (`#00ff88`) — Exit Beacon & Batteries:** Warm harmonic chord / rising two-tone chime.

---

## 2. Project Architecture

```text
abyssal-reckoning/
├── src/
│   ├── index.html      # Game shell, CRT cockpit layout, briefings & HUD modals
│   ├── style.css       # CRT scanlines, oscilloscope styling, responsive layout
│   ├── audio.js        # 100% procedural Web Audio API synthesizer & spatial panner
│   ├── world.js        # Mulberry32 seeded PRNG, cave generator, 120-ray sonar engine
│   └── game.js         # Sub physics, enemy AI state machines, dead reckoning, game loop
├── build.sh            # Packages src/ at root of website.tar.gz & deploys to /final/
├── install.sh          # Competition submission installer (./install.sh folderName)
├── website.tar.gz      # Generated static archive (index.html at archive root)
└── README.md           # Documentation & operations scripts
```
