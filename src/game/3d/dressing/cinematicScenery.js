import { MAP, DRESSING } from '@/game/config';
import { dressingNoise as noise } from '@/game/3d/dressing/groundAppearance';

// Visual-only scenery outside the collision boundary: never obstructs a route or shot.
export function addCinematicScenery(batches) {
  const put = (kind, position, scale, color, rotation = [0, 0, 0]) => batches[kind].push({ position, scale, color, rotation });
  const steel = DRESSING.steel, rust = DRESSING.rust;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = side * (MAP.HALF + 12 + noise(i + 720) * 7), z = -66 + i * 25;
      // Ribbed shipping containers, recessed door seam and corner uprights.
      put('box', [x, 1.6, z], [4.5, 3.2, 8], i % 2 ? '#777965' : '#927b5d');
      for (let j = 0; j < 10; j++) for (const edge of [-1, 1])
        put('box', [x + edge * 2.3, 1.6, z - 3.7 + j * .82], [.12, 2.85, .13], rust);
      put('box', [x, 1.6, z + 4.03], [.09, 3, .09], steel);
      put('box', [x, 3.25, z], [4.7, .13, 8.2], steel);
      // Broken reinforced wall sections and smaller rubble beside each container.
      put('box', [x + side * 7, 1.4, z - 5], [1.1, 2.8, 6], '#8a8273', [0, .15, .1]);
      for (let j = 0; j < 10; j++) {
        const n = 9100 + i * 70 + j * 4 + (side + 1) * 300;
        put('rock', [x + side * (4 + noise(n) * 7), .18, z + (noise(n + 1) - .5) * 16],
          [.3 + noise(n + 2) * 1.2, .25 + noise(n + 3), .8], '#8c8370', [.2, noise(n) * 6, .2]);
      }
      // Utility poles and broken cross-braces make readable long sun shadows.
      put('cylinder', [side * (MAP.HALF + 6), 3.7, z], [.24, 7.4, .24], steel);
      put('box', [side * (MAP.HALF + 6), 6.8, z], [.2, .2, 3], rust);
    }
    // Ruined industrial frames in the middle distance.
    for (let i = 0; i < 4; i++) {
      const x = side * (MAP.HALF + 40), z = -100 + i * 58;
      for (const dx of [-7, 7]) for (const dz of [-8, 8])
        put('box', [x + dx, 5, z + dz], [.8, 10, .8], steel);
      for (const dz of [-8, 8]) put('box', [x, 10, z + dz], [15, .7, .8], rust);
      put('box', [x + 5, 4, z], [.7, 10, .7], rust, [0, 0, .55]);
    }
  }
  // Low distant mesas hide the map apron silhouette without filling the combat area.
  for (let i = 0; i < 38; i++) {
    const a = i / 38 * Math.PI * 2, radius = 215 + noise(500 + i) * 18;
    put('rock', [Math.cos(a) * radius, 5, Math.sin(a) * radius],
      [32 + noise(600 + i) * 24, 18 + noise(700 + i) * 30, 30 + noise(800 + i) * 20],
      i % 2 ? '#a38f75' : '#968978', [0, a, 0]);
  }
}