import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { BACKGROUND_BATTLE as B, BALANCE, ENEMY_TYPES, FRONT, SOLDIER } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { clonePooledModel } from '@/game/3d/objects/pooledModel';
import { useUnitVisuals } from '@/game/3d/objects/useUnitVisuals';
import { boltGeometry, friendlyMaterial, enemyMaterial, BOLT_VISUAL } from '@/game/3d/objects/projectileAppearance';
import { useLevel } from '@/game/3d/vfx/useLevel';
import { alienDeath, soldierDown, muzzleFlash, impact, explosion } from '@/game/3d/vfx/effects';

// Visual-only war beyond the map edges. Uses its own randomness so the gameplay
// RNG stream, combat registry, physics and navigation are never touched.
const rand = ([a, b]) => a + Math.random() * (b - a);
const units = [];
const bolts = {
  friendly: Array.from({ length: B.boltsPerTeam }, () => ({ life: 0 })),
  enemy: Array.from({ length: B.boltsPerTeam }, () => ({ life: 0 })),
};
const SPECS = [-1, 1].flatMap(flank => [
  ...Array.from({ length: B.soldiersPerFlank }, (_, i) => ({ key: `bg-f-${flank}-${i}`, team: 'friendly', type: 'soldier', flank, slot: i })),
  ...B.enemyTypes.map((type, i) => ({ key: `bg-e-${flank}-${i}`, team: 'enemy', type, flank, slot: i + 3 })),
]);

// Read-only snapshot for the window.game API.
export const backgroundBattleSnapshot = () => ({
  visualOnly: true, units: units.length,
  friendly: units.filter(u => u.alive && u.team === 'friendly').length,
  enemy: units.filter(u => u.alive && u.team === 'enemy').length,
  bolts: bolts.friendly.filter(b => b.life > 0).length + bolts.enemy.filter(b => b.life > 0).length,
});

function fireBolt(team, x, y, z, tx, ty, tz) {
  const bolt = bolts[team].find(b => b.life <= 0);
  if (!bolt) return;
  const dx = tx - x, dy = ty - y, dz = tz - z, len = Math.hypot(dx, dy, dz) || 1;
  bolt.x = x; bolt.y = y; bolt.z = z;
  bolt.vx = dx / len * B.boltSpeed; bolt.vy = dy / len * B.boltSpeed; bolt.vz = dz / len * B.boltSpeed;
  bolt.life = len / B.boltSpeed;
}

function BackdropUnit({ spec, outerX }) {
  const friendly = spec.team === 'friendly';
  const config = friendly ? null : ENEMY_TYPES[spec.type];
  const { scene, animations } = useGLTF(friendly ? SOLDIER.modelUrl : config.modelUrl);
  const model = useMemo(() => clonePooledModel(scene, animations), [scene, animations]);
  const groupRef = useRef();
  const currentAnim = useRef(null);
  const unit = useMemo(() => ({
    team: spec.team, flank: spec.flank, x: 0, y: 0, z: 0, heading: 0, homeZ: 0,
    alive: false, state: 'new', timer: 0, fire: 0, target: null,
    aimHeight: friendly ? SOLDIER.colliderY : config.colliderY,
  }), [spec, friendly, config]);
  // useUnitVisuals only needs a position: it handles culling and throttled animation.
  const bodyRef = useRef(null);
  bodyRef.current = useMemo(() => ({ translation: () => unit }), [unit]);
  const { actions } = useUnitVisuals(animations, model, groupRef, bodyRef, true, 'backdrop', spec.key, spec.slot);

  const anims = friendly
    ? { idle: 'Idle', move: 'Running', attack: SOLDIER.animAttack }
    : { idle: config.animIdle, move: config.animRun ?? config.animMove, attack: config.animAttack };
  const play = (name) => {
    if (currentAnim.current === name || !actions[name]) return;
    actions[currentAnim.current]?.fadeOut(0.2);
    actions[name].reset().fadeIn(0.2).play();
    currentAnim.current = name;
  };

  useEffect(() => {
    units.push(unit);
    return () => { unit.alive = false; units.splice(units.indexOf(unit), 1); };
  }, [unit]);

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (gameState.paused || !group) return;
    const dt = Math.min(delta, 0.1);
    const forward = friendly ? FRONT.friendlyForward : FRONT.enemyForward;
    unit.timer -= dt;

    if (unit.state === 'new' || (unit.state === 'dead' && unit.timer <= 0)) {
      // First appearance starts on the line; later ones walk in from the rear.
      const walkIn = unit.state === 'dead';
      unit.x = spec.flank * rand([B.innerX, outerX]);
      unit.homeZ = rand(friendly ? B.friendlyLine : B.enemyLine);
      unit.z = unit.homeZ - (walkIn ? forward * B.approach : 0);
      unit.y = config?.hoverHeight ?? 0;
      unit.heading = forward > 0 ? 0 : Math.PI;
      unit.alive = true; unit.target = null; unit.state = 'advance';
      group.visible = true; group.rotation.y = unit.heading;
      play(anims.move);
    } else if (unit.state === 'dead') {
      return;
    }

    if (unit.state === 'advance') {
      unit.z += forward * (config?.moveSpeed ?? BALANCE.moveSpeed) * dt;
      if (forward * (unit.homeZ - unit.z) <= 0) { unit.state = 'fight'; unit.timer = rand(B.lifetime); unit.fire = Math.random(); }
    } else {
      if (!unit.target?.alive) {
        const foes = units.filter(u => u.alive && u.team !== unit.team && u.flank === unit.flank);
        unit.target = foes[Math.floor(Math.random() * foes.length)] ?? null;
      }
      const target = unit.target;
      if (target) {
        const dx = target.x - unit.x, dy = target.y + target.aimHeight - unit.y - unit.aimHeight, dz = target.z - unit.z;
        unit.heading = Math.atan2(dx, dz);
        play(anims.attack);
        unit.fire -= dt;
        if (unit.fire <= 0) {
          unit.fire = rand(B.fireInterval);
          const mx = unit.x + Math.sin(unit.heading) * 0.6, my = unit.y + unit.aimHeight, mz = unit.z + Math.cos(unit.heading) * 0.6;
          muzzleFlash(mx, my, mz, dx, dy, dz);
          fireBolt(unit.team, mx, my, mz,
            target.x + (Math.random() - 0.5) * B.spread, target.y + target.aimHeight, target.z + (Math.random() - 0.5) * B.spread);
        }
      } else play(anims.idle);
      if (unit.timer <= 0) {
        unit.alive = false; unit.state = 'dead'; unit.timer = rand(B.respawn);
        group.visible = false;
        if (friendly) soldierDown(unit.x, unit.z);
        else alienDeath(unit.x, unit.y + unit.aimHeight, unit.z, spec.type);
        return;
      }
    }
    group.position.set(unit.x, unit.y, unit.z);
    const turn = Math.atan2(Math.sin(unit.heading - group.rotation.y), Math.cos(unit.heading - group.rotation.y));
    group.rotation.y += turn * Math.min(1, dt * 8);
  });

  return (
    <group ref={groupRef} visible={false}>
      <primitive object={model} scale={friendly ? SOLDIER.scale : config.scale} />
    </group>
  );
}

// Pooled tracers (one draw call per team) and occasional shell bursts on the flanks.
function BackdropFire({ outerX }) {
  const friendlyRef = useRef();
  const enemyRef = useRef();
  const transform = useMemo(() => new THREE.Object3D(), []);
  const blast = useRef(rand(B.blastInterval));

  useFrame((_state, delta) => {
    if (gameState.paused) return;
    const dt = Math.min(delta, 0.1);
    for (const [team, ref] of [['friendly', friendlyRef], ['enemy', enemyRef]]) {
      const mesh = ref.current;
      if (!mesh) continue;
      let n = 0;
      for (const b of bolts[team]) {
        if (b.life <= 0) continue;
        b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        if (b.life <= 0) { impact(b.x, b.y, b.z, b.vx, b.vy, b.vz, true); continue; }
        transform.position.set(b.x, b.y, b.z);
        transform.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
        transform.scale.set(1, 1, BOLT_VISUAL.length);
        transform.updateMatrix();
        mesh.setMatrixAt(n++, transform.matrix);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    blast.current -= dt;
    if (blast.current <= 0) {
      blast.current = rand(B.blastInterval);
      explosion((Math.random() < 0.5 ? -1 : 1) * rand([B.innerX, outerX]), rand(B.blastZ), 0.8 + Math.random() * 0.5, 'ambient');
    }
  });

  return (
    <>
      <instancedMesh ref={friendlyRef} args={[boltGeometry, friendlyMaterial, B.boltsPerTeam]} frustumCulled={false} raycast={() => null} />
      <instancedMesh ref={enemyRef} args={[boltGeometry, enemyMaterial, B.boltsPerTeam]} frustumCulled={false} raycast={() => null} />
    </>
  );
}

export function BackgroundBattle() {
  const level = useLevel();
  const outerX = level === 5 ? B.cityOuterX : B.outerX;
  useEffect(() => () => { for (const team of Object.values(bolts)) team.forEach(b => { b.life = 0; }); }, []);
  return (
    <group name="Visual-only background battle">
      {SPECS.map(spec => <BackdropUnit key={spec.key} spec={spec} outerX={outerX} />)}
      <BackdropFire outerX={outerX} />
    </group>
  );
}