/**
 * Artemis II trajectory data — based on real NASA mission parameters.
 *
 * REAL MISSION DATA (launched April 1, 2026):
 *   - Launch: April 1, 2026 22:35:12 UTC from Kennedy LC-39B
 *   - Mission duration: ~10 days
 *   - Day 1: LEO → High Earth Orbit (apogee 44,000 mi / 71,000 km)
 *   - Day 2: Trans-Lunar Injection (5 min 49 sec burn)
 *   - Day 6: Lunar flyby — closest approach 4,067 mi (6,545 km) from
 *            far-side surface at 23:00 UTC April 6
 *   - Farthest from Earth: 252,756 mi (406,771 km) — broke Apollo 13 record
 *   - Day 7–10: Free-return coast back to Earth
 *   - Splashdown: ~April 11, Pacific Ocean near San Diego
 *
 * Scene scale: 1 unit ≈ 6,371 km (1 Earth-radius).
 * Moon distance compressed to 40 units (real ≈ 60.3) for visual clarity.
 *
 * Closest flyby in real units:
 *   Surface distance: 6,545 km ≈ 1.03 Earth-radii
 *   From Moon center: 6,545 + 1,737 = 8,282 km ≈ 1.30 Earth-radii
 *   In scene scale (×40/60.3): ≈ 0.86 units from Moon center
 */

import * as THREE from 'three';

/** Distance from Earth center to Moon center (scene units) */
export const MOON_DISTANCE = 40;

/** Earth radius (scene units) */
export const EARTH_RADIUS = 1;

/** Moon radius (scene units) — real ratio ≈ 0.273 */
export const MOON_RADIUS = 0.273;

/** Closest flyby distance from Moon center (scene units) — real: 8,282 km */
const FLYBY_RADIUS = 0.86;

/**
 * High Earth orbit apogee (scene units).
 * Real: 71,000 km ≈ 11.1 Earth-radii ≈ 7.4 units.
 * Visually scaled to ~4 units for clarity (matches NASA animation proportions).
 */
const HEO_APOGEE = 4;

/** Sun direction (unit vector, only for lighting) */
export const SUN_DIR = new THREE.Vector3(1, 0.3, 0.5).normalize();

/* ------------------------------------------------------------------ */
/*  Mission timeline (fraction of 10-day mission)                      */
/* ------------------------------------------------------------------ */
export const MISSION_TIMELINE = {
  launch:    0.0,       // Day 0 — T+0
  leo:       0.004,     // Day 0 — LEO orbit
  heo:       0.03,      // Day 0 — High Earth Orbit
  tli:       0.10,      // Day 1 — Trans-Lunar Injection burn
  coast1:    0.22,      // Day 2-3 — outbound coast
  coast2:    0.42,      // Day 4-5 — approaching Moon
  approach:  0.52,      // Day 5-6 — entering Moon's SOI
  flyby:     0.60,      // Day 6 23:00 UTC — closest approach (far side)
  depart:    0.67,      // Day 6-7 — departing Moon
  return1:   0.78,      // Day 7-8 — return coast (figure-8 crossover)
  return2:   0.90,      // Day 9 — approaching Earth
  reentry:   0.95,      // Day 10 — atmospheric entry at 25,000 mph
  splashdown: 1.0,      // Day 10 — Pacific Ocean near San Diego
};

/* ------------------------------------------------------------------ */
/*  Trajectory generation                                              */
/* ------------------------------------------------------------------ */

/**
 * Build a CatmullRom spline representing the Artemis II free-return
 * trajectory based on real NASA mission data.
 *
 * The spacecraft:
 * 1. Launches to LEO
 * 2. Burns to ~44,000 mi high Earth orbit (23.5 hr period)
 * 3. TLI burn sends it toward the Moon
 * 4. Coasts for ~4 days
 * 5. Swings around the Moon's FAR SIDE at 4,067 mi (6,545 km)
 * 6. Free-returns to Earth without additional propulsion
 *
 * @param moonAngle  The Moon's orbital angle (radians) at mission start.
 */
export function buildTrajectory(_moonAngle: number): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];

  const INCL = (28.5 * Math.PI) / 180;
  const e1 = new THREE.Vector3(1, 0, 0);
  const e2 = new THREE.Vector3(0, Math.sin(INCL), Math.cos(INCL));

  const leoR = EARTH_RADIUS + 0.08;
  const heoSemiMajor = (EARTH_RADIUS + 0.3 + HEO_APOGEE) / 2;
  const heoEcc = (HEO_APOGEE - EARTH_RADIUS - 0.3) / (HEO_APOGEE + EARTH_RADIUS + 0.3);
  const LOOP_R = 4;
  const OFFSET = 2;

  // ── Spiral: LEO → HEO, 1.78 revolutions, 120 points ──
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

  // ── Outbound: spiral end → flyby entry ──
  // Use cubic Hermite interpolation so the outbound STARTS along
  // the spiral's tangent direction (pure +X at angle=3.5π) and
  // smoothly bends toward the flyby entry. No visible kink.
  const spiralEnd = points[points.length - 1].clone();
  const flybyEntry = new THREE.Vector3(
    MOON_DISTANCE + LOOP_R * Math.cos(Math.PI / 2),
    -0.05,
    LOOP_R * Math.sin(Math.PI / 2),   // +Z side (right)
  );

  // Spiral tangent at end (angle = 1.78*2π)
  const endAngle = 1.78 * 2 * Math.PI;
  const spiralTangent = new THREE.Vector3(
    -Math.sin(endAngle),
    Math.sin(INCL) * Math.cos(endAngle),
    Math.cos(INCL) * Math.cos(endAngle),
  ).normalize();

  // Arrival tangent: direction pointing into the flyby entry
  // Flyby circle at θ=π/2 has tangent = +X, so approach should be +X
  const arrivalTangent = new THREE.Vector3(1, 0, 0);

  // Chord length for tangent scaling
  const chordLen = spiralEnd.distanceTo(flybyEntry);
  const outChord = chordLen * 0.6;   // departure chord (spiral end)
  const arrChord = chordLen * 2.0;   // arrival chord (flyby entry) — variant F

  const outN = 60;
  for (let i = 1; i < outN; i++) {
    const tLinear = i / outN;
    const t = tLinear * tLinear;  // ease-in: denser near spiral end

    // Cubic Hermite basis functions
    const h00 = 2*t*t*t - 3*t*t + 1;
    const h10 = t*t*t - 2*t*t + t;
    const h01 = -2*t*t*t + 3*t*t;
    const h11 = t*t*t - t*t;

    const pt = spiralEnd.clone().multiplyScalar(h00)
      .add(spiralTangent.clone().multiplyScalar(h10 * outChord))
      .add(flybyEntry.clone().multiplyScalar(h01))
      .add(arrivalTangent.clone().multiplyScalar(h11 * arrChord));

    // Apply Z sine-bulge for figure-8 crossing
    pt.z -= OFFSET * Math.sin(Math.PI * t);

    points.push(pt);
  }

  // ── Flyby: semicircle around Moon far side, 60 points ──
  // More points = smoother arc at junctions
  // Flyby goes from +Z (+π/2) around far side to -Z (-π/2)
  const flybyN = 60;
  for (let i = 0; i < flybyN; i++) {
    const angle = (Math.PI / 2) - (i / (flybyN - 1)) * Math.PI;
    points.push(new THREE.Vector3(
      MOON_DISTANCE + LOOP_R * Math.cos(angle),
      -0.05,
      LOOP_R * Math.sin(angle),
    ));
  }

  // ── Return: Hermite from flyby exit → Earth ──
  // Departure tangent = -X (circle tangent at θ=-π/2)
  // Arrival tangent = -X (approaching Earth from +X side)
  const flybyExit = new THREE.Vector3(
    MOON_DISTANCE + LOOP_R * Math.cos(-Math.PI / 2),
    -0.05,
    LOOP_R * Math.sin(-Math.PI / 2),   // -Z side (left)
  );
  const earthEnd = new THREE.Vector3(0, -0.3, 0);
  const departureTangent = new THREE.Vector3(-1, 0, 0); // -X, matching circle tangent at exit
  const earthArrivalTangent = new THREE.Vector3(-1, 0, 0); // arriving at Earth from +X
  const retChord = flybyExit.distanceTo(earthEnd) * 0.8;

  const retN = 60;
  for (let i = 1; i <= retN; i++) {
    const t = i / retN;

    // Cubic Hermite
    const h00 = 2*t*t*t - 3*t*t + 1;
    const h10 = t*t*t - 2*t*t + t;
    const h01 = -2*t*t*t + 3*t*t;
    const h11 = t*t*t - t*t;

    const pt = flybyExit.clone().multiplyScalar(h00)
      .add(departureTangent.clone().multiplyScalar(h10 * retChord))
      .add(earthEnd.clone().multiplyScalar(h01))
      .add(earthArrivalTangent.clone().multiplyScalar(h11 * retChord));

    // Apply Z sine-bulge for figure-8 crossing (opposite of outbound)
    pt.z += OFFSET * Math.sin(Math.PI * t);

    points.push(pt);
  }

  // ── Splashdown ──
  points.push(new THREE.Vector3(-0.2, -EARTH_RADIUS, -0.3));

  // Use centripetal parameterization for smoothest join
  return new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
}

/* ------------------------------------------------------------------ */
/*  Progress mapping — uniform speed along the path                    */
/* ------------------------------------------------------------------ */

/**
 * Simple arc-length based progress mapping.
 * progress 0→1 maps linearly to curve arc-length 0→1.
 * No per-segment speed adjustments — the spacecraft moves at
 * constant visual speed along the entire path.
 * This eliminates the jarring speed changes between segments.
 */
export function buildProgressMapping(
  curve: THREE.CatmullRomCurve3,
): (progress: number) => number {
  // CatmullRomCurve3.getPointAt() already uses arc-length parameterization.
  // So we just return the identity function — progress = arc-length fraction.
  return function mapProgressToCurveT(progress: number): number {
    return Math.min(Math.max(progress, 0), 1);
  };
}

/**
 * Total mission duration in simulation seconds.
 * Real Artemis II: ~10 days (April 1–11, 2026).
 */
export const MISSION_DURATION = 60; // seconds at 1× speed

/** Moon orbital period in simulation seconds (≈ 27.3 days scaled) */
export const MOON_ORBIT_PERIOD = 160;

/**
 * Real mission crew for display.
 */
export const CREW = [
  { name: 'Reid Wiseman', role: 'Commander', agency: 'NASA' },
  { name: 'Victor Glover', role: 'Pilot', agency: 'NASA' },
  { name: 'Christina Koch', role: 'Mission Specialist 1', agency: 'NASA' },
  { name: 'Jeremy Hansen', role: 'Mission Specialist 2', agency: 'CSA' },
];

/** Mission launch date */
export const LAUNCH_DATE = new Date('2026-04-01T22:35:12Z');
