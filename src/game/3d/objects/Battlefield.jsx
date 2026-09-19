import { useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { MAP, BASES, LANES, OBSTACLES } from '@/game/config';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';

// --- Lane visual strip between consecutive waypoints -----------------------
function LaneStrip({ waypoints, color, width }) {
  const strips = useMemo(() => {
    const result = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = new THREE.Vector3(...waypoints[i]);
      const b = new THREE.Vector3(...waypoints[i + 1]);
      const mid = a.clone().lerp(b, 0.5);
      const dir = b.clone().sub(a);
      const len = dir.length();
      const angle = Math.atan2(dir.x, dir.z);
      result.push({ mid, len, angle, key: i });
    }
    return result;
  }, [waypoints]);

  return (
    <>
      {strips.map((s) => (
        <mesh key={s.key} position={[s.mid.x, 0.03, s.mid.z]} rotation={[0, s.angle, 0]} receiveShadow>
          <boxGeometry args={[width, 0.06, s.len]} />
          <meshStandardMaterial color={color} transparent opacity={0.3} />
        </mesh>
      ))}
      {waypoints.map((wp, i) => (
        <mesh key={`wp-${i}`} position={[wp[0], 0.05, wp[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.5, 8]} />
          <meshStandardMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

// --- Faction base platform --------------------------------------------------
function Base({ position, color, accentColor }) {
  return (
    <group position={position} userData={{ shotCover: true }}>
      <mesh position={[0, 0.1, 0]} receiveShadow castShadow>
        <boxGeometry args={[7, 0.2, 7]} />
        <meshStandardMaterial color="#4a5568" />
      </mesh>
      <mesh position={[0, 0.16, 0]} receiveShadow>
        <boxGeometry args={[7.3, 0.12, 7.3]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.2} />
      </mesh>
      {[[2.5, 2.5], [-2.5, 2.5], [2.5, -2.5], [-2.5, -2.5]].map(([x, z], i) => (
        <mesh key={i} position={[x, 1, z]} castShadow>
          <boxGeometry args={[0.4, 2, 0.4]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.8, 1, 6]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

// --- Full battlefield -------------------------------------------------------
export function Battlefield() {
  const obstacleGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const obstacleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.8 }), []);

  // Boundary walls — just outside the walkable area, explicit colliders
  const walls = useMemo(() => [
    { pos: [0, 4, -MAP.HALF - 1], args: [MAP.HALF, 4, 1] },   // North
    { pos: [0, 4, MAP.HALF + 1], args: [MAP.HALF, 4, 1] },     // South
    { pos: [-MAP.HALF - 1, 4, 0], args: [1, 4, MAP.HALF] },     // West
    { pos: [MAP.HALF + 1, 4, 0], args: [1, 4, MAP.HALF] },      // East
  ], []);

  return (
    <group>
      {/* Ground plane — click to deselect soldier */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, -0.5, 0]} receiveShadow onClick={() => {
          if (gameState.mode === 'strategic' && gameState.selectedSoldierId !== null) {
            gameState.selectedSoldierId = null;
            EventBus.emit('soldier-deselected');
          }
        }}>
          <boxGeometry args={[MAP.SIZE, 1, MAP.SIZE]} />
          <meshStandardMaterial color={MAP.GROUND_COLOR} roughness={0.9} />
        </mesh>
      </RigidBody>

      {/* Grid overlay */}
      <gridHelper args={[MAP.SIZE, 40, '#64748b', '#94a3b8']} position={[0, 0.01, 0]} />

      {/* Lane strips */}
      <LaneStrip waypoints={LANES.top.waypoints} color={LANES.top.color} width={MAP.LANE_WIDTH} />
      <LaneStrip waypoints={LANES.mid.waypoints} color={LANES.mid.color} width={MAP.LANE_WIDTH} />
      <LaneStrip waypoints={LANES.bot.waypoints} color={LANES.bot.color} width={MAP.LANE_WIDTH} />

      {/* Diagonal separator (river equivalent) */}
      <mesh position={[0, 0.02, 0]} rotation={[0, Math.PI / 4, 0]} receiveShadow>
        <boxGeometry args={[1.5, 0.04, MAP.SIZE * 1.414]} />
        <meshStandardMaterial color="#1e3a5f" transparent opacity={0.25} />
      </mesh>

      {/* Bases */}
      <Base position={BASES.friendly.position} color={BASES.friendly.color} accentColor={BASES.friendly.accentColor} />
      <Base position={BASES.enemy.position} color={BASES.enemy.color} accentColor={BASES.enemy.accentColor} />

      {/* Obstacle blocks */}
      {OBSTACLES.map((obs, i) => (
        <RigidBody key={i} type="fixed" colliders="cuboid" position={obs.pos}>
          <mesh
            geometry={obstacleGeo}
            material={obstacleMat}
            scale={[obs.size[0], obs.size[1], obs.size[2]]}
            castShadow
            receiveShadow
          />
        </RigidBody>
      ))}

      {/* Boundary walls — invisible explicit colliders */}
      {walls.map((w, i) => (
        <RigidBody key={`wall-${i}`} type="fixed" colliders={false}>
          <CuboidCollider args={w.args} position={w.pos} />
        </RigidBody>
      ))}
    </group>
  );
}