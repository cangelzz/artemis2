/**
 * Artemis II trajectory — physically-based free-return orbit.
 *
 * REAL MISSION DATA (NASA, launched April 1, 2026):
 *   - Launch: 2026-04-01 22:35:12 UTC from Kennedy LC-39B
 *   - Mission duration: ~10 days
 *   - LEO parking orbit: 185 km altitude, 28.5° inclination
 *   - TLI burn: 5m49s, sends spacecraft toward Moon
 *   - Translunar coast: ~4 days
 *   - Lunar flyby: closest approach 6,545 km from far-side surface
 *     (8,282 km from Moon center)
 *   - Farthest from Earth: 406,771 km (record)
 *   - Free-return coast: ~4 days back to Earth
 *   - Splashdown: ~April 11, Pacific Ocean near San Diego
 *
 * COORDINATE SYSTEM (Synodic / Co-Rotating Frame):
 *   - Earth at origin
 *   - Moon fixed at (+MOON_DISTANCE, 0, 0)
 *   - Y in the Earth-Moon orbital plane
 *   - Z perpendicular to lunar orbital plane
 *
 * In this frame, a free-return trajectory forms a figure-8.
 *
 * SCALE: 1 scene unit = 1 Earth radius = 6,371 km
 *
 * METHOD:
 *   Patched Conics: Keplerian transfer ellipse (Earth-focused) +
 *   hyperbolic flyby (Moon-focused) + return ellipse (Earth-focused).
 *   Each segment uses real orbital mechanics equations.
 *   The segments connect at the Moon's Sphere of Influence boundary.
 */

import * as THREE from 'three';

/* ================================================================== */
/*  Physical constants  (1 unit = R_Earth = 6,371 km)                 */
/* ================================================================== */

export const EARTH_RADIUS = 1;
export const MOON_RADIUS = 0.2727;  // 1,737.4 / 6,371
export const MOON_DISTANCE = 60.34; // 384,400 / 6,371

const MU_EARTH = 398600.4418; // km^3/s^2
const MU_MOON = 4902.8;       // km^3/s^2
const R_E_KM = 6371;          // km

const LEO_R = (R_E_KM + 185) / R_E_KM; // 1.029 R_E
const FLYBY_PERI = 8282 / R_E_KM;       // 1.30 R_E (from Moon center)
const INCL = (28.5 * Math.PI) / 180;    // launch inclination

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

  // TLI ellipse: perigee = LEO, apogee = Moon distance
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

  // Return ellipse: perigee near Earth surface, apogee ~Moon distance
  const retPer = (R_E_KM + 60) / R_E_KM;
  const retApo = 400000 / R_E_KM;
  const a_ret = (retPer + retApo) / 2;
  const e_ret = (retApo - retPer) / (retApo + retPer);

  // ================================================================
  //  SEGMENT 1: LEO parking orbit — 1.5 revs
  // ================================================================
  for (let i = 0; i <= 60; i++) {
    const ang = (i / 60) * 1.5 * 2 * Math.PI;
    const x = LEO_R * Math.cos(ang);
    const ip = LEO_R * Math.sin(ang);
    pts.push(new THREE.Vector3(x, ip * Math.cos(INCL), ip * Math.sin(INCL)));
  }

  // ================================================================
  //  SEGMENT 2: TLI outbound — Earth to Moon SOI
  //
  //  In the synodic frame, the outbound trajectory goes from
  //  Earth toward Moon (+X), curving through +Y (upper lobe
  //  of figure-8).
  //
  //  We orient the TLI ellipse so:
  //    - Perigee is near Earth, on the -X side (opposite Moon)
  //    - The orbit sweeps through +Y toward the Moon (+X)
  //    - Apogee is near Moon distance, on the +X side
  //
  //  argument of perigee (omega) = PI
  //  This means: position angle = theta + omega = theta + PI
  //    theta=0  → angle=PI  → (-r, 0) [perigee, -X side] ✓
  //    theta=PI → angle=2PI → (+r, 0) [apogee, +X side = Moon] ✓
  //    theta=PI/2 → angle=3PI/2 → r*cos(3PI/2)=0, r*sin(3PI/2)=-r
  //    Hmm, that goes through -Y... we want +Y.
  //
  //  For +Y: omega = -PI (or equivalently omega = PI with the
  //  orbit traversed in the other angular direction).
  //  Let's use: position angle = -(theta - PI) = PI - theta
  //    theta=0 → angle=PI → (-r, 0) [perigee, -X] ✓
  //    theta=PI → angle=0 → (+r, 0) [apogee, +X = Moon] ✓
  //    theta=PI/2 → angle=PI/2 → (0, +r) [+Y lobe] ✓
  // ================================================================

  const thetaEndOut = Math.PI * 0.96;
  for (let i = 0; i <= 150; i++) {
    const f = i / 150;
    const theta = f * thetaEndOut;
    const r = ellipseR(a_tli, e_tli, theta);

    // Position in synodic frame
    const angle = Math.PI - theta; // sweep from -X through +Y to +X
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);

    // Z: inclination effect fading as we approach ecliptic
    const incFade = Math.max(0, 1 - f * 1.2);
    const z = r * Math.sin(theta) * Math.sin(INCL) * incFade * 0.12;

    pts.push(new THREE.Vector3(x, y, z));
  }

  // ================================================================
  //  SEGMENT 3: Hyperbolic flyby around Moon far side
  //
  //  Moon at (MOON_DISTANCE, 0, 0).
  //  Approach from Earth side → periapsis on far side → depart.
  //
  //  In Moon-centered coordinates:
  //    periapsis (+X from Moon = far side)
  //    theta > 0: trajectory above → approach from +Y
  //    theta < 0: trajectory below → depart toward -Y
  //
  //  This connects: outbound coming from +Y, depart going to -Y ✓
  // ================================================================

  const flyRange = thetaMaxHyp * 0.88;

  for (let i = 0; i <= 100; i++) {
    const f = i / 100;
    const theta = flyRange * (1 - 2 * f); // +flyRange → -flyRange
    const r = hyperR(aHyp, eHyp, theta);

    const xM = r * Math.cos(theta);
    const yM = r * Math.sin(theta);

    const x = MOON_DISTANCE + xM;
    const y = yM;
    const z = pts[pts.length - 1].z * (1 - f); // fade Z to 0

    pts.push(new THREE.Vector3(x, y, z));
  }

  // ================================================================
  //  SEGMENT 4: Free-return — Moon SOI back to Earth
  //
  //  Mirror of the outbound: the return path sweeps through -Y
  //  (lower lobe of figure-8).
  //
  //  Return ellipse oriented with:
  //    omega = -PI → position angle = theta - PI
  //    theta=PI → angle=0 → (+r, 0) [apogee near Moon, +X] ✓
  //    theta=0 → angle=-PI → (-r, 0) [perigee, -X side]
  //
  //  For -Y sweep:
  //    angle = -(PI - theta) = theta - PI
  //    theta=PI → angle=0 → (+r, 0) [near Moon] ✓
  //    theta=PI/2 → angle=-PI/2 → (0, -r) [-Y lobe] ✓
  //    theta=0 → angle=-PI → (-r, 0) [perigee]
  //
  //  But we want perigee near Earth on the +X side for splashdown,
  //  not -X. Let's adjust:
  //    angle = -(PI - theta) + PI = theta → standard orientation
  //    No, that gives +Y again.
  //
  //  Correct approach for -Y:
  //    angle = theta - PI
  //    We sweep theta from PI (apogee at +X) down to ~0 (perigee at -X)
  //    Midway at theta=PI/2: angle=-PI/2 → (0, -r) ✓ -Y lobe!
  //
  //  The perigee ends up at -X, which is fine — we add a final
  //  splashdown segment to bring it to Earth surface.
  // ================================================================

  // Find the true anomaly where r = distance of flyby exit from Earth
  const fExit = pts[pts.length - 1];
  const rExit = Math.sqrt(fExit.x * fExit.x + fExit.y * fExit.y + fExit.z * fExit.z);
  const cosStartTA = ((a_ret * (1 - e_ret * e_ret)) / rExit - 1) / e_ret;
  const startTA = Math.acos(Math.max(-1, Math.min(1, cosStartTA)));

  // Sweep from near-apogee (startTA ≈ pi) to near-perigee (small theta)
  const endTA = 0.05; // not quite 0, stop just before perigee
  for (let i = 1; i <= 150; i++) {
    const f = i / 150;
    const theta = startTA + f * (endTA - startTA); // decreasing
    const r = ellipseR(a_ret, e_ret, theta);

    const angle = theta - Math.PI; // sweeps through -Y
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);
    const z = fExit.z * (1 - f) * 0.2;

    pts.push(new THREE.Vector3(x, y, z));
  }

  // ================================================================
  //  SEGMENT 5: Final splashdown
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
