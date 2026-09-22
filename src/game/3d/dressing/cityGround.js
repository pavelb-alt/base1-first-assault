import * as THREE from 'three';
import { CITY, MAP } from '@/game/config';
import { dressingNoise } from '@/game/3d/dressing/dressingNoise';

let texture;
export function cityGroundTexture() {
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d'), unit = canvas.width / MAP.SIZE;
  const at = n => (n + MAP.HALF) * unit;
  ctx.fillStyle = CITY.concrete;
  ctx.fillRect(0, 0, 1024, 1024);
  // Pavement joints around the streets.
  ctx.strokeStyle = '#878e8a'; ctx.lineWidth = 0.5;
  for (let i = 0; i < 1024; i += 20) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1024); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke();
  }
  const roads = [-45, 0, 45];
  ctx.fillStyle = CITY.curb;
  roads.forEach(n => {
    ctx.fillRect(at(n - 6), 0, 12 * unit, 1024);
    ctx.fillRect(0, at(n - 6), 1024, 12 * unit);
  });
  ctx.fillStyle = CITY.asphalt;
  roads.forEach(n => {
    ctx.fillRect(at(n - 5.5), 0, 11 * unit, 1024);
    ctx.fillRect(0, at(n - 5.5), 1024, 11 * unit);
  });
  ctx.fillStyle = CITY.roadMarking;
  for (const lane of roads) for (let n = -72; n < 73; n += 6) {
    if (roads.some(c => Math.abs(n - c) < 8)) continue;
    ctx.fillRect(at(lane - 0.1), at(n), 0.2 * unit, 2.8 * unit);
    ctx.fillRect(at(n), at(lane - 0.1), 2.8 * unit, 0.2 * unit);
  }
  // Crosswalks and worn road paint at intersections.
  ctx.fillStyle = '#c7c8b8'; ctx.globalAlpha = 0.65;
  for (const x of roads) for (const z of roads) for (let stripe = -4; stripe <= 4; stripe += 1.5) {
    ctx.fillRect(at(x + stripe), at(z + 7), unit * 0.7, unit * 2.4);
    ctx.fillRect(at(x + 7), at(z + stripe), unit * 2.4, unit * 0.7);
  }
  for (let i = 0; i < 110; i++) {
    const x = dressingNoise(110000 + i * 3) * 1024, y = dressingNoise(110001 + i * 3) * 1024;
    const r = 4 + dressingNoise(110002 + i * 3) * 17;
    const stain = ctx.createRadialGradient(x, y, 0, x, y, r);
    stain.addColorStop(0, '#3c4549'); stain.addColorStop(1, '#3c454900');
    ctx.fillStyle = stain; ctx.globalAlpha = 0.3; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 14000; i++) {
    ctx.fillStyle = i % 2 ? '#e2ddd1' : '#303e42';
    ctx.fillRect(dressingNoise(120000 + i * 2) * 1024, dressingNoise(120001 + i * 2) * 1024, 1.5, 1);
  }
  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.name = 'Urban streets, crosswalks and blast scars';
  return texture;
}