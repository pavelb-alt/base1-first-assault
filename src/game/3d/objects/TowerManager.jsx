import { useRef, useReducer, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { TOWER_DEFENSE } from '@/game/config';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { combat } from '@/game/3d/combat';
import { gameState } from '@/game/3d/world';
import { battle } from '@/game/3d/battleMetrics';

// Raycaster for ground-plane intersection (screen → world)
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPoint = new THREE.Vector3();

// Scratch vectors — never allocate inside useFrame
const _targetPos = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();

// Shared geometries/materials for tower visuals
const baseGeo = new THREE.CylinderGeometry(1, 1.1, 0.4, 8);
const turretGeo = new THREE.BoxGeometry(0.5, 0.4, 0.6);
const barrelGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6);
barrelGeo.rotateX(Math.PI / 2);
barrelGeo.translate(0, 0, -0.5);
const ringGeo = new THREE.RingGeometry(0.9, 1, 32);
ringGeo.rotateX(-Math.PI / 2);

function towerMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3 });
}

const TOWER_MATERIALS = {};
function getMaterial(type) {
  const cfg = TOWER_DEFENSE.towers[type];
  if (!cfg) return null;
  if (!TOWER_MATERIALS[type]) TOWER_MATERIALS[type] = towerMaterial(cfg.color);
  return TOWER_MATERIALS[type];
}

const baseMaterial = new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.8, metalness: 0.2 });
const ringMaterial = new THREE.MeshBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.25, side: THREE.DoubleSide });

// Pseudo-tower entry for combat registry — lets fireShot/trace work with tower projectiles
function createTowerCombatEntry(tower, cfg) {
  return {
    id: `tower-${tower.id}`,
    team: 'friendly',
    type: 'tower',
    profile: { damage: cfg.damage, aiSpread: 0.02, range: cfg.range },
    bodyRef: { current: null },  // towers don't have physics bodies
    aimHeight: 1.2,
    alive: true,
    weapon: null,
  };
}

function Tower({ tower }) {
  const groupRef = useRef();
  const barrelRef = useRef();
  const cfg = TOWER_DEFENSE.towers[tower.type];
  const material = getMaterial(tower.type);
  const combatEntry = useMemo(() => {
    const entry = createTowerCombatEntry(tower, cfg);
    entry.bodyRef = { current: null }; // towers have no physics body — fine for projectile exclusion
    return entry;
  }, [tower.id, cfg]);

  useFrame((_state, delta) => {
    if (gameState.paused) return;
    const group = groupRef.current;
    const barrel = barrelRef.current;
    if (!group || !barrel) return;

    tower.cooldown = Math.max(0, tower.cooldown - delta);

    // Find nearest enemy in range using spatial grid
    const tx = tower.position.x, tz = tower.position.z;
    let nearest = null;
    let nearestDist = cfg.range;

    for (const unit of combat.units) {
      if (!unit.alive || unit.team !== 'enemy' || !unit.bodyRef?.current) continue;
      const p = unit.bodyRef.current.translation();
      const dist = Math.hypot(p.x - tx, p.z - tz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = unit;
      }
    }

    tower.targetId = nearest?.id ?? null;

    if (nearest) {
      // Rotate turret toward target
      const p = nearest.bodyRef.current.translation();
      const yaw = Math.atan2(p.x - tx, p.z - tz);
      group.rotation.y = yaw;

      // Fire on cooldown
      if (tower.cooldown <= 0) {
        _origin.set(tx, 1.2, tz);
        _aim.set(p.x, p.y + nearest.aimHeight, p.z);
        // Use fireShot with the tower's combat entry as shooter
        const shot = {
          origin: _origin.toArray(),
          direction: _dir.subVectors(_aim, _origin).normalize().toArray(),
          team: 'friendly',
          shooterId: combatEntry.id,
          shooter: combatEntry,
          player: false,
          damage: cfg.damage,
        };
        // Directly push to pending projectiles (bypassing fireShot's shooter validation)
        if (combat.physics) {
          combat.pendingProjectiles.push(shot);
          combat.stats.shots++;
          battle.shots.friendly++;
          if (combat.muzzleEffects.length < 128) {
            combat.muzzleEffects.push({ position: [...shot.origin], direction: [...shot.direction] });
          }
          combat.stats.muzzleFlashes++;
        }
        tower.cooldown = cfg.cooldown;

        // Frost tower applies slow on hit via a delayed effect
        if (tower.type === 'frost' && tower.slowFactor) {
          // Apply slow immediately since we don't track per-projectile effects
          nearest.slowUntil = battle.elapsed + tower.slowDuration;
          nearest.slowFactor = tower.slowFactor;
        }
      }
    }
  });

  return (
    <group position={[tower.position.x, 0, tower.position.z]}>
      {/* Range ring on ground */}
      <mesh geometry={ringGeo} material={ringMaterial} scale={[cfg.range, cfg.range, 1]} />
      {/* Base platform */}
      <mesh geometry={baseGeo} material={baseMaterial} scale={[cfg.baseRadius, 1, cfg.baseRadius]} castShadow receiveShadow position={[0, 0.2, 0]} />
      {/* Turret */}
      <group ref={groupRef} position={[0, 0.5, 0]}>
        <mesh geometry={turretGeo} material={material} castShadow />
        {/* Barrel */}
        <group ref={barrelRef} position={[0, 0, -0.3]}>
          <mesh geometry={barrelGeo} material={material} scale={[1, 1, cfg.barrelLength]} castShadow position={[0, 0, -cfg.barrelLength * 0.5]} />
        </group>
      </group>
    </group>
  );
}

export function TowerManager() {
  const { camera } = useThree();
  const [, publish] = useReducer(n => n + 1, 0);

  useEffect(() => {
    const onPlace = () => publish();
    const onReset = () => { towerDefenseState.reset(); publish(); };
    EventBus.on('tower-placed', onPlace);
    EventBus.on('reset-game', onReset);

    // Handle right-click ground raycast: screen point → world position on y=0 plane
    const onGroundRequest = ({ x, y, rect }) => {
      if (!camera) return;
      _ndc.x = (x / rect.width) * 2 - 1;
      _ndc.y = -(y / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_ndc, camera);
      const hit = _raycaster.ray.intersectPlane(_groundPlane, _hitPoint);
      if (hit) {
        EventBus.emit('ground-position-response', { x: hit.x, z: hit.z });
      }
    };
    EventBus.on('request-ground-position', onGroundRequest);

    return () => {
      EventBus.off('tower-placed', onPlace);
      EventBus.off('reset-game', onReset);
      EventBus.off('request-ground-position', onGroundRequest);
    };
  }, [camera]);

  return (
    <>
      {towerDefenseState.towers.map(t => (
        <Tower key={t.id} tower={t} />
      ))}
    </>
  );
}