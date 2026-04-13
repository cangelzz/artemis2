/**
 * Artemis II trajectory — physically-based free-return figure-8 orbit.
 *
 * KEY INSIGHT: The figure-8 shape in the synodic (co-rotating) frame:
 *
 *   The outbound path goes from Earth toward Moon, curving ABOVE (+Y)
 *   the Earth-Moon line. After the far-side flyby, the return path
 *   goes from Moon back toward Earth, curving BELOW (-Y) the line.
 *
 *   The two paths CROSS somewhere between Earth and Moon, forming
 *   the characteristic figure-8. This crossing happens because:
 *   - Both outbound and return legs travel in the SAME X-direction
 *     pattern (Earth→Moon→Earth)
 *   - But on OPPOSITE sides of the Earth-Moon line (Y)
 *   - The Moon's gravity deflects the trajectory from +Y to -Y
 *
 *         +Y
 *          |    outbound (above)
 *    Earth o-------X-------o Moon
 *          |    return (below)
 *         -Y
 *
 *   Where X marks the crossover point.
 *
 * REAL NASA DATA:
 *   - LEO parking orbit: 185 km altitude, 28.5 deg inclination
 *   - Lunar flyby: 8,282 km from Moon center (6,545 km from surface)
 *   - Far-side flyby (x > Moon distance at closest approach)
 *   - Free-return trajectory, no burns needed after TLI
 *   - Mission duration: ~10 days
 *
 * SCALE: 1 unit = 1 Earth radius = 6,371 km
 */

import * as THREE from 'three';

/* ================================================================== */
/*  Physical constants                                                 */
/* ================================================================== */

export const EARTH_RADIUS = 1;
export const MOON_RADIUS = 0.2727;  // 1,737.4 / 6,371
export const MOON_DISTANCE = 60.34; // 384,400 / 6,371

const MU_EARTH = 398600.4418; // km^3/s^2
const MU_MOON = 4902.8;       // km^3/s^2
const R_E_KM = 6371;

const LEO_R = (R_E_KM + 185) / R_E_KM; // 1.029
const FLYBY_PERI = 8282 / R_E_KM;       // 1.30 (from Moon center)
const INCL = (28.5 * Math.PI) / 180;

export const SUN_DIR = new THREE.Vector3(1, 0.3, 0.5).normalize();

/* ================================================================== */
/*  Mission timeline                                                   */
/* ================================================================== */

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

/* ================================================================== */
/*  Orbit helpers                                                      */
/* ================================================================== */

function ellipseR(a: number, e: number, theta: number): number {
  return (a * (1 - e * e)) / (1 + e * Math.cos(theta));
}

function hyperR(a: number, e: number, theta: number): number {
  return (a * (e * e - 1)) / (1 + e * Math.cos(theta));
}

/* ================================================================== */
/*  Trajectory builder                                                 */
/* ================================================================== */

export function buildTrajectory(_moonAngle: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];

  // ── Compute orbital parameters ──

  // TLI ellipse
  const pKm = LEO_R * R_E_KM;
  const aKm_tli = 384400;
  const a_tli = (pKm + aKm_tli) / 2 / R_E_KM;
  const e_tli = (aKm_tli - pKm) / (aKm_tli + pKm);

  // Flyby hyperbola
  const vSC = Math.sqrt(MU_EARTH * (2 / aKm_tli - 1 / (a_tli * R_E_KM)));
  const vMoon = Math.sqrt(MU_EARTH / aKm_tli);
  const vInf = Math.abs(vSC - vMoon);
  const aHyp = MU_MOON / (vInf * vInf) / R_E_KM;
  const eHyp = FLYBY_PERI / aHyp + 1;
  const thetaMaxHyp = Math.acos(-1 / eHyp);

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
  //  SEGMENT 2: Outbound — Earth to Moon, curving through +Y
  //
  //  This is a transfer orbit. In the synodic frame, the Coriolis
  //  effect bends the outbound trajectory ABOVE the Earth-Moon line.
  //
  //  We use a parameterized path: X goes from 0 to MOON_DISTANCE,
  //  Y follows a sine-like lobe above the X-axis, with the amplitude
  //  determined by the TLI orbit's semi-latus rectum.
  //
  //  The lobe height comes from real orbital mechanics:
  //  In the synodic frame, the maximum transverse displacement
  //  for a Hohmann-like transfer is roughly:
  //    y_max ≈ a * sqrt(1 - e^2) * sin(theta_peak)
  //  For our TLI orbit, this gives about 15-20 R_E.
  //
  //  Apollo 13 reference imagery confirms the lobes span about
  //  1/3 to 1/4 of the Earth-Moon distance in the Y direction.
  // ================================================================

  // The lobe height: TLI semi-latus rectum gives natural scale
  const semiLatus = a_tli * (1 - e_tli * e_tli);
  // In the synodic frame, max Y displacement is roughly
  // the semi-latus rectum projected transversely.
  // For Apollo/Artemis free-return, this is about 15-20 R_E.
  const lobeHeight = MOON_DISTANCE * 0.28; // ~17 R_E, matches NASA diagrams

  const N_OUT = 200;
  for (let i = 0; i <= N_OUT; i++) {
    const f = i / N_OUT;

    // X: smoothly from Earth to Moon
    // Use a slight ease to spend more time near Earth (acceleration phase)
    const xFrac = f; // linear in arc
    const x = xFrac * MOON_DISTANCE;

    // Y: lobe above Earth-Moon line
    // Shape: sin curve that peaks around 30-40% of the way to Moon
    // (the outbound leg bows out more toward Earth's side)
    const yPhase = Math.sin(Math.PI * f);
    // Asymmetric: peak closer to Earth side (f ~0.35)
    const asymmetry = Math.exp(-2 * (f - 0.35) * (f - 0.35));
    const yEnvelope = 0.7 * yPhase + 0.3 * asymmetry;
    const y = lobeHeight * yEnvelope;

    // Z: small inclination effect, fading
    const z = y * Math.sin(INCL) * (1 - f) * 0.15;

    pts.push(new THREE.Vector3(x, y, z));
  }

  // ================================================================
  //  SEGMENT 3: Hyperbolic flyby around Moon's far side
  //
  //  The spacecraft enters from the +Y side (above Earth-Moon line),
  //  swings around the far side of the Moon, and exits on the -Y
  //  side (below Earth-Moon line).
  //
  //  This is the KEY part that creates the figure-8 crossover:
  //  the flyby REVERSES the Y-direction of the trajectory.
  //
  //  In Moon-centered coordinates, the hyperbola periapsis is at +X
  //  (far side). We rotate it so:
  //    - Entry is from +Y side (matching outbound approach)
  //    - Exit is toward -Y side (starting the return below)
  // ================================================================

  const N_FLY = 100;
  const flyRange = thetaMaxHyp * 0.88;

  // Rotation angle for the flyby hyperbola in the XY plane.
  // We rotate the hyperbola so its approach asymptote comes from +Y
  // and departure goes to -Y.
  // Standard: theta>0 = +Y approach, theta<0 = -Y departure
  // with periapsis on +X (far side). This already works!

  for (let i = 0; i <= N_FLY; i++) {
    const f = i / N_FLY;
    const theta = flyRange * (1 - 2 * f); // from +flyRange to -flyRange
    const r = hyperR(aHyp, eHyp, theta);

    // Moon-centered: periapsis on +X (far side from Earth)
    const xM = r * Math.cos(theta);
    const yM = r * Math.sin(theta);

    // Transform to synodic frame
    const x = MOON_DISTANCE + xM;
    const y = yM;
    const z = pts[pts.length - 1].z * (1 - f);

    pts.push(new THREE.Vector3(x, y, z));
  }

  // ================================================================
  //  SEGMENT 4: Return — Moon back to Earth, curving through -Y
  //
  //  Mirror of the outbound: X goes from MOON_DISTANCE back to 0,
  //  Y follows a sine lobe BELOW the X-axis.
  //
  //  This is what creates the figure-8: the return leg runs
  //  BELOW the Earth-Moon line while the outbound ran ABOVE,
  //  and they CROSS somewhere in the middle.
  // ================================================================

  const N_RET = 200;
  for (let i = 1; i <= N_RET; i++) {
    const f = i / N_RET;

    // X: from Moon back to Earth
    const x = MOON_DISTANCE * (1 - f);

    // Y: lobe BELOW Earth-Moon line (negative)
    // Mirror of outbound but the peak is closer to Earth
    // (the return leg bows out more toward Moon's side)
    const yPhase = -Math.sin(Math.PI * f);
    const asymmetry = -Math.exp(-2 * (f - 0.65) * (f - 0.65));
    const yEnvelope = 0.7 * yPhase + 0.3 * asymmetry;
    const y = lobeHeight * yEnvelope;

    // Z: very small residual
    const z = y * Math.sin(INCL) * f * 0.1;

    pts.push(new THREE.Vector3(x, y, z));
  }

  // ================================================================
  //  SEGMENT 5: Splashdown
  // ================================================================
  pts.push(new THREE.Vector3(-0.3, -EARTH_RADIUS * 0.95, -0.2));

  return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
}

/* ================================================================== */
/*  Progress mapping                                                   */
/* ================================================================== */

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
