// Procedural sound library. Each recipe renders a mono Float32Array; buffers
// are cached per variant and pre-warmed in idle time after the context unlocks.
import { engine } from '@/game/audio/engine';
import { TAU, SVF, rng, brown, expEnv, normalize, fade, makeLoop, addPartials, gunshot, explosion, mtof } from '@/game/audio/dsp';

const buf = (sr, s) => new Float32Array(Math.max(1, Math.floor(sr * s)));

// --- Weapons -----------------------------------------------------------------
const RIFLE = { dur: 0.42, crackHz: 3200, crackTau: 0.0032, bodyHz: 850, bodyTau: 0.02, bodyAmt: 1.4,
  thumpHz: 160, thumpEnd: 55, thumpTau: 0.03, thumpAmt: 0.6, tailHz: 1600, tailTau: 0.1, tailAmt: 0.3, drive: 1.8 };
const RIFLE_PLAYER = { dur: 0.85, crackHz: 2600, crackTau: 0.004, crackAmt: 1.2, bodyHz: 700, bodyTau: 0.028, bodyAmt: 1.6,
  thumpHz: 120, thumpEnd: 42, thumpTau: 0.055, thumpAmt: 1.0, tailHz: 2200, tailSweep: 0.18, tailTau: 0.22, tailAmt: 0.42, tailBrown: true,
  clickAt: 0.045, clickAmt: 0.06, drive: 2.1 };
const TOWER_MG = { dur: 0.4, crackHz: 2400, crackTau: 0.003, bodyHz: 560, bodyQ: 1.4, bodyTau: 0.024, bodyAmt: 1.6,
  thumpHz: 190, thumpEnd: 60, thumpTau: 0.028, thumpAmt: 0.8, tailHz: 1200, tailTau: 0.09, tailAmt: 0.25,
  ring: [2380, 3710], ringAmt: 0.05, ringTau: 0.03, drive: 2.0 };
const TOWER_CANNON = { dur: 1.3, crackHz: 1800, crackTau: 0.006, bodyHz: 380, bodyTau: 0.05, bodyAmt: 1.4,
  thumpHz: 95, thumpEnd: 30, thumpTau: 0.16, thumpAmt: 1.3, tailHz: 1400, tailSweep: 0.25, tailTau: 0.35, tailAmt: 0.6, tailBrown: true, drive: 2.0 };
const TANK = { dur: 1.9, crackHz: 1500, crackTau: 0.008, crackAmt: 1.2, bodyHz: 300, bodyTau: 0.07, bodyAmt: 1.5,
  thumpHz: 72, thumpEnd: 24, thumpTau: 0.26, thumpAmt: 1.5, tailHz: 1100, tailSweep: 0.35, tailTau: 0.55, tailAmt: 0.75, tailBrown: true,
  ring: [412, 1127, 1871, 2650], ringAmt: 0.04, ringTau: 0.35, drive: 2.2 };
const ARTILLERY = { dur: 3.0, crackHz: 1200, crackTau: 0.01, crackAmt: 1.0, bodyHz: 220, bodyTau: 0.1, bodyAmt: 1.4,
  thumpHz: 58, thumpEnd: 20, thumpTau: 0.4, thumpAmt: 1.6, tailHz: 800, tailSweep: 0.6, tailTau: 0.9, tailAmt: 0.9, tailBrown: true, drive: 2.4 };

function plasma(sr, R) { // quadshell: descending resonant plasma bolt
  const x = buf(sr, 0.32); const f = new SVF(sr, 2000, 5); let ph = 0, ph2 = 0;
  const f0 = 1300 + R() * 400, f1 = 240 + R() * 80;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; const fr = f1 + (f0 - f1) * Math.exp(-t / 0.045);
    ph += TAU * fr / sr; ph2 += TAU * fr * 0.501 / sr;
    const saw = ((ph / TAU) % 1) * 2 - 1;
    if ((i & 15) === 0) f.set(fr * 2.2, 4);
    f.run(saw * 0.7 + (R() * 2 - 1) * 0.25);
    x[i] = (f.lp * 0.9 + Math.sin(ph2) * 0.5) * expEnv(t, 0.002, 0.07);
  }
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 1.6);
  return fade(normalize(x, 0.9), sr, 0.3, 20);
}
function needle(sr, R) { // spider403: buzzy FM needler
  const x = buf(sr, 0.14); let pc = 0, pm = 0; const fc = 2000 + R() * 700, fm = 310 + R() * 60;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; const drop = 1 - 0.35 * (1 - Math.exp(-t / 0.03));
    pm += TAU * fm / sr; pc += TAU * fc * drop / sr + Math.sin(pm) * 0.9 * Math.exp(-t / 0.05);
    x[i] = (Math.sin(pc) + (R() * 2 - 1) * 0.3 * Math.exp(-t / 0.004)) * expEnv(t, 0.001, 0.03);
  }
  return fade(normalize(x, 0.85), sr, 0.2, 10);
}
function zap(sr, R) { // eyedrone: bright ring-modulated laser
  const x = buf(sr, 0.28); let p1 = 0, p2 = 0, p3 = 0; const f0 = 3200 + R() * 800, f1 = 520 + R() * 160, rm = 47 + R() * 30;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; const fr = f1 + (f0 - f1) * Math.exp(-t / 0.035);
    p1 += TAU * fr / sr; p2 += TAU * fr * 1.007 / sr; p3 += TAU * rm / sr;
    x[i] = (Math.sin(p1) + 0.6 * Math.sin(p2 * 2)) * (0.6 + 0.4 * Math.sin(p3)) * expEnv(t, 0.001, 0.06);
  }
  return fade(normalize(x, 0.85), sr, 0.2, 15);
}
function growl(sr, R) { // trilobite: heavy distorted bio-cannon
  const x = buf(sr, 0.75); const f = new SVF(sr, 1200, 2.5); let ph = 0, ps = 0; const nb = brown(R);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; const fr = 48 + 50 * Math.exp(-t / 0.08);
    ph += TAU * fr / sr; ps += TAU * (fr * 0.5) / sr;
    const saw = ((ph / TAU) % 1) * 2 - 1;
    if ((i & 15) === 0) f.set(180 + 1400 * Math.exp(-t / 0.09), 3);
    f.run(saw + nb() * 0.4);
    x[i] = (f.lp * 1.2 + Math.sin(ps) * 0.9) * expEnv(t, 0.004, 0.16) + (R() * 2 - 1) * 0.3 * Math.exp(-t / 0.01);
  }
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 2.4);
  return fade(normalize(x, 0.92), sr, 0.3, 40);
}
function frost(sr, R) { // frost tower: icy hiss burst + crystalline partials
  const x = buf(sr, 0.7); const f = new SVF(sr, 6000, 3);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; if ((i & 31) === 0) f.set(1800 + 5000 * Math.exp(-t / 0.12), 2.5);
    f.run(R() * 2 - 1); x[i] = f.bp * expEnv(t, 0.01, 0.12) * 0.9 + f.hp * 0.15 * Math.exp(-t / 0.05);
  }
  addPartials(x, sr, Math.floor(sr * 0.004), [2637, 3520, 4186, 5274], [0.12, 0.09, 0.07, 0.05], [0.18, 0.14, 0.11, 0.08], R);
  return fade(normalize(x, 0.85), sr, 0.5, 30);
}

// --- Impacts -----------------------------------------------------------------
function impactCover(sr, R) {
  const x = buf(sr, 0.22); const f = new SVF(sr, 1800 + R() * 1500, 1.2); let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; f.run(R() * 2 - 1); ph += TAU * (190 + R() * 2) / sr;
    x[i] = f.bp * expEnv(t, 0.0005, 0.014) * 1.6 + Math.sin(ph) * expEnv(t, 0.001, 0.02) * 0.4;
  }
  // grit
  const g = new SVF(sr, 4000, 2);
  for (let k = 0; k < 5; k++) {
    const at = Math.floor(sr * (0.02 + R() * 0.12)), len = Math.floor(sr * 0.006);
    for (let i = 0; i < len && at + i < x.length; i++) { g.run(R() * 2 - 1); x[at + i] += g.bp * 0.25 * (1 - i / len); }
  }
  return fade(normalize(x, 0.8), sr, 0.1, 10);
}
function impactFlesh(sr, R) {
  const x = buf(sr, 0.16); const f = new SVF(sr, 700 + R() * 400, 0.9); let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; f.run(R() * 2 - 1); ph += TAU * (90 + 80 * Math.exp(-t / 0.02)) / sr;
    x[i] = f.lp * expEnv(t, 0.001, 0.022) * 1.3 + Math.sin(ph) * expEnv(t, 0.001, 0.03) * 0.8;
  }
  return fade(normalize(x, 0.8), sr, 0.1, 10);
}
function impactChitin(sr, R) { // alien hit: crunchy wet click
  const x = buf(sr, 0.18); const f = new SVF(sr, 1200 + R() * 800, 3);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; f.run(R() * 2 - 1);
    const crackle = (R() < 0.08 ? (R() * 2 - 1) : 0) * Math.exp(-t / 0.05);
    x[i] = f.bp * expEnv(t, 0.0005, 0.018) * 2 + crackle * 0.5;
  }
  addPartials(x, sr, 0, [140 + R() * 40], [0.5], [0.03], R);
  return fade(normalize(x, 0.8), sr, 0.1, 10);
}
function impactMetal(sr, R) {
  const x = buf(sr, 0.4); const f = new SVF(sr, 3500, 1);
  for (let i = 0; i < x.length; i++) { const t = i / sr; f.run(R() * 2 - 1); x[i] = f.bp * Math.exp(-t / 0.005) * 1.2; }
  const b = 1 + (R() - 0.5) * 0.3;
  addPartials(x, sr, 0, [1730 * b, 2810 * b, 4350 * b, 6020 * b], [0.25, 0.18, 0.12, 0.06], [0.11, 0.08, 0.06, 0.04], R);
  return fade(normalize(x, 0.75), sr, 0.1, 20);
}

// --- Deaths ------------------------------------------------------------------
function screech(sr, R, base, dur, vib, rough) {
  const x = buf(sr, dur); const f1 = new SVF(sr, base * 2.2, 4), f2 = new SVF(sr, base * 4.3, 5);
  let pc = 0, pm = 0, pv = 0;
  const b = base * (0.9 + R() * 0.2);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; const u = t / dur;
    pv += TAU * vib / sr;
    const fr = b * (1 + 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.6))) * (1 - 0.45 * u) * (1 + 0.04 * Math.sin(pv));
    pm += TAU * fr * 1.41 / sr; pc += TAU * fr / sr + Math.sin(pm) * rough * (1 - u);
    const src = Math.sin(pc) + (R() * 2 - 1) * 0.35;
    f1.run(src); f2.run(src);
    x[i] = (f1.bp + f2.bp * 0.7) * expEnv(t, 0.02, dur * 0.35) * (1 - u);
  }
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 2);
  return fade(normalize(x, 0.85), sr, 2, 40);
}
const deathQuad = (sr, R) => screech(sr, R, 520, 0.75, 28, 1.3);
const deathSpider = (sr, R) => { // chittering clicks + shriek
  const x = screech(sr, R, 1400, 0.55, 42, 2);
  const f = new SVF(sr, 3000, 3);
  for (let i = 0; i < x.length; i++) { const t = i / sr; f.run(R() * 2 - 1); x[i] = x[i] * 0.7 + f.bp * (Math.sin(TAU * 38 * t) > 0.6 ? 1 : 0) * Math.exp(-t / 0.2) * 0.5; }
  return normalize(x, 0.85);
};
function deathDrone(sr, R) { // electronic warble down + sparks
  const x = buf(sr, 0.9); let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; const fr = (900 - 700 * (t / 0.9)) * (1 + 0.15 * Math.sin(TAU * 17 * t));
    ph += TAU * fr / sr;
    const sq = Math.sin(ph) > 0 ? 0.6 : -0.6;
    const spark = R() < 0.02 * Math.exp(-t / 0.3) ? (R() * 2 - 1) : 0;
    x[i] = sq * expEnv(t, 0.005, 0.3) * 0.5 + spark;
  }
  const f = new SVF(sr, 3000, 0.8); for (let i = 0; i < x.length; i++) x[i] = f.run(x[i]);
  return fade(normalize(x, 0.85), sr, 1, 40);
}
function deathTrilobite(sr, R) { // deep roar + body slam
  const x = buf(sr, 1.6); const fa = new SVF(sr, 400, 4), fb = new SVF(sr, 1100, 5); let ph = 0; const nb = brown(R);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; const u = t / 1.6;
    const fr = (95 + 30 * Math.sin(Math.PI * Math.min(1, u * 2))) * (1 - 0.4 * u);
    ph += TAU * fr / sr; const saw = ((ph / TAU) % 1) * 2 - 1;
    const src = saw + nb() * 0.6; fa.run(src); fb.run(src);
    x[i] = (fa.bp * 1.2 + fb.bp * 0.6) * expEnv(t, 0.05, 0.5) * (1 - u);
  }
  addPartials(x, sr, Math.floor(sr * 0.9), [42], [0.9], [0.15], R);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 2.2);
  return fade(normalize(x, 0.9), sr, 2, 60);
}
function deathSoldier(sr, R) { // body drop + gear rattle (no vocal)
  const x = buf(sr, 0.7); const f = new SVF(sr, 400, 0.8);
  const drop = Math.floor(sr * (0.12 + R() * 0.08));
  for (let i = drop; i < x.length; i++) { const t = (i - drop) / sr; f.run(R() * 2 - 1); x[i] = f.lp * expEnv(t, 0.002, 0.05) * 1.6; }
  addPartials(x, sr, drop, [85], [0.8], [0.05], R);
  for (let k = 0; k < 6; k++) addPartials(x, sr, drop + Math.floor(sr * (R() * 0.25)), [2200 + R() * 3000], [0.06], [0.015], R);
  return fade(normalize(x, 0.7), sr, 0.5, 20);
}
function vehicleDestroyed(sr, R) {
  const x = explosion(sr, R, { dur: 3.6, thumpHz: 60, thumpTau: 0.45, lpStart: 3500, lpEnd: 220, lpTau: 0.5, noiseTau: 0.9, debris: 40, drive: 2 });
  // metal groan + clanks
  const f = new SVF(sr, 600, 6); let ph = 0;
  const at = Math.floor(sr * 0.25);
  for (let i = at; i < x.length; i++) {
    const t = (i - at) / sr; ph += TAU * (110 - 50 * Math.min(1, t / 1.5)) / sr;
    f.run(((ph / TAU) % 1) * 2 - 1); x[i] += f.bp * expEnv(t, 0.2, 0.6) * 0.25;
  }
  for (let k = 0; k < 4; k++) addPartials(x, sr, Math.floor(sr * (0.5 + R() * 2)), [620 + R() * 300, 1500 + R() * 700], [0.08, 0.05], [0.2, 0.12], R);
  return normalize(x, 0.95);
}

// --- Artillery / explosions ----------------------------------------------------
function whistle(sr, R) { // 1.6s incoming whistle, rising loudness, falling pitch
  const dur = 1.6; const x = buf(sr, dur); const f = new SVF(sr, 3000, 6); let ph = 0;
  const f0 = 1900 + R() * 300, f1 = 700 + R() * 120;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; const u = t / dur;
    const fr = f0 + (f1 - f0) * u * u * (1 + 0.006 * Math.sin(TAU * 6 * t));
    ph += TAU * fr / sr;
    f.set(fr, 8); f.run(R() * 2 - 1);
    x[i] = (Math.sin(ph) * 0.6 + f.bp * 0.8) * Math.pow(u, 1.8) * (u > 0.96 ? (1 - u) / 0.04 : 1);
  }
  return fade(normalize(x, 0.7), sr, 5, 10);
}
const explosionBig = (sr, R) => explosion(sr, R, { dur: 3.2, thumpHz: 55, thumpTau: 0.4, lpStart: 5000, lpEnd: 160, lpTau: 0.35, noiseTau: 0.7, debris: 50, drive: 2.1 });
const explosionMed = (sr, R) => explosion(sr, R, { dur: 2.2, thumpHz: 70, thumpTau: 0.25, lpStart: 4000, lpEnd: 220, lpTau: 0.25, noiseTau: 0.45, debris: 28, drive: 1.9 });
const explosionSmall = (sr, R) => explosion(sr, R, { dur: 1.0, thumpHz: 110, thumpTau: 0.1, lpStart: 3500, lpEnd: 400, lpTau: 0.12, noiseTau: 0.18, debris: 10, drive: 1.6 });
const rumbleDistant = (sr, R) => explosion(sr, R, { dur: 4.2, thumpHz: 38, thumpTau: 0.7, lpStart: 420, lpEnd: 90, lpTau: 1.2, noiseTau: 1.4, attack: 0.06, crackAmt: 0, debris: 0, drive: 1.4 });

// --- Player feedback -----------------------------------------------------------
function hitTick(sr, R) {
  const x = buf(sr, 0.06); let ph = 0;
  for (let i = 0; i < x.length; i++) { const t = i / sr; ph += TAU * (2900 + R() * 0) / sr; x[i] = Math.sin(ph) * expEnv(t, 0.0005, 0.012) + (R() * 2 - 1) * 0.3 * Math.exp(-t / 0.0015); }
  return fade(normalize(x, 0.8), sr, 0.05, 5);
}
function killConfirm(sr, R) {
  const x = buf(sr, 0.45);
  addPartials(x, sr, 0, [1760, 2637], [0.5, 0.3], [0.09, 0.07], R);
  addPartials(x, sr, Math.floor(sr * 0.045), [2349, 3520], [0.45, 0.2], [0.14, 0.09], R);
  let ph = 0; const hp = new SVF(sr, 6000, 0.7);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; ph += TAU * (70 + 60 * Math.exp(-t / 0.02)) / sr;
    hp.run(R() * 2 - 1);
    x[i] += Math.sin(ph) * expEnv(t, 0.001, 0.06) * 0.7 + hp.hp * expEnv(t, 0.002, 0.04) * 0.15;
  }
  return fade(normalize(x, 0.85), sr, 0.05, 30);
}
function hurt(sr, R) {
  const x = buf(sr, 0.35); let ph = 0; const f = new SVF(sr, 500, 0.8);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; ph += TAU * (48 + 60 * Math.exp(-t / 0.03)) / sr; f.run(R() * 2 - 1);
    x[i] = Math.sin(ph) * expEnv(t, 0.002, 0.09) + f.lp * expEnv(t, 0.001, 0.03) * 1.2;
  }
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 2.5);
  return fade(normalize(x, 0.9), sr, 0.1, 20);
}
function heartbeat(sr) {
  const x = buf(sr, 0.6);
  const beat = (at, amp) => { let ph = 0; const s = Math.floor(sr * at); for (let i = 0; s + i < x.length; i++) { const t = i / sr; ph += TAU * (52 + 20 * Math.exp(-t / 0.02)) / sr; x[s + i] += Math.sin(ph) * expEnv(t, 0.006, 0.06) * amp; } };
  beat(0, 1); beat(0.26, 0.65);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 1.5);
  return fade(normalize(x, 0.9), sr, 0.5, 30);
}
function scrap(sr, R) {
  const x = buf(sr, 0.28); const notes = [mtof(84), mtof(91)];
  for (let n = 0; n < 2; n++) {
    const at = Math.floor(sr * n * 0.055); let ph = 0;
    for (let i = 0; at + i < x.length; i++) { const t = i / sr; ph += TAU * notes[n] / sr; const sq = Math.sin(ph) + 0.25 * Math.sin(ph * 3); x[at + i] += sq * expEnv(t, 0.002, 0.06) * 0.5; }
  }
  addPartials(x, sr, 0, [5200, 7100], [0.05, 0.03], [0.05, 0.03], R);
  return fade(normalize(x, 0.7), sr, 0.1, 20);
}
function towerDeploy(sr, R) { // descending thrusters → touchdown clank → hiss
  const dur = 2.0; const x = buf(sr, dur); const f = new SVF(sr, 900, 1.2); const nb = brown(R); const td = 1.0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const thr = t < td ? Math.min(1, t / 0.5) : Math.exp(-(t - td) / 0.08);
    if ((i & 31) === 0) f.set(500 + 700 * Math.min(1, t / td) + 120 * Math.sin(TAU * 7 * t), 1.4);
    f.run((R() * 2 - 1) * 0.6 + nb() * 0.6);
    let v = f.bp * thr * 1.1;
    if (t > td) { const u = t - td; v += (R() * 2 - 1) * 0.12 * expEnv(u, 0.05, 0.35) * (u > 0.08 ? 1 : 0); }
    x[i] = v;
  }
  const at = Math.floor(sr * td);
  addPartials(x, sr, at, [62, 340, 870, 1410, 2290], [1.0, 0.25, 0.18, 0.1, 0.06], [0.12, 0.25, 0.18, 0.12, 0.08], R);
  addPartials(x, sr, at + Math.floor(sr * 0.14), [520, 1240], [0.12, 0.06], [0.1, 0.06], R);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 1.6);
  return fade(normalize(x, 0.9), sr, 2, 60);
}
function klaxon(sr) {
  const x = buf(sr, 1.9); const f = new SVF(sr, 1300, 1.5); let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; const seg = Math.floor(t / 0.3); const local = t - seg * 0.3;
    const on = seg < 6 && local < 0.26;
    ph += TAU * (seg % 2 ? 440 : 523) / sr;
    const sq = (Math.sin(ph) > 0 ? 1 : -1) * 0.6 + Math.sin(ph * 2) * 0.2;
    f.run(sq);
    x[i] = on ? f.bp * Math.min(1, local / 0.01) * Math.min(1, (0.26 - local) / 0.02) : 0;
  }
  return fade(normalize(x, 0.7), sr, 1, 40);
}
function horn(sr, R) { // wave-start war horn with taiko hit
  const dur = 3.2; const x = buf(sr, dur); const f = new SVF(sr, 200, 1.3);
  const ps = [0, 0, 0, 0]; const fr = [mtof(38), mtof(38) * 1.003, mtof(45), mtof(26)];
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; const env = expEnv(t, 0.35, 1.2) * (t < 2.6 ? 1 : Math.max(0, 1 - (t - 2.6) / 0.6));
    let s = 0; for (let k = 0; k < 4; k++) { ps[k] += TAU * fr[k] * (1 - 0.01 * Math.exp(-t / 0.2)) / sr; s += (((ps[k] / TAU) % 1) * 2 - 1) * (k === 3 ? 0.5 : 0.4); }
    if ((i & 31) === 0) f.set(180 + 1300 * Math.min(1, t / 0.5) * Math.exp(-t / 2), 1.2);
    f.run(s); x[i] = f.lp * env;
  }
  // taiko
  let ph = 0; const nf = new SVF(sr, 600, 0.8);
  for (let i = 0; i < x.length; i++) { const t = i / sr; ph += TAU * (60 + 70 * Math.exp(-t / 0.03)) / sr; nf.run(R() * 2 - 1); x[i] += (Math.sin(ph) * 1.2 + nf.lp * 0.8) * expEnv(t, 0.002, 0.25); }
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 1.5);
  return fade(normalize(x, 0.9), sr, 1, 80);
}
function chord(sr, R, notes, dur, bright, fall = 0, wave = 'saw') {
  const x = buf(sr, dur); const f = new SVF(sr, 300, 0.9); const ph = new Float64Array(notes.length * 2);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; const u = t / dur;
    const env = Math.min(1, t / 0.25) * Math.pow(1 - u, 1.5);
    const bend = 1 - fall * u * u;
    let s = 0;
    for (let k = 0; k < notes.length; k++) for (let d = 0; d < 2; d++) {
      const j = k * 2 + d; ph[j] += TAU * notes[k] * bend * (d ? 1.004 : 0.996) / sr;
      s += wave === 'saw' ? (((ph[j] / TAU) % 1) * 2 - 1) : Math.sin(ph[j]);
    }
    if ((i & 31) === 0) f.set(200 + bright * Math.min(1, t / 0.6) * (1 - u * 0.7), 0.9);
    f.run(s / notes.length); x[i] = f.lp * env;
  }
  return x;
}
function victory(sr, R) {
  const x = chord(sr, R, [mtof(50), mtof(57), mtof(62), mtof(66), mtof(69)], 4.5, 3800);
  let ph = 0; const nf = new SVF(sr, 500, 0.8);
  for (let i = 0; i < x.length; i++) { const t = i / sr; ph += TAU * (55 + 50 * Math.exp(-t / 0.04)) / sr; nf.run(R() * 2 - 1); x[i] += (Math.sin(ph) + nf.lp * 0.6) * expEnv(t, 0.002, 0.5) * 0.9; }
  addPartials(x, sr, Math.floor(sr * 0.35), [mtof(86), mtof(90), mtof(93)], [0.1, 0.07, 0.06], [1.2, 1.0, 0.9], R);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 1.4);
  return fade(normalize(x, 0.9), sr, 2, 200);
}
function defeat(sr, R) {
  const x = chord(sr, R, [mtof(36), mtof(43), mtof(48), mtof(51), mtof(54)], 5.5, 1400, 0.12);
  let ph = 0;
  for (let i = 0; i < x.length; i++) { const t = i / sr; ph += TAU * (34 + 30 * Math.exp(-t / 0.1)) / sr; x[i] += Math.sin(ph) * expEnv(t, 0.01, 1.2) * 0.9; }
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 1.6);
  return fade(normalize(x, 0.9), sr, 2, 300);
}
function objective(sr, R) { // positive chime: enemy base breached
  const x = buf(sr, 1.2);
  addPartials(x, sr, 0, [mtof(74), mtof(81)], [0.4, 0.3], [0.4, 0.35], R);
  addPartials(x, sr, Math.floor(sr * 0.12), [mtof(86)], [0.35], [0.5], R);
  return fade(normalize(x, 0.7), sr, 0.5, 80);
}

// --- UI ------------------------------------------------------------------------
function tone(sr, notes, step, tau, wave = 0.15, dur = 0.25) {
  const x = buf(sr, dur);
  for (let n = 0; n < notes.length; n++) {
    const at = Math.floor(sr * step * n); let ph = 0; const f = mtof(notes[n]);
    for (let i = 0; at + i < x.length; i++) { const t = i / sr; ph += TAU * f / sr; x[at + i] += (Math.sin(ph) + wave * Math.sin(ph * 2)) * expEnv(t, 0.002, tau); }
  }
  return fade(normalize(x, 0.7), sr, 0.1, 15);
}
function uiHover(sr, R) {
  const x = buf(sr, 0.035); const f = new SVF(sr, 5200, 3);
  for (let i = 0; i < x.length; i++) { const t = i / sr; f.run(R() * 2 - 1); x[i] = f.bp * expEnv(t, 0.0005, 0.005) + Math.sin(TAU * 3400 * t) * expEnv(t, 0.0005, 0.006) * 0.3; }
  return fade(normalize(x, 0.5), sr, 0.05, 5);
}
function uiClick(sr, R) {
  const x = buf(sr, 0.07); const f = new SVF(sr, 2600, 2);
  for (let i = 0; i < x.length; i++) { const t = i / sr; f.run(R() * 2 - 1); x[i] = f.bp * expEnv(t, 0.0003, 0.004) * 1.5 + Math.sin(TAU * 820 * t) * expEnv(t, 0.0005, 0.012) * 0.6; }
  return fade(normalize(x, 0.7), sr, 0.05, 5);
}
function whoosh(sr, R, up) {
  const x = buf(sr, 0.22); const f = new SVF(sr, 800, 1.6);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; const u = t / 0.22;
    if ((i & 15) === 0) f.set(up ? 600 + 4000 * u * u : 4500 - 3800 * u, 1.6);
    f.run(R() * 2 - 1); x[i] = f.bp * Math.sin(Math.PI * u) ** 1.5;
  }
  addPartials(x, sr, Math.floor(sr * (up ? 0.17 : 0.0)), [up ? 2400 : 1500], [0.2], [0.02], R);
  return fade(normalize(x, 0.55), sr, 0.5, 10);
}
function uiError(sr) {
  const x = buf(sr, 0.26); let ph = 0;
  for (let i = 0; i < x.length; i++) { const t = i / sr; ph += TAU * 150 / sr; const on = t < 0.09 || (t > 0.13 && t < 0.22); x[i] = on ? (Math.sin(ph) > 0 ? 0.5 : -0.5) * 0.6 + Math.sin(ph * 2) * 0.2 : 0; }
  const f = new SVF(sr, 1400, 0.7); for (let i = 0; i < x.length; i++) x[i] = f.run(x[i]);
  return fade(normalize(x, 0.6), sr, 1, 10);
}
function uiPurchase(sr, R) {
  const x = tone(sr, [79, 86, 91], 0.05, 0.08, 0.2, 0.4);
  addPartials(x, sr, Math.floor(sr * 0.1), [6200, 8100, 9400], [0.04, 0.03, 0.02], [0.12, 0.1, 0.08], R);
  return normalize(x, 0.7);
}

// --- Music one-shots (pitched per note via playbackRate) -------------------------
function kick(sr, R) { const x = buf(sr, 0.5); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / sr; ph += TAU * (46 + 90 * Math.exp(-t / 0.03)) / sr; x[i] = Math.tanh(Math.sin(ph) * expEnv(t, 0.001, 0.14) * 1.8) + (R() * 2 - 1) * 0.1 * Math.exp(-t / 0.002); } return fade(normalize(x, 0.9), sr, 0.05, 20); }
function taiko(sr, R) { const x = buf(sr, 1.0); let ph = 0; const f = new SVF(sr, 500, 0.8); for (let i = 0; i < x.length; i++) { const t = i / sr; ph += TAU * (62 + 40 * Math.exp(-t / 0.04)) / sr; f.run(R() * 2 - 1); x[i] = Math.sin(ph) * expEnv(t, 0.002, 0.28) + f.lp * expEnv(t, 0.001, 0.06) * 1.2; } return fade(normalize(x, 0.9), sr, 0.05, 40); }
function tom(sr, R) { const x = buf(sr, 0.6); let ph = 0; const f = new SVF(sr, 900, 0.8); for (let i = 0; i < x.length; i++) { const t = i / sr; ph += TAU * (105 + 50 * Math.exp(-t / 0.03)) / sr; f.run(R() * 2 - 1); x[i] = Math.sin(ph) * expEnv(t, 0.001, 0.16) + f.lp * expEnv(t, 0.001, 0.03) * 0.6; } return fade(normalize(x, 0.85), sr, 0.05, 30); }
function snare(sr, R) { const x = buf(sr, 0.4); const f = new SVF(sr, 3500, 0.7); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / sr; f.run(R() * 2 - 1); ph += TAU * 190 / sr; x[i] = (f.bp * 1.4 + f.hp * 0.4) * expEnv(t, 0.001, 0.09) + Math.sin(ph) * expEnv(t, 0.001, 0.04) * 0.5; } return fade(normalize(x, 0.8), sr, 0.05, 20); }
function hat(sr, R) { const x = buf(sr, 0.09); const f = new SVF(sr, 8000, 1); for (let i = 0; i < x.length; i++) { const t = i / sr; f.run(R() * 2 - 1); x[i] = f.hp * expEnv(t, 0.0005, 0.018); } return fade(normalize(x, 0.6), sr, 0.05, 10); }
function shaker(sr, R) { const x = buf(sr, 0.12); const f = new SVF(sr, 6000, 1.5); for (let i = 0; i < x.length; i++) { const t = i / sr; f.run(R() * 2 - 1); x[i] = f.bp * expEnv(t, 0.012, 0.03); } return fade(normalize(x, 0.5), sr, 0.1, 10); }
function rim(sr, R) { const x = buf(sr, 0.12); addPartials(x, sr, 0, [1650, 2730], [0.5, 0.3], [0.015, 0.01], R); const f = new SVF(sr, 3000, 2); for (let i = 0; i < x.length; i++) { f.run(R() * 2 - 1); x[i] += f.bp * Math.exp(-i / sr / 0.004); } return fade(normalize(x, 0.6), sr, 0.05, 10); }
function metal(sr, R) { const x = buf(sr, 0.9); const f = new SVF(sr, 2000, 1); for (let i = 0; i < x.length; i++) { const t = i / sr; f.run(R() * 2 - 1); x[i] = f.bp * expEnv(t, 0.001, 0.05); } addPartials(x, sr, 0, [317, 873, 1291, 2087, 3311], [0.4, 0.3, 0.25, 0.15, 0.1], [0.4, 0.3, 0.2, 0.15, 0.1], R); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 2); return fade(normalize(x, 0.8), sr, 0.05, 40); }
function logdrum(sr, R) { const x = buf(sr, 0.35); addPartials(x, sr, 0, [196, 196 * 2.76, 196 * 5.4], [0.8, 0.3, 0.1], [0.12, 0.05, 0.02], R); return fade(normalize(x, 0.8), sr, 0.1, 20); }
function bell(sr, R) { // base C6 bell, pitched by playbackRate
  const x = buf(sr, 3.0); const f0 = mtof(84);
  addPartials(x, sr, 0, [f0 * 0.5, f0, f0 * 2.0, f0 * 2.76, f0 * 4.07, f0 * 5.4], [0.25, 0.5, 0.25, 0.16, 0.08, 0.05], [1.6, 1.3, 0.8, 0.5, 0.3, 0.2], R);
  return fade(normalize(x, 0.7), sr, 0.2, 100);
}
function braam(sr, R) {
  const x = chord(sr, R, [mtof(26), mtof(38), mtof(45), mtof(50)], 3.5, 2400, 0.04);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 3);
  return fade(normalize(x, 0.9), sr, 5, 300);
}
function riser(sr, R) { // reverse-swell noise for transitions
  const dur = 2.5; const x = buf(sr, dur); const f = new SVF(sr, 300, 2);
  for (let i = 0; i < x.length; i++) { const t = i / sr; const u = t / dur; if ((i & 31) === 0) f.set(200 + 5000 * u * u, 2); f.run(R() * 2 - 1); x[i] = f.bp * u * u * u; }
  return fade(normalize(x, 0.6), sr, 5, 30);
}

// --- Ambience loops (seamless) -----------------------------------------------------
const loopBrown = (sr, R) => makeLoop(sr, 8, 1, (n) => { const x = new Float32Array(n); const b = brown(R); for (let i = 0; i < n; i++) x[i] = b(); return normalize(x, 0.8); });
const loopWhite = (sr, R) => normalize(makeLoop(sr, 6, 0.8, (n) => { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = R() * 2 - 1; return x; }), 0.7);
function loopInsects(sr, R) {
  return makeLoop(sr, 6, 0.5, (n) => {
    const x = new Float32Array(n);
    for (let c = 0; c < 7; c++) { // individual crickets
      const f = 4200 + R() * 1400, rate = 0.35 + R() * 0.5, pulses = 3 + Math.floor(R() * 3), gain = 0.2 + R() * 0.4, phase = R();
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr; const cyc = ((t * rate + phase) % 1) / rate; // seconds into chirp cycle
        const p = cyc / 0.022; const k = Math.floor(p);
        const on = k < pulses ? Math.sin(Math.PI * (p - k)) : 0;
        ph += TAU * f / sr; x[i] += Math.sin(ph) * on * gain;
      }
    }
    return normalize(x, 0.6);
  });
}
function loopHum(sr, R) { // city: mains hum + distant traffic/industry wash
  return makeLoop(sr, 6, 1, (n) => {
    const x = new Float32Array(n); const f = new SVF(sr, 220, 0.7); const b = brown(R);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const hum = Math.sin(TAU * 55 * t) * 0.35 + Math.sin(TAU * 110 * t) * 0.2 + Math.sin(TAU * 165 * t) * 0.08 + Math.sin(TAU * 220.5 * t) * 0.04;
      f.run(b()); x[i] = hum * 0.5 + f.lp * 1.4;
    }
    return normalize(x, 0.7);
  });
}
function loopBattle(sr, R) { // distant firefight texture: many far muffled shots
  return makeLoop(sr, 7, 0.6, (n) => {
    const x = new Float32Array(n); const f = new SVF(sr, 700, 0.8);
    const shots = 140;
    for (let k = 0; k < shots; k++) {
      // bursts: clusters of 3-6 shots
      const at = Math.floor(R() * n), len = Math.floor(sr * 0.12), amp = 0.2 + R() * 0.8;
      for (let i = 0; i < len && at + i < n; i++) { const t = i / sr; x[at + i] += (R() * 2 - 1) * expEnv(t, 0.0008, 0.015) * amp; }
    }
    const b = brown(R);
    for (let i = 0; i < n; i++) { f.run(x[i]); x[i] = f.lp * 2 + b() * 0.08; }
    return normalize(x, 0.8);
  });
}
function loopEngine(sr, R) { // spaceship engine: filtered noise + detuned low tone
  return makeLoop(sr, 4, 0.5, (n) => {
    const x = new Float32Array(n); const f = new SVF(sr, 900, 1.5); const b = brown(R);
    for (let i = 0; i < n; i++) { const t = i / sr; f.run(R() * 2 - 1); x[i] = f.bp * 0.7 + b() * 0.4 + Math.sin(TAU * 73 * t) * 0.2 + Math.sin(TAU * 73.6 * t * 2) * 0.1; }
    return normalize(x, 0.7);
  });
}
function bird(sr, R) { // single songbird phrase
  const x = buf(sr, 0.9); const notes = 3 + Math.floor(R() * 5); let at = 0;
  const base = 2600 + R() * 1800;
  for (let k = 0; k < notes; k++) {
    const len = Math.floor(sr * (0.04 + R() * 0.08)); const f0 = base * (0.8 + R() * 0.5), f1 = f0 * (0.7 + R() * 0.7); let ph = 0;
    for (let i = 0; i < len && at + i < x.length; i++) { const u = i / len; ph += TAU * (f0 + (f1 - f0) * u) / sr; x[at + i] += Math.sin(ph) * Math.sin(Math.PI * u) * 0.6; }
    at += len + Math.floor(sr * (0.02 + R() * 0.06));
  }
  return fade(normalize(x, 0.5), sr, 1, 20);
}
function owl(sr, R) {
  const x = buf(sr, 1.4); const f0 = 380 + R() * 60;
  for (const [s, d] of [[0, 0.28], [0.45, 0.18], [0.7, 0.5]]) {
    let ph = 0; const a = Math.floor(sr * s), len = Math.floor(sr * d);
    for (let i = 0; i < len && a + i < x.length; i++) { const u = i / len; ph += TAU * f0 * (1 - 0.06 * u) / sr; x[a + i] += Math.sin(ph) * Math.sin(Math.PI * u) * 0.5; }
  }
  return fade(normalize(x, 0.5), sr, 2, 30);
}
function siren(sr) { // distant air-raid siren
  const dur = 7; const x = buf(sr, dur); let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr; const u = t / dur;
    const fr = 420 + 260 * Math.sin(Math.PI * Math.min(1, u * 1.3)) + 20 * Math.sin(TAU * 0.4 * t);
    ph += TAU * fr / sr; x[i] = (Math.sin(ph) + 0.3 * Math.sin(ph * 2) + 0.12 * Math.sin(ph * 3)) * Math.sin(Math.PI * u);
  }
  return fade(normalize(x, 0.5), sr, 50, 100);
}
function clank(sr, R) { const x = buf(sr, 1.5); addPartials(x, sr, 0, [210 + R() * 80, 590 + R() * 200, 1130 + R() * 300], [0.5, 0.3, 0.15], [0.5, 0.3, 0.2], R); return fade(normalize(x, 0.6), sr, 0.2, 50); }
function laser(sr, R) { // far-off dogfight blaster
  const x = buf(sr, 0.2); let ph = 0; const f0 = 1800 + R() * 900;
  for (let i = 0; i < x.length; i++) { const t = i / sr; ph += TAU * (f0 * Math.exp(-t / 0.05) + 300) / sr; x[i] = Math.sin(ph) * expEnv(t, 0.001, 0.04); }
  return fade(normalize(x, 0.6), sr, 0.2, 10);
}

// --- Registry ------------------------------------------------------------------
export const RECIPES = {
  rifle: [4, (sr, R) => gunshot(sr, R, RIFLE)],
  rifle_player: [4, (sr, R) => gunshot(sr, R, RIFLE_PLAYER)],
  tower_mg: [3, (sr, R) => gunshot(sr, R, TOWER_MG)],
  tower_cannon: [2, (sr, R) => gunshot(sr, R, TOWER_CANNON)],
  tower_frost: [3, frost],
  tank: [2, (sr, R) => gunshot(sr, R, TANK)],
  artillery: [2, (sr, R) => gunshot(sr, R, ARTILLERY)],
  plasma: [3, plasma], needle: [3, needle], zap: [3, zap], growl: [2, growl],
  imp_cover: [4, impactCover], imp_flesh: [3, impactFlesh], imp_chitin: [3, impactChitin], imp_metal: [3, impactMetal],
  death_quadshell: [3, deathQuad], death_spider403: [3, deathSpider], death_eyedrone: [2, deathDrone], death_trilobite: [2, deathTrilobite],
  death_soldier: [3, deathSoldier], vehicle_destroyed: [2, vehicleDestroyed],
  whistle: [2, whistle], exp_big: [3, explosionBig], exp_med: [3, explosionMed], exp_small: [3, explosionSmall], rumble: [2, rumbleDistant],
  hit_tick: [1, hitTick], kill_confirm: [1, killConfirm], hurt: [3, hurt], heartbeat: [1, heartbeat], scrap: [1, scrap],
  tower_deploy: [1, towerDeploy], klaxon: [1, klaxon], horn: [1, horn], victory: [1, victory], defeat: [1, defeat], objective: [1, objective],
  ui_hover: [1, uiHover], ui_click: [2, uiClick], ui_confirm: [1, (sr) => tone(sr, [81, 88], 0.06, 0.07)], ui_back: [1, (sr) => tone(sr, [86, 79], 0.06, 0.07)],
  ui_error: [1, uiError], ui_purchase: [1, uiPurchase], ui_open: [1, (sr, R) => whoosh(sr, R, true)], ui_close: [1, (sr, R) => whoosh(sr, R, false)],
  m_kick: [1, kick], m_taiko: [2, taiko], m_tom: [1, tom], m_snare: [2, snare], m_hat: [2, hat], m_shaker: [2, shaker], m_rim: [1, rim],
  m_metal: [2, metal], m_log: [1, logdrum], m_bell: [1, bell], m_braam: [1, braam], m_riser: [1, riser],
  loop_brown: [1, loopBrown], loop_white: [1, loopWhite], loop_insects: [1, loopInsects], loop_hum: [1, loopHum], loop_battle: [1, loopBattle], loop_engine: [1, loopEngine],
  amb_bird: [5, bird], amb_owl: [2, owl], amb_siren: [1, siren], amb_clank: [3, clank], sky_laser: [3, laser],
};

const cache = Object.create(null);
let seed = 1337;

function renderVariant(name, idx) {
  const recipe = RECIPES[name];
  if (!recipe || !engine.ready) return null;
  const ctx = engine.ctx;
  let data;
  try { data = recipe[1](ctx.sampleRate, rng(seed + idx * 7919 + name.length * 104729)); }
  catch (err) { console.error('[audio] render failed', name, err); data = new Float32Array(1); }
  const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
  b.getChannelData(0).set(data);
  return b;
}

/** Random (or explicit) variant of a named sound; renders lazily on first use. */
export function getSound(name, variant = -1) {
  let list = cache[name];
  if (!list) { const r = RECIPES[name]; if (!r) return null; list = cache[name] = new Array(r[0]).fill(null); }
  const i = variant >= 0 ? variant % list.length : Math.floor(Math.random() * list.length);
  return list[i] || (list[i] = renderVariant(name, i));
}

// Idle-time prewarm so the first shot never hitches.
const PREWARM_FIRST = ['ui_hover', 'ui_click', 'rifle', 'rifle_player', 'imp_cover', 'hit_tick', 'kill_confirm', 'plasma', 'needle', 'zap', 'growl', 'tower_mg', 'loop_brown', 'loop_battle', 'exp_med', 'm_kick', 'm_taiko', 'm_hat'];
export function prewarm() {
  const queue = [];
  const push = (n) => { const r = RECIPES[n]; if (!r) return; for (let i = 0; i < r[0]; i++) queue.push(n, i); };
  PREWARM_FIRST.forEach(push);
  for (const n in RECIPES) if (!PREWARM_FIRST.includes(n)) push(n);
  const ric = typeof window !== 'undefined' && window.requestIdleCallback;
  const step = (deadline) => {
    let budget = 0;
    // always render at least one buffer per callback so a starved idle queue still progresses
    while (queue.length && (budget < 1 || (deadline && deadline.timeRemaining() > 4))) {
      const name = queue.shift(), i = queue.shift();
      getSound(name, i); budget++;
    }
    if (queue.length) { if (ric) ric(step, { timeout: 500 }); else setTimeout(step, 16); }
  };
  if (ric) ric(step, { timeout: 500 }); else setTimeout(step, 16);
}
