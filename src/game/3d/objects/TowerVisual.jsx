import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOWER_DEFENSE, TOWER_VISUALS as V } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { tacticalState } from '@/game/3d/abilities/tacticalState';

// Shared low-poly parts keep the richer silhouettes inexpensive.
const box = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
const crystal = new THREE.OctahedronGeometry(1);
const ring = new THREE.TorusGeometry(1, 0.055, 5, 24);
const flashGeo = new THREE.OctahedronGeometry(1);
const steel = new THREE.MeshStandardMaterial({ color: V.steel, metalness: 0.7, roughness: 0.42 });
const dark = new THREE.MeshStandardMaterial({ color: V.dark, metalness: 0.55, roughness: 0.6 });
const trim = new THREE.MeshStandardMaterial({ color: V.trim, metalness: 0.7, roughness: 0.35 });
const paints = Object.fromEntries(Object.entries(TOWER_DEFENSE.towers).map(([key, cfg]) => [key,
  new THREE.MeshStandardMaterial({ color: cfg.color, metalness: 0.45, roughness: 0.5 })]));
const glows = Object.fromEntries(['mg', 'cannon', 'frost'].map(key => [key,
  new THREE.MeshBasicMaterial({ color: key === 'frost' ? V.coldGlow : V.warmGlow, toneMapped: false })]));
const rangeMat = new THREE.MeshBasicMaterial({ color: '#8fa6a0', transparent: true, opacity: 0.16, depthWrite: false });
const selectedRangeMat = new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
const selectedFillMat = new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.06, depthWrite: false });
const selectRingMat = new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
const upgradePulseMat = new THREE.MeshBasicMaterial({ color: '#fde68a', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
const disc = new THREE.CircleGeometry(1, 48);
const flatRing = new THREE.RingGeometry(0.9, 1, 40);
// Veteran trims: level 2 = amber, level 3 = hot white-gold.
const veteranGlow = [null, new THREE.MeshBasicMaterial({ color: '#f59e0b', toneMapped: false }), new THREE.MeshBasicMaterial({ color: '#fff1b8', toneMapped: false })];
const noRaycast = () => null;

// Rocket-landing deployment assets
const exhaustGeo = new THREE.ConeGeometry(0.45, 2.4, 8);
const exhaustCoreGeo = new THREE.ConeGeometry(0.26, 1.6, 8);
const nozzleGeo = new THREE.CylinderGeometry(0.3, 0.22, 0.2, 10);
const legPoleGeo = new THREE.BoxGeometry(0.1, 1.0, 0.16);
const legStrutGeo = new THREE.BoxGeometry(0.06, 0.6, 0.08);
const footGeo = new THREE.BoxGeometry(0.32, 0.07, 0.32);
const dustRingGeo = new THREE.RingGeometry(0.2, 1.2, 20);
const exhaustMat = new THREE.MeshBasicMaterial({ color: V.exhaustColor, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
const exhaustCoreMat = new THREE.MeshBasicMaterial({ color: V.exhaustCoreColor, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
const nozzleMat = new THREE.MeshStandardMaterial({ color: '#1a1d1e', metalness: 0.8, roughness: 0.3 });
const dustMat = new THREE.MeshBasicMaterial({ color: V.dustColor, transparent: true, opacity: 0, depthWrite: false });

function Part({ geo = box, material = steel, ...props }) {
  return <mesh geometry={geo} material={material} castShadow {...props} />;
}

export function TowerVisual({ tower }) {
  const root = useRef(), head = useRef(), elevation = useRef(), recoil = useRef();
  const rotor = useRef(), flash = useRef(), pulse = useRef();
  const deploy = useRef(), exhaust = useRef(), exhaustCore = useRef(), dust = useRef(), range = useRef();
  const legRefs = useRef([]);
  const selectRef = useRef(), fillRef = useRef(), upgradeRef = useRef(), halo = useRef();
  const state = useRef({ age: 0, shot: 0, kick: 0, flash: 0, spin: 0, dustTriggered: false, upgradedAt: tower.upgradedAt ?? 0, upgradePulse: 0 });
  const cfg = TOWER_DEFENSE.towers[tower.type];
  const level = tower.level ?? 1;
  const vet = veteranGlow[level - 1];
  const twin = level >= 3;
  const pulseMat = useMemo(() => upgradePulseMat.clone(), []);
  useEffect(() => () => pulseMat.dispose(), [pulseMat]);
  const frost = tower.type === 'frost', cannon = tower.type === 'cannon';
  const paint = paints[tower.type], glow = glows[tower.type];
  const length = cannon ? 1.25 : frost ? 0.85 : 1.05;
  useEffect(() => () => { delete tower.visual; }, [tower]);

  useFrame((_, dt) => {
    if (gameState.paused || !root.current) return;
    const s = state.current;
    s.age += dt;
    const selected = towerDefenseState.selectedTowerId === tower.id && gameState.mode === 'strategic';
    const reach = tower.stats?.range ?? cfg.range;
    range.current.visible = s.age < 3 || selected;
    range.current.material = selected ? selectedRangeMat : rangeMat;
    range.current.scale.set(reach, reach, selected ? 0.3 : 0.18);
    fillRef.current.visible = selected;
    fillRef.current.scale.setScalar(reach);
    selectRef.current.visible = selected;
    if (selected) { selectRef.current.rotation.z += dt * 1.5; selectRef.current.scale.setScalar(cfg.baseRadius * 1.5 * (1 + Math.sin(s.age * 5) * 0.05)); }
    // Upgrade pulse: a quick swell and an expanding gold ring.
    if ((tower.upgradedAt ?? 0) !== s.upgradedAt) { s.upgradedAt = tower.upgradedAt; s.upgradePulse = 0.6; }
    s.upgradePulse = Math.max(0, s.upgradePulse - dt);
    const up = s.upgradePulse / 0.6;
    upgradeRef.current.visible = up > 0;
    upgradeRef.current.scale.setScalar(cfg.baseRadius * (1 + (1 - up) * 3.5));
    pulseMat.opacity = 0.8 * up;
    if (halo.current) halo.current.rotation.y += dt * 1.2;

    // ===== Rocket-landing deployment =====
    const DESC = V.descentDuration;
    const SETTLE = V.touchdownSettle;
    const TOTAL = DESC + SETTLE;

    if (s.age < DESC) {
      // Phase 1 — Descending from sky with retropropulsion
      const t = s.age / DESC;
      // Ease-out: fast descent, decelerating to a hover touchdown
      const eased = 1 - Math.pow(1 - t, 2.6);
      deploy.current.position.y = V.descentHeight * (1 - eased);
      // Subtle lateral wobble during descent
      root.current.position.x = (Math.random() - 0.5) * 0.012 * (1 - t);
      root.current.position.z = (Math.random() - 0.5) * 0.012 * (1 - t);
      root.current.scale.set(1, 1, 1);
      // Exhaust plume — large while descending, flickering
      const flick = 0.85 + Math.random() * 0.3;
      const exhaustLen = (0.6 + 0.9 * (1 - t * 0.7)) * flick;
      exhaust.current.visible = true;
      exhaust.current.scale.set(flick, exhaustLen, flick);
      exhaust.current.position.y = -0.5 - exhaustLen * 1.2;
      exhaustCore.current.visible = true;
      exhaustCore.current.scale.set(flick * 0.7, exhaustLen * 0.75, flick * 0.7);
      exhaustCore.current.position.y = -0.5 - exhaustLen * 0.9;
      // Landing legs — fold out after legDeployAt fraction of descent
      const legT = Math.max(0, (t - V.legDeployAt) / (1 - V.legDeployAt));
      const legAngle = THREE.MathUtils.lerp(-Math.PI / 2 + 0.1, -0.42, legT);
      for (const leg of legRefs.current) { if (leg) leg.rotation.x = legAngle; }
    } else if (s.age < TOTAL) {
      // Phase 2 — Touchdown: dust kick, squash, settle
      const t = (s.age - DESC) / SETTLE;
      deploy.current.position.y = V.touchdownBounce * Math.sin(t * Math.PI) * (1 - t);
      root.current.position.x = 0;
      root.current.position.z = 0;
      // Squash on impact, recover to full
      const squash = Math.max(0, 1 - t * 2.5);
      root.current.scale.set(1 + squash * 0.06, 1 - squash * 0.05, 1 + squash * 0.06);
      // Exhaust fades out
      exhaust.current.visible = false;
      exhaustCore.current.visible = false;
      // Legs fully deployed
      for (const leg of legRefs.current) { if (leg) leg.rotation.x = -0.42; }
      // Dust ring expands and fades
      dust.current.visible = true;
      const dustScale = 0.6 + t * 3.5;
      dust.current.scale.set(dustScale, dustScale, 1);
      dust.current.material.opacity = 0.55 * (1 - t);
    } else {
      // Phase 3 — Fully deployed and operational
      deploy.current.position.y = 0;
      root.current.scale.setScalar(1 + Math.sin(up * Math.PI) * 0.12);
      root.current.position.x = 0;
      root.current.position.z = 0;
      exhaust.current.visible = false;
      exhaustCore.current.visible = false;
      dust.current.visible = false;
      for (const leg of legRefs.current) { if (leg) leg.rotation.x = -0.42; }
    }

    const deployed = Math.min(1, s.age / TOTAL);

    // ===== Combat visuals (recoil, targeting, flash) =====
    if ((tower.shotsFired || 0) !== s.shot) {
      s.shot = tower.shotsFired || 0;
      s.kick = V.recoil[tower.type];
      s.flash = V.flashDuration[tower.type];
      s.spin = 22;
    }
    s.kick *= Math.exp(-V.recoilRecovery * dt);
    s.flash = Math.max(0, s.flash - dt);
    s.spin *= Math.exp(-3 * dt);
    const yaw = tower.aimYaw ?? 0;
    const diff = Math.atan2(Math.sin(yaw - head.current.rotation.y), Math.cos(yaw - head.current.rotation.y));
    head.current.rotation.y += diff * (1 - Math.exp(-V.turnDamping * dt));
    elevation.current.rotation.x = THREE.MathUtils.damp(elevation.current.rotation.x, tower.aimPitch || 0, V.turnDamping, dt);
    recoil.current.position.z = s.kick;
    rotor.current.rotation.z += (frost ? 1.3 + s.spin * 0.15 : cannon ? 0 : s.spin) * dt;
    flash.current.visible = s.flash > 0;
    const flashSize = s.flash / V.flashDuration[tower.type];
    flash.current.scale.set(0.22 * flashSize, 0.22 * flashSize, (cannon ? 0.65 : 0.4) * flashSize);
    pulse.current.visible = frost && s.flash > 0;
    pulse.current.scale.setScalar(0.3 + (1 - flashSize) * 1.2);
    pulse.current.position.z = -length - (1 - flashSize) * 0.9;
    tower.visual = { deployed, yaw: head.current.rotation.y, pitch: elevation.current.rotation.x, recoil: s.kick, flash: s.flash, rotor: rotor.current.rotation.z };
  });

  return (
    <group position={[tower.position.x, 0, tower.position.z]} name={`tower-${tower.id}`}>
      <mesh ref={range} geometry={ring} material={rangeMat} rotation={[-Math.PI / 2, 0, 0]} scale={[cfg.range, cfg.range, 0.18]} position={[0, 0.035, 0]} raycast={noRaycast} />
      <mesh ref={fillRef} geometry={disc} material={selectedFillMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false} raycast={noRaycast} />
      <mesh ref={selectRef} geometry={flatRing} material={selectRingMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} visible={false} raycast={noRaycast} renderOrder={6} />
      <mesh ref={upgradeRef} geometry={flatRing} material={pulseMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]} visible={false} raycast={noRaycast} renderOrder={6} />
      <mesh ref={dust} geometry={dustRingGeo} material={dustMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} visible={false} raycast={noRaycast} />
      <group ref={deploy}
        onClick={e => {
          if (gameState.mode !== 'strategic' || tacticalState.mode || e.delta > 6) return;
          e.stopPropagation();
          towerDefenseState.selectTower(tower.id);
          tacticalState.towerClickAt = performance.now();
        }}
        onPointerOver={e => { if (gameState.mode === 'strategic' && !tacticalState.mode) { e.stopPropagation(); document.body.style.cursor = 'pointer'; } }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}>
        <group ref={root}>
          <Part geo={cylinder} material={dark} scale={[cfg.baseRadius, 0.2, cfg.baseRadius]} position={[0, 0.15, 0]} receiveShadow />
          <Part geo={cylinder} scale={[cfg.baseRadius * 0.82, 0.16, cfg.baseRadius * 0.82]} position={[0, 0.33, 0]} />
          {[0, 1, 2, 3].map(i => (
            <group key={i} rotation={[0, i * Math.PI / 2 + Math.PI / 4, 0]}>
              <Part material={dark} scale={[0.28, 0.22, 0.65]} position={[0, 0.2, cfg.baseRadius * 0.8]} />
              <Part material={paint} scale={[0.24, 0.08, 0.4]} position={[0, 0.34, cfg.baseRadius * 0.83]} />
              <Part geo={cylinder} material={trim} scale={[0.065, 0.08, 0.065]} position={[0, 0.4, cfg.baseRadius * 0.9]} />
            </group>
          ))}
          <Part geo={cylinder} material={dark} scale={[0.3, 0.62, 0.3]} position={[0, 0.68, 0]} />
          <Part geo={cylinder} material={paint} scale={[0.4, 0.12, 0.4]} position={[0, 0.96, 0]} />
          {/* Veterancy: level 2 bolts on armor skirts + emissive trim; level 3 adds a rotating sensor halo. */}
          {level >= 2 && (
            <>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <group key={i} rotation={[0, i * Math.PI / 3, 0]}>
                  <Part material={paint} scale={[0.42, 0.3, 0.07]} position={[0, 0.42, cfg.baseRadius * 0.72]} rotation={[-0.35, 0, 0]} />
                  <Part material={vet} scale={[0.3, 0.025, 0.02]} position={[0, 0.55, cfg.baseRadius * 0.75]} rotation={[-0.35, 0, 0]} />
                </group>
              ))}
              <Part geo={ring} material={vet} scale={[0.46, 0.46, 0.5]} rotation={[Math.PI / 2, 0, 0]} position={[0, 1.03, 0]} />
            </>
          )}
          {Array.from({ length: level }, (_, i) => (
            <Part key={`chev-${i}`} material={vet ?? glow} scale={[0.2, 0.035, 0.03]} position={[0, 0.55 + i * 0.09, 0.31]} />
          ))}
          {level >= 3 && (
            <group ref={halo} position={[0, 1.9, 0]}>
              <Part geo={ring} material={vet} scale={0.55} rotation={[Math.PI / 2, 0, 0]} />
              {[0, 1, 2].map(i => <Part key={i} geo={crystal} material={vet} scale={0.07} position={[Math.cos(i * 2.09) * 0.55, 0, Math.sin(i * 2.09) * 0.55]} />)}
            </group>
          )}
          <group ref={head} position={[0, 1.2, 0]} scale={level >= 3 ? 1.12 : level === 2 ? 1.05 : 1}>
            <Part material={dark} scale={[0.82, 0.22, 0.6]} position={[0, -0.12, 0]} />
            {[-1, 1].map(side => (
              <group key={side} position={[side * 0.42, 0, 0]}>
                <Part material={paint} scale={[0.18, 0.48, cannon ? 0.72 : 0.6]} />
                <Part geo={cylinder} material={trim} rotation={[0, 0, Math.PI / 2]} scale={[0.14, 0.2, 0.14]} />
                <Part material={glow} scale={[0.025, 0.07, 0.25]} position={[side * 0.1, 0.17, 0]} />
                {level >= 2 && <Part material={dark} scale={[0.08, 0.4, 0.66]} position={[side * 0.13, 0, -0.05]} />}
              </group>
            ))}
            <group ref={elevation}>
              <group ref={recoil}>
                <Part material={paint} scale={[0.64, 0.38, 0.64]} />
                <Part material={dark} scale={[0.45, 0.22, 0.34]} position={[0, 0.2, 0.16]} />
                <Part material={glow} scale={[0.16, 0.085, 0.035]} position={[0, 0.21, -0.02]} />
                {/* Heat vents / rear power pack. */}
                {[0, 1, 2].map(i => <Part key={i} material={trim} scale={[0.48, 0.035, 0.045]} position={[0, 0.205, 0.1 + i * 0.1]} />)}
                <group ref={rotor}>
                  {frost ? (
                    <>
                      <Part geo={crystal} material={glow} scale={[0.18, 0.18, 0.55]} position={[0, 0, -0.6]} />
                      {twin && [-1, 1].map(sd => <Part key={sd} geo={crystal} material={glow} scale={[0.08, 0.08, 0.34]} position={[sd * 0.24, 0.08, -0.45]} />)}
                      {level >= 2 && <Part geo={ring} material={vet} scale={0.38} position={[0, 0, -1.0]} />}
                      {[0.4, 0.66, 0.86].map(z => <Part key={z} geo={ring} material={paint} scale={0.3} position={[0, 0, -z]} />)}
                      {[0, 1, 2].map(i => <group key={i} rotation={[0, 0, i * Math.PI * 2 / 3]}><Part material={trim} scale={[0.1, 0.13, 0.8]} position={[0, 0.25, -0.5]} /></group>)}
                    </>
                  ) : cannon ? (
                    <>
                      {(twin ? [-0.15, 0.15] : [0]).map(x => (
                        <group key={x} position={[x, 0, 0]}>
                          <Part geo={cylinder} rotation={[Math.PI / 2, 0, 0]} scale={[twin ? 0.13 : 0.17, 1.1, twin ? 0.13 : 0.17]} position={[0, 0, -0.65]} />
                          <Part material={paint} scale={[twin ? 0.24 : 0.38, 0.34, 0.32]} position={[0, 0, -1.08]} />
                          <Part material={dark} scale={[twin ? 0.16 : 0.24, 0.21, 0.025]} position={[0, 0, -1.25]} />
                        </group>
                      ))}
                      {level >= 2 && <Part material={vet} scale={[twin ? 0.56 : 0.4, 0.03, 0.03]} position={[0, 0.19, -1.0]} />}
                      {[-1, 1].map(s => <Part key={s} geo={cylinder} material={trim} rotation={[Math.PI / 2, 0, 0]} scale={[0.055, 0.65, 0.055]} position={[s * 0.25, -0.1, -0.4]} />)}
                    </>
                  ) : (
                    <>
                      {Array.from({ length: twin ? 6 : 4 }, (_, i) => {
                        const n = twin ? 6 : 4, r = twin ? 0.16 : 0.13;
                        return <Part key={i} geo={cylinder} rotation={[Math.PI / 2, 0, 0]} scale={[0.052, 0.8, 0.052]} position={[Math.cos(i * Math.PI * 2 / n) * r, Math.sin(i * Math.PI * 2 / n) * r, -0.65]} />;
                      })}
                      {level >= 2 && <Part geo={ring} material={vet} scale={twin ? 0.26 : 0.22} position={[0, 0, -1.02]} />}
                      {[0.4, 0.94].map(z => <Part key={z} geo={ring} material={trim} scale={0.22} position={[0, 0, -z]} />)}
                    </>
                  )}
                </group>
                {!frost && <Part material={dark} scale={[0.27, 0.36, 0.44]} position={[0.5, -0.04, 0.17]} />}
                {!frost && twin && <Part material={dark} scale={[0.27, 0.36, 0.44]} position={[-0.5, -0.04, 0.17]} />}
                {level >= 2 && <Part material={vet} scale={[0.5, 0.03, 0.03]} position={[0, -0.2, -0.33]} />}
                <mesh ref={flash} geometry={flashGeo} material={glow} position={[0, 0, -length - 0.18]} visible={false} />
                <mesh ref={pulse} geometry={ring} material={glow} visible={false} />
              </group>
            </group>
          </group>
        </group>
        {/* Rocket nozzle at base */}
        <Part geo={nozzleGeo} material={nozzleMat} position={[0, 0.02, 0]} />
        {/* Exhaust plume */}
        <mesh ref={exhaust} geometry={exhaustGeo} material={exhaustMat} position={[0, -1.5, 0]} visible={false} />
        <mesh ref={exhaustCore} geometry={exhaustCoreGeo} material={exhaustCoreMat} position={[0, -1.2, 0]} visible={false} />
        {/* Landing legs — 4 fold-out struts */}
        {[0, 1, 2, 3].map(i => (
          <group key={i} rotation={[0, i * Math.PI / 2 + Math.PI / 4, 0]} position={[0, 0.2, 0]}>
            <group ref={el => (legRefs.current[i] = el)} rotation={[-Math.PI / 2, 0, 0]}>
              <Part geo={legPoleGeo} material={dark} position={[0, -0.5, 0]} />
              <Part geo={legStrutGeo} material={trim} position={[0, -0.25, 0.2]} rotation={[0.5, 0, 0]} />
              <Part geo={footGeo} material={dark} position={[0, -1.0, 0.15]} />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}