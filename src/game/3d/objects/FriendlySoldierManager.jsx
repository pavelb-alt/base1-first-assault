import { useState, useRef, useCallback, useEffect, useMemo, Component, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { EventBus } from '@/game/EventBus';
import { SOLDIER, LANES, NPCS, FRIENDLY, COMBAT } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { input } from '@/game/3d/input';
import { combat, findNearestEnemy } from '@/game/3d/combat';

// Start downloading the model as soon as the module loads
useGLTF.preload(SOLDIER.modelUrl);

// Friendly lane paths (friendly base → enemy base, original waypoint order)
const friendlyLanePaths = Object.values(LANES).map((lane) => ({
  name: lane.name,
  color: lane.color,
  points: lane.waypoints.map((wp) => new THREE.Vector3(wp[0], 0, wp[2])),
}));

// Scratch vectors — never allocate inside useFrame
const _dir = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

// Module-level flag so only the first loaded soldier emits the loaded event
let modelLoaded = false;

// Module-level registry for verification (read by window.game API)
export const friendlyRegistry = { soldiers: [] };

// --- Error boundary so a failed GLB doesn't crash the canvas ----------------
class SoldierErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error.message || 'Unknown error' };
  }
  componentDidCatch(error) {
    gameState.error = error.message;
    EventBus.emit('soldier-error', error.message);
  }
  render() {
    if (this.state.hasError) {
      return (
        <mesh position={[0, 0.75, 0]} castShadow>
          <boxGeometry args={[0.8, 1.5, 0.8]} />
          <meshStandardMaterial color="#ff4444" emissive="#ff0000" emissiveIntensity={0.3} />
        </mesh>
      );
    }
    return this.props.children;
  }
}

// --- Single friendly soldier: GLB model + lane AI + possession -------------
function FriendlySoldier({ id, laneIndex, spawnOffset, onDespawn }) {
  const bodyRef = useRef();
  const groupRef = useRef();
  const wpIndex = useRef(0);
  const spawned = useRef(false);
  const currentAnim = useRef('Idle');
  const targetRotation = useRef(SOLDIER.initialFacing);
  const prevSpace = useRef(false);
  const jumpsRemaining = useRef(SOLDIER.maxJumps);
  const wasPossessed = useRef(false);
  const combatEntryRef = useRef(null);
  const attackTimer = useRef(0);

  const lane = friendlyLanePaths[laneIndex];

  // Load the model (cached by useGLTF — one fetch per URL, many clones)
  const { scene, animations } = useGLTF(SOLDIER.modelUrl);
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

  // Initialize: play idle, emit loaded (first soldier only)
  useEffect(() => {
    if (actions.Idle) actions.Idle.play();
    if (!modelLoaded) {
      modelLoaded = true;
      gameState.loaded = true;
      gameState.error = null;
      EventBus.emit('soldier-loaded');
    }
  }, [actions]);

  // Set initial spawn position once the body exists
  useEffect(() => {
    if (bodyRef.current && !spawned.current) {
      spawned.current = true;
      const start = lane.points[0];
      bodyRef.current.setTranslation(
        { x: start.x + spawnOffset.x, y: 0.1, z: start.z + spawnOffset.z },
        true,
      );
    }
  }, [lane, spawnOffset]);

  // Listen for external rotation set (only apply if this is the possessed soldier)
  useEffect(() => {
    const onSetRotation = ({ id: targetId, rotation }) => {
      if (targetId === id) targetRotation.current = rotation;
    };
    EventBus.on('set-soldier-rotation', onSetRotation);
    return () => EventBus.off('set-soldier-rotation', onSetRotation);
  }, [id]);

  // Register in combat system
  useEffect(() => {
    const entry = {
      id,
      team: 'friendly',
      bodyRef,
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

  // Listen for reset
  useEffect(() => {
    const onReset = () => {
      if (bodyRef.current) {
        bodyRef.current.setTranslation(
          { x: lane.points[0].x + spawnOffset.x, y: 0.1, z: lane.points[0].z + spawnOffset.z },
          true,
        );
        bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      wpIndex.current = 0;
      targetRotation.current = SOLDIER.initialFacing;
      jumpsRemaining.current = SOLDIER.maxJumps;
      prevSpace.current = false;
      wasPossessed.current = false;
      attackTimer.current = 0;
    };
    EventBus.on('reset-game', onReset);
    return () => EventBus.off('reset-game', onReset);
  }, [lane, spawnOffset]);

  useFrame((_state, delta) => {
    const body = bodyRef.current;
    const group = groupRef.current;
    if (!body || !group) return;

    const pos = body.translation();
    const vel = body.linvel();
    const isPossessed = gameState.possessedSoldierId === id;
    const isSelected = gameState.selectedSoldierId === id;

    // Update gameState.soldierPosition if this is the active soldier
    if (isPossessed || isSelected) {
      gameState.soldierPosition.set(pos.x, pos.y, pos.z);
    }

    // Ground detection: low position + low vertical velocity
    const grounded = pos.y < SOLDIER.groundThreshold && Math.abs(vel.y) < 0.5;
    if (grounded) jumpsRemaining.current = SOLDIER.maxJumps;

    // Transition from possessed → AI: recalculate nearest waypoint
    if (wasPossessed.current && !isPossessed) {
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < lane.points.length; i++) {
        const d = Math.hypot(lane.points[i].x - pos.x, lane.points[i].z - pos.z);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      }
      wpIndex.current = Math.min(nearestIdx + 1, lane.points.length - 1);
    }
    wasPossessed.current = isPossessed;

    if (isPossessed && gameState.mode === 'third_person') {
      // --- Player control (same as original Soldier) ---
      const keys = input.keys;
      const yaw = gameState.cameraYaw;

      // Jump (edge-press on Space)
      const spacePressed = !!keys.Space;
      let verticalVelocity = vel.y;
      let jumpAnimation = null;
      if (spacePressed && !prevSpace.current && jumpsRemaining.current > 0) {
        const isDouble = jumpsRemaining.current === SOLDIER.maxJumps - 1;
        verticalVelocity = SOLDIER.jumpForce;
        jumpsRemaining.current--;
        jumpAnimation = isDouble ? 'DoubleJump' : 'Jump';
      }
      prevSpace.current = spacePressed;

      // Camera-relative movement axes
      _forward.set(Math.sin(yaw), 0, Math.cos(yaw));
      _right.set(-Math.cos(yaw), 0, Math.sin(yaw));

      let mx = 0, mz = 0;
      if (keys.KeyW) { mx += _forward.x; mz += _forward.z; }
      if (keys.KeyS) { mx -= _forward.x; mz -= _forward.z; }
      if (keys.KeyD) { mx += _right.x;   mz += _right.z; }
      if (keys.KeyA) { mx -= _right.x;   mz -= _right.z; }

      const moving = mx !== 0 || mz !== 0;

      if (moving) {
        const len = Math.sqrt(mx * mx + mz * mz);
        mx /= len; mz /= len;
        body.setLinvel(
          { x: mx * SOLDIER.moveSpeed, y: verticalVelocity, z: mz * SOLDIER.moveSpeed },
          true,
        );
        targetRotation.current = Math.atan2(mx, mz);
        if (grounded && !jumpAnimation) playAnimation('Running');
      } else {
        body.setLinvel({ x: 0, y: verticalVelocity, z: 0 }, true);
        if (grounded && !jumpAnimation) playAnimation('Idle');
      }

      if (jumpAnimation) {
        playAnimation(jumpAnimation);
      } else if (!grounded) {
        if (vel.y > 0.5) playAnimation('Jump');
        else if (vel.y < -0.5) playAnimation('Idle');
      }
    } else {
      // --- AI mode: combat + lane movement ---
      const entry = combatEntryRef.current;

      // Check if dead
      if (entry && !entry.alive) {
        onDespawn(id);
        return;
      }

      // Find nearest enemy within attack range
      const enemy = entry ? findNearestEnemy(entry, COMBAT.attackRange) : null;

      if (enemy) {
        // In range — stop and attack
        body.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
        const enemyPos = enemy.bodyRef.current.translation();
        targetRotation.current = Math.atan2(enemyPos.x - pos.x, enemyPos.z - pos.z);

        attackTimer.current -= delta;
        if (attackTimer.current <= 0) {
          attackTimer.current = COMBAT.attackCooldown;
          playAnimation(SOLDIER.animAttack || 'Attack');
          combat.pendingProjectiles.push({
            origin: [pos.x, pos.y + 1.0, pos.z],
            targetId: enemy.id,
            damage: COMBAT.projectileDamage,
            team: 'friendly',
          });
        } else {
          playAnimation('Idle');
        }
      } else {
        // No enemy in range — continue lane movement
        const target = lane.points[wpIndex.current];
        if (!target) return;

        _dir.set(target.x - pos.x, 0, target.z - pos.z);
        const dist = _dir.length();

        let moving = false;

        if (dist < 1.2) {
          wpIndex.current++;
          if (wpIndex.current >= lane.points.length) {
            onDespawn(id);
            return;
          }
        } else {
          _dir.normalize();
          moving = true;
          body.setLinvel(
            { x: _dir.x * FRIENDLY.moveSpeed, y: vel.y, z: _dir.z * FRIENDLY.moveSpeed },
            true,
          );
          targetRotation.current = Math.atan2(_dir.x, _dir.z);
        }

        if (moving) {
          playAnimation('Running');
        } else {
          playAnimation('Idle');
        }
      }
    }

    // Smooth rotation toward target
    const cur = group.rotation.y;
    const tgt = targetRotation.current;
    let diff = tgt - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    group.rotation.y = cur + diff * Math.min(1, delta * 10);
  });

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      lockRotations
      canSleep={false}
      name="friendly-soldier"
    >
      <CapsuleCollider
        args={[SOLDIER.colliderHalfHeight, SOLDIER.colliderRadius]}
        position={[0, SOLDIER.colliderY, 0]}
      />
      <group
        ref={groupRef}
        rotation={[0, SOLDIER.initialFacing, 0]}
        onClick={(e) => {
          e.stopPropagation();
          if (gameState.mode === 'strategic') {
            gameState.selectedSoldierId = id;
            EventBus.emit('soldier-selected');
          }
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (gameState.mode === 'strategic') document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        <primitive object={clonedScene} scale={SOLDIER.scale} />
      </group>
    </RigidBody>
  );
}

// --- Manager: wave-based spawning for friendly soldiers --------------------
export function FriendlySoldierManager() {
  const [soldiers, setSoldiers] = useState([]);
  const soldiersRef = useRef([]);
  const nextId = useRef(0);
  const waveTimer = useRef(0);
  const firstWaveSpawned = useRef(false);

  soldiersRef.current = soldiers;
  friendlyRegistry.soldiers = soldiers;

  // Compute staggered spawn offsets perpendicular to the lane direction
  const computeSpawnOffsets = useCallback((laneIndex) => {
    const lane = friendlyLanePaths[laneIndex];
    const start = lane.points[0];
    const next = lane.points[1] || start;
    const dx = next.x - start.x;
    const dz = next.z - start.z;
    const len = Math.hypot(dx, dz) || 1;
    const perpX = -dz / len;
    const perpZ = dx / len;

    const offsets = [];
    for (let i = 0; i < FRIENDLY.perLane; i++) {
      const offset = (i - (FRIENDLY.perLane - 1) / 2) * FRIENDLY.staggerOffset;
      offsets.push({ x: perpX * offset, z: perpZ * offset });
    }
    return offsets;
  }, []);

  // Spawn a wave: FRIENDLY.perLane soldiers per lane
  const spawnWave = useCallback(() => {
    if (soldiersRef.current.length >= FRIENDLY.maxAlive) return;

    const newSoldiers = [];
    for (let li = 0; li < friendlyLanePaths.length; li++) {
      const offsets = computeSpawnOffsets(li);
      for (let si = 0; si < FRIENDLY.perLane; si++) {
        nextId.current++;
        newSoldiers.push({
          id: nextId.current,
          laneIndex: li,
          spawnOffset: offsets[si],
        });
      }
    }

    // Respect cap — only add as many as we can fit
    const remaining = FRIENDLY.maxAlive - soldiersRef.current.length;
    const toAdd = newSoldiers.slice(0, remaining);
    if (toAdd.length > 0) {
      setSoldiers((prev) => [...prev, ...toAdd]);
    }
  }, [computeSpawnOffsets]);

  const handleDespawn = useCallback((id) => {
    setSoldiers((prev) => prev.filter((s) => s.id !== id));
    if (gameState.selectedSoldierId === id) {
      gameState.selectedSoldierId = null;
      EventBus.emit('soldier-deselected');
    }
  }, []);

  // Reset: clear all soldiers and timers
  useEffect(() => {
    const onReset = () => {
      setSoldiers([]);
      soldiersRef.current = [];
      waveTimer.current = 0;
      firstWaveSpawned.current = false;
      gameState.selectedSoldierId = null;
      gameState.possessedSoldierId = null;
    };
    EventBus.on('reset-game', onReset);
    return () => EventBus.off('reset-game', onReset);
  }, []);

  // Possess / release handlers
  useEffect(() => {
    const onPossess = () => {
      gameState.possessedSoldierId = gameState.selectedSoldierId;
    };
    const onRelease = () => {
      gameState.possessedSoldierId = null;
      gameState.selectedSoldierId = null;
    };
    EventBus.on('possess-soldier', onPossess);
    EventBus.on('release-soldier', onRelease);
    return () => {
      EventBus.off('possess-soldier', onPossess);
      EventBus.off('release-soldier', onRelease);
    };
  }, []);

  // Spawn loop — first wave at start, then existing enemy-wave cadence
  useFrame((_state, delta) => {
    if (!firstWaveSpawned.current) {
      firstWaveSpawned.current = true;
      spawnWave();
      return;
    }

    waveTimer.current += delta;
    if (waveTimer.current >= NPCS.spawnInterval) {
      waveTimer.current = 0;
      if (soldiersRef.current.length < FRIENDLY.maxAlive) {
        spawnWave();
      }
    }
  });

  return (
    <>
      {soldiers.map((soldier) => (
        <SoldierErrorBoundary key={soldier.id}>
          <Suspense fallback={
            <mesh position={[0, 0.75, 0]}>
              <boxGeometry args={[0.8, 1.5, 0.8]} />
              <meshStandardMaterial color="#facc15" emissive="#ca8a04" emissiveIntensity={0.2} />
            </mesh>
          }>
            <FriendlySoldier
              id={soldier.id}
              laneIndex={soldier.laneIndex}
              spawnOffset={soldier.spawnOffset}
              onDespawn={handleDespawn}
            />
          </Suspense>
        </SoldierErrorBoundary>
      ))}
    </>
  );
}