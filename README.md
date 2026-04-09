# Artemis II – Lunar Mission 3D Simulator

Interactive 3D simulation of NASA's Artemis II crewed lunar flyby mission (April 1–11, 2026), built with React, Three.js, and TypeScript.

## Features

- **Real mission data** — trajectory, timeline, and crew based on actual NASA Artemis II parameters
- **Bowtie/figure-8 trajectory** — LEO orbit → high Earth orbit → nearly-straight TLI coast → far-side lunar flyby → gravity slingshot return
- **Color-coded flight path** — green (outbound) / blue (return), matching NASA's official diagrams
- **Orion "Integrity" spacecraft model** — capsule, service module, solar arrays, engine nozzle, gold foil band
- **Earth with 23.44° axial tilt** and mission-synced rotation (10 rotations over 10 days)
- **Moon** orbiting Earth during the mission
- **Play / Pause / Step / Speed controls** — 0.25×–4× playback, step forward/backward ~1.2 hours
- **Progress slider** — scrub to any point in the 10-day mission
- **Camera focus targets** — smoothly orbit around Earth, Moon, or the spacecraft
- **Mouse interaction** — drag to rotate, scroll to zoom, right-drag to pan
- **Mission HUD** — real-time date (UTC), mission day, phase name, crew names

## Mission Data

| Parameter | Value |
|---|---|
| Launch | April 1, 2026 22:35:12 UTC, LC-39B |
| Spacecraft | Orion CM-003 "Integrity" + ESM-2 |
| Crew | Wiseman, Glover, Koch, Hansen |
| Lunar flyby | 4,067 mi (6,545 km) from far-side surface |
| Farthest from Earth | 252,756 mi (406,771 km) |
| Duration | ~10 days |
| Splashdown | Pacific Ocean near San Diego |

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Build

```bash
npm run build
npm run preview
```

## Tech Stack

- [Vite](https://vite.dev) + [TypeScript](https://www.typescriptlang.org)
- [React 18](https://react.dev) + [React Three Fiber](https://r3f.docs.pmnd.rs)
- [Three.js](https://threejs.org) + [@react-three/drei](https://github.com/pmndrs/drei)

## License

MIT
