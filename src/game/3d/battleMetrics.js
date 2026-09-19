import { LANES } from '@/game/config';

const paths = Object.values(LANES).map(lane => {
  let total = 0;
  const segments = lane.waypoints.slice(1).map((p, i) => {
    const a = lane.waypoints[i], dx = p[0] - a[0], dz = p[2] - a[2];
    const length = Math.hypot(dx, dz), start = total; total += length;
    return { x: a[0], z: a[2], dx, dz, length, start };
  });
  return { name: lane.name, segments, total };
});
const laneStats = () => ({ friendly: { spawned: 0, deaths: 0, breaches: 0, lifeSeconds: 0 }, enemy: { spawned: 0, deaths: 0, breaches: 0, lifeSeconds: 0 } });
export const battle = { elapsed: 0, waves: { friendly: 0, enemy: 0 }, lanes: paths.map(laneStats), shots: { friendly: 0, enemy: 0 }, hits: { friendly: 0, enemy: 0 }, playerDamage: 0, playerKills: 0, projectileOverflow: 0 };
export function resetBattle() {
  battle.elapsed = 0; battle.waves = { friendly: 0, enemy: 0 }; battle.lanes = paths.map(laneStats);
  battle.shots = { friendly: 0, enemy: 0 }; battle.hits = { friendly: 0, enemy: 0 };
  battle.playerDamage = 0; battle.playerKills = 0; battle.projectileOverflow = 0;
}
export function recordWave(team, waveId, perLane) {
  battle.waves[team] = waveId;
  battle.lanes.forEach(lane => { lane[team].spawned += perLane; });
}
export function recordRemoval(unit, reason) {
  if (!unit || unit.removalRecorded) return;
  unit.removalRecorded = true;
  const stat = battle.lanes[unit.laneIndex]?.[unit.team];
  if (!stat) return;
  if (reason === 'death') { stat.deaths++; stat.lifeSeconds += battle.elapsed - unit.bornAt; }
  if (reason === 'breach') stat.breaches++;
}
function progress(laneIndex, p) {
  const path = paths[laneIndex]; let nearest = Infinity, value = 0;
  for (const s of path.segments) {
    const t = Math.max(0, Math.min(1, ((p.x - s.x) * s.dx + (p.z - s.z) * s.dz) / (s.length * s.length)));
    const d = (p.x - s.x - t * s.dx) ** 2 + (p.z - s.z - t * s.dz) ** 2;
    if (d < nearest) { nearest = d; value = (s.start + t * s.length) / path.total; }
  }
  return value;
}
export function battleSnapshot(units) {
  const lanes = paths.map((p, i) => ({ name: p.name, friendly: { ...battle.lanes[i].friendly, alive: 0, hp: 0, frontline: null }, enemy: { ...battle.lanes[i].enemy, alive: 0, hp: 0, frontline: null }, types: {} }));
  for (const u of units) {
    if (!u.alive || !u.bodyRef.current) continue;
    const lane = lanes[u.laneIndex]; if (!lane) continue;
    const side = lane[u.team]; side.alive++; side.hp += u.health;
    lane.types[u.type] = (lane.types[u.type] || 0) + 1;
    const at = progress(u.laneIndex, u.bodyRef.current.translation());
    side.frontline = side.frontline === null ? at : (u.team === 'friendly' ? Math.max(side.frontline, at) : Math.min(side.frontline, at));
  }
  for (const lane of lanes) for (const team of ['friendly', 'enemy']) {
    const s = lane[team]; s.meanLifetimeAtDeath = s.deaths ? s.lifeSeconds / s.deaths : null;
  }
  return { elapsed: battle.elapsed, waves: { ...battle.waves }, lanes,
    shots: { ...battle.shots }, hits: { ...battle.hits }, playerDamage: battle.playerDamage, playerKills: battle.playerKills,
    projectileOverflow: battle.projectileOverflow,
    baseDamage: null, baseDamageStatus: 'Not implemented: existing bases are decorative. Breaches count arrivals, not damage.',
  };
}