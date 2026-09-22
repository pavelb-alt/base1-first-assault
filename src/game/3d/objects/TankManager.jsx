import { useRef, useReducer, useCallback, useEffect, useMemo, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { EventBus } from '@/game/EventBus';
import { TANK, TANK_DELIVERY, CARGO_SHIP, BALANCE, FRONT, MAP } from '@/game/config';
import { tankState } from '@/game/3d/objects/tankState';
import { cargoShipState } from '@/game/3d/objects/cargoShipState';
import { gameState } from '@/game/3d/world';
import { combat, findNearestEnemy } from '@/game/3d/combat';
import { battle, recordRemoval } from '@/game/3d/battleMetrics';
import { fireShot, canSeeTarget } from '@/game/3d/ballistics';

useGLTF.preload(CARGO_SHIP.modelUrl);

// --- Shared geometries & materials (module scope for zero GC churn) --------
// Hull & Glacis
const hullTubGeo = new THREE.BoxGeometry(2.1, 0.46, 3.4);
const hullTopGeo = new THREE.BoxGeometry(2.2, 0.34, 2.2);
const glacisLowerGeo = new THREE.BoxGeometry(2.1, 0.38, 0.7);
const glacisUpperGeo = new THREE.BoxGeometry(2.05, 0.44, 1.15);
const eraBlockGeo = new THREE.BoxGeometry(0.32, 0.1, 0.22);
const towShackleGeo = new THREE.TorusGeometry(0.08, 0.026, 6, 8);
const driverVisorGeo = new THREE.BoxGeometry(0.32, 0.16, 0.24);
const driverOpticGeo = new THREE.BoxGeometry(0.24, 0.05, 0.04);
const headlightBoxGeo = new THREE.BoxGeometry(0.18, 0.14, 0.18);
const headlightLensGeo = new THREE.BoxGeometry(0.15, 0.1, 0.04);
const taillightGeo = new THREE.BoxGeometry(0.22, 0.08, 0.03);

// Engine & Rear Hull
const engineDeckGeo = new THREE.BoxGeometry(1.85, 0.2, 1.25);
const engineVentGeo = new THREE.BoxGeometry(1.5, 0.06, 0.35);
const engineFanGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.06, 12);
const exhaustMufflerGeo = new THREE.BoxGeometry(0.22, 0.28, 0.55);
const exhaustPipeGeo = new THREE.CylinderGeometry(0.065, 0.08, 0.35, 8);
const rearPodGeo = new THREE.BoxGeometry(0.42, 0.35, 0.65);

// Running gear & tracks
const trackBeltGeo = new THREE.BoxGeometry(0.44, 0.46, 3.6);
const trackSkirtPanelGeo = new THREE.BoxGeometry(0.08, 0.44, 0.62);
const skirtTopRailGeo = new THREE.BoxGeometry(0.1, 0.08, 3.2);
const frontFenderGeo = new THREE.BoxGeometry(0.48, 0.14, 0.42);
const rearMudflapGeo = new THREE.BoxGeometry(0.46, 0.32, 0.06);
const roadWheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.38, 12);
const wheelHubGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.42, 8);
const driveSprocketGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.38, 12);
const idlerWheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.38, 12);
const returnRollerGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.36, 8);

// Turret & Sensor Suite
const turretRingGeo = new THREE.CylinderGeometry(0.9, 0.98, 0.12, 16);
const turretCitadelGeo = new THREE.BoxGeometry(1.65, 0.48, 1.9);
const turretCheekGeo = new THREE.BoxGeometry(0.38, 0.44, 1.35);
const turretBustleGeo = new THREE.BoxGeometry(1.45, 0.4, 0.95);
const bustleRackGeo = new THREE.BoxGeometry(1.35, 0.22, 0.35);
const cupolaGeo = new THREE.CylinderGeometry(0.3, 0.33, 0.16, 12);
const cupolaHatchGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.07, 10);
const loaderHatchGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 8);
const citvStemGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6);
const citvPodGeo = new THREE.SphereGeometry(0.14, 8, 8);
const citvLensGeo = new THREE.BoxGeometry(0.1, 0.08, 0.04);
const gunnerSightGeo = new THREE.BoxGeometry(0.22, 0.18, 0.28);
const gunnerOpticGeo = new THREE.BoxGeometry(0.16, 0.1, 0.03);
const rangefinderGeo = new THREE.BoxGeometry(0.28, 0.08, 0.04);
const smokePodGeo = new THREE.BoxGeometry(0.18, 0.18, 0.28);
const smokeTubeGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6);
const antennaGeo = new THREE.CylinderGeometry(0.012, 0.022, 1.3, 4);
const antennaTipGeo = new THREE.SphereGeometry(0.04, 6, 6);
const chevronGeo = new THREE.BoxGeometry(0.25, 0.12, 0.02);

// Cannon & Armament
const mantletGeo = new THREE.BoxGeometry(0.68, 0.42, 0.55);
const coaxGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.9, 6);
const barrelRootGeo = new THREE.CylinderGeometry(0.17, 0.2, 0.7, 10);
const barrelMainGeo = new THREE.CylinderGeometry(0.12, 0.125, 2.5, 10);
const boreEvacuatorGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.55, 10);
const muzzleBrakeGeo = new THREE.BoxGeometry(0.3, 0.24, 0.45);
const muzzlePortGeo = new THREE.BoxGeometry(0.34, 0.08, 0.12);
const muzzleFlashGeo = new THREE.SphereGeometry(0.35, 8, 8);

// Tactical Cover Aura & Pylons
const auraRingGeo = new THREE.RingGeometry(4.88, 5.0, 36);
const emitterPylonGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.25, 6);
const emitterNodeGeo = new THREE.SphereGeometry(0.08, 8, 8);
const explosionGeo = new THREE.SphereGeometry(1, 8, 8);

// Materials
const hullMat = new THREE.MeshStandardMaterial({ color: TANK.hullColor, roughness: 0.75, metalness: 0.25 });
const plateMat = new THREE.MeshStandardMaterial({ color: TANK.plateColor, roughness: 0.65, metalness: 0.3 });
const trackMat = new THREE.MeshStandardMaterial({ color: TANK.trackColor, roughness: 0.9, metalness: 0.4 });
const wheelMat = new THREE.MeshStandardMaterial({ color: TANK.wheelColor, roughness: 0.6, metalness: 0.5 });
const rimMat = new THREE.MeshStandardMaterial({ color: TANK.rimColor, roughness: 0.5, metalness: 0.5 });
const turretMat = new THREE.MeshStandardMaterial({ color: TANK.turretColor, roughness: 0.72, metalness: 0.28 });
const mantletMat = new THREE.MeshStandardMaterial({ color: TANK.mantletColor, roughness: 0.6, metalness: 0.4 });
const barrelMat = new THREE.MeshStandardMaterial({ color: TANK.barrelColor, roughness: 0.4, metalness: 0.75 });
const exhaustMat = new THREE.MeshStandardMaterial({ color: TANK.exhaustColor, roughness: 0.85, metalness: 0.35 });
const darkMetalMat = new THREE.MeshStandardMaterial({ color: '#1a1c1d', roughness: 0.5, metalness: 0.7 });
const accentMat = new THREE.MeshStandardMaterial({ color: TANK.accentColor, emissive: TANK.accentColor, emissiveIntensity: 0.9 });
const opticMat = new THREE.MeshStandardMaterial({ color: TANK.accentCyan, emissive: TANK.accentCyan, emissiveIntensity: 1.2 });
const headlightMat = new THREE.MeshStandardMaterial({ color: TANK.headlightColor, emissive: TANK.headlightColor, emissiveIntensity: 1.6 });
const taillightMat = new THREE.MeshStandardMaterial({ color: TANK.taillightColor, emissive: TANK.taillightColor, emissiveIntensity: 1.4 });
const flashMat = new THREE.MeshBasicMaterial({ color: '#ffea77', transparent: true, opacity: 0.9 });
const auraMat = new THREE.MeshBasicMaterial({ color: TANK.accentColor, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });

// --- Scratch vectors (no per-frame allocation) ------------------------------
const _muzzle = new THREE.Vector3();
const _aim = new THREE.Vector3();

// --- Detailed Track & Suspension System ------------------------------------
function TrackAssembly({ side, wheelRefs }) {
  // side: -1 for left, +1 for right
  const x = side * 1.3;
  const outerX = side * 1.54;
  const rotZ = Math.PI / 2;
  const wheelZOffsets = [-1.2, -0.6, 0.0, 0.6, 1.2];
  const rollerZOffsets = [-0.8, 0.0, 0.8];
  const skirtZOffsets = [-1.2, -0.6, 0.0, 0.6, 1.2];

  return (
    <group>
      {/* Main Track Belt */}
      <mesh geometry={trackBeltGeo} material={trackMat} position={[x, 0.32, 0]} castShadow />

      {/* Side Skirt Top Rail */}
      <mesh geometry={skirtTopRailGeo} material={plateMat} position={[outerX, 0.6, 0]} castShadow />

      {/* Modular ERA Skirt Armor Slabs (5 segments) */}
      {skirtZOffsets.map((z, idx) => (
        <mesh key={`skirt-${idx}`} geometry={trackSkirtPanelGeo} material={plateMat} position={[outerX, 0.36, z]} castShadow />
      ))}

      {/* Front Mudguard with Faction Trim */}
      <group position={[x, 0.42, -1.72]} rotation={[Math.PI / 8, 0, 0]}>
        <mesh geometry={frontFenderGeo} material={plateMat} castShadow />
        <mesh geometry={eraBlockGeo} material={accentMat} position={[0, 0.06, -0.15]} scale={[1.2, 0.2, 0.3]} />
      </group>

      {/* Rear Mudflap */}
      <mesh geometry={rearMudflapGeo} material={darkMetalMat} position={[x, 0.34, 1.76]} rotation={[-Math.PI / 10, 0, 0]} castShadow />

      {/* Drive Sprocket (Front) */}
      <mesh
        ref={el => { if (el && wheelRefs) wheelRefs.push(el); }}
        geometry={driveSprocketGeo}
        material={darkMetalMat}
        position={[x, 0.35, -1.6]}
        rotation={[0, 0, rotZ]}
        castShadow
      />

      {/* Idler Wheel (Rear) */}
      <mesh
        ref={el => { if (el && wheelRefs) wheelRefs.push(el); }}
        geometry={idlerWheelGeo}
        material={darkMetalMat}
        position={[x, 0.35, 1.6]}
        rotation={[0, 0, rotZ]}
        castShadow
      />

      {/* 5 Road Wheels & Rim Caps */}
      {wheelZOffsets.map((z, idx) => (
        <group key={`wheel-${idx}`} position={[x, 0.26, z]}>
          <mesh
            ref={el => { if (el && wheelRefs) wheelRefs.push(el); }}
            geometry={roadWheelGeo}
            material={wheelMat}
            rotation={[0, 0, rotZ]}
            castShadow
          />
          <mesh geometry={wheelHubGeo} material={rimMat} rotation={[0, 0, rotZ]} />
        </group>
      ))}

      {/* Return Rollers (Upper Track Support) */}
      {rollerZOffsets.map((z, idx) => (
        <mesh key={`roller-${idx}`} geometry={returnRollerGeo} material={rimMat} position={[x, 0.5, z]} rotation={[0, 0, rotZ]} />
      ))}
    </group>
  );
}

// --- Tank Visual Component --------------------------------------------------
function TankVisual({
  turretRef,
  barrelRef,
  muzzleRef,
  flashRef,
  auraRef,
  wheelRefs,
  explosionRef,
  explosionMatRef,
}) {
  return (
    <group>
      {/* ====================================================================
          1. CHASSIS / LOWER & UPPER HULL
          ==================================================================== */}
      {/* Lower Hull Tub */}
      <mesh geometry={hullTubGeo} material={hullMat} position={[0, 0.36, 0]} castShadow />
      {/* Upper Hull Superstructure */}
      <mesh geometry={hullTopGeo} material={hullMat} position={[0, 0.62, 0.05]} castShadow />

      {/* Lower Front Glacis Plate (Angled Back) */}
      <mesh geometry={glacisLowerGeo} material={hullMat} position={[0, 0.28, -1.62]} rotation={[-Math.PI / 5, 0, 0]} castShadow />

      {/* Upper Front Sloped Glacis Plate */}
      <mesh geometry={glacisUpperGeo} material={plateMat} position={[0, 0.58, -1.22]} rotation={[-Math.PI / 4, 0, 0]} castShadow />

      {/* Reactive Armor (ERA) Chevron Array on Glacis */}
      <group position={[0, 0.62, -1.2]} rotation={[-Math.PI / 4, 0, 0]}>
        <mesh geometry={eraBlockGeo} material={plateMat} position={[-0.7, 0.1, -0.1]} castShadow />
        <mesh geometry={eraBlockGeo} material={plateMat} position={[-0.35, 0.1, -0.1]} castShadow />
        <mesh geometry={eraBlockGeo} material={plateMat} position={[0.35, 0.1, -0.1]} castShadow />
        <mesh geometry={eraBlockGeo} material={plateMat} position={[0.7, 0.1, -0.1]} castShadow />
        <mesh geometry={eraBlockGeo} material={plateMat} position={[-0.52, 0.1, 0.18]} castShadow />
        <mesh geometry={eraBlockGeo} material={plateMat} position={[0, 0.1, 0.18]} castShadow />
        <mesh geometry={eraBlockGeo} material={plateMat} position={[0.52, 0.1, 0.18]} castShadow />
      </group>

      {/* Front Tow Shackles */}
      <mesh geometry={towShackleGeo} material={darkMetalMat} position={[-0.82, 0.2, -1.78]} rotation={[0, Math.PI / 2, 0]} />
      <mesh geometry={towShackleGeo} material={darkMetalMat} position={[0.82, 0.2, -1.78]} rotation={[0, Math.PI / 2, 0]} />

      {/* Driver Vision Block & Sensor Visor */}
      <group position={[0, 0.74, -1.02]}>
        <mesh geometry={driverVisorGeo} material={plateMat} castShadow />
        <mesh geometry={driverOpticGeo} material={opticMat} position={[0, 0.01, -0.13]} />
      </group>

      {/* Projector Headlights (Front Fenders) */}
      <group position={[-0.92, 0.56, -1.58]}>
        <mesh geometry={headlightBoxGeo} material={darkMetalMat} castShadow />
        <mesh geometry={headlightLensGeo} material={headlightMat} position={[0, 0, -0.1]} />
      </group>
      <group position={[0.92, 0.56, -1.58]}>
        <mesh geometry={headlightBoxGeo} material={darkMetalMat} castShadow />
        <mesh geometry={headlightLensGeo} material={headlightMat} position={[0, 0, -0.1]} />
      </group>

      {/* Engine Deck (Rear) with Cooling Louvers & Dual Turbine Fans */}
      <group position={[0, 0.68, 0.95]}>
        <mesh geometry={engineDeckGeo} material={hullMat} castShadow />
        <mesh geometry={engineVentGeo} material={exhaustMat} position={[0, 0.11, -0.3]} />
        <mesh geometry={engineVentGeo} material={exhaustMat} position={[0, 0.11, 0.35]} />
        <mesh geometry={engineFanGeo} material={darkMetalMat} position={[-0.42, 0.11, 0.05]} />
        <mesh geometry={engineFanGeo} material={darkMetalMat} position={[0.42, 0.11, 0.05]} />
      </group>

      {/* Armored Exhaust Mufflers & Angled Tailpipes */}
      <group position={[-0.86, 0.6, 1.42]}>
        <mesh geometry={exhaustMufflerGeo} material={exhaustMat} castShadow />
        <mesh geometry={exhaustPipeGeo} material={darkMetalMat} position={[0, 0.18, 0.15]} rotation={[Math.PI / 6, 0, 0]} />
      </group>
      <group position={[0.86, 0.6, 1.42]}>
        <mesh geometry={exhaustMufflerGeo} material={exhaustMat} castShadow />
        <mesh geometry={exhaustPipeGeo} material={darkMetalMat} position={[0, 0.18, 0.15]} rotation={[Math.PI / 6, 0, 0]} />
      </group>

      {/* Rear Power / Fuel Pods */}
      <mesh geometry={rearPodGeo} material={plateMat} position={[-0.46, 0.5, 1.72]} castShadow />
      <mesh geometry={rearPodGeo} material={plateMat} position={[0.46, 0.5, 1.72]} castShadow />

      {/* Rear Tactical Taillights */}
      <mesh geometry={taillightGeo} material={taillightMat} position={[-0.98, 0.48, 1.72]} />
      <mesh geometry={taillightGeo} material={taillightMat} position={[0.98, 0.48, 1.72]} />

      {/* Left and Right Tracks */}
      <TrackAssembly side={-1} wheelRefs={wheelRefs} />
      <TrackAssembly side={1} wheelRefs={wheelRefs} />

      {/* Defensive Cover Aura Field Emitter Pylons on Hull Corners */}
      <group position={[-0.96, 0.72, -1.4]}>
        <mesh geometry={emitterPylonGeo} material={darkMetalMat} />
        <mesh geometry={emitterNodeGeo} material={accentMat} position={[0, 0.14, 0]} />
      </group>
      <group position={[0.96, 0.72, -1.4]}>
        <mesh geometry={emitterPylonGeo} material={darkMetalMat} />
        <mesh geometry={emitterNodeGeo} material={accentMat} position={[0, 0.14, 0]} />
      </group>
      <group position={[-0.96, 0.72, 1.35]}>
        <mesh geometry={emitterPylonGeo} material={darkMetalMat} />
        <mesh geometry={emitterNodeGeo} material={accentMat} position={[0, 0.14, 0]} />
      </group>
      <group position={[0.96, 0.72, 1.35]}>
        <mesh geometry={emitterPylonGeo} material={darkMetalMat} />
        <mesh geometry={emitterNodeGeo} material={accentMat} position={[0, 0.14, 0]} />
      </group>

      {/* ====================================================================
          2. INDEPENDENTLY ROTATING TURRET
          ==================================================================== */}
      <group ref={turretRef} position={[0, 0.78, -0.05]}>
        {/* Turret Collar Ring */}
        <mesh geometry={turretRingGeo} material={darkMetalMat} position={[0, 0.06, 0]} />

        {/* Main Turret Citadel */}
        <mesh geometry={turretCitadelGeo} material={turretMat} position={[0, 0.34, 0]} castShadow />

        {/* Sloped Composite Cheek Armor Wedges */}
        <group position={[-0.82, 0.32, -0.28]} rotation={[0, -0.2, 0]}>
          <mesh geometry={turretCheekGeo} material={plateMat} castShadow />
          <mesh geometry={chevronGeo} material={accentMat} position={[-0.2, 0, 0]} rotation={[0, -Math.PI / 2, 0]} />
        </group>
        <group position={[0.82, 0.32, -0.28]} rotation={[0, 0.2, 0]}>
          <mesh geometry={turretCheekGeo} material={plateMat} castShadow />
          <mesh geometry={chevronGeo} material={accentMat} position={[0.2, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
        </group>

        {/* Rear Turret Bustle (Ammunition & Counterweight) */}
        <mesh geometry={turretBustleGeo} material={turretMat} position={[0, 0.3, 0.92]} castShadow />
        <mesh geometry={bustleRackGeo} material={darkMetalMat} position={[0, 0.22, 1.25]} />

        {/* Commander's Cupola & Hatch (Right) */}
        <group position={[0.48, 0.58, 0.25]}>
          <mesh geometry={cupolaGeo} material={plateMat} castShadow />
          <mesh geometry={cupolaHatchGeo} material={darkMetalMat} position={[0, 0.1, 0]} castShadow />
        </group>

        {/* Loader / Gunner Hatch (Left) */}
        <mesh geometry={loaderHatchGeo} material={darkMetalMat} position={[-0.48, 0.6, 0.2]} castShadow />

        {/* CITV - Commander's Independent Thermal Viewer (Right Front Mast) */}
        <group position={[0.54, 0.58, -0.32]}>
          <mesh geometry={citvStemGeo} material={darkMetalMat} position={[0, 0.1, 0]} />
          <mesh geometry={citvPodGeo} material={plateMat} position={[0, 0.22, 0]} castShadow />
          <mesh geometry={citvLensGeo} material={opticMat} position={[0, 0.22, -0.13]} />
        </group>

        {/* Gunner's Primary Optical Sight Box (Left Front) */}
        <group position={[-0.48, 0.62, -0.42]}>
          <mesh geometry={gunnerSightGeo} material={plateMat} castShadow />
          <mesh geometry={gunnerOpticGeo} material={opticMat} position={[0, 0, -0.15]} />
        </group>

        {/* Laser Rangefinder Slit above Mantlet */}
        <mesh geometry={rangefinderGeo} material={opticMat} position={[0, 0.56, -0.96]} />

        {/* Smoke Grenade Discharger Pods (Flanks) */}
        <group position={[-0.92, 0.46, -0.2]}>
          <mesh geometry={smokePodGeo} material={darkMetalMat} />
          <mesh geometry={smokeTubeGeo} material={darkMetalMat} position={[-0.06, 0.08, -0.08]} rotation={[-Math.PI / 4, -Math.PI / 6, 0]} />
          <mesh geometry={smokeTubeGeo} material={darkMetalMat} position={[-0.06, 0.08, 0.08]} rotation={[-Math.PI / 4, -Math.PI / 6, 0]} />
        </group>
        <group position={[0.92, 0.46, -0.2]}>
          <mesh geometry={smokePodGeo} material={darkMetalMat} />
          <mesh geometry={smokeTubeGeo} material={darkMetalMat} position={[0.06, 0.08, -0.08]} rotation={[-Math.PI / 4, Math.PI / 6, 0]} />
          <mesh geometry={smokeTubeGeo} material={darkMetalMat} position={[0.06, 0.08, 0.08]} rotation={[-Math.PI / 4, Math.PI / 6, 0]} />
        </group>

        {/* Dual Communications & Data-Link Whip Antennae */}
        <group position={[-0.62, 0.58, 1.15]}>
          <mesh geometry={antennaGeo} material={darkMetalMat} position={[0, 0.65, 0]} />
          <mesh geometry={antennaTipGeo} material={accentMat} position={[0, 1.3, 0]} />
        </group>
        <group position={[0.62, 0.58, 1.15]}>
          <mesh geometry={antennaGeo} material={darkMetalMat} position={[0, 0.65, 0]} />
          <mesh geometry={antennaTipGeo} material={accentMat} position={[0, 1.3, 0]} />
        </group>

        {/* ====================================================================
            3. CANNON & RECOILING BARREL ASSEMBLY
            ==================================================================== */}
        {/* Armored Gun Mantlet / Rotor Shroud */}
        <mesh geometry={mantletGeo} material={mantletMat} position={[0, 0.3, -0.96]} castShadow />

        {/* Coaxial Secondary Autocannon */}
        <mesh geometry={coaxGeo} material={darkMetalMat} position={[-0.3, 0.3, -1.35]} rotation={[Math.PI / 2, 0, 0]} />

        {/* Recoiling Main Cannon Barrel Group */}
        <group ref={barrelRef} position={[0, 0.3, -1.05]}>
          {/* Thermal Sleeve Collar */}
          <mesh geometry={barrelRootGeo} material={darkMetalMat} position={[0, 0, -0.32]} rotation={[Math.PI / 2, 0, 0]} castShadow />
          {/* Main Heavy Rifled Barrel Tube */}
          <mesh geometry={barrelMainGeo} material={barrelMat} position={[0, 0, -1.45]} rotation={[Math.PI / 2, 0, 0]} castShadow />
          {/* Bore Evacuator Chamber */}
          <mesh geometry={boreEvacuatorGeo} material={plateMat} position={[0, 0, -1.25]} rotation={[Math.PI / 2, 0, 0]} castShadow />
          {/* Dual-Port Heavy Muzzle Brake */}
          <mesh geometry={muzzleBrakeGeo} material={darkMetalMat} position={[0, 0, -2.7]} castShadow />
          <mesh geometry={muzzlePortGeo} material={darkMetalMat} position={[0, 0, -2.7]} />

          {/* Muzzle World Anchor (True shot spawn position) */}
          <group ref={muzzleRef} position={[0, 0, -2.95]} />

          {/* Muzzle Flash Burst */}
          <mesh ref={flashRef} geometry={muzzleFlashGeo} material={flashMat} position={[0, 0, -2.95]} visible={false} />
        </group>
      </group>

      {/* ====================================================================
          4. TACTICAL COVER AURA (5M DEFENSIVE SHIELD PERIMETER)
          ==================================================================== */}
      <mesh
        ref={auraRef}
        geometry={auraRingGeo}
        material={auraMat}
        position={[0, -0.46, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />

      {/* Death explosion (hidden until tank destroyed) */}
      <mesh ref={explosionRef} geometry={explosionGeo} material={explosionMatRef} visible={false} />
    </group>
  );
}

// --- Tank entity (inside Physics) -------------------------------------------
const TankEntity = function TankEntity({ id, zone, onDespawn }) {
  const bodyRef = useRef();
  const groupRef = useRef();
  const explosionRef = useRef();
  const combatEntryRef = useRef(null);

  // Dynamic visual references
  const turretRef = useRef();
  const barrelRef = useRef();
  const muzzleRef = useRef();
  const flashRef = useRef();
  const auraRef = useRef();
  const wheelRefs = useRef([]);

  // Animation states
  const turretYaw = useRef(0);
  const recoil = useRef(0);
  const flashTimer = useRef(0);
  const wheelSpin = useRef(0);

  const cooldown = useRef(0);
  const deathTimer = useRef(0);
  const hasDied = useRef(false);
  const sectorIndex = zone.x < -22.5 ? 0 : zone.x < 22.5 ? 1 : 2;
  const explosionMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff8833', transparent: true, opacity: 0 }), []);

  // Body activation and combat registration
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setTranslation({ x: zone.x, y: 0.5, z: zone.z }, true);

    const profile = BALANCE.units.tank;
    const entry = {
      id, team: 'friendly', type: 'tank', sectorIndex, squadId: `tank-${id}`,
      profile, bodyRef, aimHeight: 1.0, heading: TANK.initialFacing,
      cooldown: 0, aiTarget: null,
      health: profile.health, maxHealth: profile.health,
      alive: true, bornAt: battle.elapsed, targetScan: 0,
    };
    combat.units.push(entry);
    combat.byBody.set(body.handle, entry);
    combatEntryRef.current = entry;

    return () => {
      entry.alive = false;
      if (combat.byBody.get(body.handle) === entry) combat.byBody.delete(body.handle);
      const idx = combat.units.indexOf(entry);
      if (idx >= 0) combat.units.splice(idx, 1);
      combatEntryRef.current = null;
    };
  }, [id, zone, sectorIndex]);

  useFrame((_state, delta) => {
    const body = bodyRef.current;
    const group = groupRef.current;
    if (!body || !group) return;
    if (gameState.paused) return;

    const entry = combatEntryRef.current;
    if (!entry) return;

    // --- Death animation: explosion sphere scales up and fades --------------
    if (!entry.alive) {
      if (!hasDied.current) {
        hasDied.current = true;
        recordRemoval(entry, 'death');
        if (group) group.visible = false;
        if (explosionRef.current) {
          explosionRef.current.visible = true;
          explosionMat.opacity = 0.85;
        }
      }
      deathTimer.current += delta;
      const t = Math.min(1, deathTimer.current / 2);
      if (explosionRef.current) {
        explosionRef.current.scale.setScalar(1 + t * 4);
        explosionMat.opacity = 0.85 * (1 - t);
      }
      if (deathTimer.current >= 2) { onDespawn(id); return; }
      return;
    }

    const pos = body.translation();
    const frontlineZ = FRONT.rows[2]; // z=14 — defensive hold line
    const isAdvancing = pos.z > frontlineZ + 2;

    // --- Drive to frontline if not there yet --------------------------------
    if (isAdvancing) {
      body.setLinvel({ x: 0, y: 0, z: -TANK.moveSpeed }, true);
      group.rotation.y = TANK.initialFacing; // face -Z
      // Spin road wheels realistically while moving
      wheelSpin.current += delta * TANK.moveSpeed * 3.8;
      for (let i = 0; i < wheelRefs.current.length; i++) {
        const w = wheelRefs.current[i];
        if (w) w.rotation.x = wheelSpin.current;
      }
    } else {
      // Hold position at the frontline
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      group.rotation.y = TANK.initialFacing;
    }

    // --- Scan for enemies and traverse turret / fire -------------------------
    const enemy = findNearestEnemy(entry, entry.profile.range, canSeeTarget);
    if (enemy) {
      const ep = enemy.bodyRef.current.translation();
      // Calculate local turret yaw toward enemy (relative to chassis heading)
      const worldAngle = Math.atan2(ep.x - pos.x, ep.z - pos.z);
      let desiredYaw = worldAngle - group.rotation.y;
      while (desiredYaw > Math.PI) desiredYaw -= Math.PI * 2;
      while (desiredYaw < -Math.PI) desiredYaw += Math.PI * 2;

      // Smoothly traverse turret toward enemy (2.5 rad/sec)
      const diff = desiredYaw - turretYaw.current;
      turretYaw.current += Math.sign(diff) * Math.min(Math.abs(diff), 2.5 * delta);

      // Fire cannon if cooldown elapsed & turret approximately on target
      cooldown.current -= delta;
      if (cooldown.current <= 0 && Math.abs(diff) < 0.4) {
        if (muzzleRef.current) {
          muzzleRef.current.getWorldPosition(_muzzle);
        } else {
          _muzzle.set(
            pos.x + Math.sin(group.rotation.y + turretYaw.current) * 2.2,
            pos.y + 1.0,
            pos.z + Math.cos(group.rotation.y + turretYaw.current) * 2.2
          );
        }
        _aim.set(ep.x, ep.y + 0.8, ep.z);
        fireShot(entry, _muzzle, _aim);
        cooldown.current = entry.profile.cooldown;
        recoil.current = 0.22;
        flashTimer.current = 0.08;
      }
    } else {
      // Smoothly return turret to centerline when idle
      const diff = -turretYaw.current;
      turretYaw.current += Math.sign(diff) * Math.min(Math.abs(diff), 1.4 * delta);
    }

    if (turretRef.current) {
      turretRef.current.rotation.y = turretYaw.current;
    }

    // Cannon barrel recoil recovery
    if (recoil.current > 0) {
      recoil.current = Math.max(0, recoil.current - delta * 1.5);
    }
    if (barrelRef.current) {
      barrelRef.current.position.z = -1.05 + recoil.current;
    }

    // Muzzle flash visibility decay
    if (flashRef.current) {
      if (flashTimer.current > 0) {
        flashTimer.current -= delta;
        flashRef.current.visible = true;
      } else {
        flashRef.current.visible = false;
      }
    }

    // Cover aura soft breathing pulse
    if (auraRef.current) {
      auraMat.opacity = 0.16 + Math.sin(_state.clock.elapsedTime * 2.5) * 0.06;
    }
  });

  return (
    <RigidBody ref={bodyRef} colliders={false} lockRotations canSleep={false} name="friendly-tank" ccd>
      <CuboidCollider
        args={[TANK.colliderHalfWidth, TANK.colliderHalfHeight, TANK.colliderHalfDepth]}
        position={[0, TANK.colliderY, 0]}
      />
      <group ref={groupRef} visible={true}>
        <TankVisual
          turretRef={turretRef}
          barrelRef={barrelRef}
          muzzleRef={muzzleRef}
          flashRef={flashRef}
          auraRef={auraRef}
          wheelRefs={wheelRefs.current}
          explosionRef={explosionRef}
          explosionMatRef={explosionMat}
        />
      </group>
    </RigidBody>
  );
};

// --- Tank delivery ship (visual only, outside Physics) ----------------------
const _shipDir = new THREE.Vector3();
function moveToward(pos, tx, ty, tz, step) {
  _shipDir.set(tx - pos.x, ty - pos.y, tz - pos.z);
  const dist = _shipDir.length();
  if (dist <= step) { pos.set(tx, ty, tz); return true; }
  pos.addScaledVector(_shipDir, 1 / dist * step);
  return false;
}

function TankDeliveryShip({ shipId, zone, onLand, onComplete }) {
  const groupRef = useRef();
  const phase = useRef('approach');
  const unloadTimer = useRef(0);
  const landed = useRef(false);
  const pos = useRef(new THREE.Vector3(zone.x, CARGO_SHIP.cruiseAltitude, MAP.HALF + 30));

  const { scene } = useGLTF(CARGO_SHIP.modelUrl);
  const model = useMemo(() => {
    const clone = cloneSkeleton(scene);
    clone.traverse(node => {
      if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z);
    const scale = CARGO_SHIP.targetLength / maxDim;
    const offset = new THREE.Vector3(-center.x * scale, -box.min.y * scale, -center.z * scale);
    return { clone, scale, offset };
  }, [scene]);

  useFrame((_, delta) => {
    if (gameState.paused) return;
    const group = groupRef.current;
    if (!group) return;

    const p = pos.current;
    let targetYaw = group.rotation.y;

    switch (phase.current) {
      case 'approach': {
        if (moveToward(p, zone.x, CARGO_SHIP.cruiseAltitude, zone.z, CARGO_SHIP.approachSpeed * delta)) {
          phase.current = 'descend';
        }
        targetYaw = Math.atan2(zone.x - p.x, zone.z - p.z);
        break;
      }
      case 'descend': {
        if (moveToward(p, zone.x, 0, zone.z, CARGO_SHIP.descentSpeed * delta)) {
          phase.current = 'unload';
          unloadTimer.current = 0;
          if (!landed.current) {
            landed.current = true;
            onLand();
          }
        }
        break;
      }
      case 'unload': {
        unloadTimer.current += delta;
        if (unloadTimer.current >= CARGO_SHIP.landingPause) {
          phase.current = 'depart';
        }
        break;
      }
      case 'depart': {
        const dz = MAP.HALF + 50;
        if (moveToward(p, zone.x, CARGO_SHIP.cruiseAltitude, dz, CARGO_SHIP.takeoffSpeed * delta)) {
          phase.current = 'done';
          onComplete(shipId);
        }
        targetYaw = Math.atan2(zone.x - p.x, dz - p.z);
        break;
      }
    }

    group.position.copy(p);
    if (phase.current === 'approach' || phase.current === 'depart') {
      let diff = targetYaw - group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      group.rotation.y += diff * Math.min(1, delta * 3);
    }
  });

  return (
    <group ref={groupRef}>
      <group position={model.offset} scale={model.scale}>
        <primitive object={model.clone} />
      </group>
    </group>
  );
}

// --- Tank delivery manager (outside Physics) --------------------------------
export function TankDeliveryManager() {
  const shipsRef = useRef([]);
  const deliveryTimer = useRef(-TANK_DELIVERY.startDelay);
  const [, publish] = useReducer(n => n + 1, 0);

  useEffect(() => {
    const reset = () => {
      shipsRef.current = [];
      deliveryTimer.current = -TANK_DELIVERY.startDelay;
      publish();
    };
    EventBus.on('reset-game', reset);
    return () => EventBus.off('reset-game', reset);
  }, []);

  useFrame((_, delta) => {
    if (gameState.paused) return;

    deliveryTimer.current += delta;
    if (deliveryTimer.current < TANK_DELIVERY.interval) return;
    deliveryTimer.current = 0;

    // Only launch if under the tank population cap
    const activeTanks = combat.units.filter(u => u.team === 'friendly' && u.type === 'tank' && u.alive).length;
    if (activeTanks >= TANK_DELIVERY.maxAlive) return;

    // Find a free landing zone (shared with soldier delivery ships)
    const zone = CARGO_SHIP.landingZones.find(z => !cargoShipState.occupiedZones.has(z.id));
    if (!zone) return;

    cargoShipState.occupiedZones.add(zone.id);
    cargoShipState.activeShipCount++;
    const shipId = tankState.nextShipId++;
    shipsRef.current.push({ id: shipId, zone });
    publish();
  });

  const handleComplete = useCallback(shipId => {
    const ship = shipsRef.current.find(s => s.id === shipId);
    if (ship) {
      cargoShipState.occupiedZones.delete(ship.zone.id);
      cargoShipState.activeShipCount--;
    }
    shipsRef.current = shipsRef.current.filter(s => s.id !== shipId);
    publish();
  }, []);

  return (
    <>
      {shipsRef.current.map(ship => (
        <Suspense key={ship.id} fallback={null}>
          <TankDeliveryShip
            shipId={ship.id}
            zone={ship.zone}
            onLand={() => {
              tankState.pendingSpawns.push({ id: tankState.nextTankId++, zone: ship.zone });
              tankState.firstTankDelivered = true;
            }}
            onComplete={handleComplete}
          />
        </Suspense>
      ))}
    </>
  );
}

// --- Tank entity manager (inside Physics) -----------------------------------
export function TankEntityManager() {
  const tanksRef = useRef([]);
  const [, publish] = useReducer(n => n + 1, 0);

  useEffect(() => {
    const reset = () => {
      tanksRef.current = [];
      publish();
      EventBus.emit('tank-count-changed', 0);
    };
    EventBus.on('reset-game', reset);
    return () => EventBus.off('reset-game', reset);
  }, []);

  useFrame((_, delta) => {
    if (gameState.paused) return;
    // Consume pending spawns (discrete event, not per-frame)
    let spawned = false;
    while (tankState.pendingSpawns.length > 0 && tanksRef.current.length < TANK_DELIVERY.maxAlive) {
      const spawn = tankState.pendingSpawns.shift();
      tanksRef.current.push(spawn);
      spawned = true;
    }
    if (spawned) {
      publish();
      EventBus.emit('tank-count-changed', tanksRef.current.length);
    }
  });

  const handleDespawn = useCallback(id => {
    tanksRef.current = tanksRef.current.filter(t => t.id !== id);
    publish();
    EventBus.emit('tank-count-changed', tanksRef.current.length);
  }, []);

  return (
    <>
      {tanksRef.current.map(tank => (
        <TankEntity key={tank.id} id={tank.id} zone={tank.zone} onDespawn={handleDespawn} />
      ))}
    </>
  );
}