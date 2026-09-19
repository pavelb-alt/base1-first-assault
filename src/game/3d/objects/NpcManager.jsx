import { useState, useRef, useCallback, useEffect, useMemo, Component, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { LANES, NPCS, ENEMY_TYPES, COMBAT } from '@/game/config';
import { EventBus } from '@/game/EventBus';
import { combat, findNearestEnemy } from '@/game/3d/combat';
import { fireShot } from '@/game/3d/ballistics';
import { random } from '@/game/3d/random';
import { gameState } from '@/game/3d/world';
const shotOrigin = new THREE.Vector3();
const shotAim = new THREE.Vector3();

// Preload all enemy models at module scope (loaded once, cached by URL)
Object.values(ENEMY_TYPES).forEach((t) => useGLTF.preload(t.modelUrl));

// Lane paths (reversed: enemy base → friendly base)
const lanePaths = Object.values(LANES).map((lane) => ({
  name: lane.name,
  color: lane.color,
  points: [...lane.waypoints].reverse().map((wp) => new THREE.Vector3(wp[0], 0, wp[2])),
}));

// Scratch vector — never allocate inside useFrame
const _dir = new THREE.Vector3();

// --- Error boundary so a failed GLB doesn't crash the canvas ----------------
class NpcErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <mesh position={[0, 1, 0]} castShadow>
          <boxGeometry args={[0.8, 1.5, 0.8]} />
          <meshStandardMaterial color="#ff4444" emissive="#ff0000" emissiveIntensity={0.2} />
        </mesh>
      );
    }
    return this.props.children;
  }
}

// --- Single NPC: GLB model + lane movement + independent animation ----------
function NpcBody({ id, laneIndex, type, onDespawn }) {
  const config = ENEMY_TYPES[type];
  const bodyRef = useRef();
  const groupRef = useRef();
  const wpIndex = useRef(0);
  const spawned = useRef(false);
  const currentAnim = useRef(null);
  const combatEntryRef = useRef(null);
  const attackTimer = useRef(0);

  const lane = lanePaths[laneIndex];
  const isFlying = config.hoverHeight > 0;

  // Load the model (cached by useGLTF — one fetch per URL, many clones)
  const { scene, animations } = useGLTF(config.modelUrl);
  const { actions } = useAnimations(animations, groupRef);

  // Skeleton-safe deep clone — preserves bone bindings, allows independent animation
  const clonedScene = useMemo(() => {
    const clone = cloneSkeleton(scene);
    clone.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  // Play an animation with smooth fade (silently skips unknown names)
  const playAnimation = (name) => {
    if (currentAnim.current === name) return;
    const next = actions[name];
    if (!next) return;
    const old = actions[currentAnim.current];
    if (old) old.fadeOut(0.2);
    next.reset().fadeIn(0.2).play();
    currentAnim.current = name;
  };

  // Initialize: play idle animation
  useEffect(() => {
    if (actions[config.animIdle]) {
      actions[config.animIdle].play();
      currentAnim.current = config.animIdle;
    }
  }, [actions, config]);

  // Register in combat system
  useEffect(() => {
    const entry = {
      id,
      team: 'enemy',
      bodyRef, aimHeight: config.colliderY,
      health: COMBAT.maxHealth,
      maxHealth: COMBAT.maxHealth,
      alive: true,
    };
    combat.units.push(entry);
    combatEntryRef.current = entry;
    return () => {
      const idx = combat.units.indexOf(entry);
      if (idx >= 0) combat.units.splice(idx, 1);
      combatEntryRef.current = null;
    };
  }, [id]);

  // Set initial spawn position once the body exists
  useEffect(() => {
    if (bodyRef.current && !spawned.current) {
      spawned.current = true;
      const spawnY = isFlying ? config.hoverHeight : 0.1;
      bodyRef.current.setTranslation(
        { x: lane.points[0].x, y: spawnY, z: lane.points[0].z },
        true,
      );
    }
  }, [lane, isFlying, config]);

  useFrame((_state, delta) => {
    if (gameState.paused) return;
    const body = bodyRef.current;
    const group = groupRef.current;
    if (!body || !group) return;

    const pos = body.translation();

    // Check if dead
    const entry = combatEntryRef.current;
    if (entry && !entry.alive) {
      onDespawn(id);
      return;
    }

    // Find nearest enemy (friendly) within attack range
    const enemy = entry ? findNearestEnemy(entry, COMBAT.attackRange) : null;

    if (enemy) {
      // In range — stop and attack
      const vel = body.linvel();
      body.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
      const enemyPos = enemy.bodyRef.current.translation();
      group.rotation.y = Math.atan2(enemyPos.x - pos.x, enemyPos.z - pos.z) + config.facingOffset;

      attackTimer.current -= delta;
      if (attackTimer.current <= 0) {
        attackTimer.current = COMBAT.attackCooldown;
        playAnimation(config.animAttack);
        shotOrigin.set(pos.x, pos.y + 1, pos.z);
        shotAim.set(enemyPos.x, enemyPos.y + enemy.aimHeight, enemyPos.z);
        fireShot(entry, shotOrigin, shotAim);
      } else {
        playAnimation(config.animIdle);
      }
      return;
    }

    // No enemy in range — continue lane movement
    const target = lane.points[wpIndex.current];
    if (!target) return;

    _dir.set(target.x - pos.x, 0, target.z - pos.z);
    const dist = _dir.length();

    let moving = false;

    if (dist < 1.2) {
      wpIndex.current++;
      if (wpIndex.current >= lane.points.length) {
        // Reached friendly base — despawn
        onDespawn(id);
        return;
      }
    } else {
      _dir.normalize();
      moving = true;
      const vel = body.linvel();

      if (isFlying) {
        // Flying unit: spring toward hover height, move horizontally
        const targetY = config.hoverHeight;
        const yVel = (targetY - pos.y) * 5;
        body.setLinvel(
          { x: _dir.x * NPCS.moveSpeed, y: yVel, z: _dir.z * NPCS.moveSpeed },
          true,
        );
      } else {
        // Ground unit: preserve vertical velocity (gravity)
        body.setLinvel(
          { x: _dir.x * NPCS.moveSpeed, y: vel.y, z: _dir.z * NPCS.moveSpeed },
          true,
        );
      }
      // Face movement direction (model forward = +Z)
      group.rotation.y = Math.atan2(_dir.x, _dir.z) + config.facingOffset;
    }

    // Animation state
    if (moving) {
      playAnimation(config.animMove || config.animIdle);
    } else {
      playAnimation(config.animIdle);
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      lockRotations
      canSleep={false}
      gravityScale={isFlying ? 0 : 1}
    >
      <CapsuleCollider
        args={[config.colliderHalfHeight, config.colliderRadius]}
        position={[0, config.colliderY, 0]}
      />
      <group ref={groupRef}>
        <primitive object={clonedScene} scale={config.scale} />
      </group>
    </RigidBody>
  );
}

// --- Manager: wave-based spawning with type distribution --------------------
export function NpcManager() {
  const [npcs, setNpcs] = useState([]);
  const npcsRef = useRef([]);
  const nextId = useRef(0);
  const timers = useRef(lanePaths.map(() => 0));
  const commanderLane = useRef(0);     // rotates each commander spawn
  const commanderAlive = useRef(false); // only one Trilobite at a time

  npcsRef.current = npcs;

  const handleDespawn = useCallback((id) => {
    setNpcs((prev) => {
      const npc = prev.find((n) => n.id === id);
      if (npc && npc.type === 'trilobite') {
        commanderAlive.current = false;
      }
      return prev.filter((n) => n.id !== id);
    });
  }, []);

  // Reset: clear all NPCs and timers, reset commander state
  useEffect(() => {
    const onReset = () => {
      setNpcs([]);
      npcsRef.current = [];
      timers.current = lanePaths.map(() => 0);
      commanderLane.current = 0;
      commanderAlive.current = false;
    };
    EventBus.on('reset-game', onReset);
    return () => EventBus.off('reset-game', onReset);
  }, []);

  // Spawn loop — per-lane timers, type distribution, one commander per wave
  useFrame((_state, delta) => {
    if (gameState.paused) return;
    const current = npcsRef.current;
    let spawned = false;

    for (let i = 0; i < timers.current.length; i++) {
      timers.current[i] += delta;
      const laneCount = current.filter((n) => n.laneIndex === i).length;
      if (timers.current[i] >= NPCS.spawnInterval && laneCount < NPCS.maxPerLane) {
        timers.current[i] = 0;
        nextId.current++;

        let type;
        const cmdLane = commanderLane.current % lanePaths.length;
        if (!commanderAlive.current && i === cmdLane) {
          // Spawn the single commander for this wave in a rotating lane
          type = 'trilobite';
          commanderAlive.current = true;
          commanderLane.current++;
        } else {
          // Regular enemy: mostly QuadShell, sometimes EyeDrone
          type = random() < NPCS.eyeDroneChance ? 'eyedrone' : 'quadshell';
        }

        current.push({ id: nextId.current, laneIndex: i, type });
        spawned = true;
      }
    }
    if (spawned) setNpcs([...current]);
  });

  return (
    <>
      {npcs.map((npc) => (
        <NpcErrorBoundary key={npc.id}>
          <Suspense fallback={
            <mesh position={[0, 1, 0]}>
              <boxGeometry args={[0.8, 1.5, 0.8]} />
              <meshStandardMaterial color="#facc15" emissive="#ca8a04" emissiveIntensity={0.2} />
            </mesh>
          }>
            <NpcBody
              id={npc.id}
              laneIndex={npc.laneIndex}
              type={npc.type}
              onDespawn={handleDespawn}
            />
          </Suspense>
        </NpcErrorBoundary>
      ))}
    </>
  );
}