// Ambience beds: persistent looping layers (wind, gusts, rumble, insects,
// blizzard, city hum, distant firefight, sky engines) crossfaded per level, plus
// randomly scheduled one-shots (birds, owls, sirens, clanks, far thumps).
import { engine, bus, playBuffer, setWorldReverb } from '@/game/audio/engine';
import { getSound } from '@/game/audio/sounds';

const R = Math.random;

const AMB = {
  menu: { wind: 0.3, windHz: 420, gust: 0.15, rumble: 0.35, insects: 0, blizzard: 0, hum: 0, birds: 0, owls: 0, sirens: 0, clanks: 0, thumps: 0.4 },
  1: { wind: 0.42, windHz: 520, gust: 0.3, rumble: 0.38, insects: 0, blizzard: 0, hum: 0, birds: 0.25, owls: 0, sirens: 0, clanks: 0, thumps: 1 },
  2: { wind: 0.28, windHz: 360, gust: 0.18, rumble: 0.4, insects: 0.5, blizzard: 0, hum: 0, birds: 0, owls: 0.5, sirens: 0, clanks: 0, thumps: 1 },
  3: { wind: 0.36, windHz: 950, gust: 0.42, rumble: 0.3, insects: 0.14, blizzard: 0, hum: 0, birds: 1, owls: 0, sirens: 0, clanks: 0, thumps: 0.7 },
  4: { wind: 0.62, windHz: 650, gust: 0.55, rumble: 0.28, insects: 0, blizzard: 0.5, hum: 0, birds: 0, owls: 0, sirens: 0, clanks: 0, thumps: 0.6 },
  5: { wind: 0.22, windHz: 400, gust: 0.2, rumble: 0.45, insects: 0, blizzard: 0, hum: 0.42, birds: 0, owls: 0, sirens: 0.6, clanks: 0.7, thumps: 1 },
};
// Per-level world reverb (seconds, decay power, brightness, predelay)
const VERB = {
  menu: [1.8, 2.6, 5200, 0.012], 1: [1.6, 2.8, 5000, 0.015], 2: [2.0, 2.4, 4000, 0.02],
  3: [1.3, 2.0, 3400, 0.008], 4: [2.4, 2.6, 7000, 0.03], 5: [2.6, 2.0, 6000, 0.025],
};

const amb = { built: false, key: null, cfg: null, layers: null, timer: 0, battle: 0, sky: null, cargo: null };
export const ambienceState = amb;

function loopSource(name, rate = 1, offset = 0) {
  const ctx = engine.ctx;
  const src = ctx.createBufferSource();
  src.buffer = getSound(name, 0); src.loop = true; src.playbackRate.value = rate;
  src.start(ctx.currentTime + 0.05, offset % Math.max(0.1, src.buffer.duration));
  return src;
}
function lfo(freq, depth, target) {
  const ctx = engine.ctx;
  const o = ctx.createOscillator(); o.frequency.value = freq; o.type = 'sine';
  const g = ctx.createGain(); g.gain.value = depth;
  o.connect(g); g.connect(target); o.start();
  return o;
}
function filt(type, f, q = 0.7) { const n = engine.ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; }
function gain(v) { const n = engine.ctx.createGain(); n.gain.value = v; return n; }
function pan(v) { const n = engine.ctx.createStereoPanner(); n.pan.value = v; return n; }

function build() {
  if (amb.built || !engine.ready) return;
  amb.built = true;
  const out = bus.ambience;
  const L = {};
  // wind: brown noise through a slowly wandering band-pass
  { const s = loopSource('loop_brown'); const bp = filt('bandpass', 500, 0.6); lfo(0.05, 180, bp.frequency);
    const am = gain(0.8); lfo(0.07, 0.25, am.gain); L.wind = gain(0); L.windBP = bp;
    s.connect(bp); bp.connect(am); am.connect(L.wind); L.wind.connect(out); }
  // gusts: white noise, resonant sweep, auto-panned
  { const s = loopSource('loop_white', 1, 2.3); const bp = filt('bandpass', 1300, 1.4); lfo(0.11, 650, bp.frequency);
    const am = gain(0.5); lfo(0.063, 0.45, am.gain); const p = pan(0); lfo(0.031, 0.6, p.pan);
    L.gust = gain(0); s.connect(bp); bp.connect(am); am.connect(p); p.connect(L.gust); L.gust.connect(out); }
  // distant battle rumble
  { const s = loopSource('loop_brown', 0.6, 3.7); const lp = filt('lowpass', 130, 0.8); const am = gain(0.75); lfo(0.09, 0.25, am.gain);
    L.rumble = gain(0); s.connect(lp); lp.connect(am); am.connect(L.rumble); L.rumble.connect(out); }
  // insects: two detuned copies panned wide
  { L.insects = gain(0); const hp = filt('highpass', 2200, 0.7); hp.connect(L.insects); L.insects.connect(out);
    for (const [r, pv] of [[0.97, -0.55], [1.035, 0.55]]) { const s = loopSource('loop_insects', r, r * 3); const p = pan(pv); s.connect(p); p.connect(hp); } }
  // blizzard: hiss + whistling resonance
  { const s = loopSource('loop_white', 0.9, 1.1); const bp = filt('bandpass', 2800, 0.7); const wh = filt('bandpass', 1000, 9); lfo(0.13, 380, wh.frequency);
    const whg = gain(0.9); const am = gain(0.7); lfo(0.05, 0.3, am.gain);
    L.blizzard = gain(0); s.connect(bp); s.connect(wh); wh.connect(whg); bp.connect(am); whg.connect(am); am.connect(L.blizzard); L.blizzard.connect(out); }
  // city hum
  { const s = loopSource('loop_hum'); const lp = filt('lowpass', 900, 0.7); L.hum = gain(0); s.connect(lp); lp.connect(L.hum); L.hum.connect(out); }
  // distant firefight bed (driven by culled-shot rate)
  { L.battle = gain(0); const lp = filt('lowpass', 1500, 0.7); lp.connect(L.battle); L.battle.connect(out);
    for (const [r, pv, off] of [[1, -0.45, 0], [0.93, 0.45, 3.3]]) { const s = loopSource('loop_battle', r, off); const p = pan(pv); s.connect(p); p.connect(lp); } }
  // sky engines (nearest dogfighter) — positional-ish via panner
  { const s = loopSource('loop_engine'); const lp = filt('lowpass', 800, 1); const p = pan(0); const g = gain(0);
    s.connect(lp); lp.connect(p); p.connect(g); g.connect(out); amb.sky = { src: s, lp, p, g }; }
  // cargo ship heavy drone
  { const s = loopSource('loop_engine', 0.5, 1.2); const lp = filt('lowpass', 260, 1.2); const g = gain(0);
    s.connect(lp); lp.connect(g); g.connect(out); amb.cargo = { g }; }
  amb.layers = L;
  if (amb.key !== null) applyLevel(amb.key, true);
}

function applyLevel(key, immediate = false) {
  if (!amb.layers) return;
  const c = key == null ? null : (AMB[key] || AMB[1]);
  amb.cfg = c;
  const t = engine.ctx.currentTime, tc = immediate ? 0.5 : 2.5;
  const L = amb.layers;
  const set = (node, v) => node.gain.setTargetAtTime(v, t, tc);
  set(L.wind, c ? c.wind : 0); set(L.gust, c ? c.gust * 0.5 : 0); set(L.rumble, c ? c.rumble : 0);
  set(L.insects, c ? c.insects * 0.35 : 0); set(L.blizzard, c ? c.blizzard * 0.45 : 0); set(L.hum, c ? c.hum * 0.5 : 0);
  if (c) L.windBP.frequency.setTargetAtTime(c.windHz, t, tc);
  if (key == null || key === 'menu') { set(L.battle, 0); amb.sky.g.gain.setTargetAtTime(0, t, 1); amb.cargo.g.gain.setTargetAtTime(0, t, 1); }
  const v = VERB[key] || VERB.menu;
  setWorldReverb(v[0], v[1], v[2], v[3]);
}

/** 'menu' | 1..5 | null */
export function setAmbience(key) {
  if (key === amb.key) return;
  amb.key = key;
  if (engine.ready && amb.built) applyLevel(key);
}

/** Distant firefight bed level from culled shots per second. */
export function setBattleDensity(shotsPerSec) {
  if (!amb.layers || amb.key == null || amb.key === 'menu') return;
  const v = Math.min(0.55, Math.sqrt(Math.max(0, shotsPerSec)) / 22);
  amb.layers.battle.gain.setTargetAtTime(v, engine.ctx.currentTime, 0.8);
}
export function setSkyEngine(gainV, panV, cutoff) {
  if (!amb.sky) return;
  const t = engine.ctx.currentTime;
  amb.sky.g.gain.setTargetAtTime(gainV, t, 0.35);
  amb.sky.p.pan.setTargetAtTime(panV, t, 0.35);
  amb.sky.lp.frequency.setTargetAtTime(cutoff, t, 0.35);
}
export function setCargoDrone(v) {
  if (!amb.cargo) return;
  amb.cargo.g.gain.setTargetAtTime(v, engine.ctx.currentTime, 1.2);
}

function event(name, g, cutoff, wet, rate) {
  playBuffer(getSound(name), bus.ambience, g, (R() * 2 - 1) * 0.8, rate, cutoff, wet, 1, 'amb');
}
function tick() {
  const c = amb.cfg;
  if (!engine.ready || !c || engine.videoActive || engine.ctx.state !== 'running') return;
  const p = (perMin) => R() < perMin / 60 * 0.25;
  if (c.birds && p(c.birds * 18)) event('amb_bird', 0.06 + R() * 0.1, 9000, 0.3, 0.9 + R() * 0.25);
  if (c.owls && p(c.owls * 3)) event('amb_owl', 0.08 + R() * 0.06, 2500, 0.5, 0.92 + R() * 0.12);
  if (c.sirens && p(c.sirens * 1.2)) event('amb_siren', 0.06 + R() * 0.05, 2200, 0.7, 0.9 + R() * 0.2);
  if (c.clanks && p(c.clanks * 4)) event('amb_clank', 0.04 + R() * 0.05, 3000, 0.75, 0.7 + R() * 0.6);
  if (c.thumps && p(c.thumps * 4)) event('rumble', 0.12 + R() * 0.12, 420, 0.4, 0.8 + R() * 0.4);
}

export function initAmbience() {
  build();
  if (!amb.timer) amb.timer = setInterval(tick, 250);
}
