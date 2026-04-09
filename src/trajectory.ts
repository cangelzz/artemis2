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

  // ── Spiral: LEO → HEO, 1.75 revolutions, 60 points ──
  const spiralN = 60;
  const totalAngle = 1.75 * 2 * Math.PI;
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

  // ── Outbound: spiral end → flyby entry, sine-bulge in Z ──
  // Z = linear_interp + OFFSET*sin(πt)
  // Near Earth (t≈0): Z ≈ spiralEnd.z (natural, no spread)
  // Middle (t=0.5): Z = midpoint + OFFSET (pushed to +Z side)
  // Near Moon (t≈1): Z ≈ flybyEntry.z (matches flyby, no kink)
  const spiralEnd = points[points.length - 1].clone();
  const flybyEntry = new THREE.Vector3(
    MOON_DISTANCE + LOOP_R * Math.cos(Math.PI / 2),
    -0.05,
    LOOP_R * Math.sin(Math.PI / 2),   // +Z side (right)
  );
  const outN = 30;
  for (let i = 1; i < outN; i++) {
    const t = i / outN;
    const x = spiralEnd.x + (flybyEntry.x - spiralEnd.x) * t;
    const y = spiralEnd.y + (flybyEntry.y - spiralEnd.y) * t;
    const zLinear = spiralEnd.z + (flybyEntry.z - spiralEnd.z) * t;
    const z = zLinear - OFFSET * Math.sin(Math.PI * t);
    points.push(new THREE.Vector3(x, y, z));
  }

  // ── Flyby: semicircle around Moon far side, 20 points ──
  // Flyby goes from +Z (+π/2) around far side to -Z (-π/2)
  const flybyN = 20;
  for (let i = 0; i < flybyN; i++) {
    const angle = (Math.PI / 2) - (i / (flybyN - 1)) * Math.PI;
    points.push(new THREE.Vector3(
      MOON_DISTANCE + LOOP_R * Math.cos(angle),
      -0.05,
      LOOP_R * Math.sin(angle),
    ));
  }

  // ── Return: flyby exit → Earth, sine-bulge in -Z ──
  // Z = linear_interp - OFFSET*sin(πt)
  // Near Moon (t≈0): Z ≈ flybyExit.z (natural)
  // Middle (t=0.5): Z = midpoint - OFFSET (pushed to -Z side → crosses outbound!)
  // Near Earth (t≈1): Z ≈ 0 (natural, converges with outbound)
  const flybyExit = new THREE.Vector3(
    MOON_DISTANCE + LOOP_R * Math.cos(-Math.PI / 2),
    -0.05,
    LOOP_R * Math.sin(-Math.PI / 2),   // -Z side (left)
  );
  const earthEnd = new THREE.Vector3(0, -0.3, 0);
  const retN = 30;
  for (let i = 1; i <= retN; i++) {
    const t = i / retN;
    const x = flybyExit.x + (earthEnd.x - flybyExit.x) * t;
    const y = flybyExit.y + (earthEnd.y - flybyExit.y) * t;
    const zLinear = flybyExit.z + (earthEnd.z - flybyExit.z) * t;
    const z = zLinear + OFFSET * Math.sin(Math.PI * t);
    points.push(new THREE.Vector3(x, y, z));
  }

  // ── Splashdown ──
  points.push(new THREE.Vector3(-0.2, -EARTH_RADIUS, -0.3));

  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
}

/* ------------------------------------------------------------------ */
/*  Progress → Curve-t remapping                                       */
/* ------------------------------------------------------------------ */

/**
 * Mission-progress for each control point (140 points).
 */
const WAYPOINT_PROGRESS = (() => {
  const wp: number[] = [];
  const spiral = 60, out = 29, flyby = 20, ret = 30, end = 1;
  // Spiral: 0 → 0.10
  for (let i = 0; i < spiral; i++) wp.push((i / spiral) * 0.10);
  // Outbound: 0.10 → 0.50
  for (let i = 0; i < out; i++) wp.push(0.10 + (i / out) * 0.40);
  // Flyby: 0.50 → 0.70
  for (let i = 0; i < flyby; i++) wp.push(0.50 + (i / flyby) * 0.20);
  // Return: 0.70 → 0.97
  for (let i = 0; i < ret; i++) wp.push(0.70 + (i / ret) * 0.27);
  // Splashdown
  wp.push(1.00);
  return wp;
})();

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
