import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FRONT, MAP, BASES } from '@/game/config';
import { terrainHeight } from '@/game/3d/trenchShape';

// === Deterministic PRNG (fixed seed for stable placement on reset) ==========
let s = 42;
const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
const rr = (a, b) => a + rand() * (b - a);

// === Shared geometries (created once, reused by all instances) ===============
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const scorchGeo = new THREE.CircleGeometry(1, 10); scorchGeo.rotateX(-Math.PI / 2);
const craterGeo = new THREE.RingGeometry(0.6, 1, 12); craterGeo.rotateX(-Math.PI / 2);
const wallGeo = new THREE.BoxGeometry(3, 1.2, 0.3);
const pillarGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.5, 6);
const stackGeo = new THREE.CylinderGeometry(0.35, 0.45, 3.5, 8);
const containerGeo = new THREE.BoxGeometry(2, 1.3, 1.2);
const antennaGeo = new THREE.CylinderGeometry(0.04, 0.06, 2.5, 4);
const towerGeo = new THREE.CylinderGeometry(0.12, 0.18, 5, 6);
const dishGeo = new THREE.SphereGeometry(1.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 3);
const archGeo = new THREE.TorusGeometry(2, 0.2, 6, 12, Math.PI);
const beaconGeo = new THREE.ConeGeometry(0.3, 0.8, 6);
const baseGeo = new THREE.BoxGeometry(1.5, 0.4, 1.5);

// === Shared materials ========================================================
const rockMat = new THREE.MeshStandardMaterial({ color: '#6a5e4a', roughness: 0.9, flatShading: true });
const scorchMat = new THREE.MeshBasicMaterial({ color: '#1a1510', transparent: true, opacity: 0.5, depthWrite: false });
const craterMat = new THREE.MeshBasicMaterial({ color: '#2a2520', transparent: true, opacity: 0.35, depthWrite: false });
const concreteMat = new THREE.MeshStandardMaterial({ color: '#8a867a', roughness: 0.85 });
const metalMat = new THREE.MeshStandardMaterial({ color: '#5a5a5a', roughness: 0.6, metalness: 0.4 });
const darkMat = new THREE.MeshStandardMaterial({ color: '#3a3530', roughness: 0.9 });
const friendlyMat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.7, emissive: '#d97706', emissiveIntensity: 0.15 });
const enemyMat = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.7, emissive: '#dc2626', emissiveIntensity: 0.15 });
const beaconMat = new THREE.MeshStandardMaterial({ color: '#dc2626', emissive: '#dc2626', emissiveIntensity: 0.4 });

// === Placement helpers =======================================================
function isNearBase(x, z, margin = 12) {
  const f = BASES.friendly.position, e = BASES.enemy.position;
  return Math.hypot(x - f[0], z - f[2]) < margin || Math.hypot(x - e[0], z - e[2]) < margin;
}

// === Placement data (deterministic — same positions every mount/reset) ======
function generateMarkings() {
  s = 42;
  const scorch = [], craters = [];
  for (let i = 0; i < 80; i++) {
    const row = FRONT.rows[Math.floor(rand() * FRONT.rows.length)];
    const x = rr(-MAP.HALF * 0.85, MAP.HALF * 0.85);
    const z = row + rr(-12, 12);
    if (isNearBase(x, z, 14)) continue;
    if (Math.abs(terrainHeight(x, z)) > 0.05) continue;
    if (rand() < 0.7)
      scorch.push({ x, y: 0.02, z, scale: rr(0.8, 2.2), rot: rand() * Math.PI });
    else
      craters.push({ x, y: 0.02, z, scale: rr(1.5, 3.0), rot: rand() * Math.PI });
  }
  if (!scorch.length) scorch.push({ x: 0, y: 0.02, z: 0, scale: 0.1, rot: 0 });
  if (!craters.length) craters.push({ x: 0, y: 0.02, z: 0, scale: 0.1, rot: 0 });
  return { scorch, craters };
}

function generateRocks() {
  s = 100;
  const rocks = [];
  // Perimeter zones only — never in the central battlefield
  const zones = [
    { xR: [-149, -138], zR: [-149, 149] },
    { xR: [138, 149], zR: [-149, 149] },
    { xR: [-149, 149], zR: [138, 149] },
    { xR: [-149, 149], zR: [-149, -138] },
  ];
  for (const zone of zones) {
    const clusters = 3 + Math.floor(rand() * 3);
    for (let c = 0; c < clusters; c++) {
      const cx = rr(zone.xR[0], zone.xR[1]), cz = rr(zone.zR[0], zone.zR[1]);
      const count = 3 + Math.floor(rand() * 3);
      for (let r = 0; r < count; r++) {
        rocks.push({
          x: THREE.MathUtils.clamp(cx + rr(-3, 3), -149, 149),
          z: THREE.MathUtils.clamp(cz + rr(-3, 3), -149, 149),
          scale: rr(0.4, 1.5),
          rotX: rand() * Math.PI, rotY: rand() * Math.PI,
        });
      }
    }
  }
  if (!rocks.length) rocks.push({ x: 0, z: 0, scale: 0.1, rotX: 0, rotY: 0 });
  return rocks;
}

function generateStructures() {
  s = 200;
  const structures = [];
  for (let i = 0; i < 14; i++) {
    const edge = Math.floor(rand() * 4);
    let x, z;
    if (edge === 0) { x = rr(-145, 145); z = rr(139, 148); }
    else if (edge === 1) { x = rr(-145, 145); z = rr(-148, -139); }
    else if (edge === 2) { x = rr(-148, -139); z = rr(-145, 145); }
    else { x = rr(139, 148); z = rr(-145, 145); }
    structures.push({
      x, z, type: Math.floor(rand() * 3),
      rotation: rand() * Math.PI, scale: rr(0.8, 1.4),
      tiltX: rr(-0.1, 0.1), tiltZ: rr(-0.1, 0.1),
    });
  }
  return structures;
}

const LANDMARKS = [
  { x: -143, z: 143, type: 0 },  // radio tower
  { x: 143, z: 143, type: 1 },   // satellite dish
  { x: -143, z: -143, type: 2 }, // broken arch
  { x: 143, z: -143, type: 3 },  // ruined monument
];

function generateBaseSurroundings() {
  s = 300;
  const result = [];
  for (const [faction, pos] of [['friendly', BASES.friendly.position], ['enemy', BASES.enemy.position]]) {
    for (let i = 0; i < 8; i++) {
      const angle = rr(0, Math.PI * 2);
      const dist = rr(5.5, 9);
      const x = pos[0] + Math.cos(angle) * dist;
      const z = pos[2] + Math.sin(angle) * dist;
      // Keep spawn exits clear
      if (faction === 'friendly' && z < 130) continue;
      if (faction === 'enemy' && z > -130) continue;
      result.push({ x, z, type: Math.floor(rand() * 3), rotation: angle, faction });
    }
  }
  return result;
}

// === Individual structure renderers ==========================================
function Structure({ x, z, type, rotation, scale, tiltX, tiltZ }) {
  if (type === 0)
    return <mesh geometry={wallGeo} material={concreteMat} position={[x, 0.6 * scale, z]} rotation={[tiltX, rotation, tiltZ]} scale={scale} castShadow receiveShadow />;
  if (type === 1)
    return <mesh geometry={pillarGeo} material={concreteMat} position={[x, 1.25 * scale, z]} rotation={[tiltX, rotation, tiltZ]} scale={scale} castShadow receiveShadow />;
  return <mesh geometry={stackGeo} material={metalMat} position={[x, 1.75 * scale, z]} rotation={[tiltX, rotation, tiltZ]} scale={scale} castShadow />;
}

function Landmark({ x, z, type }) {
  if (type === 0) return (
    <group position={[x, 0, z]}>
      <mesh geometry={towerGeo} material={metalMat} position={[0, 2.5, 0]} castShadow />
      <mesh geometry={beaconGeo} material={beaconMat} position={[0, 5.2, 0]} />
    </group>
  );
  if (type === 1) return (
    <group position={[x, 0, z]} rotation={[0.3, 0, 0]}>
      <mesh geometry={dishGeo} material={metalMat} position={[0, 1.5, 0]} castShadow />
      <mesh geometry={antennaGeo} material={metalMat} position={[0, 0.8, 0]} castShadow />
    </group>
  );
  if (type === 2) return (
    <group position={[x, 0, z]} rotation={[0, Math.PI / 4, 0]}>
      <mesh geometry={archGeo} material={concreteMat} position={[0, 2, 0]} castShadow />
    </group>
  );
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={pillarGeo} material={concreteMat} position={[0, 1.875, 0]} rotation={[0.2, 0, 0.1]} scale={1.5} castShadow />
      <mesh geometry={baseGeo} material={darkMat} position={[0, 0.2, 0]} castShadow receiveShadow />
    </group>
  );
}

function BaseStructure({ x, z, type, rotation, faction }) {
  const mat = faction === 'friendly' ? friendlyMat : enemyMat;
  if (type === 0)
    return <mesh geometry={wallGeo} material={mat} position={[x, 0.6, z]} rotation={[0, rotation, 0]} scale={0.8} castShadow />;
  if (type === 1)
    return <mesh geometry={containerGeo} material={mat} position={[x, 0.65, z]} rotation={[0, rotation, 0]} castShadow receiveShadow />;
  return (
    <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
      <mesh geometry={antennaGeo} material={mat} position={[0, 1.25, 0]} castShadow />
      <mesh geometry={beaconGeo} material={beaconMat} position={[0, 2.6, 0]} scale={0.5} />
    </group>
  );
}

// === Main component ==========================================================
export function BattlefieldDressing() {
  const markings = useMemo(() => generateMarkings(), []);
  const rocks = useMemo(() => generateRocks(), []);
  const structures = useMemo(() => generateStructures(), []);
  const baseSurroundings = useMemo(() => generateBaseSurroundings(), []);

  const rockRef = useRef();
  const scorchRef = useRef();
  const craterRef = useRef();

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    if (rockRef.current) {
      rocks.forEach((r, i) => {
        dummy.position.set(r.x, 0, r.z);
        dummy.rotation.set(r.rotX, r.rotY, 0);
        dummy.scale.setScalar(r.scale);
        dummy.updateMatrix();
        rockRef.current.setMatrixAt(i, dummy.matrix);
      });
      rockRef.current.instanceMatrix.needsUpdate = true;
    }
    if (scorchRef.current) {
      markings.scorch.forEach((m, i) => {
        dummy.position.set(m.x, m.y, m.z);
        dummy.rotation.set(0, m.rot, 0);
        dummy.scale.setScalar(m.scale);
        dummy.updateMatrix();
        scorchRef.current.setMatrixAt(i, dummy.matrix);
      });
      scorchRef.current.instanceMatrix.needsUpdate = true;
    }
    if (craterRef.current) {
      markings.craters.forEach((c, i) => {
        dummy.position.set(c.x, c.y, c.z);
        dummy.rotation.set(0, c.rot, 0);
        dummy.scale.setScalar(c.scale);
        dummy.updateMatrix();
        craterRef.current.setMatrixAt(i, dummy.matrix);
      });
      craterRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [rocks, markings]);

  return (
    <group>
      <instancedMesh ref={scorchRef} args={[scorchGeo, scorchMat, markings.scorch.length]} />
      <instancedMesh ref={craterRef} args={[craterGeo, craterMat, markings.craters.length]} />
      <instancedMesh ref={rockRef} args={[rockGeo, rockMat, rocks.length]} castShadow receiveShadow />
      {structures.map((s, i) => <Structure key={i} {...s} />)}
      {LANDMARKS.map((l, i) => <Landmark key={i} {...l} />)}
      {baseSurroundings.map((b, i) => <BaseStructure key={i} {...b} />)}
    </group>
  );
}