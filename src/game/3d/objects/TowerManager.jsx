import { gameEvents } from '@/game/gameEvents';
import { useReducer, useEffect, useMemo } from 'react';
import { TowerVisual } from '@/game/3d/objects/TowerVisual';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { TOWER_DEFENSE } from '@/game/config';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { combat } from '@/game/3d/combat';
import { gameState } from '@/game/3d/world';
import { battle } from '@/game/3d/battleMetrics';
import { cameraAim, fireShot, trace } from '@/game/3d/ballistics';
import { isStationControlled } from '@/game/3d/stationControl';
import { input } from '@/game/3d/input';

// Raycaster for ground-plane intersection (screen → world)
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPoint = new THREE.Vector3();

// Scratch vectors — never allocate inside useFrame

const _origin = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();



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
  const cfg = TOWER_DEFENSE.towers[tower.type];
  const combatEntry = useMemo(() => {
    const entry = createTowerCombatEntry(tower, cfg);
    entry.bodyRef = { current: null }; // towers have no physics body — fine for projectile exclusion
    return entry;
  }, [tower.id, cfg]);

  useFrame((_state, delta) => {
    if (gameState.paused) return;

    tower.cooldown = Math.max(0, tower.cooldown - delta);

    if (isStationControlled('tower',tower.id)) {
      cameraAim(_state.camera,combatEntry,_aim);
      const tx=tower.position.x,tz=tower.position.z;
      tower.targetId=null;
      tower.aimYaw=Math.atan2(tx-_aim.x,tz-_aim.z);
      tower.aimPitch=Math.atan2(_aim.y-1.2,Math.hypot(_aim.x-tx,_aim.z-tz));
      _origin.set(tx,1.2,tz);
      if (input.mouseDown && tower.cooldown<=0 && fireShot(combatEntry,_origin,_aim,_origin,true)) {
        tower.cooldown=cfg.cooldown; tower.shotsFired=(tower.shotsFired??0)+1;
        if (tower.type==='frost') {
          const distance=_dir.subVectors(_aim,_origin).length();
          const hit=trace(_origin,_dir.normalize(),distance+0.1,combatEntry)?.unit;
          if(hit?.alive && hit.team==='enemy') { hit.slowUntil=battle.elapsed+cfg.slowDuration; hit.slowFactor=cfg.slowFactor; }
        }
      }
      return;
    }
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
      // Model barrels face local -Z; visuals smoothly follow the combat target.
      const p = nearest.bodyRef.current.translation();
      tower.aimYaw = Math.atan2(tx - p.x, tz - p.z);
      tower.aimPitch = Math.atan2(p.y + nearest.aimHeight - 1.2, nearestDist);

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
          tower.shotsFired = (tower.shotsFired || 0) + 1;
          combat.stats.shots++;
          battle.shots.friendly++;
          if (combat.muzzleEffects.length < 128) {
            combat.muzzleEffects.push({ position: [...shot.origin], direction: [...shot.direction] });
          }
          combat.stats.muzzleFlashes++;
          if (gameEvents.has('shot')) gameEvents.emit('shot', { team: 'friendly', kind: `tower-${tower.type}`, player: false, x: tx, y: 1.2, z: tz });
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

  return <TowerVisual tower={tower} />;
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