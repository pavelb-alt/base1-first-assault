import { gameEvents } from '@/game/gameEvents';
import { useReducer, useEffect, useMemo } from 'react';
import { TowerVisual } from '@/game/3d/objects/TowerVisual';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { TOWER_DEFENSE, BASES } from '@/game/config';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { combat } from '@/game/3d/combat';
import { gameState } from '@/game/3d/world';
import { battle } from '@/game/3d/battleMetrics';
import { cameraAim, fireShot, trace } from '@/game/3d/ballistics';
import { isStationControlled } from '@/game/3d/stationControl';
import { input } from '@/game/3d/input';
import { TacticalOverlay } from '@/game/3d/abilities/TacticalOverlay';

// Raycaster for ground-plane intersection (screen → world)
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPoint = new THREE.Vector3();

// Scratch vectors — never allocate inside useFrame
const _origin = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();
const BASE_X = BASES.friendly.position[0], BASE_Z = BASES.friendly.position[2];

// Pseudo-tower entry for combat registry — lets fireShot/trace work with tower projectiles
function createTowerCombatEntry(tower, cfg) {
  return {
    id: `tower-${tower.id}`,
    team: 'friendly',
    type: 'tower',
    tower,
    profile: { damage: cfg.damage, aiSpread: 0.02, range: cfg.range },
    bodyRef: { current: null },  // towers don't have physics bodies
    aimHeight: 1.2,
    alive: true,
    weapon: null,
  };
}

// Target selection by the tower's priority. 'first' = the hostile closest to the base.
function pickTarget(tower, range) {
  const tx = tower.position.x, tz = tower.position.z, mode = tower.targeting ?? 'first';
  let best = null, bestScore = Infinity, bestDist = 0;
  for (const unit of combat.units) {
    if (!unit.alive || unit.team !== 'enemy' || !unit.bodyRef?.current) continue;
    const p = unit.bodyRef.current.translation();
    const dist = Math.hypot(p.x - tx, p.z - tz);
    if (dist >= range) continue;
    const score = mode === 'closest' ? dist
      : mode === 'strongest' ? -unit.health * 1000 + dist
      : Math.hypot(p.x - BASE_X, p.z - BASE_Z);
    if (score < bestScore) { bestScore = score; best = unit; bestDist = dist; }
  }
  return best ? { unit: best, dist: bestDist } : null;
}

function Tower({ tower }) {
  const cfg = TOWER_DEFENSE.towers[tower.type];
  const combatEntry = useMemo(() => createTowerCombatEntry(tower, cfg), [tower, cfg]);

  useFrame((_state, delta) => {
    if (gameState.paused) return;
    const stats = tower.stats;
    combatEntry.profile.damage = stats.damage;
    combatEntry.profile.range = stats.range;
    combatEntry.splashRadius = stats.splashRadius;
    combatEntry.splashDamage = stats.splashRadius ? stats.damage * 0.5 : null;

    tower.cooldown = Math.max(0, tower.cooldown - delta);

    if (isStationControlled('tower',tower.id)) {
      cameraAim(_state.camera,combatEntry,_aim);
      const tx=tower.position.x,tz=tower.position.z;
      tower.targetId=null;
      tower.aimYaw=Math.atan2(tx-_aim.x,tz-_aim.z);
      tower.aimPitch=Math.atan2(_aim.y-1.2,Math.hypot(_aim.x-tx,_aim.z-tz));
      _origin.set(tx,1.2,tz);
      if (input.mouseDown && tower.cooldown<=0 && fireShot(combatEntry,_origin,_aim,_origin,true)) {
        tower.cooldown=stats.cooldown; tower.shotsFired=(tower.shotsFired??0)+1;
        if (tower.type==='frost') {
          const distance=_dir.subVectors(_aim,_origin).length();
          const hit=trace(_origin,_dir.normalize(),distance+0.1,combatEntry)?.unit;
          if(hit?.alive && hit.team==='enemy') { hit.slowUntil=battle.elapsed+stats.slowDuration; hit.slowFactor=stats.slowFactor; }
        }
      }
      return;
    }
    const tx = tower.position.x, tz = tower.position.z;
    const found = pickTarget(tower, stats.range);
    const nearest = found?.unit ?? null;
    tower.targetId = nearest?.id ?? null;

    if (nearest) {
      // Model barrels face local -Z; visuals smoothly follow the combat target.
      const p = nearest.bodyRef.current.translation();
      tower.aimYaw = Math.atan2(tx - p.x, tz - p.z);
      tower.aimPitch = Math.atan2(p.y + nearest.aimHeight - 1.2, found.dist);

      // Fire on cooldown
      if (tower.cooldown <= 0) {
        _origin.set(tx, 1.2, tz);
        _aim.set(p.x, p.y + nearest.aimHeight, p.z);
        const shot = {
          origin: _origin.toArray(),
          direction: _dir.subVectors(_aim, _origin).normalize().toArray(),
          team: 'friendly',
          shooterId: combatEntry.id,
          shooter: combatEntry,
          player: false,
          damage: stats.damage,
          splashRadius: combatEntry.splashRadius,
          splashDamage: combatEntry.splashDamage,
        };
        // Directly push to pending projectiles (bypassing fireShot's shooter validation)
        if (combat.physics) {
          combat.pendingProjectiles.push(shot);
          tower.shotsFired = (tower.shotsFired || 0) + 1;
          combat.stats.shots++;
          battle.shots.friendly++;
          if (combat.muzzleEffects.length < 128) {
            combat.muzzleEffects.push({ position: [...shot.origin], direction: [...shot.direction] });
          }
          combat.stats.muzzleFlashes++;
          if (gameEvents.has('shot')) gameEvents.emit('shot', { team: 'friendly', kind: `tower-${tower.type}`, player: false, x: tx, y: 1.2, z: tz, level: tower.level });
        }
        tower.cooldown = stats.cooldown;

        // Frost tower applies slow on fire (no per-projectile effect tracking)
        if (tower.type === 'frost' && stats.slowFactor) {
          nearest.slowUntil = battle.elapsed + stats.slowDuration;
          nearest.slowFactor = stats.slowFactor;
        }
      }
    }
  });

  return <TowerVisual tower={tower} />;
}

export function TowerManager() {
  const { camera } = useThree();
  const [, publish] = useReducer(n => n + 1, 0);

  useEffect(() => {
    const onPlace = () => publish();
    const onReset = () => { towerDefenseState.reset(); publish(); };
    EventBus.on('tower-placed', onPlace);
    EventBus.on('tower-changed', onPlace);
    EventBus.on('tower-selected', onPlace);
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
      EventBus.off('tower-changed', onPlace);
      EventBus.off('tower-selected', onPlace);
      EventBus.off('reset-game', onReset);
      EventBus.off('request-ground-position', onGroundRequest);
    };
  }, [camera]);

  return (
    <>
      {towerDefenseState.towers.map(t => (
        <Tower key={t.id} tower={t} />
      ))}
      <TacticalOverlay />
    </>
  );
}
