import { DRESSING } from '@/game/config';

// Stable visual variation, independent of the gameplay random stream.
export function dressingNoise(index) {
  const n = Math.sin((index + DRESSING.seed) * 127.1) * 43758.5453;
  return n - Math.floor(n);
}