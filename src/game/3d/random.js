// One seedable source for spawn choices; never tied to render/possession.
let seed = (Date.now() >>> 0) || 1;
export function setRandomSeed(value) { seed = (value >>> 0) || 1; }
export function random() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}