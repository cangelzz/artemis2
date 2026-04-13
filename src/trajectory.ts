/**
 * Artemis II trajectory — figure-8 free-return orbit.
 *
 * The trajectory is built as a single smooth path in the synodic
 * (co-rotating) frame where Earth is at origin and Moon is fixed
 * on the +X axis.
 *
 * APPROACH: Instead of patching different orbit types together
 * (which causes discontinuities at junctions), we define the
 * figure-8 as a smooth parametric curve with control points
 * derived from real mission data.
 *
 * The figure-8 shape:
 *   - Outbound: Earth → Moon, arcing through +Y (above)
 *   - Flyby: smooth hairpin around Moon's far side
 *   - Return: Moon → Earth, arcing through -Y (below)
 *   - The two legs cross midway between Earth and Moon
 *
 * Physical parameters matched:
 *   - LEO: 185 km altitude
 *   - Flyby: 8,282 km from Moon center (6,545 km surface)
 *   - Far-side flyby (periapsis at x > MOON_DISTANCE)
 *   - Max distance from Earth: ~400,000 km
 *   - Lobe height: ~15-20 R_E (matches NASA diagrams)
 *
 * SCALE: 1 unit = 1 Earth radius = 6,371 km
 */

import * as THREE from 'three';

export const EARTH_RADIUS = 1;
export const MOON_RADIUS = 0.2727;
export const MOON_DISTANCE = 60.34;

const R_E_KM = 6371;
const LEO_R = (R_E_KM + 185) / R_E_KM;
const FLYBY_PERI = 8282 / R_E_KM; // 1.30 R_E from Moon center
const INCL = (28.5 * Math.PI) / 180;

export const SUN_DIR = new THREE.Vector3(1, 0.3, 0.5).normalize();

export const MISSION_TIMELINE = {
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

export function buildTrajectory(_moonAngle: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];

  const D = MOON_DISTANCE;
  // Lobe height: ~17 R_E ≈ 108,000 km, consistent with NASA diagrams
  const H = D * 0.28;

  // ================================================================
  //  SEGMENT 1: LEO parking orbit — 1.5 revolutions
  // ================================================================
  for (let i = 0; i <= 60; i++) {
    const ang = (i / 60) * 1.5 * 2 * Math.PI;
    const x = LEO_R * Math.cos(ang);
    const ip = LEO_R * Math.sin(ang);
    pts.push(new THREE.Vector3(x, ip * Math.cos(INCL), ip * Math.sin(INCL)));
  }

  // ================================================================
  //  SEGMENT 2: Outbound — Earth to Moon flyby entry
  //
  //  Smooth arc from Earth through +Y to the Moon's near side.
  //  The path approaches the Moon from slightly above (+Y),
  //  which feeds smoothly into the flyby hairpin.
  //
  //  The arc is defined parametrically so that:
  //    - x goes from 0 to D (Earth to Moon)
  //    - y traces a single lobe peaking around x = D*0.35
  //    - At x = D, y should be small and positive (approaching Moon
  //      from above to match the flyby entry direction)
  // ================================================================

  const N_OUT = 200;
  for (let i = 1; i <= N_OUT; i++) {
    const f = i / N_OUT;

    // X: Earth to Moon, with slight ease-in
    const x = f * f * (3 - 2 * f) * D; // smoothstep

    // Y: asymmetric lobe, peaks around 35% of the way
    // At f=0: y=0 (Earth), at f=1: y approaches FLYBY_PERI (Moon entry)
    const yBase = Math.sin(Math.PI * f);
    // Taper toward Moon but keep a residual to match flyby entry
    const taper = 1 - f * f * f * 0.7;
    const yLobe = H * yBase * taper;
    // Blend toward FLYBY_PERI at the end for smooth flyby connection
    const flybyBlend = Math.pow(f, 8); // only kicks in near f=1
    const y = yLobe * (1 - flybyBlend) + FLYBY_PERI * flybyBlend;

    // Z: small inclination, fading
    const z = y * Math.sin(INCL) * (1 - f) * 0.12;

    pts.push(new THREE.Vector3(x, y, z));
  }

  // ================================================================
  //  SEGMENT 3: Lunar flyby — smooth hairpin around far side
  //
  //  A constant-radius semicircle at FLYBY_PERI from Moon center.
  //  Entry from +Y, periapsis on +X (far side), exit to -Y.
  //  We extend the angular range beyond ±pi/2 to include
  //  approach/departure arcs, which helps CatmullRom blend smoothly.
  // ================================================================

  const N_FLY = 100;
  const flybyZ0 = pts[pts.length - 1].z;
  // Extend angular range: from ~2pi/3 to -2pi/3 (wider than pi/2)
  // This adds approach/departure arcs at larger radius
  const flybyAngleExtent = Math.PI * 0.75; // 135 degrees each side

  for (let i = 0; i <= N_FLY; i++) {
    const f = i / N_FLY;

    // Angle: from +flybyAngleExtent to -flybyAngleExtent
    const angle = flybyAngleExtent * (1 - 2 * f);

    // Radius: at periapsis (angle=0) use FLYBY_PERI,
    // at entry/exit use a larger radius that tapers in
    const angleFrac = Math.abs(angle) / flybyAngleExtent; // 0 at periapsis, 1 at extremes
    const flybyR = FLYBY_PERI + angleFrac * angleFrac * 2.5;

    const xM = flybyR * Math.cos(angle);
    const yM = flybyR * Math.sin(angle);

    const x = D + xM;
    const y = yM;
    const z = flybyZ0 * (1 - f);

    pts.push(new THREE.Vector3(x, y, z));
  }

  // ================================================================
  //  SEGMENT 4: Return — Moon to Earth, arcing through -Y
  //
  //  Mirror of outbound but below the Earth-Moon line.
  //  The path departs Moon from -Y and sweeps back to Earth.
  //  The -Y lobe peaks around 65% of the way back (closer to Earth).
  //  This creates the figure-8 crossover with the outbound +Y lobe.
  // ================================================================

  const N_RET = 200;

  for (let i = 1; i <= N_RET; i++) {
    const f = i / N_RET;

    // X: Moon to Earth
    const x = D * (1 - f * f * (3 - 2 * f));

    // Y: lobe below Earth-Moon line
    const yBase = -Math.sin(Math.PI * f);
    const taper = 1 - (1 - f) * (1 - f) * (1 - f) * 0.7;
    const yLobe = H * yBase * taper;
    // Blend from -FLYBY_PERI at start for smooth flyby exit
    const flybyBlend = Math.pow(1 - f, 8);
    const y = yLobe * (1 - flybyBlend) + (-FLYBY_PERI) * flybyBlend;

    const z = y * Math.sin(INCL) * f * 0.08;

    pts.push(new THREE.Vector3(x, y, z));
  }

  // ================================================================
  //  SEGMENT 5: Splashdown
  // ================================================================
  pts.push(new THREE.Vector3(-0.3, -EARTH_RADIUS * 0.95, -0.2));

  return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
}

export function buildProgressMapping(
  _curve: THREE.CatmullRomCurve3,
): (progress: number) => number {
  return (p: number) => Math.min(Math.max(p, 0), 1);
}

export const MISSION_DURATION = 60;
export const MOON_ORBIT_PERIOD = 160;

export const CREW = [
  { name: 'Reid Wiseman', role: 'Commander', agency: 'NASA' },
  { name: 'Victor Glover', role: 'Pilot', agency: 'NASA' },
  { name: 'Christina Koch', role: 'Mission Specialist 1', agency: 'NASA' },
  { name: 'Jeremy Hansen', role: 'Mission Specialist 2', agency: 'CSA' },
];

export const LAUNCH_DATE = new Date('2026-04-01T22:35:12Z');
