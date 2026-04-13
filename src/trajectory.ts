/**
 * Artemis II trajectory versions.
 *
 * V1: Original (main branch, spiral + Hermite, compressed Moon distance)
 * V2: Parametric arcs (eye/lens shape — NOT a true figure-8)
 * V3: CR3BP numerical integration — true free-return figure-8
 *
 * V3 uses simplified Circular Restricted 3-Body Problem integration
 * in the synodic (co-rotating) frame to produce a physically accurate
 * free-return trajectory that forms a TRUE figure-8 with:
 *   - A large loop around Earth
 *   - A small loop around Moon
 *   - A crossing point between them
 *
 * SCALE: 1 unit = 1 Earth radius = 6,371 km
 */

import * as THREE from 'three';

/* ================================================================== */
/*  Shared constants                                                   */
/* ================================================================== */

export const EARTH_RADIUS = 1;
export const SUN_DIR = new THREE.Vector3(1, 0.3, 0.5).normalize();
export const MISSION_DURATION = 60;
export const MOON_ORBIT_PERIOD = 160;

export const CREW = [
  { name: 'Reid Wiseman', role: 'Commander', agency: 'NASA' },
  { name: 'Victor Glover', role: 'Pilot', agency: 'NASA' },
  { name: 'Christina Koch', role: 'Mission Specialist 1', agency: 'NASA' },
  { name: 'Jeremy Hansen', role: 'Mission Specialist 2', agency: 'CSA' },
];

export const LAUNCH_DATE = new Date('2026-04-01T22:35:12Z');

/* ================================================================== */
/*  Version types                                                      */
/* ================================================================== */

export type TrajectoryVersion = 'v1' | 'v2' | 'v3';

export interface TrajectoryConfig {
  version: TrajectoryVersion;
  label: string;
  moonDistance: number;
  moonRadius: number;
  buildTrajectory: (moonAngle: number) => THREE.CatmullRomCurve3;
  buildProgressMapping: (curve: THREE.CatmullRomCurve3) => (p: number) => number;
  timeline: Record<string, number>;
  phaseName: (t: number) => string;
}

function identityMapping(_curve: THREE.CatmullRomCurve3): (p: number) => number {
  return (p: number) => Math.min(Math.max(p, 0), 1);
}

/* ================================================================== */
/*  V1: Original (compressed, spiral + Hermite)                        */
/* ================================================================== */

const MOON_DISTANCE_V1 = 40;
const MOON_RADIUS_V1 = 0.273;

const TIMELINE_V1: Record<string, number> = {
  launch: 0, leo: 0.004, heo: 0.03, tli: 0.10,
  coast1: 0.22, coast2: 0.42, approach: 0.52, flyby: 0.60,
  depart: 0.67, return1: 0.78, return2: 0.90, reentry: 0.95, splashdown: 1.0,
};

function phaseNameV1(t: number): string {
  if (t < 0.004) return '🚀 Launch — LC-39B';
  if (t < 0.03) return '🌍 Low Earth Orbit';
  if (t < 0.10) return '🌍 High Earth Orbit';
  if (t < 0.22) return '🔥 Trans-Lunar Injection';
  if (t < 0.52) return '🌌 Translunar Coast';
  if (t < 0.60) return '🌙 Approaching Moon';
  if (t < 0.67) return '🌑 Far Side Flyby';
  if (t < 0.78) return '🌙 Departing Moon';
  if (t < 0.95) return '🌌 Free-Return Coast';
  if (t < 1.0)  return '🔥 Re-entry';
  return '🏁 Splashdown';
}

function buildTrajectoryV1(_moonAngle: number): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  const INCL = (28.5 * Math.PI) / 180;
  const leoR = EARTH_RADIUS + 0.08;
  const HEO_APOGEE = 4;
  const heoSMA = (EARTH_RADIUS + 0.3 + HEO_APOGEE) / 2;
  const heoEcc = (HEO_APOGEE - EARTH_RADIUS - 0.3) / (HEO_APOGEE + EARTH_RADIUS + 0.3);
  const LOOP_R = 4, OFFSET = 2;

  // Spiral
  for (let i = 0; i < 120; i++) {
    const f = i / 119;
    const a = f * 1.78 * 2 * Math.PI;
    const b = 1 / (1 + Math.exp(-(f - 0.30) / 0.12));
    const hL = (f - 0.30) * 1.78 * 2 * Math.PI;
    const rH = heoSMA * (1 - heoEcc ** 2) / (1 + heoEcc * Math.cos(hL));
    const r = leoR + (rH - leoR) * b;
    points.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * Math.sin(INCL), Math.sin(a) * r * Math.cos(INCL)));
  }

  // Outbound Hermite
  const sEnd = points[points.length - 1].clone();
  const fEntry = new THREE.Vector3(MOON_DISTANCE_V1 + LOOP_R * Math.cos(Math.PI / 2), -0.05, LOOP_R * Math.sin(Math.PI / 2));
  const eA = 1.78 * 2 * Math.PI;
  const sT = new THREE.Vector3(-Math.sin(eA), Math.sin(INCL) * Math.cos(eA), Math.cos(INCL) * Math.cos(eA)).normalize();
  const aT = new THREE.Vector3(1, 0, 0);
  const cL = sEnd.distanceTo(fEntry);
  for (let i = 1; i < 60; i++) {
    const tL = i / 60; const t = tL * tL;
    const h00 = 2*t**3 - 3*t**2 + 1, h10 = t**3 - 2*t**2 + t;
    const h01 = -2*t**3 + 3*t**2, h11 = t**3 - t**2;
    const pt = sEnd.clone().multiplyScalar(h00).add(sT.clone().multiplyScalar(h10 * cL * 0.4))
      .add(fEntry.clone().multiplyScalar(h01)).add(aT.clone().multiplyScalar(h11 * cL * 2.0));
    pt.z -= OFFSET * Math.sin(Math.PI * t);
    points.push(pt);
  }

  // Flyby
  for (let i = 0; i < 60; i++) {
    const a = Math.PI / 2 - (i / 59) * Math.PI;
    points.push(new THREE.Vector3(MOON_DISTANCE_V1 + LOOP_R * Math.cos(a), -0.05, LOOP_R * Math.sin(a)));
  }

  // Return Hermite
  const fExit = new THREE.Vector3(MOON_DISTANCE_V1 + LOOP_R * Math.cos(-Math.PI / 2), -0.05, LOOP_R * Math.sin(-Math.PI / 2));
  const eEnd = new THREE.Vector3(0, -0.3, 0);
  const dT = new THREE.Vector3(-1, 0, 0);
  const rC = fExit.distanceTo(eEnd) * 0.8;
  for (let i = 1; i <= 60; i++) {
    const t = i / 60;
    const h00 = 2*t**3 - 3*t**2 + 1, h10 = t**3 - 2*t**2 + t;
    const h01 = -2*t**3 + 3*t**2, h11 = t**3 - t**2;
    const pt = fExit.clone().multiplyScalar(h00).add(dT.clone().multiplyScalar(h10 * rC))
      .add(eEnd.clone().multiplyScalar(h01)).add(dT.clone().multiplyScalar(h11 * rC));
    pt.z += OFFSET * Math.sin(Math.PI * t);
    points.push(pt);
  }

  points.push(new THREE.Vector3(-0.2, -EARTH_RADIUS, -0.3));
  return new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
}

/* ================================================================== */
/*  V2: Parametric arcs (eye/lens shape)                               */
/* ================================================================== */

const MOON_DISTANCE_V2 = 60.34;
const MOON_RADIUS_V2 = 0.2727;
const FLYBY_PERI_V2 = 8282 / 6371;
const INCL_V2 = (28.5 * Math.PI) / 180;
const LEO_R_V2 = (6371 + 185) / 6371;

const TIMELINE_V2: Record<string, number> = {
  launch: 0, leo: 0.003, tli: 0.01, coast1: 0.15, coast2: 0.40,
  approach: 0.52, flyby: 0.60, depart: 0.68, return1: 0.80,
  return2: 0.90, reentry: 0.96, splashdown: 1.0,
};

function phaseNameV2(t: number): string {
  if (t < 0.003) return '🚀 Launch — LC-39B';
  if (t < 0.01) return '🌍 LEO — 185 km';
  if (t < 0.15) return '🔥 Trans-Lunar Injection';
  if (t < 0.52) return '🌌 Translunar Coast';
  if (t < 0.60) return '🌙 Approaching Moon';
  if (t < 0.68) return '🌑 Far Side Flyby — 6,545 km';
  if (t < 0.80) return '🌙 Departing Moon';
  if (t < 0.96) return '🌌 Free-Return Coast';
  if (t < 1.0)  return '🔥 Re-entry — 40,000 km/h';
  return '🏁 Splashdown';
}

function buildTrajectoryV2(_moonAngle: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  const D = MOON_DISTANCE_V2;
  const LOBE = 16;

  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * 2 * Math.PI;
    const x = LEO_R_V2 * Math.cos(a);
    const ip = LEO_R_V2 * Math.sin(a);
    pts.push(new THREE.Vector3(x, ip * Math.cos(INCL_V2), ip * Math.sin(INCL_V2)));
  }

  const xStop = D - FLYBY_PERI_V2 * 2;
  for (let i = 1; i <= 180; i++) {
    const f = i / 180;
    const x = f * xStop;
    const yL = LOBE * Math.sin(Math.PI * f * 0.92);
    const eB = Math.pow(f, 12);
    const y = yL * (1 - eB) + FLYBY_PERI_V2 * eB;
    pts.push(new THREE.Vector3(x, y, y * Math.sin(INCL_V2) * (1 - f) * 0.1));
  }

  for (let i = 0; i <= 60; i++) {
    const f = i / 60;
    const a = Math.PI / 2 - Math.PI * f;
    pts.push(new THREE.Vector3(D + FLYBY_PERI_V2 * Math.cos(a), FLYBY_PERI_V2 * Math.sin(a), 0));
  }

  for (let i = 1; i <= 180; i++) {
    const f = i / 180;
    const x = xStop * (1 - f);
    const yL = -LOBE * Math.sin(Math.PI * f * 0.92);
    const sB = Math.pow(1 - f, 12);
    const y = yL * (1 - sB) + (-FLYBY_PERI_V2) * sB;
    pts.push(new THREE.Vector3(x, y, y * Math.sin(INCL_V2) * f * 0.06));
  }

  pts.push(new THREE.Vector3(-0.2, -EARTH_RADIUS * 0.98, -0.1));
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
}

/* ================================================================== */
/*  V3: CR3BP free-return — TRUE figure-8                              */
/*                                                                     */
/*  In the synodic frame, a free-return trajectory forms two loops:     */
/*    - A large loop around Earth (the spacecraft departs, swings      */
/*      out, and approaches the Moon)                                  */
/*    - A small loop around the Moon (the flyby)                       */
/*    - The two loops CROSS near the Moon, creating the "8" shape      */
/*                                                                     */
/*  We use simplified CR3BP equations of motion integrated             */
/*  numerically (RK4) in the co-rotating frame.                        */
/*                                                                     */
/*  The key physics:                                                   */
/*    - Earth at origin, Moon at (D, 0)                                */
/*    - Gravitational pull from both bodies                            */
/*    - Coriolis and centrifugal forces in rotating frame               */
/*    - Initial conditions tuned for free-return                       */
/*                                                                     */
/*  Physical parameters:                                               */
/*    - Earth-Moon distance: 384,400 km = 60.34 R_E                   */
/*    - Mass ratio mu = M_moon / (M_earth + M_moon) ≈ 0.01215         */
/*    - Flyby periapsis: ~8,282 km from Moon center                   */
/* ================================================================== */

const MOON_DISTANCE_V3 = 60.34;
const MOON_RADIUS_V3 = 0.2727;

// CR3BP mass ratio
const MU = 0.012150585; // M_moon / (M_earth + M_moon)

// Nondimensional: Earth at (-mu, 0), Moon at (1-mu, 0)
// But for our scene: Earth at (0,0), Moon at (D,0)
// We'll compute in nondimensional coords then scale to scene units.

const TIMELINE_V3: Record<string, number> = {
  launch: 0, leo: 0.003, tli: 0.01, coast1: 0.10, coast2: 0.35,
  approach: 0.45, flyby: 0.55, depart: 0.65, return1: 0.75,
  return2: 0.88, reentry: 0.96, splashdown: 1.0,
};

function phaseNameV3(t: number): string {
  if (t < 0.003) return '🚀 Launch — LC-39B';
  if (t < 0.01) return '🌍 LEO — 185 km';
  if (t < 0.10) return '🔥 Trans-Lunar Injection';
  if (t < 0.45) return '🌌 Translunar Coast';
  if (t < 0.55) return '🌙 Lunar Encounter';
  if (t < 0.65) return '🌑 Far Side Flyby';
  if (t < 0.75) return '🌙 Departing Moon';
  if (t < 0.96) return '🌌 Free-Return Coast';
  if (t < 1.0)  return '🔥 Re-entry';
  return '🏁 Splashdown';
}

/**
 * CR3BP equations of motion in the co-rotating frame.
 * Nondimensional: distance unit = Earth-Moon distance, time unit = 1/omega.
 * Earth at (-mu, 0), Moon at (1-mu, 0).
 *
 * State: [x, y, vx, vy]
 * Returns: [dx, dy, dvx, dvy]
 */
function cr3bpDerivs(state: number[]): number[] {
  const [x, y, vx, vy] = state;

  // Distances to primaries
  const r1 = Math.sqrt((x + MU) ** 2 + y ** 2);       // dist to Earth
  const r2 = Math.sqrt((x - 1 + MU) ** 2 + y ** 2);   // dist to Moon

  // Accelerations (CR3BP in rotating frame)
  const ax = 2 * vy + x
    - (1 - MU) * (x + MU) / (r1 ** 3)
    - MU * (x - 1 + MU) / (r2 ** 3);
  const ay = -2 * vx + y
    - (1 - MU) * y / (r1 ** 3)
    - MU * y / (r2 ** 3);

  return [vx, vy, ax, ay];
}

/** RK4 integration step */
function rk4Step(state: number[], dt: number): number[] {
  const k1 = cr3bpDerivs(state);
  const s2 = state.map((s, i) => s + dt / 2 * k1[i]);
  const k2 = cr3bpDerivs(s2);
  const s3 = state.map((s, i) => s + dt / 2 * k2[i]);
  const k3 = cr3bpDerivs(s3);
  const s4 = state.map((s, i) => s + dt * k3[i]);
  const k4 = cr3bpDerivs(s4);
  return state.map((s, i) => s + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

function buildTrajectoryV3(_moonAngle: number): THREE.CatmullRomCurve3 {
  const leoR_nd = (6371 + 185) / 384400;
  const earthX = -MU;

  // Start at top of LEO orbit (above Earth in +Y)
  const x0 = earthX;
  const y0 = leoR_nd;

  // TLI velocity: prograde (+X at top of orbit)
  // v=1.40952 * vCirc gives a free-return with ~7,910 km flyby distance
  // (close to real Artemis II value of 8,282 km)
  const vCirc = Math.sqrt((1 - MU) / leoR_nd);
  const vx0 = vCirc * 1.40952;
  const vy0 = 0;

  // Integrate with RK4
  let state = [x0, y0, vx0, vy0];
  const dt = 0.00002;
  const ndPoints: [number, number][] = [[x0, y0]];

  for (let step = 0; step < 500000; step++) {
    state = rk4Step(state, dt);
    ndPoints.push([state[0], state[1]]);

    const distEarth = Math.sqrt((state[0] - earthX) ** 2 + state[1] ** 2);
    if (step > 20000 && distEarth < leoR_nd * 5) break;
    if (distEarth > 5) break;
  }

  // Convert to scene coords: Earth at (0,0), Moon at (D,0)
  const D = MOON_DISTANCE_V3;
  const pts: THREE.Vector3[] = [];
  const stride = Math.max(1, Math.floor(ndPoints.length / 600));
  for (let i = 0; i < ndPoints.length; i += stride) {
    const [nx, ny] = ndPoints[i];
    pts.push(new THREE.Vector3((nx + MU) * D, ny * D, 0));
  }
  // Ensure last point
  const [lx, ly] = ndPoints[ndPoints.length - 1];
  pts.push(new THREE.Vector3((lx + MU) * D, ly * D, 0));

  return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
}

/* ================================================================== */
/*  Config factory                                                     */
/* ================================================================== */

const CONFIG_V1: TrajectoryConfig = {
  version: 'v1', label: 'V1 — Original',
  moonDistance: MOON_DISTANCE_V1, moonRadius: MOON_RADIUS_V1,
  buildTrajectory: buildTrajectoryV1, buildProgressMapping: identityMapping,
  timeline: TIMELINE_V1, phaseName: phaseNameV1,
};

const CONFIG_V2: TrajectoryConfig = {
  version: 'v2', label: 'V2 — Parametric Arcs',
  moonDistance: MOON_DISTANCE_V2, moonRadius: MOON_RADIUS_V2,
  buildTrajectory: buildTrajectoryV2, buildProgressMapping: identityMapping,
  timeline: TIMELINE_V2, phaseName: phaseNameV2,
};

const CONFIG_V3: TrajectoryConfig = {
  version: 'v3', label: 'V3 — CR3BP Free-Return',
  moonDistance: MOON_DISTANCE_V3, moonRadius: MOON_RADIUS_V3,
  buildTrajectory: buildTrajectoryV3, buildProgressMapping: identityMapping,
  timeline: TIMELINE_V3, phaseName: phaseNameV3,
};

export function getTrajectoryConfig(version: TrajectoryVersion): TrajectoryConfig {
  switch (version) {
    case 'v1': return CONFIG_V1;
    case 'v2': return CONFIG_V2;
    case 'v3': return CONFIG_V3;
  }
}

/* ================================================================== */
/*  Default exports (backward compat)                                  */
/* ================================================================== */

export const MOON_DISTANCE = MOON_DISTANCE_V3;
export const MOON_RADIUS = MOON_RADIUS_V3;
export const MISSION_TIMELINE = TIMELINE_V3;
export const buildTrajectory = buildTrajectoryV3;
export const buildProgressMapping = identityMapping;
