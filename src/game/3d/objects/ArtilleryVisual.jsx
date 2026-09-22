import * as THREE from 'three';
import { ARTILLERY } from '@/game/config';

// Self-propelled howitzer: tracked chassis, rear casemate turret, long gun.
// Local +Z is forward/muzzle, matching the tank convention.
const m = {
  hull: new THREE.MeshStandardMaterial({ color: ARTILLERY.hullColor, roughness: 0.5, metalness: 0.3 }),
  armor: new THREE.MeshStandardMaterial({ color: ARTILLERY.armorColor, roughness: 0.45, metalness: 0.35 }),
  track: new THREE.MeshStandardMaterial({ color: ARTILLERY.trackColor, roughness: 0.9 }),
  steel: new THREE.MeshStandardMaterial({ color: ARTILLERY.barrelColor, roughness: 0.4, metalness: 0.65 }),
  accent: new THREE.MeshStandardMaterial({ color: ARTILLERY.accentColor, emissive: '#ff6a00', emissiveIntensity: 0.8 }),
  lens: new THREE.MeshStandardMaterial({ color: '#86f7ff', emissive: '#20dff2', emissiveIntensity: 1.8 }),
};
const g = {
  box: new THREE.BoxGeometry(1, 1, 1),
  wheel: new THREE.CylinderGeometry(0.26, 0.26, 0.48, 12),
  barrel: new THREE.CylinderGeometry(0.1, 0.13, 1, 12),
  sphere: new THREE.SphereGeometry(1, 8, 8),
};
const B = ({ mat, s, p, r }) => <mesh geometry={g.box} material={m[mat]} scale={s} position={p} rotation={r} castShadow receiveShadow />;
const wheels = [];
for (const side of [-1, 1]) for (let i = 0; i < 6; i++) wheels.push([side * 1.22, 0.3, -1.5 + i * 0.6]);
const L = ARTILLERY.barrelLength;

export function ArtilleryVisual({ barrelRef, recoilRef, explosionRef, explosionMat }) {
  return (
    <group name="MobileArtillery" dispose={null}>
      {/* Chassis and tracks */}
      <B mat="track" s={[0.46, 0.58, 3.8]} p={[-1.22, 0.3, 0]} />
      <B mat="track" s={[0.46, 0.58, 3.8]} p={[1.22, 0.3, 0]} />
      {wheels.map((p, i) => <mesh key={i} geometry={g.wheel} material={m.steel} position={p} rotation={[0, 0, Math.PI / 2]} />)}
      <B mat="hull" s={[2.1, 0.55, 3.7]} p={[0, 0.7, 0]} />
      <B mat="armor" s={[2.0, 0.18, 0.9]} p={[0, 0.9, 1.55]} r={[0.35, 0, 0]} />
      <B mat="hull" s={[2.7, 0.08, 3.9]} p={[0, 0.98, 0]} />
      {/* Rear casemate turret */}
      <B mat="armor" s={[1.9, 0.95, 2.3]} p={[0, 1.45, -0.45]} />
      <B mat="hull" s={[1.7, 0.1, 2.1]} p={[0, 1.97, -0.45]} />
      <B mat="accent" s={[0.03, 0.16, 1.4]} p={[-0.96, 1.5, -0.45]} />
      <B mat="accent" s={[0.03, 0.16, 1.4]} p={[0.96, 1.5, -0.45]} />
      <B mat="steel" s={[0.5, 0.25, 0.5]} p={[-0.5, 2.12, -0.9]} />
      <B mat="lens" s={[0.3, 0.1, 0.02]} p={[-0.5, 2.14, -0.64]} />
      <B mat="steel" s={[0.03, 0.9, 0.03]} p={[0.7, 2.45, -1.3]} />
      {/* Rear recoil spade */}
      <B mat="steel" s={[1.6, 0.5, 0.12]} p={[0, 0.45, -1.95]} r={[-0.4, 0, 0]} />
      {/* Elevating gun: pivot at mantlet, barrel along +Z */}
      <group ref={barrelRef} position={ARTILLERY.barrelPivot}>
        <group ref={recoilRef}>
          <B mat="steel" s={[0.7, 0.55, 0.5]} p={[0, 0, 0.15]} />
          <mesh geometry={g.barrel} material={m.steel} scale={[1, L, 1]} position={[0, 0, L / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow />
          <B mat="steel" s={[0.34, 0.3, 0.4]} p={[0, 0, L - 0.1]} />
          <B mat="accent" s={[0.3, 0.05, 0.1]} p={[0, 0.16, 1.2]} />
        </group>
      </group>
      <mesh ref={explosionRef} geometry={g.sphere} material={explosionMat} visible={false} />
    </group>
  );
}