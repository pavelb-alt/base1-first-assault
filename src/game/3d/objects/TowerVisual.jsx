import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOWER_DEFENSE, TOWER_VISUALS as V } from '@/game/config';
import { gameState } from '@/game/3d/world';

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

function Part({ geo = box, material = steel, ...props }) {
  return <mesh geometry={geo} material={material} castShadow {...props} />;
}

export function TowerVisual({ tower }) {
  const root = useRef(), head = useRef(), elevation = useRef(), recoil = useRef();
  const rotor = useRef(), flash = useRef(), pulse = useRef();
  const state = useRef({ age: 0, shot: 0, kick: 0, flash: 0, spin: 0 });
  const cfg = TOWER_DEFENSE.towers[tower.type];
  const frost = tower.type === 'frost', cannon = tower.type === 'cannon';
  const paint = paints[tower.type], glow = glows[tower.type];
  const length = cannon ? 1.25 : frost ? 0.85 : 1.05;
  useEffect(() => () => { delete tower.visual; }, [tower]);

  useFrame((_, dt) => {
    if (gameState.paused || !root.current) return;
    const s = state.current;
    s.age += dt;
    const deployed = Math.min(1, s.age / V.deployDuration);
    root.current.scale.y = 1 - Math.pow(1 - deployed, 3);
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
      <mesh geometry={ring} material={rangeMat} rotation={[-Math.PI / 2, 0, 0]} scale={[cfg.range, cfg.range, 0.18]} position={[0, 0.035, 0]} />
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
        <group ref={head} position={[0, 1.2, 0]}>
          <Part material={dark} scale={[0.82, 0.22, 0.6]} position={[0, -0.12, 0]} />
          {[-1, 1].map(side => (
            <group key={side} position={[side * 0.42, 0, 0]}>
              <Part material={paint} scale={[0.18, 0.48, cannon ? 0.72 : 0.6]} />
              <Part geo={cylinder} material={trim} rotation={[0, 0, Math.PI / 2]} scale={[0.14, 0.2, 0.14]} />
              <Part material={glow} scale={[0.025, 0.07, 0.25]} position={[side * 0.1, 0.17, 0]} />
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
                    {[0.4, 0.66, 0.86].map(z => <Part key={z} geo={ring} material={paint} scale={0.3} position={[0, 0, -z]} />)}
                    {[0, 1, 2].map(i => <group key={i} rotation={[0, 0, i * Math.PI * 2 / 3]}><Part material={trim} scale={[0.1, 0.13, 0.8]} position={[0, 0.25, -0.5]} /></group>)}
                  </>
                ) : cannon ? (
                  <>
                    <Part geo={cylinder} rotation={[Math.PI / 2, 0, 0]} scale={[0.17, 1.1, 0.17]} position={[0, 0, -0.65]} />
                    <Part material={paint} scale={[0.38, 0.34, 0.32]} position={[0, 0, -1.08]} />
                    <Part material={dark} scale={[0.24, 0.21, 0.025]} position={[0, 0, -1.25]} />
                    {[-1, 1].map(s => <Part key={s} geo={cylinder} material={trim} rotation={[Math.PI / 2, 0, 0]} scale={[0.055, 0.65, 0.055]} position={[s * 0.25, -0.1, -0.4]} />)}
                  </>
                ) : (
                  <>
                    {[0, 1, 2, 3].map(i => <Part key={i} geo={cylinder} rotation={[Math.PI / 2, 0, 0]} scale={[0.052, 0.8, 0.052]} position={[Math.cos(i * Math.PI / 2) * 0.13, Math.sin(i * Math.PI / 2) * 0.13, -0.65]} />)}
                    {[0.4, 0.94].map(z => <Part key={z} geo={ring} material={trim} scale={0.22} position={[0, 0, -z]} />)}
                  </>
                )}
              </group>
              {!frost && <Part material={dark} scale={[0.27, 0.36, 0.44]} position={[0.5, -0.04, 0.17]} />}
              <mesh ref={flash} geometry={flashGeo} material={glow} position={[0, 0, -length - 0.18]} visible={false} />
              <mesh ref={pulse} geometry={ring} material={glow} visible={false} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}