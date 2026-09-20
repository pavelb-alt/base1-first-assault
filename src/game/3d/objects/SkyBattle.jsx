import { useRef, useMemo, useEffect, useReducer } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { EventBus } from '@/game/EventBus';
import { SKY_BATTLE } from '@/game/config';
import { skyBattle, initSkyBattle, resetSkyBattle, updateSkyBattle } from '@/game/3d/objects/skyBattleState';
import { gameState } from '@/game/3d/world';

for (const url of SKY_BATTLE.models) useGLTF.preload(url);

const boltGeometry = new THREE.BoxGeometry(0.13, 0.13, 2.5);
const boltMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
const explosionGeometry = new THREE.IcosahedronGeometry(1, 1);
const explosionMaterial = new THREE.MeshBasicMaterial({ color: SKY_BATTLE.colors.explosion, transparent: true, opacity: 0.72, toneMapped: false });
const coreMaterial = new THREE.MeshBasicMaterial({ color: '#fff1a8', transparent: true, opacity: 0.9, toneMapped: false });
const smokeGeometry = new THREE.IcosahedronGeometry(1, 1);
const smokeMaterial = new THREE.MeshLambertMaterial({ color: '#373a3c', transparent: true, opacity: 0.44, depthWrite: false });
const debrisGeometry = new THREE.BoxGeometry(1, 0.35, 0.55);
const debrisMaterial = new THREE.MeshStandardMaterial({ color: '#493f36', roughness: 0.82, metalness: 0.25 });
const engineGeometry = new THREE.SphereGeometry(0.24, 6, 6);
const engineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

const _friendlyBoltColor = new THREE.Color(SKY_BATTLE.colors.friendlyBolt);
const _enemyBoltColor = new THREE.Color(SKY_BATTLE.colors.enemyBolt);
const _friendlyEngineColor = new THREE.Color('#7dd3fc');
const _enemyEngineColor = new THREE.Color('#fb7185');
const _lookTarget = new THREE.Vector3();
const _dummy = new THREE.Object3D();

function recolorShipModel(model, team) {
  const accentColor = team === 'friendly' ? new THREE.Color(SKY_BATTLE.colors.friendlyAccent) : new THREE.Color(SKY_BATTLE.colors.enemyAccent);
  model.traverse(child => {
    if (!child.isMesh || !child.material) return;
    child.castShadow = false; child.receiveShadow = false;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const newMaterials = materials.map(material => {
      const clone = material.clone();
      if (clone.color) {
        const hsl = {}; clone.color.getHSL(hsl);
        if (hsl.s > 0.15) clone.color.copy(accentColor);
      }
      return clone;
    });
    child.material = Array.isArray(child.material) ? newMaterials : newMaterials[0];
  });
}

function createShipModel(sourceScene, team) {
  const clone = cloneSkeleton(sourceScene);
  recolorShipModel(clone, team);
  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = SKY_BATTLE.shipScale / Math.max(size.x, size.y, size.z);
  clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  clone.scale.setScalar(scale);
  const wrapper = new THREE.Group(); wrapper.add(clone); return wrapper;
}

function setInstance(mesh, index, position, scale, rotation) {
  _dummy.position.copy(position);
  _dummy.scale.set(scale.x, scale.y, scale.z);
  if (rotation) _dummy.rotation.set(rotation.x, rotation.y, rotation.z);
  else _dummy.rotation.set(0, 0, 0);
  _dummy.updateMatrix(); mesh.setMatrixAt(index, _dummy.matrix);
}

export function SkyBattle() {
  const modelA = useGLTF(SKY_BATTLE.models[0]);
  const modelB = useGLTF(SKY_BATTLE.models[1]);
  const modelC = useGLTF(SKY_BATTLE.models[2]);
  const [, forceRender] = useReducer(n => n + 1, 0);
  const apiSet = useRef(false);

  const shipModels = useMemo(() => {
    const sources = [modelA.scene, modelB.scene, modelC.scene];
    return Array.from({ length: SKY_BATTLE.maxShips }, (_, i) => createShipModel(sources[i % 3], i < SKY_BATTLE.maxShips / 2 ? 'friendly' : 'enemy'));
  }, [modelA, modelB, modelC]);

  useEffect(() => { initSkyBattle(); forceRender(); }, []);
  useEffect(() => {
    const reset = () => { resetSkyBattle(); forceRender(); };
    EventBus.on('reset-game', reset); return () => EventBus.off('reset-game', reset);
  }, []);

  const shipGroupRefs = useRef([]);
  const boltMeshRef = useRef();
  const explosionMeshRef = useRef();
  const coreMeshRef = useRef();
  const smokeMeshRef = useRef();
  const debrisMeshRef = useRef();
  const engineMeshRef = useRef();

  useFrame((_, delta) => {
    if (gameState.paused || !skyBattle.initialized) return;
    updateSkyBattle(Math.min(delta, 0.05));

    let engineIdx = 0;
    const engines = engineMeshRef.current;
    for (let i = 0; i < skyBattle.ships.length; i++) {
      const ship = skyBattle.ships[i];
      const group = shipGroupRefs.current[i];
      if (!group) continue;
      group.visible = ship.alive || ship.falling;
      if (ship.alive) {
        group.position.copy(ship.position);
        _lookTarget.copy(ship.position).add(ship.heading);
        group.lookAt(_lookTarget); group.rotateZ(ship.bankAngle);
        if (engines) {
          _lookTarget.copy(ship.position).addScaledVector(ship.heading, -1.35);
          setInstance(engines, engineIdx, _lookTarget, { x: 1, y: 1, z: 2.8 });
          engines.setColorAt(engineIdx, ship.team === 'friendly' ? _friendlyEngineColor : _enemyEngineColor);
          engineIdx++;
        }
      } else if (ship.falling) {
        group.position.copy(ship.position);
        group.rotation.set(ship.wreckRotation.x, ship.wreckRotation.y, ship.wreckRotation.z);
      }
    }
    if (engines) {
      engines.count = engineIdx; engines.instanceMatrix.needsUpdate = true;
      if (engines.instanceColor) engines.instanceColor.needsUpdate = true;
    }

    let boltIdx = 0;
    const bolts = boltMeshRef.current;
    if (bolts) {
      for (const bolt of skyBattle.bolts) {
        if (!bolt.active) continue;
        _dummy.position.copy(bolt.position);
        _lookTarget.copy(bolt.position).add(bolt.velocity);
        _dummy.lookAt(_lookTarget); _dummy.scale.set(1, 1, 1); _dummy.updateMatrix();
        bolts.setMatrixAt(boltIdx, _dummy.matrix);
        bolts.setColorAt(boltIdx, bolt.team === 'friendly' ? _friendlyBoltColor : _enemyBoltColor);
        boltIdx++;
      }
      bolts.count = boltIdx; bolts.instanceMatrix.needsUpdate = true;
      if (bolts.instanceColor) bolts.instanceColor.needsUpdate = true;
    }

    let expIdx = 0;
    const explosions = explosionMeshRef.current;
    const cores = coreMeshRef.current;
    if (explosions && cores) {
      for (const exp of skyBattle.explosions) {
        if (!exp.active) continue;
        const t = exp.age / exp.lifetime;
        const pulse = Math.sin(Math.min(1, t) * Math.PI);
        setInstance(explosions, expIdx, exp.position, { x: 0.5 + t * 4.8, y: 0.5 + t * 4.8, z: 0.5 + t * 4.8 });
        setInstance(cores, expIdx, exp.position, { x: 0.3 + pulse * 2.2, y: 0.3 + pulse * 2.2, z: 0.3 + pulse * 2.2 });
        expIdx++;
      }
      explosions.count = cores.count = expIdx;
      explosions.instanceMatrix.needsUpdate = cores.instanceMatrix.needsUpdate = true;
    }

    let smokeIdx = 0;
    const smoke = smokeMeshRef.current;
    if (smoke) {
      for (const puff of skyBattle.smoke) {
        if (!puff.active) continue;
        const t = puff.age / puff.lifetime;
        const scale = puff.size * (0.65 + t * 2.5);
        setInstance(smoke, smokeIdx++, puff.position, { x: scale, y: scale * 0.85, z: scale });
      }
      smoke.count = smokeIdx; smoke.instanceMatrix.needsUpdate = true;
    }

    let debrisIdx = 0;
    const debris = debrisMeshRef.current;
    if (debris) {
      for (const piece of skyBattle.debris) {
        if (!piece.active) continue;
        setInstance(debris, debrisIdx++, piece.position, { x: piece.size, y: piece.size, z: piece.size }, piece.rotation);
      }
      debris.count = debrisIdx; debris.instanceMatrix.needsUpdate = true;
    }

    if (!apiSet.current && window.game) {
      window.game.getSkyBattle = () => ({
        shipCount: skyBattle.ships.filter(s => s.alive).length,
        friendlyCount: skyBattle.ships.filter(s => s.alive && s.team === 'friendly').length,
        enemyCount: skyBattle.ships.filter(s => s.alive && s.team === 'enemy').length,
        fallingCount: skyBattle.ships.filter(s => s.falling).length,
        boltCount: skyBattle.bolts.filter(b => b.active).length,
        explosionCount: skyBattle.explosions.filter(e => e.active).length,
        smokeCount: skyBattle.smoke.filter(s => s.active).length,
        debrisCount: skyBattle.debris.filter(d => d.active).length,
        destroyed: { ...skyBattle.destroyed },
        ships: skyBattle.ships.map(s => ({ id: s.id, team: s.team, alive: s.alive, falling: s.falling, health: s.health, type: s.type,
          position: { x: s.position.x, y: s.position.y, z: s.position.z }, heading: { x: s.heading.x, y: s.heading.y, z: s.heading.z } })),
      });
      apiSet.current = true;
    }
  });

  if (!skyBattle.initialized) return null;
  return (
    <>
      {shipModels.map((model, i) => <group key={i} ref={el => shipGroupRefs.current[i] = el}><primitive object={model} /></group>)}
      <instancedMesh ref={engineMeshRef} args={[engineGeometry, engineMaterial, SKY_BATTLE.maxShips]} frustumCulled={false} />
      <instancedMesh ref={boltMeshRef} args={[boltGeometry, boltMaterial, SKY_BATTLE.maxBolts]} frustumCulled={false} />
      <instancedMesh ref={explosionMeshRef} args={[explosionGeometry, explosionMaterial, SKY_BATTLE.maxExplosions]} frustumCulled={false} />
      <instancedMesh ref={coreMeshRef} args={[explosionGeometry, coreMaterial, SKY_BATTLE.maxExplosions]} frustumCulled={false} />
      <instancedMesh ref={smokeMeshRef} args={[smokeGeometry, smokeMaterial, SKY_BATTLE.maxSmoke]} frustumCulled={false} />
      <instancedMesh ref={debrisMeshRef} args={[debrisGeometry, debrisMaterial, SKY_BATTLE.maxDebris]} frustumCulled={false} />
    </>
  );
}