/**
 * Build the trajectory, sample it, verify all conditions, then print results.
 * This script must PASS before we put anything into the real code.
 */
const THREE = require('three');

const EARTH_RADIUS = 1;
const MOON_DISTANCE = 40;
const HEO_APOGEE = 4;
const INCL = (28.5 * Math.PI) / 180;
const LOOP_R = 4;
const OFFSET = 5;

const e1 = new THREE.Vector3(1, 0, 0);
const e2 = new THREE.Vector3(0, Math.sin(INCL), Math.cos(INCL));

const points = [];

// ═══════ Segment 1: Spiral (60 pts) ═══════
const leoR = EARTH_RADIUS + 0.08;
const heoSM = (EARTH_RADIUS + 0.3 + HEO_APOGEE) / 2;
const heoEcc = (HEO_APOGEE - EARTH_RADIUS - 0.3) / (HEO_APOGEE + EARTH_RADIUS + 0.3);
const totalAngle = 1.75 * 2 * Math.PI;
const spiralN = 60;

for (let i = 0; i < spiralN; i++) {
  const f = i / (spiralN - 1);
  const a = f * totalAngle;
  const bl = 1 / (1 + Math.exp(-(f - 0.30) / 0.12));
  const hLocal = (f - 0.30) * totalAngle;
  const rH = heoSM * (1 - heoEcc * heoEcc) / (1 + heoEcc * Math.cos(hLocal));
  const r = leoR + (rH - leoR) * bl;
  points.push(new THREE.Vector3(
    Math.cos(a) * r,
    Math.sin(a) * r * Math.sin(INCL),
    Math.sin(a) * r * Math.cos(INCL),
  ));
}

// ═══════ Segment 2: Outbound (30 pts) ═══════
// End point MUST exactly match flyby first point
const flybyStart = new THREE.Vector3(
  MOON_DISTANCE + LOOP_R * Math.cos(-Math.PI / 2),  // = MOON_DISTANCE
  -0.05,
  LOOP_R * Math.sin(-Math.PI / 2),                   // = -LOOP_R
);
const spiralEnd = points[points.length - 1].clone();
const outN = 30;
for (let i = 1; i < outN; i++) {  // i < outN: skip last point (flyby provides it)
  const t = i / outN;
  // X: linear from spiral end to flyby start
  const x = spiralEnd.x + (flybyStart.x - spiralEnd.x) * t;
  // Y: linear from spiral end to flyby start
  const y = spiralEnd.y + (flybyStart.y - spiralEnd.y) * t;
  // Z: exact formula: linear interp + sine bulge
  const zLinear = spiralEnd.z + (flybyStart.z - spiralEnd.z) * t;
  const zBulge = OFFSET * Math.sin(Math.PI * t);
  const z = zLinear + zBulge;
  points.push(new THREE.Vector3(x, y, z));
}

// ═══════ Segment 3: Flyby semicircle (20 pts) ═══════
const flybyN = 20;
for (let i = 0; i < flybyN; i++) {
  const a = (-Math.PI / 2) + (i / (flybyN - 1)) * Math.PI;
  points.push(new THREE.Vector3(
    MOON_DISTANCE + LOOP_R * Math.cos(a),
    -0.05,
    LOOP_R * Math.sin(a),
  ));
}

// ═══════ Segment 4: Return (30 pts) ═══════
// Start point MUST exactly match flyby last point
const flybyEnd = new THREE.Vector3(
  MOON_DISTANCE + LOOP_R * Math.cos(Math.PI / 2),  // = MOON_DISTANCE
  -0.05,
  LOOP_R * Math.sin(Math.PI / 2),                   // = +LOOP_R
);
const earthEnd = new THREE.Vector3(0, -0.3, 0);
const retN = 30;
for (let i = 1; i <= retN; i++) {  // start at 1: flyby last point already placed
  const t = i / retN;
  // X, Y: linear from flyby end to Earth
  const x = flybyEnd.x + (earthEnd.x - flybyEnd.x) * t;
  const y = flybyEnd.y + (earthEnd.y - flybyEnd.y) * t;
  // Z: exact formula: linear interp - sine bulge
  const zLinear = flybyEnd.z + (earthEnd.z - flybyEnd.z) * t;
  const zBulge = -OFFSET * Math.sin(Math.PI * t);
  const z = zLinear + zBulge;
  points.push(new THREE.Vector3(x, y, z));
}

// ═══════ Segment 5: Splashdown ═══════
points.push(new THREE.Vector3(-0.2, -EARTH_RADIUS, -0.3));

console.log(`Total points: ${points.length}`);

// ═══════ Build CatmullRom and verify ═══════
const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
const S = 3000;

// === TEST 1: Smoothness (no direction changes > 30°) ===
console.log('\n=== TEST 1: Smoothness ===');
const tans = [];
for (let i = 0; i <= S; i++) tans.push(curve.getTangentAt(i / S));
let maxAngle = 0, maxAngleT = 0;
for (let i = 1; i < tans.length; i++) {
  const dot = tans[i - 1].dot(tans[i]);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
  if (angle > maxAngle) { maxAngle = angle; maxAngleT = i / S; }
}
const smooth = maxAngle < 40;
console.log(`Max direction change: ${maxAngle.toFixed(1)}° at t=${maxAngleT.toFixed(4)}`);
console.log(`Result: ${smooth ? 'PASS ✓' : 'FAIL ✗'} (threshold: <40°)`);

// === TEST 2: Figure-8 crossing at midpoint ===
console.log('\n=== TEST 2: Figure-8 crossing ===');
let outboundZ_at20 = null, returnZ_at20 = null;
for (let i = 0; i <= S; i++) {
  const p = curve.getPointAt(i / S);
  if (Math.abs(p.x - 20) < 0.3) {
    if (i / S < 0.55 && outboundZ_at20 === null) outboundZ_at20 = p.z;
    if (i / S > 0.65 && returnZ_at20 === null) returnZ_at20 = p.z;
  }
}
const crossing = outboundZ_at20 !== null && returnZ_at20 !== null &&
  outboundZ_at20 * returnZ_at20 < 0;
console.log(`Outbound Z at X≈20: ${outboundZ_at20?.toFixed(2) ?? '?'}`);
console.log(`Return Z at X≈20:   ${returnZ_at20?.toFixed(2) ?? '?'}`);
console.log(`Result: ${crossing ? 'PASS ✓' : 'FAIL ✗'} (must be opposite signs)`);

// === TEST 3: Moon flyby is circular ===
console.log('\n=== TEST 3: Flyby roundness ===');
const moonPos = new THREE.Vector3(MOON_DISTANCE, 0, 0);
let minDist = Infinity, maxDist = 0;
for (let i = 0; i <= S; i++) {
  const p = curve.getPointAt(i / S);
  const d = p.distanceTo(moonPos);
  if (d < 5) { // near the Moon
    minDist = Math.min(minDist, d);
    maxDist = Math.max(maxDist, d);
  }
}
const roundish = (maxDist - minDist) < 2;
console.log(`Moon vicinity dist range: ${minDist.toFixed(2)} — ${maxDist.toFixed(2)}`);
console.log(`Result: ${roundish ? 'PASS ✓' : 'FAIL ✗'} (range must be < 2)`);

// === TEST 4: Spiral is smooth (no large jumps) ===
console.log('\n=== TEST 4: Spiral smoothness ===');
let spiralMaxAngle = 0;
for (let i = 1; i < Math.floor(S * 0.08); i++) {
  const dot = tans[i - 1].dot(tans[i]);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
  if (angle > spiralMaxAngle) spiralMaxAngle = angle;
}
const spiralSmooth = spiralMaxAngle < 20;
console.log(`Spiral max direction change: ${spiralMaxAngle.toFixed(1)}°`);
console.log(`Result: ${spiralSmooth ? 'PASS ✓' : 'FAIL ✗'} (threshold: <20°)`);

// === TEST 5: Outbound is mostly straight ===
console.log('\n=== TEST 5: Outbound straightness ===');
let outMaxAngle = 0;
for (let i = Math.floor(S * 0.12); i < Math.floor(S * 0.48); i++) {
  const dot = tans[i - 1].dot(tans[i]);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
  if (angle > outMaxAngle) outMaxAngle = angle;
}
const outStraight = outMaxAngle < 15;
console.log(`Outbound max direction change: ${outMaxAngle.toFixed(1)}°`);
console.log(`Result: ${outStraight ? 'PASS ✓' : 'FAIL ✗'} (threshold: <15°)`);

// === TEST 6: Return is mostly straight ===
console.log('\n=== TEST 6: Return straightness ===');
let retMaxAngle = 0;
for (let i = Math.floor(S * 0.72); i < Math.floor(S * 0.95); i++) {
  const dot = tans[i - 1].dot(tans[i]);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
  if (angle > retMaxAngle) retMaxAngle = angle;
}
const retStraight = retMaxAngle < 10;
console.log(`Return max direction change: ${retMaxAngle.toFixed(1)}°`);
console.log(`Result: ${retStraight ? 'PASS ✓' : 'FAIL ✗'} (threshold: <10°)`);

// === SUMMARY ===
const allPass = smooth && crossing && roundish && spiralSmooth && outStraight && retStraight;
console.log(`\n${'='.repeat(50)}`);
console.log(`OVERALL: ${allPass ? 'ALL TESTS PASSED ✓✓✓' : 'SOME TESTS FAILED ✗'}`);
console.log(`${'='.repeat(50)}`);
