import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { DRESSING } from '@/game/config';
import { OUTPOST, OUTPOSTS } from '@/game/3d/dressing/outpostLayout';

const wallMaterial = { color: '#6f6759', roughness: 0.96 };
const innerMaterial = { color: '#514d45', roughness: 1 };
const metalMaterial = { color: DRESSING.rust, roughness: 0.85 };

function Solid({ position, size, material = wallMaterial, rotation = [0, 0, 0] }) {
  return <>
    <CuboidCollider args={size.map(v => v / 2)} position={position} rotation={rotation} />
    <mesh position={position} rotation={rotation} castShadow receiveShadow userData={{ shotCover: true }}>
      <boxGeometry args={size} />
      <meshStandardMaterial {...material} />
    </mesh>
  </>;
}

function Ruin({ outpost, index }) {
  const sideLength = OUTPOST.halfDepth * 2;
  const doorSegment = OUTPOST.halfWidth - OUTPOST.doorwayHalfWidth;
  const segmentX = OUTPOST.doorwayHalfWidth + doorSegment / 2;
  const opposite = index % 2 ? -1 : 1;
  return (
    <RigidBody type="fixed" colliders={false} position={[outpost.x, 0, outpost.z]} rotation={[0, outpost.rotation, 0]} friction={0.45}>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[OUTPOST.halfWidth * 2, 0.08, sideLength]} />
        <meshStandardMaterial color={innerMaterial.color} roughness={1} />
      </mesh>

      {/* Doorway walls: broken low sections provide firing cover without sealing the ruin. */}
      {[-1, 1].flatMap(side => [-1, 1].map(xSide => (
        <Solid key={`${side}:${xSide}`} position={[xSide * segmentX, 0.62, side * OUTPOST.halfDepth]}
          size={[doorSegment, 1.24 + (side === opposite && xSide > 0 ? 0.45 : 0), 0.42]} />
      )))}

      {/* Side walls retain tall corner fragments and window-sized breaks. */}
      {[-1, 1].flatMap(side => [-1, 0, 1].map((zStep, part) => (
        <Solid key={`side:${side}:${part}`} position={[side * OUTPOST.halfWidth, 0.8 + (part === 1 ? 0.35 : 0), zStep * 2.65]}
          size={[0.42, part === 1 ? 2.3 : 1.6, 1.55]} />
      )))}

      {/* Collapsed roof beams and interior crates add silhouette and close cover. */}
      <Solid position={[-2.6, 2.45, -0.6]} size={[5.8, 0.24, 0.28]} material={metalMaterial} rotation={[0.08, 0.12, -0.18]} />
      <Solid position={[2.9, 1.95, 1.5]} size={[0.25, 3.7, 0.25]} material={metalMaterial} rotation={[0, 0, 0.18]} />
      <Solid position={[3.55, 0.42, 0]} size={[1.25, 0.84, 1.1]} material={innerMaterial} />

      {/* Debris stays visual-only so entrances and tactical paths remain dependable. */}
      {[-3.7, 3.6].map((x, i) => (
        <mesh key={`debris:${i}`} position={[x, 0.18, opposite * (1.2 + i)]} rotation={[0.2, i, 0.15]} castShadow>
          <icosahedronGeometry args={[0.46 + i * 0.12, 0]} />
          <meshStandardMaterial color={DRESSING.rock} roughness={1} flatShading />
        </mesh>
      ))}
    </RigidBody>
  );
}

export function RuinedOutposts() {
  return <group name="Enterable ruined outposts">
    {OUTPOSTS.map((outpost, index) => <Ruin key={outpost.id} outpost={outpost} index={index} />)}
  </group>;
}