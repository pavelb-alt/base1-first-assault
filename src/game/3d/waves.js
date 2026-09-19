import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BALANCE, LANES } from '@/game/config';
import { EventBus } from '@/game/EventBus';
import { gameState } from '@/game/3d/world';
import { combat } from '@/game/3d/combat';
import { recordWave } from '@/game/3d/battleMetrics';
import { random } from '@/game/3d/random';
import { WEAPON_IDS } from '@/game/3d/weapons';

// Two rows within each lane. Advancing from the shared corner separates the
// three formations without putting rear ranks outside the map boundary.
export function formationOffset(laneIndex, team, member) {
  const points = Object.values(LANES)[laneIndex].waypoints;
  const from = team === 'enemy' ? points[points.length - 1] : points[0];
  const to = team === 'enemy' ? points[points.length - 2] : points[1];
  const dx = to[0] - from[0], dz = to[2] - from[2], length = Math.hypot(dx, dz);
  const f = BALANCE.formation;
  const side = ((member % 3) - 1) * f.spacing;
  const forward = f.departure + (1 - Math.floor(member / 3)) * f.rowSpacing;
  return { x: dx / length * forward - dz / length * side, z: dz / length * forward + dx / length * side };
}

// A single render-loop clock per faction. Reusable slots, not per-spawn mounts.
// The ref owns reservations immediately; React is only a discrete render copy.
export function useWavePool(team) {
  const rules = BALANCE[team];
  const size = team === 'enemy' ? rules.squad.length : rules.perLane;
  const [, publish] = useReducer(n => n + 1, 0);
  const state = useRef(null);
  if (!state.current) state.current = {
    slots: Array.from({ length: rules.maxAlive }, (_, slot) => ({
      slot, id: -slot - 1, active: false, laneIndex: Math.floor(slot / rules.maxPerLane),
      type: team === 'enemy' ? rules.squad[slot % size] : 'soldier',
      weaponId: WEAPON_IDS[slot % WEAPON_IDS.length], spawnOffset: { x: 0, z: 0 }, squadId: 0,
    })), timer: rules.interval, nextId: 0, waveId: 0,
  };
  const despawn = useCallback(id => {
    const s = state.current;
    const index = s.slots.findIndex(u => u.active && u.id === id);
    if (index < 0) return;
    s.slots[index] = { ...s.slots[index], active: false };
    publish();
  }, []);
  useEffect(() => {
    const reset = () => {
      const s = state.current;
      s.slots = s.slots.map(u => ({ ...u, active: false }));
      s.timer = rules.interval; s.waveId = 0;
      publish();
    };
    EventBus.on('reset-game', reset);
    return () => EventBus.off('reset-game', reset);
  }, [rules]);
  useFrame((_, delta) => {
    if (gameState.paused) return;
    const s = state.current;
    s.timer = Math.min(rules.interval, s.timer + delta);
    if (s.timer < rules.interval) return;
    // Reserve all 18 slots atomically: never partial squads, never a burst of
    // overdue waves, and never lane-order priority when the pool is full.
    const free = [[], [], []];
    s.slots.forEach((u, i) => { if (!u.active) free[u.laneIndex].push(i); });
    if (free.some(lane => lane.length < size)) return;
    s.waveId++;
    const squad = team === 'enemy'
      ? (s.waveId % rules.giantEvery === 0 ? rules.giantSquad : rules.squad)
      : null;
    for (let laneIndex = 0; laneIndex < 3; laneIndex++) {
      for (let member = 0; member < size; member++) {
        const index = free[laneIndex][member];
        s.slots[index] = {
          ...s.slots[index], id: ++s.nextId, active: true, squadId: `${team}-${s.waveId}-${laneIndex}`,
          type: team === 'enemy' ? squad[member] : 'soldier',
          weaponId: team === 'friendly' ? WEAPON_IDS[Math.floor(random() * WEAPON_IDS.length)] : null,
          spawnOffset: formationOffset(laneIndex, team, member),
        };
      }
    }
    s.timer = 0;
    recordWave(team, s.waveId, size);
    publish();
  });
  return { slots: state.current.slots, despawn };
}

// All enemy types share a cruise speed. Front ranks ease off if a live squad
// member falls behind; trailing members catch up without racing past the group.
export function squadSpeed(entry, position, dx, dz) {
  let behind = 0, ahead = 0;
  for (const u of combat.units) {
    if (!u.alive || u.squadId !== entry.squadId || u === entry || !u.bodyRef.current) continue;
    const p = u.bodyRef.current.translation();
    const along = (p.x - position.x) * dx + (p.z - position.z) * dz;
    ahead = Math.max(ahead, along); behind = Math.max(behind, -along);
  }
  if (behind > BALANCE.formation.cohesionDistance) return BALANCE.moveSpeed * 0.35;
  return ahead > BALANCE.formation.cohesionDistance / 2 ? BALANCE.formation.catchupSpeed : BALANCE.moveSpeed;
}