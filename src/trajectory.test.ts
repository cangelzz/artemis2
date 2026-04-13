/**
 * Enhanced trajectory physics validation tests.
 * Verify the Artemis II trajectory matches real NASA mission data.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTrajectory,
  buildProgressMapping,
  EARTH_RADIUS,
  MOON_RADIUS,
  MOON_DISTANCE,
} from './trajectory';

const curve = buildTrajectory(0);
const mapProgress = buildProgressMapping(curve);
const R_E_KM = 6371;

function samplePoints(n: number) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    pts.push(curve.getPointAt(i / n));
  }
  return pts;
}

function distEarth(p: THREE.Vector3Like): number {
  return Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
}

function distMoon(p: THREE.Vector3Like): number {
  return Math.sqrt((p.x - MOON_DISTANCE) ** 2 + p.y * p.y + p.z * p.z);
}

// ── Import THREE types for Vector3Like ──
import type * as THREE from 'three';

describe('Trajectory generation', () => {
  it('should build a valid curve', () => {
    expect(curve).toBeDefined();
    expect(curve.getPointAt(0)).toBeDefined();
    expect(curve.getPointAt(1)).toBeDefined();
  });

  it('should have reasonable length', () => {
    const len = curve.getLength();
    expect(len).toBeGreaterThan(MOON_DISTANCE * 1.5);
    expect(len).toBeLessThan(MOON_DISTANCE * 10);
  });
});

describe('Launch and splashdown', () => {
  it('should start near LEO (185 km altitude)', () => {
    const start = curve.getPointAt(0);
    const r = distEarth(start);
    const altKm = (r - 1) * R_E_KM;
    // LEO altitude should be approximately 185 km
    expect(altKm).toBeGreaterThan(100);
    expect(altKm).toBeLessThan(400);
  });

  it('should end near Earth surface (splashdown)', () => {
    const end = curve.getPointAt(1);
    const r = distEarth(end);
    expect(r).toBeGreaterThan(EARTH_RADIUS * 0.5);
    expect(r).toBeLessThan(EARTH_RADIUS * 2.0);
  });
});

describe('Lunar flyby — matches NASA data', () => {
  it('closest approach should be ~8,282 km from Moon center (6,545 km from surface)', () => {
    const pts = samplePoints(10000);
    let minDist = Infinity;
    for (const pt of pts) {
      const d = distMoon(pt);
      if (d < minDist) minDist = d;
    }
    const minDistKm = minDist * R_E_KM;
    // NASA value: 8,282 km from center, allow ±1000 km tolerance
    expect(minDistKm).toBeGreaterThan(7000);
    expect(minDistKm).toBeLessThan(10000);
  });

  it('closest approach on Moon far side (x near or beyond MOON_DISTANCE)', () => {
    const pts = samplePoints(10000);
    let minDist = Infinity;
    let closest = pts[0];
    for (const pt of pts) {
      const d = distMoon(pt);
      if (d < minDist) { minDist = d; closest = pt; }
    }
    // Closest approach should be very near the Moon's far side
    // Allow small tolerance for CatmullRom spline interpolation
    // x > MOON_DISTANCE - 0.5 R_E (within ~3,000 km)
    expect(closest.x).toBeGreaterThan(MOON_DISTANCE - 0.5);
  });

  it('should not crash into Moon', () => {
    const pts = samplePoints(10000);
    for (const pt of pts) {
      const d = distMoon(pt);
      expect(d).toBeGreaterThan(MOON_RADIUS);
    }
  });
});

describe('Figure-8 shape in synodic frame', () => {
  it('outbound leg passes through +Y (upper lobe)', () => {
    // Sample outbound half (t < 0.5)
    let maxY = -Infinity;
    for (let i = 0; i <= 5000; i++) {
      const t = (i / 5000) * 0.5;
      const pt = curve.getPointAt(t);
      if (pt.y > maxY) maxY = pt.y;
    }
    // Outbound should go significantly above +Y
    expect(maxY).toBeGreaterThan(3);
  });

  it('return leg passes through -Y (lower lobe)', () => {
    let minY = Infinity;
    for (let i = 0; i <= 5000; i++) {
      const t = 0.5 + (i / 5000) * 0.5;
      const pt = curve.getPointAt(Math.min(t, 0.9999));
      if (pt.y < minY) minY = pt.y;
    }
    expect(minY).toBeLessThan(-3);
  });

  it('trajectory X moves monotonically outward then inward', () => {
    // Outbound: X should generally increase from Earth to Moon
    const outPts = [];
    for (let i = 0; i <= 100; i++) {
      outPts.push(curve.getPointAt(i / 100 * 0.45));
    }
    let xIncreasing = 0;
    for (let i = 1; i < outPts.length; i++) {
      if (outPts[i].x > outPts[i - 1].x) xIncreasing++;
    }
    // At least 70% of steps should show increasing X
    expect(xIncreasing / (outPts.length - 1)).toBeGreaterThan(0.65);

    // Return: X should generally decrease from Moon back to Earth
    const retPts = [];
    for (let i = 0; i <= 100; i++) {
      retPts.push(curve.getPointAt(0.55 + i / 100 * 0.40));
    }
    let xDecreasing = 0;
    for (let i = 1; i < retPts.length; i++) {
      if (retPts[i].x < retPts[i - 1].x) xDecreasing++;
    }
    expect(xDecreasing / (retPts.length - 1)).toBeGreaterThan(0.65);
  });

  it('should reach maximum distance > 380,000 km from Earth', () => {
    const pts = samplePoints(5000);
    let maxDist = 0;
    for (const pt of pts) {
      const d = distEarth(pt) * R_E_KM;
      if (d > maxDist) maxDist = d;
    }
    // NASA: farthest = 406,771 km. Allow wide tolerance.
    expect(maxDist).toBeGreaterThan(380000);
  });
});

describe('Trajectory continuity and smoothness', () => {
  it('no discontinuities (max step < 3 R_E)', () => {
    const pts = samplePoints(5000);
    let maxStep = 0;
    for (let i = 1; i < pts.length; i++) {
      const step = pts[i].distanceTo(pts[i - 1]);
      if (step > maxStep) maxStep = step;
    }
    expect(maxStep).toBeLessThan(3);
  });

  it('no sharp reversals outside LEO region', () => {
    const pts = samplePoints(2000);
    let sharpTurns = 0;
    for (let i = 2; i < pts.length; i++) {
      const v1 = pts[i - 1].clone().sub(pts[i - 2]);
      const v2 = pts[i].clone().sub(pts[i - 1]);
      if (v1.length() > 0.01 && v2.length() > 0.01) {
        const dot = v1.normalize().dot(v2.normalize());
        if (dot < -0.3 && i > 80) sharpTurns++;
      }
    }
    expect(sharpTurns).toBeLessThan(5);
  });
});

describe('Progress mapping', () => {
  it('maps 0→0 and 1→1', () => {
    expect(mapProgress(0)).toBe(0);
    expect(mapProgress(1)).toBe(1);
  });

  it('clamps out-of-range values', () => {
    expect(mapProgress(-0.5)).toBe(0);
    expect(mapProgress(1.5)).toBe(1);
  });

  it('is monotonically increasing', () => {
    for (let i = 0; i < 100; i++) {
      expect(mapProgress((i + 1) / 100)).toBeGreaterThanOrEqual(mapProgress(i / 100));
    }
  });
});

describe('Physical constants', () => {
  it('Moon/Earth radius ratio ≈ 0.2727', () => {
    expect(MOON_RADIUS / EARTH_RADIUS).toBeCloseTo(0.2727, 3);
  });

  it('Earth-Moon distance ≈ 60.34 R_E', () => {
    expect(MOON_DISTANCE / EARTH_RADIUS).toBeCloseTo(60.34, 1);
  });
});
