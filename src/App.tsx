import { useState, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Html, Line } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import {
  EARTH_RADIUS,
  MISSION_DURATION,
  CREW,
  LAUNCH_DATE,
  getTrajectoryConfig,
  type TrajectoryVersion,
  type TrajectoryConfig,
} from './trajectory';

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const EARTH_TILT = (23.44 * Math.PI) / 180;
type FocusTarget = 'earth' | 'moon' | 'ship';

/* ================================================================== */
/*  Earth                                                              */
/* ================================================================== */

function Earth({ progress }: { progress: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    meshRef.current.rotation.y = progress * 10 * Math.PI * 2;
  });

  return (
    <group position={[0, 0, 0]} rotation={[0, 0, EARTH_TILT]}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshStandardMaterial color="#2264aa" roughness={0.8} />
        <mesh>
          <sphereGeometry args={[EARTH_RADIUS * 1.02, 64, 64]} />
          <meshStandardMaterial color="#88ccff" transparent opacity={0.15} side={THREE.BackSide} />
        </mesh>
        <mesh rotation={[0, 1.2, 0.2]}>
          <sphereGeometry args={[EARTH_RADIUS * 1.001, 32, 32]} />
          <meshStandardMaterial color="#33884a" roughness={0.9} transparent opacity={0.45} />
        </mesh>
      </mesh>
      <Line
        points={[
          new THREE.Vector3(0, -EARTH_RADIUS * 1.5, 0),
          new THREE.Vector3(0, EARTH_RADIUS * 1.5, 0),
        ]}
        color="#4466aa" lineWidth={0.5} transparent opacity={0.3}
      />
      <Html position={[0, EARTH_RADIUS + 0.4, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{ color: '#88ccff', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>Earth</div>
      </Html>
    </group>
  );
}

/* ================================================================== */
/*  Moon — dynamic position based on moonDistance                       */
/* ================================================================== */

function Moon({ angle, moonDistance, moonRadius }: { angle: number; moonDistance: number; moonRadius: number }) {
  const pos: [number, number, number] = [
    Math.cos(angle) * moonDistance, 0, Math.sin(angle) * moonDistance,
  ];
  return (
    <mesh position={pos}>
      <sphereGeometry args={[moonRadius, 32, 32]} />
      <meshStandardMaterial color="#ccccbb" roughness={0.9} />
      <Html position={[0, moonRadius + 0.25, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{ color: '#ccccbb', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>Moon</div>
      </Html>
    </mesh>
  );
}

/* ================================================================== */
/*  Moon orbit ring                                                    */
/* ================================================================== */

function MoonOrbit({ moonDistance }: { moonDistance: number }) {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * moonDistance, 0, Math.sin(a) * moonDistance));
    }
    return pts;
  }, [moonDistance]);

  return <Line points={points} color="#334455" lineWidth={0.5} transparent opacity={0.4} />;
}

/* ================================================================== */
/*  Sun                                                                */
/* ================================================================== */

function Sun() {
  return (
    <group>
      <directionalLight position={[200, 60, 120]} intensity={2} color="#fff5e0" />
      <ambientLight intensity={0.12} />
      <mesh position={[200, 60, 120]}>
        <sphereGeometry args={[5, 16, 16]} />
        <meshBasicMaterial color="#ffee88" />
      </mesh>
    </group>
  );
}

/* ================================================================== */
/*  Stars                                                              */
/* ================================================================== */

function StarField() {
  return <Stars radius={600} depth={200} count={8000} factor={4} saturation={0} fade speed={0.5} />;
}

/* ================================================================== */
/*  Distant planets                                                    */
/* ================================================================== */

function DistantBodies() {
  const bodies = useMemo(
    () => [
      { pos: [250, 40, -160] as [number, number, number], r: 2, color: '#cc6633', name: 'Mars' },
      { pos: [-200, -20, 200] as [number, number, number], r: 6, color: '#ddaa55', name: 'Jupiter' },
      { pos: [300, 80, 350] as [number, number, number], r: 5, color: '#ddc87a', name: 'Saturn' },
    ],
    [],
  );
  return (
    <>
      {bodies.map((b) => (
        <mesh key={b.name} position={b.pos}>
          <sphereGeometry args={[b.r, 24, 24]} />
          <meshStandardMaterial color={b.color} roughness={0.7} />
          <Html position={[0, b.r + 0.6, 0]} center style={{ pointerEvents: 'none' }}>
            <div style={{ color: '#999', fontSize: 10, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{b.name}</div>
          </Html>
        </mesh>
      ))}
    </>
  );
}

/* ================================================================== */
/*  Trajectory line                                                    */
/* ================================================================== */

function TrajectoryLine({ curve, mapProgress }: {
  curve: THREE.CatmullRomCurve3;
  mapProgress: (p: number) => number;
}) {
  const { outbound, ret } = useMemo(() => {
    const splitT = mapProgress(0.60);
    const numPts = 3000;
    const outPts: THREE.Vector3[] = [];
    const retPts: THREE.Vector3[] = [];
    for (let i = 0; i <= numPts; i++) {
      const t = i / numPts;
      const pt = curve.getPointAt(t);
      if (t <= splitT) {
        outPts.push(pt);
      } else {
        if (retPts.length === 0) outPts.push(pt);
        retPts.push(pt);
      }
    }
    return { outbound: outPts, ret: retPts };
  }, [curve, mapProgress]);

  return (
    <>
      <Line points={outbound} color="#44cc66" lineWidth={1.5} transparent opacity={0.7} />
      <Line points={ret} color="#4488ff" lineWidth={1.5} transparent opacity={0.7} />
    </>
  );
}

/* ================================================================== */
/*  Spacecraft                                                         */
/* ================================================================== */

function Spacecraft({ curve, progress, mapProgress }: {
  curve: THREE.CatmullRomCurve3;
  progress: number;
  mapProgress: (p: number) => number;
}) {
  const trailRef = useRef<THREE.Vector3[]>([]);
  const curveT = mapProgress(Math.min(Math.max(progress, 0), 1));
  const pos = useMemo(() => curve.getPointAt(curveT), [curve, curveT]);
  const tangent = useMemo(() => curve.getTangentAt(curveT), [curve, curveT]);

  useMemo(() => {
    trailRef.current.push(pos.clone());
    if (trailRef.current.length > 600) trailRef.current.shift();
  }, [pos]);

  const quaternion = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const mat = new THREE.Matrix4().lookAt(new THREE.Vector3(), tangent, up);
    return new THREE.Quaternion().setFromRotationMatrix(mat);
  }, [tangent]);

  return (
    <group>
      <group position={pos} quaternion={quaternion}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.14, 0.22, 12]} />
          <meshStandardMaterial color="#e8e0d0" roughness={0.6} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0, -0.11]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.14, 12]} />
          <meshStandardMaterial color="#332211" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0, -0.33]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.13, 0.3, 12]} />
          <meshStandardMaterial color="#888888" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0, -0.52]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.07, 0.08, 8]} />
          <meshStandardMaterial color="#555555" roughness={0.3} metalness={0.7} />
        </mesh>
        {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle, i) => (
          <mesh key={i} position={[Math.cos(angle) * 0.35, Math.sin(angle) * 0.35, -0.3]} rotation={[0, 0, angle]}>
            <boxGeometry args={[0.35, 0.08, 0.005]} />
            <meshStandardMaterial color="#1a2244" roughness={0.4} metalness={0.6} emissive="#112244" emissiveIntensity={0.15} />
          </mesh>
        ))}
        <mesh position={[0, 0, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.135, 0.135, 0.03, 12]} />
          <meshStandardMaterial color="#ccaa44" roughness={0.3} metalness={0.8} />
        </mesh>
      </group>
      <pointLight position={pos} color="#ff6622" intensity={2} distance={5} />
      <Html position={[pos.x, pos.y + 0.5, pos.z]} center style={{ pointerEvents: 'none' }}>
        <div style={{ color: '#ff8844', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap', textShadow: '0 0 6px #ff4400' }}>
          Orion "Integrity"
        </div>
      </Html>
      {trailRef.current.length > 2 && (
        <Line points={trailRef.current} color="#ff4400" lineWidth={1} transparent opacity={0.35} />
      )}
    </group>
  );
}

/* ================================================================== */
/*  Camera controller                                                  */
/* ================================================================== */

function CameraController({ focusTarget, moonDistance, shipPos }: {
  focusTarget: FocusTarget;
  moonDistance: number;
  shipPos: THREE.Vector3;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null!);
  const targetVec = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    let desired: THREE.Vector3;
    switch (focusTarget) {
      case 'moon':
        desired = new THREE.Vector3(moonDistance, 0, 0);
        break;
      case 'ship':
        desired = shipPos.clone();
        break;
      default:
        desired = new THREE.Vector3(0, 0, 0);
        break;
    }
    targetVec.current.lerp(desired, 1 - Math.pow(0.01, delta));
    controls.target.copy(targetVec.current);
    controls.update();
  });

  return (
    <OrbitControls ref={controlsRef} enablePan enableZoom enableRotate minDistance={0.5} maxDistance={500} zoomSpeed={1.2} />
  );
}

/* ================================================================== */
/*  Scene                                                              */
/* ================================================================== */

function Scene({ playing, speed, progress, setProgress, focusTarget, config }: {
  playing: boolean;
  speed: number;
  progress: number;
  setProgress: (p: number | ((prev: number) => number)) => void;
  focusTarget: FocusTarget;
  config: TrajectoryConfig;
}) {
  const moonAngle = 0;
  const curve = useMemo(() => config.buildTrajectory(0), [config]);
  const mapProgress = useMemo(() => config.buildProgressMapping(curve), [config, curve]);

  const curveT = mapProgress(Math.min(Math.max(progress, 0), 1));
  const shipPos = useMemo(() => curve.getPointAt(curveT), [curve, curveT]);

  useFrame((_, delta) => {
    if (!playing) return;
    setProgress((prev: number) => {
      const next = prev + (delta * speed) / MISSION_DURATION;
      return Math.min(next, 1);
    });
  });

  return (
    <>
      <Sun />
      <StarField />
      <Earth progress={progress} />
      <MoonOrbit moonDistance={config.moonDistance} />
      <Moon angle={moonAngle} moonDistance={config.moonDistance} moonRadius={config.moonRadius} />
      <DistantBodies />
      <TrajectoryLine curve={curve} mapProgress={mapProgress} />
      <Spacecraft curve={curve} progress={progress} mapProgress={mapProgress} />
      <CameraController focusTarget={focusTarget} moonDistance={config.moonDistance} shipPos={shipPos} />
    </>
  );
}

/* ================================================================== */
/*  Styles                                                             */
/* ================================================================== */

const controlStyle: React.CSSProperties = {
  position: 'absolute', bottom: 0, left: 0, right: 0,
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '12px 20px',
  background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
  color: '#ddd', fontFamily: 'monospace', fontSize: 13,
  zIndex: 10, userSelect: 'none',
};

const btnStyle: React.CSSProperties = {
  background: 'none', border: '1px solid #666', color: '#eee',
  borderRadius: 4, padding: '4px 14px', cursor: 'pointer',
  fontFamily: 'monospace', fontSize: 13,
};

const infoPanelStyle: React.CSSProperties = {
  position: 'absolute', top: 12, left: 12,
  color: '#aac', fontFamily: 'monospace', fontSize: 12,
  lineHeight: '1.7', zIndex: 10, pointerEvents: 'none',
};

/* ================================================================== */
/*  App                                                                */
/* ================================================================== */

export default function App() {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [focusTarget, setFocusTarget] = useState<FocusTarget>('earth');
  const [version, setVersion] = useState<TrajectoryVersion>('v3');

  const config = useMemo(() => getTrajectoryConfig(version), [version]);

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);
  const reset = useCallback(() => {
    setProgress(0);
    setPlaying(false);
    setFocusTarget('earth');
  }, []);
  const stepForward = useCallback(() => setProgress((p) => Math.min(p + 0.005, 1)), []);
  const stepBackward = useCallback(() => setProgress((p) => Math.max(p - 0.005, 0)), []);

  const switchVersion = useCallback((v: TrajectoryVersion) => {
    setVersion(v);
    setProgress(0);
    setPlaying(false);
  }, []);

  const missionDay = (progress * 10).toFixed(1);
  const missionDate = new Date(LAUNCH_DATE.getTime() + progress * 10 * 24 * 3600 * 1000);
  const dateStr = missionDate.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', position: 'relative' }}>
      {/* Info panel */}
      <div style={infoPanelStyle}>
        <div style={{ fontSize: 16, color: '#ff8844', marginBottom: 4 }}>
          ARTEMIS II — Orion "Integrity"
        </div>
        <div>Crewed Lunar Free-Return · SLS Block 1</div>
        <div style={{ marginTop: 4, fontSize: 11, color: '#88ff88' }}>
          {config.label}
        </div>
        <div style={{ marginTop: 6 }}>
          Mission Day: <span style={{ color: '#fff' }}>{missionDay}</span> / 10
        </div>
        <div>
          Date: <span style={{ color: '#fff' }}>{dateStr}</span>
        </div>
        <div>Phase: <span style={{ color: '#ff8844' }}>{config.phaseName(progress)}</span></div>
        <div style={{ marginTop: 6, fontSize: 10, color: '#778' }}>
          Crew: {CREW.map(c => c.name).join(' · ')}
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: '#667' }}>
          Drag to rotate · Scroll to zoom · Right-drag to pan
        </div>
      </div>

      {/* Right panel: Focus + Version controls */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        display: 'flex', flexDirection: 'column', gap: 6,
        zIndex: 10, fontFamily: 'monospace', fontSize: 11,
      }}>
        {/* Focus controls */}
        <div style={{ color: '#888', marginBottom: 2 }}>Focus:</div>
        {([
          { key: 'earth' as FocusTarget, label: '🌍 Earth', color: '#88ccff' },
          { key: 'moon' as FocusTarget, label: '🌙 Moon', color: '#ccccbb' },
          { key: 'ship' as FocusTarget, label: '🚀 Artemis II', color: '#ff8844' },
        ]).map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setFocusTarget(key)}
            style={{
              ...btnStyle, fontSize: 11, padding: '3px 10px', textAlign: 'left',
              background: focusTarget === key ? 'rgba(255,255,255,0.12)' : 'none',
              borderColor: focusTarget === key ? color : '#555',
              color: focusTarget === key ? color : '#aaa',
            }}
          >
            {label}
          </button>
        ))}

        {/* Version switcher */}
        <div style={{ color: '#888', marginTop: 10, marginBottom: 2 }}>Trajectory:</div>
        {([
          { key: 'v1' as TrajectoryVersion, label: 'V1 Original', color: '#ffaa44' },
          { key: 'v2' as TrajectoryVersion, label: 'V2 Parametric', color: '#44aaff' },
          { key: 'v3' as TrajectoryVersion, label: 'V3 CR3BP', color: '#44ff88' },
        ]).map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => switchVersion(key)}
            style={{
              ...btnStyle, fontSize: 11, padding: '3px 10px', textAlign: 'left',
              background: version === key ? 'rgba(255,255,255,0.12)' : 'none',
              borderColor: version === key ? color : '#555',
              color: version === key ? color : '#aaa',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [10, 15, 30], fov: 55, near: 0.1, far: 1500 }}
        gl={{ antialias: true, alpha: false }}
        style={{ width: '100%', height: '100%' }}
      >
        <Scene playing={playing} speed={speed} progress={progress} setProgress={setProgress} focusTarget={focusTarget} config={config} />
      </Canvas>

      {/* Playback controls */}
      <div style={controlStyle}>
        <button style={btnStyle} onClick={stepBackward} title="Step back">⏪</button>
        <button style={btnStyle} onClick={togglePlay}>{playing ? '⏸ Pause' : '▶ Play'}</button>
        <button style={btnStyle} onClick={stepForward} title="Step forward">⏩</button>
        <button style={btnStyle} onClick={reset}>⏮ Reset</button>

        <span style={{ color: '#888' }}>Speed:</span>
        {[0.25, 0.5, 1, 2, 4].map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            style={{
              ...btnStyle,
              background: speed === s ? '#ff6622' : 'none',
              color: speed === s ? '#000' : '#eee',
              borderColor: speed === s ? '#ff6622' : '#666',
            }}
          >
            {s}×
          </button>
        ))}

        <input
          type="range" min={0} max={1} step={0.001}
          value={progress}
          onChange={(e) => setProgress(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: '#ff6622', cursor: 'pointer' }}
        />
        <span style={{ minWidth: 60, textAlign: 'right' }}>{(progress * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}
