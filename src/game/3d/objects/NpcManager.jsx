import { useState, useRef, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { LANES, NPCS } from '@/game/config';

// Lane paths (reversed: enemy base → friendly base)
const lanePaths = Object.values(LANES).map((lane) => ({
  name: lane.name,
  color: lane.color,
  points: [...lane.waypoints].reverse().map((wp) => new THREE.Vector3(wp[0], 0, wp[2])),
}));

// Scratch
const _dir = new THREE.Vector3();

// --- Single NPC: self-contained movement + despawn --------------------------
function NpcBody({ id, laneIndex, color, onDespawn }) {
  const bodyRef = useRef();
  const groupRef = useRef();
  const wpIndex = useRef(0);
  const spawned = useRef(false);

  const lane = lanePaths[laneIndex];

  // Set initial spawn position once the body exists
  useEffect(() => {
    if (bodyRef.current && !spawned.current) {
      spawned.current = true;
      bodyRef.current.setTranslation(
        { x: lane.points[0].x, y: 0.1, z: lane.points[0].z },
        true,
      );
    }
  }, [lane]);

  useFrame((_state, delta) => {
    const body = bodyRef.current;
    const group = groupRef.current;
    if (!body || !group) return;

    // Movement toward current waypoint
    const target = lane.points[wpIndex.current];
    if (!target) return;

    const pos = body.translation();
    _dir.set(target.x - pos.x, 0, target.z - pos.z);
    const dist = _dir.length();

    if (dist < 1.2) {
      wpIndex.current++;
      if (wpIndex.current >= lane.points.length) {
        // Reached friendly base
        onDespawn(id);
        return;
      }
    } else {
      _dir.normalize();
      const vel = body.linvel();
      body.setLinvel(
        { x: _dir.x * NPCS.moveSpeed, y: vel.y, z: _dir.z * NPCS.moveSpeed },
        true,
      );
      // Face movement direction
      group.rotation.y = Math.atan2(_dir.x, _dir.z);
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      lockRotations
      canSleep={false}
    >
      <CapsuleCollider args={[0.4, 0.35]} position={[0, 0.9, 0]} />
      <group ref={groupRef}>
        {/* Body */}
        <mesh position={[0, 0.9, 0]} castShadow>
          <capsuleGeometry args={[0.35, 0.8, 4, 8]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 1.55, 0]} castShadow>
          <boxGeometry args={[0.45, 0.35, 0.45]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.4} emissive={color} emissiveIntensity={0.1} />
        </mesh>
        {/* Eyes */}
        <mesh position={[-0.1, 1.58, 0.23]}>
          <sphereGeometry args={[0.06, 6, 6]} />
          <meshStandardMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[0.1, 1.58, 0.23]}>
          <sphereGeometry args={[0.06, 6, 6]} />
          <meshStandardMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={0.8} />
        </mesh>
        {/* Arms */}
        <mesh position={[-0.5, 0.95, 0]} castShadow>
          <capsuleGeometry args={[0.12, 0.5, 4, 6]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[0.5, 0.95, 0]} castShadow>
          <capsuleGeometry args={[0.12, 0.5, 4, 6]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
        </mesh>
      </group>
    </RigidBody>
  );
}

// --- Manager: spawns NPCs periodically, despawns on arrival ------------------
export function NpcManager() {
  const [npcs, setNpcs] = useState([]);
  const npcsRef = useRef([]); // authoritative list, avoids stale closures in useFrame
  const nextId = useRef(0);
  const timers = useRef(lanePaths.map(() => 0));

  // Keep ref in sync with state
  npcsRef.current = npcs;

  // Spawn loop using useFrame for timing
  useFrame((_state, delta) => {
    const current = npcsRef.current;
    let spawned = false;
    for (let i = 0; i < timers.current.length; i++) {
      timers.current[i] += delta;
      const laneCount = current.filter((n) => n.laneIndex === i).length;
      if (timers.current[i] >= NPCS.spawnInterval && laneCount < NPCS.maxPerLane) {
        timers.current[i] = 0;
        nextId.current++;
        current.push({ id: nextId.current, laneIndex: i, color: NPCS.enemyColor });
        spawned = true;
      }
    }
    if (spawned) setNpcs([...current]);
  });

  const handleDespawn = useCallback((id) => {
    setNpcs((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <>
      {npcs.map((npc) => (
        <NpcBody
          key={npc.id}
          id={npc.id}
          laneIndex={npc.laneIndex}
          color={npc.color}
          onDespawn={handleDespawn}
        />
      ))}
    </>
  );
}