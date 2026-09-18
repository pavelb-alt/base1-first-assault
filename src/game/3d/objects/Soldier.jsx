import { Suspense, useRef, useEffect, useMemo, Component } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { EventBus } from '@/game/EventBus';
import { SOLDIER } from '@/game/config';
import { gameState } from '@/game/3d/world';
import { input } from '@/game/3d/input';

// Start downloading the model as soon as the module loads
useGLTF.preload(SOLDIER.modelUrl);

// Scratch vectors — never allocate inside useFrame
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

// --- Error boundary so a failed GLB doesn't crash the canvas ----------------
class SoldierErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error.message || 'Unknown error' };
  }
  componentDidCatch(error) {
    gameState.error = error.message;
    EventBus.emit('soldier-error', error.message);
  }
  render() {
    if (this.state.hasError) {
      return (
        <mesh position={[SOLDIER.spawnPosition[0], 0.75, SOLDIER.spawnPosition[2]]} castShadow>
          <boxGeometry args={[0.8, 1.5, 0.8]} />
          <meshStandardMaterial color="#ff4444" emissive="#ff0000" emissiveIntensity={0.3} />
        </mesh>
      );
    }
    return this.props.children;
  }
}

// --- The actual soldier (inside Suspense + ErrorBoundary) -------------------
function SoldierModel() {
  const groupRef = useRef();
  const bodyRef = useRef();
  const { scene, animations } = useGLTF(SOLDIER.modelUrl);
  const { actions } = useAnimations(animations, groupRef);

  const currentAnim = useRef('Idle');
  const targetRotation = useRef(SOLDIER.initialFacing);

  // Clone so we don't mutate the cached original scene
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  // Play an animation with smooth fade
  const playAnimation = (name) => {
    if (currentAnim.current === name) return;
    const old = actions[currentAnim.current];
    const next = actions[name];
    if (old) old.fadeOut(0.2);
    if (next) {
      next.reset().fadeIn(0.2).play();
      currentAnim.current = name;
    }
  };

  // Initialize: play idle, emit loaded
  useEffect(() => {
    if (actions.Idle) actions.Idle.play();
    gameState.loaded = true;
    gameState.error = null;
    EventBus.emit('soldier-loaded');
  }, [actions]);

  // Listen for reset
  useEffect(() => {
    const onReset = () => {
      if (bodyRef.current) {
        bodyRef.current.setTranslation(
          { x: SOLDIER.spawnPosition[0], y: SOLDIER.spawnPosition[1] + 0.1, z: SOLDIER.spawnPosition[2] },
          true,
        );
        bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      targetRotation.current = SOLDIER.initialFacing;
      if (groupRef.current) groupRef.current.rotation.y = SOLDIER.initialFacing;
    };
    EventBus.on('reset-game', onReset);
    return () => EventBus.off('reset-game', onReset);
  }, []);

  // Listen for external rotation set (e.g. when possessing)
  useEffect(() => {
    const onSetRotation = (rot) => { targetRotation.current = rot; };
    EventBus.on('set-soldier-rotation', onSetRotation);
    return () => EventBus.off('set-soldier-rotation', onSetRotation);
  }, []);

  useFrame((_state, delta) => {
    if (!bodyRef.current) return;

    // Sync game state with body position
    const pos = bodyRef.current.translation();
    gameState.soldierPosition.set(pos.x, pos.y, pos.z);

    if (gameState.mode === 'third_person') {
      const keys = input.keys;
      const yaw = gameState.cameraYaw;

      // Camera-relative movement axes
      _forward.set(Math.sin(yaw), 0, Math.cos(yaw));
      _right.set(Math.cos(yaw), 0, -Math.sin(yaw));

      let mx = 0, mz = 0;
      if (keys.KeyW) { mx += _forward.x; mz += _forward.z; }
      if (keys.KeyS) { mx -= _forward.x; mz -= _forward.z; }
      if (keys.KeyD) { mx += _right.x;   mz += _right.z; }
      if (keys.KeyA) { mx -= _right.x;   mz -= _right.z; }

      const moving = mx !== 0 || mz !== 0;

      if (moving) {
        const len = Math.sqrt(mx * mx + mz * mz);
        mx /= len; mz /= len;

        const vel = bodyRef.current.linvel();
        bodyRef.current.setLinvel(
          { x: mx * SOLDIER.moveSpeed, y: vel.y, z: mz * SOLDIER.moveSpeed },
          true,
        );
        targetRotation.current = Math.atan2(mx, -mz);
        playAnimation('Running');
      } else {
        const vel = bodyRef.current.linvel();
        bodyRef.current.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
        playAnimation('Idle');
      }
    } else {
      playAnimation('Idle');
    }

    // Smooth rotation toward target
    if (groupRef.current) {
      const cur = groupRef.current.rotation.y;
      const tgt = targetRotation.current;
      let diff = tgt - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      groupRef.current.rotation.y = cur + diff * Math.min(1, delta * 10);
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      position={[SOLDIER.spawnPosition[0], SOLDIER.spawnPosition[1] + 0.1, SOLDIER.spawnPosition[2]]}
      colliders={false}
      lockRotations
      canSleep={false}
      name="soldier"
    >
      <CapsuleCollider
        args={[SOLDIER.colliderHalfHeight, SOLDIER.colliderRadius]}
        position={[0, SOLDIER.colliderY, 0]}
      />
      <group
        ref={groupRef}
        rotation={[0, SOLDIER.initialFacing, 0]}
        onClick={(e) => {
          e.stopPropagation();
          if (gameState.mode === 'strategic') {
            gameState.selected = true;
            EventBus.emit('soldier-selected');
          }
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (gameState.mode === 'strategic') document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        <primitive object={clonedScene} scale={SOLDIER.scale} />
      </group>
    </RigidBody>
  );
}

// --- Exported wrapper with Suspense + ErrorBoundary -------------------------
export function Soldier() {
  return (
    <SoldierErrorBoundary>
      <Suspense fallback={
        <mesh position={[SOLDIER.spawnPosition[0], 0.75, SOLDIER.spawnPosition[2]]}>
          <boxGeometry args={[0.8, 1.5, 0.8]} />
          <meshStandardMaterial color="#facc15" emissive="#ca8a04" emissiveIntensity={0.2} />
        </mesh>
      }>
        <SoldierModel />
      </Suspense>
    </SoldierErrorBoundary>
  );
}