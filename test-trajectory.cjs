/**
 * Artemis II trajectory analysis & test
 * 
 * GOAL: Figure out the correct shape, then verify it.
 * 
 * COORDINATE SYSTEM (synodic/rotating frame):
 *   - Earth at origin (0, 0)
 *   - Moon fixed at (40, 0)   [X-axis = Earth-Moon line]
 *   - Z-axis = perpendicular to Earth-Moon line (in orbital plane)
 *   - Y-axis = "north" (we mostly ignore for 2D shape analysis)
 *
 * WHAT THE TRAJECTORY SHOULD LOOK LIKE (from NASA animations):
 * 
 * Phase A: Earth orbits
 *   - LEO: small circle around (0,0), radius ~1.08
 *   - HEO: ellipse around (0,0), perigee ~1.3, apogee ~4
 *   - Smooth spiral from LEO to HEO
 *
 * Phase B: TLI departure
 *   - At HEO perigee, engine fires
 *   - Spacecraft exits along the orbit's tangent direction
 *   - This tangent happens to point roughly toward the Moon
 *   - The departure is smooth — it's just the orbit opening up
 *
 * Phase C: Earth-Moon transit (outbound)
 *   - Nearly straight line from Earth toward Moon
 *   - Very slight curve (not noticeable at this scale)
 *
 * Phase D: Lunar flyby
 *   - Smooth arc around the Moon's far side
 *   - Closest approach behind the Moon
 *   - Enters from one side, exits the other (gravity slingshot)
 *
 * Phase E: Moon-Earth transit (return)
 *   - Nearly straight line from Moon back toward Earth
 *   - On the OPPOSITE side of the Earth-Moon line from outbound
 *   - This is what creates the figure-8 crossing
 *
 * Phase F: Re-entry
 *   - Arrives near Earth, enters atmosphere
 *
 * KEY INSIGHT ABOUT THE FIGURE-8:
 *   The "8" is NOT symmetric. Looking at NASA animations:
 *   - The outbound path is slightly above (+Z) the center line
 *   - The return path is slightly below (-Z) the center line  
 *   - They cross somewhere between Earth and Moon
 *   - The Moon's lobe is a SMALL loop (the flyby)
 *   - The Earth's "lobe" is just where the paths converge back
 *
 *   It's more like a teardrop/tadpole than a symmetric ∞.
 *   The crossing angle is very shallow.
 */

const THREE = require('three');

// === Setup ===
const EARTH_RADIUS = 1;
const MOON_DISTANCE = 40;
const HEO_APOGEE = 4;
const INCL = (28.5 * Math.PI) / 180;

const e1 = new THREE.Vector3(1, 0, 0);
const e2 = new THREE.Vector3(0, Math.sin(INCL), Math.cos(INCL));

function orbitPoint(angle, radius, _ecc) {
  const r = radius; // for circular, ignore ecc
  return e1.clone().multiplyScalar(Math.cos(angle) * r)
    .add(e2.clone().multiplyScalar(Math.sin(angle) * r));
}

// === Build the trajectory step by step ===
const points = [];
const labels = [];

function addPt(pt, label) {
  points.push(pt);
  labels.push(label);
}

// --- Phase A: Earth orbits (spiral) ---
const launchAngle = 0;
addPt(orbitPoint(launchAngle - 0.1, EARTH_RADIUS * 0.98, 0), 'launch');

const leoR = EARTH_RADIUS + 0.08;
const heoPerigee = EARTH_RADIUS + 0.3;
const heoSM = (heoPerigee + HEO_APOGEE) / 2;
const heoEcc = (HEO_APOGEE - heoPerigee) / (HEO_APOGEE + heoPerigee);

const totalSpiral = 28;
const totalAngle = Math.PI * 4;
for (let i = 0; i < totalSpiral; i++) {
  const frac = i / (totalSpiral - 1);
  const angle = launchAngle + frac * totalAngle;
  const tc = 0.40, tw = 0.15;
  const blend = 1 / (1 + Math.exp(-(frac - tc) / tw));
  const heoLocalAngle = (frac - tc) * totalAngle;
  const rHeo = heoSM * (1 - heoEcc * heoEcc) / (1 + heoEcc * Math.cos(heoLocalAngle));
  const r = leoR + (rHeo - leoR) * blend;
  addPt(orbitPoint(angle, r, 0), `spiral-${i}`);
}

const lastSpiralPt = points[points.length - 1];
const lastAngle = launchAngle + totalAngle;
console.log('\n=== SPIRAL END ===');
console.log(`Last spiral point: (${lastSpiralPt.x.toFixed(2)}, ${lastSpiralPt.y.toFixed(2)}, ${lastSpiralPt.z.toFixed(2)})`);
console.log(`Last angle: ${(lastAngle * 180 / Math.PI).toFixed(0)}° = ${(lastAngle / Math.PI).toFixed(1)}π`);

// Tangent at last spiral point
const tangent = new THREE.Vector3(
  -Math.sin(lastAngle),
  Math.sin(INCL) * Math.cos(lastAngle),
  Math.cos(INCL) * Math.cos(lastAngle),
).normalize();
console.log(`Tangent direction: (${tangent.x.toFixed(2)}, ${tangent.y.toFixed(2)}, ${tangent.z.toFixed(2)})`);

// Moon position
const moonPos = new THREE.Vector3(MOON_DISTANCE, 0, 0);
const toMoonDir = moonPos.clone().sub(lastSpiralPt).normalize();
console.log(`Direction to Moon: (${toMoonDir.x.toFixed(2)}, ${toMoonDir.y.toFixed(2)}, ${toMoonDir.z.toFixed(2)})`);

const tangentMoonAngle = Math.acos(tangent.dot(toMoonDir)) * 180 / Math.PI;
console.log(`Angle between tangent and Moon direction: ${tangentMoonAngle.toFixed(1)}°`);

// --- Phase B+C: The key question ---
// Where does the tangent point? If it's close to Moon direction (<30°),
// we can just let the orbit "open up" naturally.
// If it's far from Moon direction, we need a deliberate turn.

console.log('\n=== PHASE B+C ANALYSIS ===');
console.log('The spiral ends near Earth. The tangent direction tells us');
console.log('where TLI naturally sends the spacecraft.');
console.log('');

// Project everything to 2D (X, Z) for figure-8 analysis
console.log('=== 2D PROJECTION (top view, X=toward Moon, Z=lateral) ===');
console.log(`Last spiral: X=${lastSpiralPt.x.toFixed(2)}, Z=${lastSpiralPt.z.toFixed(2)}`);
console.log(`Tangent 2D: X=${tangent.x.toFixed(2)}, Z=${tangent.z.toFixed(2)}`);

// For the figure-8:
// Outbound should go from Earth area toward Moon with slight +Z offset
// Return should come back from Moon with slight -Z offset
// They cross in the middle

// The SIMPLEST approach: 
// 1. From spiral end, the TLI sends us along the tangent
// 2. We arrive near the Moon
// 3. Flyby loops around the Moon's far side (small circle/arc)
// 4. We return on a slightly different angle (creating the X crossing)
// 5. Back to Earth

// What controls the figure-8 offset?
// In the rotating frame, the Coriolis force creates the lateral offset.
// The outbound path curves slightly to one side, the return curves to the other.

console.log('\n=== PROPOSED APPROACH ===');
console.log('1. Spiral → last point is the departure');
console.log('2. TLI just extends the trajectory — no hard transition needed');
console.log('3. Place 2-3 outbound waypoints along tangent direction, gradually curving toward Moon');
console.log('4. Flyby: semicircle around Moon (8+ points)');
console.log('5. Return: 2-3 waypoints from Moon back to Earth, slight -Z offset');
console.log('6. Re-entry');
console.log('');
console.log('The crossing happens because:');
console.log('  - Spiral departure tangent has some +Z component');
console.log('  - Return path aims back at Earth from a different angle (-Z)');
console.log('  - Natural Coriolis in rotating frame');

// Test: simulate where tangent-following points would go
console.log('\n=== TANGENT PROJECTIONS ===');
for (const dist of [5, 10, 20, 30, 38]) {
  const pt = lastSpiralPt.clone().add(tangent.clone().multiplyScalar(dist));
  console.log(`  dist=${dist}: X=${pt.x.toFixed(1)}, Z=${pt.z.toFixed(1)} (Moon at X=${MOON_DISTANCE})`);
}
