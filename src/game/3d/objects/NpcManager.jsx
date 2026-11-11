import { memo, useRef, useEffect, useMemo, Component, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useUnitVisuals } from '@/game/3d/objects/useUnitVisuals';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { clonePooledModel } from '@/game/3d/objects/pooledModel';
import { ENEMY_TYPES, BALANCE, FRONT, BASE, WAVES } from '@/game/config';
import { updateEnemy, releaseCrossing } from '@/game/3d/navigation/enemyTraversal';
import { combat, findNearestEnemy } from '@/game/3d/combat';
import { fireShot, canSeeTarget } from '@/game/3d/ballistics';
import { useWavePool, waveState } from '@/game/3d/waves';
import { battle, recordRemoval } from '@/game/3d/battleMetrics';
import { gameState } from '@/game/3d/world';
import { selection, issueAttack } from '@/game/3d/commands';
import { resetDeathPose, updateDeathAnimation } from '@/game/3d/objects/deathAnimation';
const shotOrigin = new THREE.Vector3();
const shotAim = new THREE.Vector3();
const backOrigin = new THREE.Vector3();
const frontOrigin = new THREE.Vector3();

// Preload all enemy models at module scope (loaded once, cached by URL)
Object.values(ENEMY_TYPES).forEach((t) => useGLTF.preload(t.modelUrl));

// Enemies use species-specific terrain links rather than lane waypoints.

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
const NpcBody = memo(function NpcBody({ id, sectorIndex, type, active, squadId, spawnOffset, slot, onDespawn,
  elite = null, speedScale = 1, healthScale = 1, damageScale = 1 }) {
  const config = ENEMY_TYPES[type];
  const baseProfile = BALANCE.units[type];
  const bossScale = elite?.scale ?? 1;
  // Difficulty and elite status scale damage per unit; range/cadence stay authored.
  const profile = useMemo(() => ({ ...baseProfile,
    damage: baseProfile.damage * damageScale * (elite ? WAVES.boss.damage : 1) }), [baseProfile, damageScale, elite]);
  const bodyRef = useRef();
  const groupRef = useRef();
  const currentAnim = useRef(null);
  const combatEntryRef = useRef(null);
  const attackTimer = useRef(0);

  const isFlying = config.hoverHeight > 0;

  // Load the model (cached by useGLTF — one fetch per URL, many clones)
  const { scene, animations } = useGLTF(config.modelUrl);
  // Skeleton-safe deep clone — preserves bone bindings, allows independent animation
  const clonedScene = useMemo(() => clonePooledModel(scene, animations), [scene, animations]);
  const backCannon = useMemo(() => config.backCannon ? clonedScene.getObjectByName(config.backCannon.node) ?? null : null, [clonedScene, config]);
  const frontCannons = useMemo(() => config.frontCannons?.map(name => clonedScene.getObjectByName(name)) ?? null, [clonedScene, config]);
  const tailMuzzle = useMemo(() => config.tailGun
    ? clonedScene.getObjectByName(config.tailGun)?.getObjectByName(config.muzzleNode) : null, [clonedScene, config]);
  const { actions } = useUnitVisuals(animations, clonedScene, groupRef, bodyRef, active, 'enemy', id, slot);

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
      ? { x: spawnOffset.x, y: isFlying ? config.hoverHeight : 0.1, z: spawnOffset.z }
      : { x: slot * 3, y: -100, z: -100 }, true);
    attackTimer.current = 0;
    resetDeathPose(groupRef.current, actions, config.animIdle, currentAnim);
    if (!active) return;
    const maxHealth = elite ? elite.health : Math.round(profile.health * healthScale);
    const moveSpeed = (config.moveSpeed ?? BALANCE.moveSpeed) * speedScale * (elite ? WAVES.boss.speed : 1);
    const entry = { id, team: 'enemy', type, sectorIndex, squadId, profile,
      bodyRef, aimHeight: config.colliderY * bossScale, footOffset: (config.colliderY-config.colliderHalfHeight-config.colliderRadius) * bossScale,
      hoverHeight:config.hoverHeight, moveSpeed, heading:0, nav:null, health: maxHealth, maxHealth,
      alive: true, bornAt: battle.elapsed, targetScan: 0, shotsFired: 0, visualScale: bossScale,
      elite: !!elite, boss: !!elite?.boss, bossName: elite?.name ?? null,
      breachDamage: elite ? BASE.bossBreachDamage : BASE.breachByType[type] ?? BASE.breachDamage,
      scrapReward: elite ? WAVES.boss.reward : null };
    combat.units.push(entry); combat.byBody.set(body.handle, entry); combatEntryRef.current = entry;
    if (elite?.boss && waveState.boss && waveState.boss.wave === elite.wave && !waveState.boss.entry) waveState.boss.entry = entry;
    return () => {
      entry.alive = false;
      releaseCrossing(entry);
      if (combat.byBody.get(body.handle) === entry) combat.byBody.delete(body.handle);
      const index = combat.units.indexOf(entry);
      if (index >= 0) combat.units.splice(index, 1);
      combatEntryRef.current = null;
    };
  }, [id, active, type, sectorIndex, squadId, spawnOffset, slot, isFlying, config, profile, actions, elite, bossScale, speedScale, healthScale]);

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
      if (!entry.playDeathAnimation || updateDeathAnimation(entry, body, group, actions, currentAnim, delta, { flying: isFlying })) onDespawn(id);
      return;
    }

    entry.aiTarget=null;
    const target=entry.nav?.phase==='jump'?null:findNearestEnemy(entry,profile.range,canSeeTarget);
    if(updateEnemy(entry,delta,target)) {
      recordRemoval(entry,'breach');entry.alive=false;releaseCrossing(entry);onDespawn(id);return;
    }
    attackTimer.current=Math.max(-profile.cooldown,attackTimer.current-delta);
    const enemy=entry.aiTarget;
    if(enemy) {
      const p=enemy.bodyRef.current.translation();
      entry.heading=Math.atan2(p.x-pos.x,p.z-pos.z);
      if(attackTimer.current<=0) {
        shotOrigin.set(pos.x,pos.y+config.colliderY,pos.z);
        shotAim.set(p.x,p.y+enemy.aimHeight,p.z);
        if (frontCannons) {
          // 403's pair of front guns: the same ballistic path and cadence as the walker.
          group.rotation.y=entry.heading+config.facingOffset;
          group.updateWorldMatrix(true,true);
          for (const cannon of frontCannons) {
            if (!cannon) continue;
            cannon.getWorldPosition(frontOrigin);
            if (fireShot(entry,frontOrigin,shotAim,shotOrigin)) entry.shotsFired++;
          }
        } else if (tailMuzzle) {
          group.rotation.y=entry.heading+config.facingOffset;
          group.updateWorldMatrix(true,true);
          tailMuzzle.getWorldPosition(frontOrigin);
          if (fireShot(entry,frontOrigin,shotAim,shotOrigin)) entry.shotsFired++;
        } else fireShot(entry,shotOrigin,shotAim);
        if(backCannon) {
          // Rear turret muzzle in world space; converges on the same target as the front shots.
          backCannon.updateWorldMatrix(true,false);
          backCannon.localToWorld(backOrigin.fromArray(config.backCannon.offset));
          fireShot(entry,backOrigin,shotAim,shotOrigin);
        }
        attackTimer.current=Math.max(0,attackTimer.current+profile.cooldown);
      }
      playAnimation(config.animAttack);
    } else {
      attackTimer.current=0;
      const v=body.linvel();
      playAnimation(entry.nav?.phase==='jump'?config.animIdle:Math.hypot(v.x,v.z)>0.2?config.animMove:config.animIdle);
    }
    group.rotation.y=entry.heading+config.facingOffset;
    // The physical capsule follows the ballistic arc; no nonexistent Jump clip.
    group.rotation.x=entry.nav?.phase==='jump'?-0.2*Math.sin(Math.PI*Math.min(1,entry.nav.jumpElapsed/FRONT.jumpDuration)):0;
  });

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      lockRotations
      canSleep={false}
      gravityScale={isFlying ? 0 : 1}
      ccd
    >
      <CapsuleCollider
        friction={0}
        args={[config.colliderHalfHeight * bossScale, config.colliderRadius * bossScale]}
        position={[0, (config.hitboxY ?? config.colliderY) * bossScale, config.hitboxZ ?? 0]}
        rotation={config.tailGun ? [Math.PI / 2, 0, 0] : undefined}
      />
      <group ref={groupRef} visible={active} onClick={e => {
        if (selection.units.length && issueAttack(combatEntryRef.current)) e.stopPropagation();
      }}>
        <primitive object={clonedScene} scale={config.scale * bossScale} />
      </group>
    </RigidBody>
  );
});

// All enemy models load before the first complete wave is scheduled.
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