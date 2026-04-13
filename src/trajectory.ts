/**
 * Artemis II trajectory — figure-8 free-return orbit.
 *
 * APPROACH: Define the trajectory as a SINGLE smooth curve using
 * carefully placed control points that trace the figure-8 path.
 * No segment patching — all points flow continuously.
 *
 * The figure-8 in the synodic (co-rotating) frame:
 *
 *          +Y (above)
 *           |     outbound arc
 *   Earth ◯------- X --------◯ Moon
 *           |     return arc
 *          -Y (below)
 *
 *   X = crossover point between the two lobes.
 *
 * Physical data:
 *   - LEO: 185 km altitude, 28.5° inclination
 *   - Flyby periapsis: 8,282 km from Moon center
 *   - Flyby on far side (behind Moon from Earth's view)
 *   - Lobe height: ~100,000 km (~16 R_E)
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

  const D = MOON_DISTANCE; // 60.34
  const LOBE = 16; // lobe height in R_E (~100,000 km)

  // ================================================================
  //  SEGMENT 1: LEO parking orbit — 1 revolution
  // ================================================================
  const N_LEO = 40;
  for (let i = 0; i <= N_LEO; i++) {
    const ang = (i / N_LEO) * 2 * Math.PI;
    const x = LEO_R * Math.cos(ang);
    const ip = LEO_R * Math.sin(ang);
    pts.push(new THREE.Vector3(x, ip * Math.cos(INCL), ip * Math.sin(INCL)));
  }

  // ================================================================
  //  SEGMENT 2+3+4: Figure-8 main body
  //
  //  We define the outbound, flyby, and return as ONE continuous
  //  set of control points. No separate segments to patch.
  //
  //  The path is parametrized by angle phi going from 0 to 2*PI:
  //    phi = 0:      Earth (start of outbound)
  //    phi = PI/2:   Peak of upper lobe (+Y)
  //    phi = PI:     Moon (flyby)
  //    phi = 3PI/2:  Trough of lower lobe (-Y)
  //    phi = 2PI:    Earth (end of return)
  //
  //  X and Y are defined so the path traces a figure-8 (lemniscate)
  //  centered between Earth and Moon.
  //
  //  Classic lemniscate of Bernoulli:
  //    x = a * cos(t) / (1 + sin²(t))
  //    y = a * sin(t) * cos(t) / (1 + sin²(t))
  //
  //  We stretch and shift it to fit Earth-Moon geometry.
  // ================================================================

  const N_MAIN = 400;
  // We use a modified lemniscate that:
  //   - Is centered at (D/2, 0) — midway between Earth and Moon
  //   - Has the right lobe around the Moon, left lobe around Earth
  //   - Scale factor a = D/2 so the tips reach Earth and Moon
  //
  // Standard lemniscate: x² = a²(x² - y²)/(x² + y²)
  // Parametric form: r² = a² cos(2θ)
  //   x = a * cos(θ) * sqrt(cos(2θ))
  //   y = a * sin(θ) * sqrt(cos(2θ))
  //
  // Better: use the Lissajous-like parametric form
  //   x(t) = (D/2) * cos(t)         → ranges from -D/2 to D/2
  //   y(t) = LOBE * sin(2t) / 2     → figure-8 shape
  //
  // Wait — sin(2t) gives exactly the figure-8 crossing pattern!
  //   At t=0: x=D/2, y=0 (right, near Moon)
  //   At t=PI/4: x=D/(2√2), y=LOBE/2 (upper right)
  //   At t=PI/2: x=0, y=0 (center, crossing point)
  //   At t=3PI/4: x=-D/(2√2), y=-LOBE/2 (lower left)
  //   At t=PI: x=-D/2, y=0 (left, near Earth)
  //
  // Hmm, this puts Earth on the LEFT and the crossing at CENTER.
  // For our purposes:
  //   Center of figure-8 = (D/2, 0) → shift by D/2
  //   x(t) = D/2 + (D/2)*cos(t) = (D/2)(1 + cos(t))
  //   y(t) = LOBE * sin(t) * cos(t) = (LOBE/2) * sin(2t)
  //
  // At t=0: x=D, y=0 (Moon!) ← starts/ends at Moon
  // At t=PI/2: x=D/2, y=LOBE/2 (upper crossing)... no, sin(2*PI/2)=0
  //
  // Let me just use the correct lemniscate parametrization.
  // A figure-8 (lemniscate of Gerono):
  //   x(t) = cos(t)
  //   y(t) = sin(t)*cos(t) = sin(2t)/2
  //
  // Scale and shift:
  //   X(t) = D/2 + (D/2)*cos(t)     ranges [0, D]
  //   Y(t) = LOBE * sin(t)*cos(t)   ranges [-LOBE/2, LOBE/2]
  //
  // At t=0: X=D, Y=0 (Moon)
  // At t=PI/2: X=D/2, Y=0 (crossing in middle)
  // At t=PI: X=0, Y=0 (Earth)
  // At t=3PI/2: X=D/2, Y=0 (crossing again)
  //
  // Hmm, Y=sin(t)*cos(t) = sin(2t)/2 is zero at t=0, PI/2, PI, 3PI/2.
  // It peaks at t=PI/4 and t=5PI/4, troughs at t=3PI/4 and t=7PI/4.
  //
  // Let me trace it:
  //   t=0: (D, 0) — Moon
  //   t=PI/4: (D/2 + D/(2√2), LOBE/2) — upper right
  //   t=PI/2: (D/2, 0) — center crossing
  //   t=3PI/4: (D/2 - D/(2√2), -LOBE/2) — lower left
  //   t=PI: (0, 0) — Earth
  //   t=5PI/4: (D/2 - D/(2√2), LOBE/2) — upper left
  //   t=3PI/2: (D/2, 0) — center crossing again
  //   t=7PI/4: (D/2 + D/(2√2), -LOBE/2) — lower right
  //   t=2PI: (D, 0) — Moon again
  //
  // So the full path goes: Moon → upper-right → crossing → lower-left →
  //   Earth → upper-left → crossing → lower-right → Moon
  //
  // That's a figure-8 but it loops Earth AND Moon, visiting each TWICE.
  // For Artemis, we only want HALF of this (one traversal):
  //   Earth → upper-right → Moon → lower-left → Earth
  //
  // That's from t=PI to t=2PI:
  //   t=PI: (0,0) Earth
  //   t=5PI/4: upper-left lobe
  //   t=3PI/2: crossing
  //   t=7PI/4: lower-right lobe
  //   t=2PI: (D,0) Moon
  //
  // No wait, that still goes through both lobes on the same side...
  //
  // The Artemis figure-8 path (one traversal, not the full lemniscate):
  //   Earth → +Y arc → Moon (far side) → -Y arc → Earth
  //
  // This is NOT a lemniscate at all! It's simpler: two separate arcs
  // sharing endpoints at Earth and Moon, one above (+Y) and one below (-Y).
  //
  // Let me just construct it directly with clean control points.

  // The outbound arc: from Earth to Moon through +Y
  // The return arc: from Moon to Earth through -Y
  // These two arcs cross somewhere in the middle, creating the "8" shape.
  //
  // Each arc is a half-ellipse in the XY plane:
  //   Outbound: x from 0 to D, y = LOBE * sin(PI * x/D)
  //   Return:   x from D to 0, y = -LOBE * sin(PI * x/D)
  //
  // The flyby connects them: at x≈D, the path transitions from y>0 to y<0
  // by swinging around the far side of the Moon.

  // ── Outbound: Earth to near Moon, through +Y ──
  const N_OUT = 180;
  for (let i = 1; i <= N_OUT; i++) {
    const f = i / N_OUT;
    const x = f * D;
    const y = LOBE * Math.sin(Math.PI * f);
    // Slight Z from inclination
    const z = y * Math.sin(INCL) * (1 - f) * 0.1;
    pts.push(new THREE.Vector3(x, y, z));
  }

  // ── Flyby: tight arc around far side of Moon ──
  // At this point we're at (D, 0). The flyby curves around the
  // far side (+X from Moon) and comes back to (D, 0) on the -Y side.
  //
  // We use a semicircle of radius FLYBY_PERI centered on the Moon.
  // Entry from -Y side (approaching from +Y, the path is at y≈0 here)
  // going around through +X (far side) to +Y side... wait.
  //
  // Actually: the outbound arc ends at (D, ~0) approaching from -X.
  // The spacecraft needs to swing AROUND the Moon's far side.
  // In moon-centered coords: approach from -X, go around +X, depart -X.
  // That's a semicircle from angle PI to -PI (or equivalently, PI to -PI
  // going through 0).
  //
  // But for the figure-8, we need the flyby to flip Y:
  // enter from +Y side, exit to -Y side.
  // So the semicircle goes from angle PI/2 (top, +Y) through 0 (far side)
  // to -PI/2 (bottom, -Y).
  //
  // The issue is that our outbound ends at (D, 0+epsilon) and the flyby
  // semicircle starts at (D, FLYBY_PERI). There's a gap.
  //
  // Solution: end the outbound slightly before D, and have the flyby
  // arc include approach/departure sections.

  // Actually, let me rethink. The outbound sin lobe has y=0 at f=1 (x=D).
  // But I need y = +something at x=D to smoothly enter the flyby.
  // Better: don't go all the way to x=D in the outbound.
  // Stop at x = D - some offset, where y is still positive,
  // then the flyby arc picks up from there.

  // Let me redo this cleanly: outbound goes to 95% of D,
  // flyby handles the last 5% + turnaround + first 5% of return,
  // return picks up from 95% back to 0.

  // Clear and redo
  // ... actually let me just do it properly from scratch.

  // I'll keep the LEO orbit, then add a clean figure-8.

  // Remove the outbound points we just added
  while (pts.length > N_LEO + 1) pts.pop();

  // ── OUTBOUND: Earth → near Moon, upper lobe (+Y) ──
  // Go from x=0 to x=D-FLYBY_PERI (stop before Moon)
  // y follows a sin lobe
  const xStop = D - FLYBY_PERI * 2; // stop 2*periapsis away from Moon center
  const N2 = 180;
  for (let i = 1; i <= N2; i++) {
    const f = i / N2;
    const x = f * xStop;
    // y: sin lobe, but at f=1 we want y=FLYBY_PERI (to match flyby entry)
    // sin(PI*f) = 0 at f=1, so we need to modify
    // Use: y = LOBE * sin(PI*f*0.95) which doesn't reach 0 at f=1
    const yLobe = LOBE * Math.sin(Math.PI * f * 0.92);
    // Blend to FLYBY_PERI at end
    const endBlend = Math.pow(f, 12);
    const y = yLobe * (1 - endBlend) + FLYBY_PERI * endBlend;
    const z = y * Math.sin(INCL) * (1 - f) * 0.1;
    pts.push(new THREE.Vector3(x, y, z));
  }

  // ── FLYBY: arc around Moon far side ──
  // Start from (xStop, ~FLYBY_PERI) → arc around far side → (xStop, ~-FLYBY_PERI)
  // In Moon-centered coords: from angle ~acos((xStop-D)/FLYBY_PERI)... complex.
  //
  // Simpler: use a semicircle centered on Moon, from angle ~PI/2 to ~-PI/2
  // (above to below), going through 0 (far side).
  const N3 = 60;
  for (let i = 0; i <= N3; i++) {
    const f = i / N3;
    // Angle from PI/2 (top) to -PI/2 (bottom)
    const angle = Math.PI / 2 - Math.PI * f;
    const x = D + FLYBY_PERI * Math.cos(angle);
    const y = FLYBY_PERI * Math.sin(angle);
    const z = 0;
    pts.push(new THREE.Vector3(x, y, z));
  }

  // ── RETURN: near Moon → Earth, lower lobe (-Y) ──
  const N4 = 180;
  for (let i = 1; i <= N4; i++) {
    const f = i / N4;
    const x = xStop * (1 - f);
    const yLobe = -LOBE * Math.sin(Math.PI * f * 0.92);
    const startBlend = Math.pow(1 - f, 12);
    const y = yLobe * (1 - startBlend) + (-FLYBY_PERI) * startBlend;
    const z = y * Math.sin(INCL) * f * 0.06;
    pts.push(new THREE.Vector3(x, y, z));
  }

  // ── SPLASHDOWN ──
  pts.push(new THREE.Vector3(-0.2, -EARTH_RADIUS * 0.98, -0.1));

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
