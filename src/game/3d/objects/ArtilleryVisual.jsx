import { forwardRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARTILLERY, TANK } from '@/game/config';

// Self-propelled howitzer. Local +Z is forward (same convention as the tank).
const materials = {
  hull: new THREE.MeshStandardMaterial({ color: ARTILLERY.hullColor, roughness: 0.5, metalness: 0.3 }),
  armor: new THREE.MeshStandardMaterial({ color: ARTILLERY.armorColor, roughness: 0.45, metalness: 0.35 }),
  rubber: new THREE.MeshStandardMaterial({ color: TANK.trackColor, roughness: 0.9 }),
  steel: new THREE.MeshStandardMaterial({ color: '#5d676b', roughness: 0.35, metalness: 0.7 }),
  dark: new THREE.MeshStandardMaterial({ color: TANK.barrelColor, roughness: 0.55, metalness: 0.45 }),
  accent: new THREE.MeshStandardMaterial({ color: TANK.accentColor, emissive: '#ff6a00', emissiveIntensity: 0.8, roughness: 0.3 }),
  lens: new THREE.MeshStandardMaterial({ color: '#86f7ff', emissive: '#20dff2', emissiveIntensity: 1.8, roughness: 0.2 }),
};

function builder() {
  const batches = Object.fromEntries(Object.keys(materials).map(k => [k, []]));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const add = (kind, g, pos, rot = [0, 0, 0]) => {
    const geo = g.index ? g.toNonIndexed() : g;
    geo.applyMatrix4(m.compose(p.set(...pos), q.setFromEuler(e.set(...rot)), one));
    batches[kind].push(geo);
  };
  const box = (k, s, pos, r) => add(k, new THREE.BoxGeometry(...s), pos, r);
  const cyl = (k, r, l, pos, rot, seg = 12) => add(k, new THREE.CylinderGeometry(r, r, l, seg), pos, rot);
  const finish = () => Object.entries(batches).filter(([, parts]) => parts.length).map(([kind, parts]) => {
    const geometry = mergeGeometries(parts, false); geometry.computeBoundingSphere();
    return { kind, geometry, material: materials[kind] };
  });
  return { box, cyl, finish };
}

function buildChassis() {
  const { box, cyl, finish } = builder();
  // Long tracked chassis with six road wheels per side.
  box('dark', [2.3, 0.4, 4.1], [0, 0.36, 0]);
  box('hull', [2.55, 0.42, 4.2], [0, 0.66, 0]);
  box('armor', [2.3, 0.18, 0.9], [0, 0.82, 1.75], [0.35, 0, 0]);
  for (const side of [-1, 1]) {
    box('rubber', [0.46, 0.5, 4.0], [side * 1.32, 0.3, 0]);
    for (let w = 0; w < 6; w++) {
      const z = -1.7 + w * 0.68;
      cyl('rubber', 0.26, 0.48, [side * 1.32, 0.3, z], [0, 0, Math.PI / 2]);
      cyl('steel', 0.1, 0.52, [side * 1.32, 0.3, z], [0, 0, Math.PI / 2], 8);
    }
    for (let s = 0; s < 22; s++) box('steel', [0.52, 0.05, 0.12], [side * 1.32, 0.02, -1.95 + s * 0.186]);
    box('hull', [0.6, 0.08, 4.25], [side * 1.28, 0.8, 0]);
    box('accent', [0.02, 0.16, 0.6], [side * 1.6, 0.7, 1.1]);
    box('lens', [0.18, 0.08, 0.02], [side * 0.95, 0.9, 2.12]);
    // Rear recoil spades, folded up.
    box('steel', [0.5, 0.6, 0.08], [side * 0.7, 0.55, -2.18], [-0.3, 0, 0]);
  }
  // Large boxy gun house set toward the rear.
  box('hull', [2.2, 0.9, 2.5], [0, 1.32, -0.35]);
  box('armor', [2.0, 0.08, 2.3], [0, 1.8, -0.35]);
  box('dark', [0.9, 0.7, 0.4], [0, 1.45, 0.95]);
  for (const side of [-1, 1]) {
    box('dark', [0.08, 0.55, 1.8], [side * 1.12, 1.32, -0.4]);
    box('accent', [0.02, 0.12, 1.2], [side * 1.14, 1.62, -0.4]);
    for (const z of [-1.2, -0.7]) box('steel', [0.3, 0.25, 0.38], [side * 1.2, 1.1, z]);
  }
  cyl('dark', 0.3, 0.14, [0.55, 1.9, -0.8]);
  cyl('armor', 0.25, 0.1, [0.55, 1.99, -0.8]);
  box('dark', [0.3, 0.2, 0.25], [-0.6, 1.92, 0.2]);
  box('lens', [0.2, 0.1, 0.02], [-0.6, 1.93, 0.33]);
  cyl('steel', 0.015, 1.1, [-0.85, 2.35, -1.3], [0, 0, 0.05], 6);
  box('accent', [0.04, 0.1, 0.04], [-0.88, 2.9, -1.3]);
  // Ammunition racks on the rear deck.
  for (let i = 0; i < 4; i++) cyl('steel', 0.08, 0.5, [-0.45 + i * 0.3, 0.98, -1.85], [Math.PI / 2, 0, 0], 8);
  return finish();
}

// Barrel meshes built along +Z from the trunnion; pitched and recoiled at runtime.
function buildBarrel() {
  const { box, cyl, finish } = builder();
  const L = ARTILLERY.barrelLength;
  cyl('dark', 0.26, 0.5, [0, 0, 0.1], [Math.PI / 2, 0, 0]);
  cyl('armor', 0.17, L * 0.35, [0, 0, 0.3 + L * 0.175], [Math.PI / 2, 0, 0]);
  cyl('steel', 0.12, L * 0.65, [0, 0, 0.3 + L * 0.35 + L * 0.325], [Math.PI / 2, 0, 0]);
  box('steel', [0.34, 0.3, 0.36], [0, 0, L + 0.25]);
  for (const side of [-1, 1]) box('dark', [0.02, 0.18, 0.1], [side * 0.18, 0, L + 0.2]);
  cyl('dark', 0.19, 0.1, [0, 0, 0.3 + L * 0.5], [Math.PI / 2, 0, 0]);
  return finish();
}

const chassis = buildChassis();
const barrel = buildBarrel();
const explosionGeometry = new THREE.SphereGeometry(1, 8, 8);

export const ArtilleryVisual = forwardRef(function ArtilleryVisual({ explosionRef, explosionMat }, recoilRef) {
  return <group name="SelfPropelledHowitzer" dispose={null}>
    {chassis.map(({ kind, geometry, material }) => <mesh key={kind} geometry={geometry} material={material} castShadow receiveShadow />)}
    <group position={ARTILLERY.pivot} rotation={[-ARTILLERY.barrelPitch, 0, 0]}>
      <group ref={recoilRef}>
        {barrel.map(({ kind, geometry, material }) => <mesh key={kind} geometry={geometry} material={material} castShadow />)}
      </group>
    </group>
    <mesh ref={explosionRef} geometry={explosionGeometry} material={explosionMat} visible={false} />
  </group>;
});