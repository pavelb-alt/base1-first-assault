// Presentation metadata for the 5 campaign missions (names/waves come from config.js).
import { getLevelConfig } from '@/game/config';

const META = {
  1: {
    codename: 'FIRST LIGHT', tint: '#f59e0b', tint2: '#7c2d12',
    blurb: 'Hold the trench line at dawn while cargo drops land the first squads. Build defenses before the swarm reaches the base.',
  },
  2: {
    codename: 'BLACKOUT', tint: '#60a5fa', tint2: '#0b1220',
    blurb: 'Night falls on the same front. Visibility drops to flare light, so keep your sectors covered and your towers fed.',
  },
  3: {
    codename: 'VERDANT WALL', tint: '#4ade80', tint2: '#0f2a16',
    blurb: 'The push moves into dense forest. Short sightlines and flanking routes punish thin defensive lines.',
  },
  4: {
    codename: 'WHITE SILENCE', tint: '#7dd3fc', tint2: '#1e3a4a',
    blurb: 'Frozen trenches under falling snow. The waves get longer, and your towers and scrap carry forward from the last fight.',
  },
  5: {
    codename: 'IRON SKYLINE', tint: '#f87171', tint2: '#2a1414',
    blurb: 'The final stand in the ruined city. Fight through barricades and wrecks beneath a shattered skyline.',
  },
};

export const MISSION_IDS = [1, 2, 3, 4, 5];

export function missionInfo(level) {
  const cfg = getLevelConfig(level);
  const meta = META[cfg.id] ?? META[1];
  return {
    id: cfg.id,
    name: cfg.name,
    maxWaves: cfg.maxWaves,
    opNumber: String(cfg.id).padStart(2, '0'),
    operation: `OPERATION ${meta.codename}`,
    ...meta,
  };
}

export const TACTICAL_TIPS = [
  'Right-click open ground in Strategic view to deploy towers. Spacing matters, since towers cannot overlap.',
  'Frost Towers slow whatever they hit. Pair them with splash-damage Cannons on the main crossing lanes.',
  'Press Join the Fight to possess a soldier. Your kills, accuracy and streak are tracked for the debrief.',
  'Drag-select squads, then press M to move, T to attack, or H to hold position.',
  'Base integrity decides your stars: keep it above 90% for a perfect three-star clear.',
  'Scrap earned from kills funds new towers, so a strong early economy wins the late waves.',
  'Tanks and artillery arrive as reinforcements. Protect them, because they anchor the line.',
  'In third-person, press E near a gun position to take control of it.',
  'Press P at any time to pause. Settings are available from the pause menu.',
];

export function formatTime(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '--:--';
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
