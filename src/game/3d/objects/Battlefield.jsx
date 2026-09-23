import { BASES, DRESSING } from '@/game/config';
import { BattlefieldDressing } from '@/game/3d/objects/BattlefieldDressing';
import { TrenchTerrain } from '@/game/3d/objects/TrenchTerrain';
import { CityObstacles } from '@/game/3d/objects/CityObstacles';
import { BattlefieldDetail } from '@/game/3d/objects/BattlefieldDetail';

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
  return <group>
    <TrenchTerrain />
    <Base {...BASES.friendly} color={DRESSING.friendly} accentColor={DRESSING.friendlyAccent} />
    <Base {...BASES.enemy} color={DRESSING.enemy} accentColor={DRESSING.enemyAccent} />
    <BattlefieldDressing />
    <BattlefieldDetail />
    <CityObstacles />
  </group>;
}