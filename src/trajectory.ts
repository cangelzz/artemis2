/**
 * Artemis II trajectory — version-switchable.
 *
 * V1 (Original): Compressed Moon distance (40 R_E), spiral + Hermite curves
 * V2 (Real Physics): True Moon distance (60.34 R_E), parametric figure-8
 *
 * Both versions share crew, timeline, and other mission data.
 * Use getTrajectoryConfig(version) to get version-specific constants
 * and the appropriate buildTrajectory function.
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
/*  Version system                                                     */
/* ================================================================== */

export type TrajectoryVersion = 'v1' | 'v2';

export interface TrajectoryConfig {
  version: TrajectoryVersion;
  label: string;
  moonDistance: number;
  moonRadius: number;
  buildTrajectory: (moonAngle: number) => THREE.CatmullRomCurve3;
  buildProgressMapping: (curve: THREE.CatmullRomCurve3) => (p: number) => number;
  timeline: typeof TIMELINE_V2;
  phaseName: (t: number) => string;
}

/* ================================================================== */
/*  V1: Original trajectory (compressed Moon distance)                 */
/* ================================================================== */

const MOON_DISTANCE_V1 = 40;
const MOON_RADIUS_V1 = 0.273;

const TIMELINE_V1 = {
  launch:    0.0,
  leo:       0.004,
  heo:       0.03,
  tli:       0.10,
  coast1:    0.22,
  coast2:    0.42,
  approach:  0.52,
  flyby:     0.60,
  depart:    0.67,
  return1:   0.78,
  return2:   0.90,
  reentry:   0.95,
  splashdown: 1.0,
};

function phaseNameV1(t: number): string {
  if (t < TIMELINE_V1.leo)       return '🚀 Launch — LC-39B, Kennedy Space Center';
  if (t < TIMELINE_V1.heo)       return '🌍 Low Earth Orbit (1 orbit)';
  if (t < TIMELINE_V1.tli)       return '🌍 High Earth Orbit (44,000 mi apogee)';
  if (t < TIMELINE_V1.coast1)    return '🔥 Trans-Lunar Injection';
  if (t < TIMELINE_V1.approach)  return '🌌 Translunar Coast (outbound leg)';
  if (t < TIMELINE_V1.flyby)     return '🌙 Entering Moon\'s Sphere of Influence';
  if (t < TIMELINE_V1.depart)    return '🌑 Far Side Flyby — 6,545 km from surface';
  if (t < TIMELINE_V1.return1)   return '🌙 Departing Moon';
  if (t < TIMELINE_V1.reentry)   return '🌌 Free-Return Coast (return leg)';
  if (t < TIMELINE_V1.splashdown) return '🔥 Re-entry — 40,000 km/h';
  return '🏁 Splashdown — Pacific Ocean';
}

function buildTrajectoryV1(_moonAngle: number): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];

  const INCL = (28.5 * Math.PI) / 180;
  const leoR = EARTH_RADIUS + 0.08;
  const HEO_APOGEE = 4;
  const heoSemiMajor = (EARTH_RADIUS + 0.3 + HEO_APOGEE) / 2;
  const heoEcc = (HEO_APOGEE - EARTH_RADIUS - 0.3) / (HEO_APOGEE + EARTH_RADIUS + 0.3);
  const LOOP_R = 4;
  const OFFSET = 2;

  // Spiral: LEO → HEO
  const spiralN = 120;
  const totalAngle = 1.78 * 2 * Math.PI;
  for (let i = 0; i < spiralN; i++) {
    const frac = i / (spiralN - 1);
    const angle = frac * totalAngle;
    const blend = 1 / (1 + Math.exp(-(frac - 0.30) / 0.12));
    const heoLocal = (frac - 0.30) * totalAngle;
    const rHeo = heoSemiMajor * (1 - heoEcc * heoEcc) / (1 + heoEcc * Math.cos(heoLocal));
    const r = leoR + (rHeo - leoR) * blend;
    points.push(new THREE.Vector3(
      Math.cos(angle) * r,
      Math.sin(angle) * r * Math.sin(INCL),
      Math.sin(angle) * r * Math.cos(INCL),
    ));
  }

  // Outbound: Hermite curve
  const spiralEnd = points[points.length - 1].clone();
  const flybyEntry = new THREE.Vector3(
    MOON_DISTANCE_V1 + LOOP_R * Math.cos(Math.PI / 2), -0.05,
    LOOP_R * Math.sin(Math.PI / 2),
  );
  const endAngle = 1.78 * 2 * Math.PI;
  const spiralTangent = new THREE.Vector3(
    -Math.sin(endAngle), Math.sin(INCL) * Math.cos(endAngle),
    Math.cos(INCL) * Math.cos(endAngle),
  ).normalize();
  const arrivalTangent = new THREE.Vector3(1, 0, 0);
  const chordLen = spiralEnd.distanceTo(flybyEntry);

  const outN = 60;
  for (let i = 1; i < outN; i++) {
    const tLinear = i / outN;
    const t = tLinear * tLinear;
    const h00 = 2*t*t*t - 3*t*t + 1;
    const h10 = t*t*t - 2*t*t + t;
    const h01 = -2*t*t*t + 3*t*t;
    const h11 = t*t*t - t*t;
    const pt = spiralEnd.clone().multiplyScalar(h00)
      .add(spiralTangent.clone().multiplyScalar(h10 * chordLen * 0.4))
      .add(flybyEntry.clone().multiplyScalar(h01))
      .add(arrivalTangent.clone().multiplyScalar(h11 * chordLen * 2.0));
    pt.z -= OFFSET * Math.sin(Math.PI * t);
    points.push(pt);
  }

  // Flyby: semicircle
  const flybyN = 60;
  for (let i = 0; i < flybyN; i++) {
    const angle = (Math.PI / 2) - (i / (flybyN - 1)) * Math.PI;
    points.push(new THREE.Vector3(
      MOON_DISTANCE_V1 + LOOP_R * Math.cos(angle), -0.05,
      LOOP_R * Math.sin(angle),
    ));
  }

  // Return: Hermite curve
  const flybyExit = new THREE.Vector3(
    MOON_DISTANCE_V1 + LOOP_R * Math.cos(-Math.PI / 2), -0.05,
    LOOP_R * Math.sin(-Math.PI / 2),
  );
  const earthEnd = new THREE.Vector3(0, -0.3, 0);
  const departureTangent = new THREE.Vector3(-1, 0, 0);
  const earthArrivalTangent = new THREE.Vector3(-1, 0, 0);
  const retChord = flybyExit.distanceTo(earthEnd) * 0.8;

  const retN = 60;
  for (let i = 1; i <= retN; i++) {
    const t = i / retN;
    const h00 = 2*t*t*t - 3*t*t + 1;
    const h10 = t*t*t - 2*t*t + t;
    const h01 = -2*t*t*t + 3*t*t;
    const h11 = t*t*t - t*t;
    const pt = flybyExit.clone().multiplyScalar(h00)
      .add(departureTangent.clone().multiplyScalar(h10 * retChord))
      .add(earthEnd.clone().multiplyScalar(h01))
      .add(earthArrivalTangent.clone().multiplyScalar(h11 * retChord));
    pt.z += OFFSET * Math.sin(Math.PI * t);
    points.push(pt);
  }

  points.push(new THREE.Vector3(-0.2, -EARTH_RADIUS, -0.3));
  return new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
}

/* ================================================================== */
/*  V2: Real physics trajectory (true Moon distance)                   */
/* ================================================================== */

const MOON_DISTANCE_V2 = 60.34;
const MOON_RADIUS_V2 = 0.2727;

const R_E_KM = 6371;
const LEO_R = (R_E_KM + 185) / R_E_KM;
const FLYBY_PERI = 8282 / R_E_KM;
const INCL_V2 = (28.5 * Math.PI) / 180;

const TIMELINE_V2 = {
  launch:     0.0,
  leo:        0.003,
  tli:        0.01,
  coast1:     0.15,
  coast2:     0.40,
  approach:   0.52,
  flyby:      0.60,
  depart:     0.68,
  return1:    0.80,
  return2:    0.90,
  reentry:    0.96,
  splashdown: 1.0,
};

function phaseNameV2(t: number): string {
  if (t < TIMELINE_V2.leo)       return '🚀 Launch — LC-39B, Kennedy Space Center';
  if (t < TIMELINE_V2.tli)       return '🌍 Low Earth Orbit — 185 km parking orbit';
  if (t < TIMELINE_V2.coast1)    return '🔥 Trans-Lunar Injection burn';
  if (t < TIMELINE_V2.approach)  return '🌌 Translunar Coast (outbound leg)';
  if (t < TIMELINE_V2.flyby)     return '🌙 Entering Moon\'s Sphere of Influence';
  if (t < TIMELINE_V2.depart)    return '🌑 Far Side Flyby ��� 6,545 km from surface';
  if (t < TIMELINE_V2.return1)   return '🌙 Departing Moon';
  if (t < TIMELINE_V2.reentry)   return '🌌 Free-Return Coast (return leg)';
  if (t < TIMELINE_V2.splashdown) return '🔥 Re-entry — 40,000 km/h';
  return '🏁 Splashdown — Pacific Ocean';
}

function buildTrajectoryV2(_moonAngle: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  const D = MOON_DISTANCE_V2;
  const LOBE = 16;

  // LEO parking orbit
  const N_LEO = 40;
  for (let i = 0; i <= N_LEO; i++) {
    const ang = (i / N_LEO) * 2 * Math.PI;
    const x = LEO_R * Math.cos(ang);
    const ip = LEO_R * Math.sin(ang);
    pts.push(new THREE.Vector3(x, ip * Math.cos(INCL_V2), ip * Math.sin(INCL_V2)));
  }

  // Outbound upper lobe
  const xStop = D - FLYBY_PERI * 2;
  const N2 = 180;
  for (let i = 1; i <= N2; i++) {
    const f = i / N2;
    const x = f * xStop;
    const yLobe = LOBE * Math.sin(Math.PI * f * 0.92);
    const endBlend = Math.pow(f, 12);
    const y = yLobe * (1 - endBlend) + FLYBY_PERI * endBlend;
    const z = y * Math.sin(INCL_V2) * (1 - f) * 0.1;
    pts.push(new THREE.Vector3(x, y, z));
  }

  // Flyby semicircle
  const N3 = 60;
  for (let i = 0; i <= N3; i++) {
    const f = i / N3;
    const angle = Math.PI / 2 - Math.PI * f;
    const x = D + FLYBY_PERI * Math.cos(angle);
    const y = FLYBY_PERI * Math.sin(angle);
    pts.push(new THREE.Vector3(x, y, 0));
  }

  // Return lower lobe
  const N4 = 180;
  for (let i = 1; i <= N4; i++) {
    const f = i / N4;
    const x = xStop * (1 - f);
    const yLobe = -LOBE * Math.sin(Math.PI * f * 0.92);
    const startBlend = Math.pow(1 - f, 12);
    const y = yLobe * (1 - startBlend) + (-FLYBY_PERI) * startBlend;
    const z = y * Math.sin(INCL_V2) * f * 0.06;
    pts.push(new THREE.Vector3(x, y, z));
  }

  pts.push(new THREE.Vector3(-0.2, -EARTH_RADIUS * 0.98, -0.1));
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
}

/* ================================================================== */
/*  Version config factory                                             */
/* ================================================================== */

function identityMapping(_curve: THREE.CatmullRomCurve3): (p: number) => number {
  return (p: number) => Math.min(Math.max(p, 0), 1);
}

const CONFIG_V1: TrajectoryConfig = {
  version: 'v1',
  label: 'V1 — Original',
  moonDistance: MOON_DISTANCE_V1,
  moonRadius: MOON_RADIUS_V1,
  buildTrajectory: buildTrajectoryV1,
  buildProgressMapping: identityMapping,
  timeline: TIMELINE_V1 as typeof TIMELINE_V2,
  phaseName: phaseNameV1,
};

const CONFIG_V2: TrajectoryConfig = {
  version: 'v2',
  label: 'V2 — Real Physics',
  moonDistance: MOON_DISTANCE_V2,
  moonRadius: MOON_RADIUS_V2,
  buildTrajectory: buildTrajectoryV2,
  buildProgressMapping: identityMapping,
  timeline: TIMELINE_V2,
  phaseName: phaseNameV2,
};

export function getTrajectoryConfig(version: TrajectoryVersion): TrajectoryConfig {
  return version === 'v1' ? CONFIG_V1 : CONFIG_V2;
}

/* ================================================================== */
/*  Default exports for backward compatibility                         */
/* ================================================================== */

export const MOON_DISTANCE = MOON_DISTANCE_V2;
export const MOON_RADIUS = MOON_RADIUS_V2;
export const MISSION_TIMELINE = TIMELINE_V2;
export const buildTrajectory = buildTrajectoryV2;
export const buildProgressMapping = identityMapping;
