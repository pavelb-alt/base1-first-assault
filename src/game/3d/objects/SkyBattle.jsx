import { useRef, useMemo, useEffect, useReducer } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { EventBus } from '@/game/EventBus';
import { SKY_BATTLE } from '@/game/config';
import { skyBattle, initSkyBattle, resetSkyBattle, updateSkyBattle } from '@/game/3d/objects/skyBattleState';
import { gameState } from '@/game/3d/world';

// Preload all Kenney spacecraft models
for (const url of SKY_BATTLE.models) useGLTF.preload(url);

// Shared geometry and materials (created once, reused across all instances)
const boltGeometry = new THREE.SphereGeometry(0.3, 6, 6);
const boltMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const explosionGeometry = new THREE.SphereGeometry(1, 8, 8);
const explosionMaterial = new THREE.MeshBasicMaterial({
  color: SKY_BATTLE.colors.explosion, transparent: true, opacity: 0.7,
});

// Pre-created colors for per-instance bolt coloring
const _friendlyBoltColor = new THREE.Color(SKY_BATTLE.colors.friendlyBolt);
const _enemyBoltColor = new THREE.Color(SKY_BATTLE.colors.enemyBolt);

// Scratch objects — never allocated per-frame
const _lookTarget = new THREE.Vector3();
const _dummy = new THREE.Object3D();

/**
 * Clone accent materials (saturated colors) and recolor to team color.
 * Preserve body/structure materials (low saturation) unchanged.
 */
function recolorShipModel(model, team) {
  const accentColor = team === 'friendly'
    ? new THREE.Color(SKY_BATTLE.colors.friendlyAccent)
    : new THREE.Color(SKY_BATTLE.colors.enemyAccent);

  model.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const newMaterials = materials.map(m => {
      const clone = m.clone();
      if (clone.color) {
        const hsl = {};
        clone.color.getHSL(hsl);
        if (hsl.s > 0.15) clone.color.copy(accentColor); // saturated = accent
      }
      return clone;
    });
    child.material = Array.isArray(child.material) ? newMaterials : newMaterials[0];
  });
}

/**
 * Create a centered, scaled, recolored ship model wrapped in a group.
 * The wrapper's origin is at the model's center; lookAt orients +Z forward.
 */
function createShipModel(sourceScene, team) {
  const clone = cloneSkeleton(sourceScene);
  recolorShipModel(clone, team);

  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = SKY_BATTLE.shipScale / maxDim;

  // Center the model at the wrapper's origin
  clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  clone.scale.setScalar(scale);

  const wrapper = new THREE.Group();
  wrapper.add(clone);
  return wrapper;
}

export function SkyBattle() {
  const modelA = useGLTF(SKY_BATTLE.models[0]);
  const modelB = useGLTF(SKY_BATTLE.models[1]);
  const modelC = useGLTF(SKY_BATTLE.models[2]);

  const [, forceRender] = useReducer(n => n + 1, 0);
  const apiSet = useRef(false);

  // Create 12 ship model instances (cached — only runs when GLTF results change)
  const shipModels = useMemo(() => {
    const sources = [modelA.scene, modelB.scene, modelC.scene];
    const models = [];
    for (let i = 0; i < SKY_BATTLE.maxShips; i++) {
      const team = i < SKY_BATTLE.maxShips / 2 ? 'friendly' : 'enemy';
      const typeIndex = i % 3;
      models.push(createShipModel(sources[typeIndex], team));
    }
    return models;
  }, [modelA, modelB, modelC]);

  // Initialize simulation state once on mount
  useEffect(() => {
    initSkyBattle();
    forceRender();
  }, []);

  // Handle game reset — reinitialize all ships, clear bolts and explosions
  useEffect(() => {
    const reset = () => { resetSkyBattle(); forceRender(); };
    EventBus.on('reset-game', reset);
    return () => EventBus.off('reset-game', reset);
  }, []);

  // Refs for render objects
  const shipGroupRefs = useRef([]);
  const boltMeshRef = useRef();
  const explosionMeshRef = useRef();

  useFrame((_, delta) => {
    if (gameState.paused || !skyBattle.initialized) return;

    updateSkyBattle(delta);

    // Update ship group transforms
    for (let i = 0; i < skyBattle.ships.length; i++) {
      const ship = skyBattle.ships[i];
      const group = shipGroupRefs.current[i];
      if (!group) continue;
      group.visible = ship.alive;
      if (ship.alive) {
        group.position.copy(ship.position);
        // Orient +Z along heading (lookAt makes +Z face the target for non-camera objects)
        _lookTarget.copy(ship.position).add(ship.heading);
        group.lookAt(_lookTarget);
        // Bank (roll around local forward axis)
        group.rotateZ(ship.bankAngle);
      }
    }

    // Update bolt instanced mesh (single mesh, per-instance color)
    let boltIdx = 0;
    const bMesh = boltMeshRef.current;
    if (bMesh) {
      for (const bolt of skyBattle.bolts) {
        if (!bolt.active) continue;
        _dummy.position.copy(bolt.position);
        _dummy.scale.setScalar(1);
        _dummy.updateMatrix();
        bMesh.setMatrixAt(boltIdx, _dummy.matrix);
        bMesh.setColorAt(boltIdx, bolt.team === 'friendly' ? _friendlyBoltColor : _enemyBoltColor);
        boltIdx++;
      }
      bMesh.count = boltIdx;
      bMesh.instanceMatrix.needsUpdate = true;
      if (bMesh.instanceColor) bMesh.instanceColor.needsUpdate = true;
    }

    // Update explosion instanced mesh (growing spheres)
    let expIdx = 0;
    const eMesh = explosionMeshRef.current;
    if (eMesh) {
      for (const exp of skyBattle.explosions) {
        if (!exp.active) continue;
        const t = exp.age / exp.lifetime;
        const scale = 0.5 + t * 2.5;
        _dummy.position.copy(exp.position);
        _dummy.scale.setScalar(scale);
        _dummy.updateMatrix();
        eMesh.setMatrixAt(expIdx, _dummy.matrix);
        expIdx++;
      }
      eMesh.count = expIdx;
      eMesh.instanceMatrix.needsUpdate = true;
    }

    // Extend window.game API for verification
    if (!apiSet.current && window.game) {
      window.game.getSkyBattle = () => ({
        shipCount: skyBattle.ships.filter(s => s.alive).length,
        friendlyCount: skyBattle.ships.filter(s => s.alive && s.team === 'friendly').length,
        enemyCount: skyBattle.ships.filter(s => s.alive && s.team === 'enemy').length,
        boltCount: skyBattle.bolts.filter(b => b.active).length,
        explosionCount: skyBattle.explosions.filter(e => e.active).length,
        ships: skyBattle.ships.map(s => ({
          id: s.id, team: s.team, alive: s.alive, health: s.health, type: s.type,
          position: { x: s.position.x, y: s.position.y, z: s.position.z },
          heading: { x: s.heading.x, y: s.heading.y, z: s.heading.z },
        })),
      });
      apiSet.current = true;
    }
  });

  if (!skyBattle.initialized) return null;

  return (
    <>
      {shipModels.map((model, i) => (
        <group key={i} ref={el => shipGroupRefs.current[i] = el}>
          <primitive object={model} />
        </group>
      ))}
      <instancedMesh ref={boltMeshRef} args={[boltGeometry, boltMaterial, SKY_BATTLE.maxBolts]} frustumCulled={false} />
      <instancedMesh ref={explosionMeshRef} args={[explosionGeometry, explosionMaterial, SKY_BATTLE.maxExplosions]} frustumCulled={false} />
    </>
  );
}