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

/** High Earth orbit apogee (scene units) — real: 71,000 km ≈ 11.1 Earth-radii */
const HEO_APOGEE = 11.1 * (40 / 60.3); // ≈ 7.4 units

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
export function buildTrajectory(moonAngle: number): THREE.CatmullRomCurve3 {
  const moonPos = new THREE.Vector3(
    Math.cos(moonAngle) * MOON_DISTANCE,
    0,
    Math.sin(moonAngle) * MOON_DISTANCE,
  );

  // Direction vectors relative to the Earth-Moon line
  const toMoon = moonPos.clone().normalize();               // Earth → Moon direction
  const perpUp = new THREE.Vector3(0, 1, 0);                // "North"
  const perpSide = new THREE.Vector3().crossVectors(toMoon, perpUp).normalize(); // sideways

  const points: THREE.Vector3[] = [];

  // Helper: point on an elliptical orbit around Earth in the orbital plane
  // a = semi-major, e = eccentricity, angle = true anomaly
  function orbitPt(a: number, e: number, angle: number, yOff: number): THREE.Vector3 {
    const r = a * (1 - e * e) / (1 + e * Math.cos(angle));
    // Orbit in the perpSide-toMoon plane, tilted slightly with y
    return perpSide.clone().multiplyScalar(Math.cos(angle) * r)
      .add(toMoon.clone().multiplyScalar(Math.sin(angle) * r))
      .setY(yOff);
  }

  // ══════════════════════════════════════════════════════════════════
  //  Phase 1: Launch & LEO (1 orbit)
  //  Real: initial orbit is suborbital, then ICPS raises perigee
  // ══════════════════════════════════════════════════════════════════
  const leoR = EARTH_RADIUS + 0.08;  // ~160 km altitude
  // Launch point
  points.push(new THREE.Vector3(0, EARTH_RADIUS * 0.95, 0));
  // LEO orbit — 6 points around Earth (nearly circular)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3; // start slightly offset
    points.push(new THREE.Vector3(
      Math.cos(a) * leoR,
      Math.sin(a) * leoR * 0.3, // inclined ~28.5°
      Math.sin(a) * leoR * 0.95,
    ));
  }

  // ══════════════════════════════════════════════════════════════════
  //  Phase 2: High Earth Orbit (1 large elliptical orbit)
  //  Real: ICPS burn raises apogee to 44,000 mi, period 23.5 hr
  // ══════════════════════════════════════════════════════════════════
  const heoA = HEO_APOGEE; // semi-major ≈ 7.4 units
  // Expanding spiral transition
  points.push(new THREE.Vector3(
    leoR * 1.2, 0.5, leoR * 0.8,
  ));
  // HEO ellipse — 8 points (highly elliptical)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = heoA * 0.5 * (1 + 0.6 * Math.cos(a)); // eccentric
    const pt = perpSide.clone().multiplyScalar(Math.cos(a) * r)
      .add(toMoon.clone().multiplyScalar(Math.sin(a) * r * 0.6));
    pt.y = Math.sin(a) * r * 0.15;
    points.push(pt);
  }

  // ══════════════════════════════════════════════════════════════════
  //  Phase 3: TLI & Outbound — nearly straight to the Moon
  //  After TLI burn at perigee, the spacecraft enters an extremely
  //  flat ellipse (almost a straight line) aimed at the Moon.
  //  Slight offset to +perpSide (one side of the "bowtie")
  // ══════════════════════════════════════════════════════════════════
  // TLI departure — slight curve away from Earth
  const tliStart = toMoon.clone().multiplyScalar(3)
    .add(perpSide.clone().multiplyScalar(1.5));
  tliStart.y = 0.2;
  points.push(tliStart);

  // Outbound is nearly straight but with a gentle arc on +perpSide
  // The arc is subtle (max ~2-3 units off the center line) because
  // the real trajectory is a very flat ellipse
  const outbound1 = toMoon.clone().multiplyScalar(MOON_DISTANCE * 0.15)
    .add(perpSide.clone().multiplyScalar(2.5));
  outbound1.y = 0.15;
  points.push(outbound1);

  const outbound2 = toMoon.clone().multiplyScalar(MOON_DISTANCE * 0.4)
    .add(perpSide.clone().multiplyScalar(3));
  outbound2.y = 0.1;
  points.push(outbound2);

  const outbound3 = toMoon.clone().multiplyScalar(MOON_DISTANCE * 0.7)
    .add(perpSide.clone().multiplyScalar(2));
  outbound3.y = 0.05;
  points.push(outbound3);

  // ══════════════════════════════════════════════════════════════════
  //  Phase 4: Lunar flyby — hyperbolic loop around the FAR SIDE
  //  Spacecraft on a hyperbolic trajectory relative to Moon.
  //  Approaches from +perpSide, swings behind the far side,
  //  exits toward -perpSide. This direction reversal is the key
  //  to the "bowtie" shape.
  // ══════════════════════════════════════════════════════════════════

  // Approach — arriving from +perpSide, near the Moon's near side
  const approach = moonPos.clone()
    .add(perpSide.clone().multiplyScalar(1.5))
    .add(toMoon.clone().multiplyScalar(-FLYBY_RADIUS * 0.5));
  approach.y = 0.0;
  points.push(approach);

  // Entering behind the Moon — curving from +perpSide to far side
  const farEntry = moonPos.clone()
    .add(toMoon.clone().multiplyScalar(FLYBY_RADIUS * 0.85))
    .add(perpSide.clone().multiplyScalar(FLYBY_RADIUS * 0.7));
  farEntry.y = -0.05;
  points.push(farEntry);

  // Closest approach — directly behind Moon (far side from Earth)
  // Real: 4,067 mi (6,545 km) from surface. Communication blackout ~40 min.
  const closest = moonPos.clone()
    .add(toMoon.clone().multiplyScalar(FLYBY_RADIUS));
  closest.y = -0.1;
  points.push(closest);

  // Exiting the far side — curving toward -perpSide
  const farExit = moonPos.clone()
    .add(toMoon.clone().multiplyScalar(FLYBY_RADIUS * 0.85))
    .add(perpSide.clone().multiplyScalar(-FLYBY_RADIUS * 0.7));
  farExit.y = -0.15;
  points.push(farExit);

  // Departing Moon — now heading on -perpSide (opposite of arrival)
  // Gravity slingshot: spacecraft speed relative to Earth drops
  // to nearly zero, then Earth's gravity pulls it back
  const depart = moonPos.clone()
    .add(perpSide.clone().multiplyScalar(-1.5))
    .add(toMoon.clone().multiplyScalar(-FLYBY_RADIUS * 0.5));
  depart.y = -0.2;
  points.push(depart);

  // ══════════════════════════════════════════════════════════════════
  //  Phase 5: Return — nearly straight back, opposite side
  //  After the gravity slingshot, the spacecraft "almost stops"
  //  relative to Earth, then free-falls back on a nearly straight
  //  path on the -perpSide (opposite to outbound).
  //  The two paths cross near Earth → creating the "bowtie" shape.
  // ══════════════════════════════════════════════════════════════════
  const return1 = toMoon.clone().multiplyScalar(MOON_DISTANCE * 0.7)
    .add(perpSide.clone().multiplyScalar(-2));
  return1.y = -0.15;
  points.push(return1);

  const return2 = toMoon.clone().multiplyScalar(MOON_DISTANCE * 0.4)
    .add(perpSide.clone().multiplyScalar(-3));
  return2.y = -0.2;
  points.push(return2);

  // Return path approaching Earth — converges back toward Earth
  // The crossover happens very close to Earth (the "knot" of the bowtie)
  const return3 = toMoon.clone().multiplyScalar(MOON_DISTANCE * 0.15)
    .add(perpSide.clone().multiplyScalar(-2.5));
  return3.y = -0.15;
  points.push(return3);

  const return4 = toMoon.clone().multiplyScalar(MOON_DISTANCE * 0.04)
    .add(perpSide.clone().multiplyScalar(-1));
  return4.y = -0.1;
  points.push(return4);

  // ══════════════════════════════════════════════════════════════════
  //  Phase 6: Re-entry & Splashdown
  // ══════════════════════════════════════════════════════════════════
  // Approaching Earth from below the orbital plane
  const reentry = perpSide.clone().multiplyScalar(-1.5);
  reentry.y = -0.3;
  points.push(reentry);

  // Re-entry
  points.push(new THREE.Vector3(-0.5, -(EARTH_RADIUS + 0.1), -0.8));

  // Splashdown — Pacific Ocean
  points.push(new THREE.Vector3(-0.2, -EARTH_RADIUS, -0.3));

  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.3);
}

/* ------------------------------------------------------------------ */
/*  Progress → Curve-t remapping                                       */
/* ------------------------------------------------------------------ */

/**
 * The desired mission-progress fraction for each control point.
 * Must match the number of points in buildTrajectory() — 32 points.
 *
 * Day 0:   Launch, LEO (1 orbit), transition to HEO
 * Day 0-1: High Earth Orbit (1 elliptical orbit, 23.5 hr period)
 * Day 1-2: TLI burn + start of outbound coast
 * Day 2-5: Translunar coast (upper leg of figure-8)
 * Day 6:   Lunar flyby around far side
 * Day 6-9: Free-return coast (lower leg of figure-8)
 * Day 10:  Re-entry + splashdown
 */
const WAYPOINT_PROGRESS = [
  // Phase 1: Launch + LEO orbit (7 pts)
  0.000,  // 0: Launch
  0.004,  // 1: LEO pt 1
  0.008,  // 2: LEO pt 2
  0.012,  // 3: LEO pt 3
  0.016,  // 4: LEO pt 4
  0.020,  // 5: LEO pt 5
  0.024,  // 6: LEO pt 6
  // Phase 2: Transition + HEO orbit (9 pts)
  0.030,  // 7: expanding transition
  0.035,  // 8: HEO pt 1
  0.045,  // 9: HEO pt 2
  0.055,  // 10: HEO pt 3
  0.065,  // 11: HEO pt 4
  0.075,  // 12: HEO pt 5
  0.085,  // 13: HEO pt 6
  0.092,  // 14: HEO pt 7
  0.098,  // 15: HEO pt 8
  // Phase 3: TLI + outbound coast (4 pts)
  0.12,   // 16: TLI departure
  0.22,   // 17: Outbound coast 1
  0.32,   // 18: Outbound coast 2
  0.42,   // 19: Outbound coast 3
  // Phase 4: Lunar flyby (5 pts)
  0.52,   // 20: Approach
  0.57,   // 21: Far side entry
  0.60,   // 22: Closest approach  ← FLYBY!
  0.63,   // 23: Far side exit
  0.67,   // 24: Departing Moon
  // Phase 5: Return coast (4 pts)
  0.72,   // 25: Return 1
  0.78,   // 26: Return 2 (crossover)
  0.84,   // 27: Return 3
  0.90,   // 28: Return 4 near Earth
  // Phase 6: Re-entry + splashdown (3 pts)
  0.95,   // 29: Re-entry approach
  0.98,   // 30: Re-entry
  1.00,   // 31: Splashdown
];

/**
 * Build a mapping function: mission progress (0–1) → curve arc-length t (0–1).
 *
 * CatmullRom's getPointAt(t) uses arc-length parameterization, so the
 * tiny flyby loop occupies only ~5% of the total curve t-range despite
 * representing 10% of mission time. This function compensates by finding
 * each control point's actual arc-length fraction, then linearly
 * interpolating between (missionProgress, arcFraction) pairs.
 */
export function buildProgressMapping(
  curve: THREE.CatmullRomCurve3,
): (progress: number) => number {
  const controlPoints = curve.points;
  const numSamples = 5000;

  // Pre-sample the curve
  const samples: THREE.Vector3[] = [];
  for (let i = 0; i <= numSamples; i++) {
    samples.push(curve.getPointAt(i / numSamples));
  }

  // Find the arc-length fraction (t) closest to each control point
  const arcFractions: number[] = [];
  for (const cp of controlPoints) {
    let bestT = 0;
    let minDist = Infinity;
    for (let i = 0; i <= numSamples; i++) {
      const d = samples[i].distanceToSquared(cp);
      if (d < minDist) {
        minDist = d;
        bestT = i / numSamples;
      }
    }
    arcFractions.push(bestT);
  }

  // Return the mapper: given mission progress, lerp between the pairs
  return function mapProgressToCurveT(progress: number): number {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;

    for (let i = 0; i < WAYPOINT_PROGRESS.length - 1; i++) {
      if (progress <= WAYPOINT_PROGRESS[i + 1]) {
        const span = WAYPOINT_PROGRESS[i + 1] - WAYPOINT_PROGRESS[i];
        const frac = span > 0 ? (progress - WAYPOINT_PROGRESS[i]) / span : 0;
        return arcFractions[i] + frac * (arcFractions[i + 1] - arcFractions[i]);
      }
    }
    return 1;
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
