import { memo, useRef, useCallback, useEffect, useMemo, Component, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { clonePooledModel } from '@/game/3d/objects/pooledModel';
import { EventBus } from '@/game/EventBus';
import { SOLDIER, LANES, FRIENDLY, BALANCE } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { input } from '@/game/3d/input';
import { combat, findNearestEnemy } from '@/game/3d/combat';
import { useWeaponAttachment } from '@/game/3d/objects/WeaponAttachment';
import { WEAPONS } from '@/game/3d/weapons';
import { useWavePool } from '@/game/3d/waves';
import { battle, recordRemoval } from '@/game/3d/battleMetrics';

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
const FriendlySoldier = memo(function FriendlySoldier({ id, weaponId, laneIndex, spawnOffset, active, squadId, slot, onDespawn }) {
  const bodyRef = useRef();
  const groupRef = useRef();
  const wpIndex = useRef(0);
  const currentAnim = useRef('Idle');
  const targetRotation = useRef(SOLDIER.initialFacing);
  const prevSpace = useRef(false);
  const jumpsRemaining = useRef(SOLDIER.maxJumps);
  const wasPossessed = useRef(false);
  const combatEntryRef = useRef(null);

  const lane = friendlyLanePaths[laneIndex];

  // Load the model (cached by useGLTF — one fetch per URL, many clones)
  const { scene, animations } = useGLTF(SOLDIER.modelUrl);
  const { actions, mixer } = useAnimations(animations, groupRef);
  useEffect(() => { mixer.timeScale = active ? 1 : 0; }, [active, mixer]);

  // Skeleton-safe deep clone — preserves bone bindings, allows independent animation
  const clonedScene = useMemo(() => clonePooledModel(scene, animations), [scene, animations]);

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

  // Body activation and registration are handled together below.

  // Listen for external rotation set (only apply if this is the possessed soldier)
  useEffect(() => {
    const onSetRotation = ({ id: targetId, rotation }) => {
      if (targetId === id) targetRotation.current = rotation;
    };
    EventBus.on('set-soldier-rotation', onSetRotation);
    return () => EventBus.off('set-soldier-rotation', onSetRotation);
  }, [id]);

  // Reuse the mounted model/body; each lease gets a fresh identity and HP.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setEnabled(active);
    body.setTranslation(active
      ? { x: lane.points[0].x + spawnOffset.x, y: 0.1, z: lane.points[0].z + spawnOffset.z }
      : { x: slot * 3, y: -100, z: 100 }, true);
    wpIndex.current = 1; targetRotation.current = SOLDIER.initialFacing;
    jumpsRemaining.current = SOLDIER.maxJumps; prevSpace.current = false; wasPossessed.current = false;
    if (!active) return;
    const profile = BALANCE.units.soldier;
    const entry = { id, team: 'friendly', type: 'soldier', laneIndex, squadId, profile,
      bodyRef, weaponId, aimHeight: SOLDIER.colliderY, cooldown: 0, aiTarget: null,
      health: profile.health, maxHealth: profile.health, alive: true, bornAt: battle.elapsed, targetScan: 0 };
    combat.units.push(entry); combat.byBody.set(body.handle, entry); combatEntryRef.current = entry;
    return () => {
      entry.alive = false;
      if (combat.byBody.get(body.handle) === entry) combat.byBody.delete(body.handle);
      const idx = combat.units.indexOf(entry);
      if (idx >= 0) combat.units.splice(idx, 1);
      combatEntryRef.current = null;
    };
  }, [id, active, weaponId, laneIndex, squadId, spawnOffset, slot, lane]);

  useWeaponAttachment(clonedScene, weaponId, combatEntryRef, id, active);

  // The wave pool owns reset/activation, avoiding one reset timer per soldier.

  useFrame((_state, delta) => {
    const body = bodyRef.current;
    const group = groupRef.current;
    if (!body || !group) return;

    if (!active || gameState.paused) return;
    const entry = combatEntryRef.current;
    if (!entry) return;
    if (!entry.alive) { onDespawn(id); return; }
    entry.aiTarget = null;
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

      // WeaponAttachment consumes the same held fire state after camera/animation updates.
      targetRotation.current = yaw;
    } else {
      // --- AI mode: combat + lane movement ---
      const entry = combatEntryRef.current;

      // Find nearest enemy within attack range
      const enemy = entry ? findNearestEnemy(entry, entry.profile.range) : null;

      if (enemy) {
        // In range — stop and attack
        body.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
        const enemyPos = enemy.bodyRef.current.translation();
        targetRotation.current = Math.atan2(enemyPos.x - pos.x, enemyPos.z - pos.z);

        if (entry) entry.aiTarget = enemy;
        playAnimation('Idle');
      } else {
        // No enemy in range — continue lane movement
        const target = lane.points[wpIndex.current];
        if (!target) return;

        const previous = lane.points[Math.max(0, wpIndex.current - 1)];
        const sx = target.x - previous.x, sz = target.z - previous.z, length = Math.hypot(sx, sz) || 1;
        const first = lane.points[1], start = lane.points[0];
        const firstLength = Math.hypot(first.x - start.x, first.z - start.z);
        const lateral = (-(first.z - start.z) * spawnOffset.x + (first.x - start.x) * spawnOffset.z) / firstLength;
        _dir.set(target.x - sz / length * lateral - pos.x, 0, target.z + sx / length * lateral - pos.z);
        const dist = _dir.length();

        let moving = false;

        if (dist < 1.2) {
          wpIndex.current++;
          if (wpIndex.current >= lane.points.length) {
            recordRemoval(entry, 'breach');
            entry.alive = false;
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
  }, -2);

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
        visible={active}
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
});

// --- Manager: wave-based spawning for friendly soldiers --------------------
export function FriendlySoldierManager() {
  useGLTF([SOLDIER.modelUrl, ...Object.values(WEAPONS).map(w => w.url)]);
  const { slots: soldiers, despawn } = useWavePool('friendly');
  friendlyRegistry.soldiers = soldiers.filter(s => s.active);
  const handleDespawn = useCallback(id => {
    if (gameState.possessedSoldierId === id) EventBus.emit('release-soldier');
    if (gameState.selectedSoldierId === id) {
      gameState.selectedSoldierId = null;
      EventBus.emit('soldier-deselected');
    }
    despawn(id);
  }, [despawn]);
  return (
    <>
      {soldiers.map((soldier) => (
        <SoldierErrorBoundary key={soldier.slot}>
          <Suspense fallback={
            <mesh position={[0, 0.75, 0]}>
              <boxGeometry args={[0.8, 1.5, 0.8]} />
              <meshStandardMaterial color="#facc15" emissive="#ca8a04" emissiveIntensity={0.2} />
            </mesh>
          }>
            <FriendlySoldier {...soldier} onDespawn={handleDespawn} />
          </Suspense>
        </SoldierErrorBoundary>
      ))}
    </>
  );
}