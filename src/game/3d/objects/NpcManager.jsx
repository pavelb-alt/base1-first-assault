import { memo, useRef, useEffect, useMemo, Component, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { clonePooledModel } from '@/game/3d/objects/pooledModel';
import { LANES, ENEMY_TYPES, BALANCE } from '@/game/config';
import { combat, findNearestEnemy } from '@/game/3d/combat';
import { fireShot } from '@/game/3d/ballistics';
import { useWavePool, squadSpeed } from '@/game/3d/waves';
import { battle, recordRemoval } from '@/game/3d/battleMetrics';
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
const NpcBody = memo(function NpcBody({ id, laneIndex, type, active, squadId, spawnOffset, slot, onDespawn }) {
  const config = ENEMY_TYPES[type];
  const profile = BALANCE.units[type];
  const bodyRef = useRef();
  const groupRef = useRef();
  const wpIndex = useRef(0);
  const currentAnim = useRef(null);
  const combatEntryRef = useRef(null);
  const attackTimer = useRef(0);

  const lane = lanePaths[laneIndex];
  const isFlying = config.hoverHeight > 0;

  // Load the model (cached by useGLTF — one fetch per URL, many clones)
  const { scene, animations } = useGLTF(config.modelUrl);
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

  // Initialize: play idle animation
  useEffect(() => {
    if (actions[config.animIdle]) {
      actions[config.animIdle].play();
      currentAnim.current = config.animIdle;
    }
  }, [actions, config]);

  // Lease a pre-mounted body for a wave; cleanup releases the old registry entry.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setEnabled(active);
    body.setTranslation(active
      ? { x: lane.points[0].x + spawnOffset.x, y: isFlying ? config.hoverHeight : 0.1, z: lane.points[0].z + spawnOffset.z }
      : { x: slot * 3, y: -100, z: -100 }, true);
    wpIndex.current = 1; attackTimer.current = 0;
    if (!active) return;
    const entry = { id, team: 'enemy', type, laneIndex, squadId, profile,
      bodyRef, aimHeight: config.colliderY, health: profile.health, maxHealth: profile.health,
      alive: true, bornAt: battle.elapsed, targetScan: 0 };
    combat.units.push(entry); combat.byBody.set(body.handle, entry); combatEntryRef.current = entry;
    return () => {
      entry.alive = false;
      if (combat.byBody.get(body.handle) === entry) combat.byBody.delete(body.handle);
      const index = combat.units.indexOf(entry);
      if (index >= 0) combat.units.splice(index, 1);
      combatEntryRef.current = null;
    };
  }, [id, active, type, laneIndex, squadId, spawnOffset, slot, lane, isFlying, config, profile]);

  useFrame((_state, delta) => {
    if (!active || gameState.paused) return;
    const body = bodyRef.current;
    const group = groupRef.current;
    if (!body || !group) return;

    const pos = body.translation();

    // Check if dead
    const entry = combatEntryRef.current;
    if (!entry) return;
    if (!entry.alive) {
      onDespawn(id);
      return;
    }

    // Find nearest enemy (friendly) within attack range
    const enemy = entry ? findNearestEnemy(entry, profile.range) : null;
    attackTimer.current = Math.max(-profile.cooldown, attackTimer.current - delta);

    if (enemy) {
      // In range — stop and attack
      const vel = body.linvel();
      body.setLinvel({ x: 0, y: isFlying ? (config.hoverHeight - pos.y) * 5 : vel.y, z: 0 }, true);
      const enemyPos = enemy.bodyRef.current.translation();
      group.rotation.y = Math.atan2(enemyPos.x - pos.x, enemyPos.z - pos.z) + config.facingOffset;

      if (attackTimer.current <= 0) {
        attackTimer.current = Math.max(0, attackTimer.current + profile.cooldown);
        playAnimation(config.animAttack);
        shotOrigin.set(pos.x, pos.y + config.colliderY, pos.z);
        shotAim.set(enemyPos.x, enemyPos.y + enemy.aimHeight, enemyPos.z);
        fireShot(entry, shotOrigin, shotAim);
      } else {
        playAnimation(config.animIdle);
      }
      return;
    }

    // No enemy in range — continue lane movement without banking a burst.
    attackTimer.current = 0;
    const target = lane.points[wpIndex.current];
    if (!target) return;

    // Preserve the formation's lateral spacing at every waypoint.
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
        // Existing bases have no HP; record an arrival, not fictional damage.
        recordRemoval(entry, 'breach');
        entry.alive = false;
        onDespawn(id);
        return;
      }
    } else {
      _dir.normalize();
      moving = true;
      const vel = body.linvel();
      const speed = squadSpeed(entry, pos, _dir.x, _dir.z);

      if (isFlying) {
        // Flying unit: spring toward hover height, move horizontally
        const targetY = config.hoverHeight;
        const yVel = (targetY - pos.y) * 5;
        body.setLinvel(
          { x: _dir.x * speed, y: yVel, z: _dir.z * speed },
          true,
        );
      } else {
        // Ground unit: preserve vertical velocity (gravity)
        body.setLinvel(
          { x: _dir.x * speed, y: vel.y, z: _dir.z * speed },
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
      <group ref={groupRef} visible={active}>
        <primitive object={clonedScene} scale={config.scale} />
      </group>
    </RigidBody>
  );
});

// All three enemy models load before the first complete wave is scheduled.
export function NpcManager() {
  useGLTF(Object.values(ENEMY_TYPES).map(t => t.modelUrl));
  const { slots: npcs, despawn: handleDespawn } = useWavePool('enemy');
  return (
    <>
      {npcs.map((npc) => (
        <NpcErrorBoundary key={npc.slot}>
          <Suspense fallback={
            <mesh position={[0, 1, 0]}>
              <boxGeometry args={[0.8, 1.5, 0.8]} />
              <meshStandardMaterial color="#facc15" emissive="#ca8a04" emissiveIntensity={0.2} />
            </mesh>
          }>
            <NpcBody {...npc} onDespawn={handleDespawn} />
          </Suspense>
        </NpcErrorBoundary>
      ))}
    </>
  );
}