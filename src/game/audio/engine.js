// Core Web Audio engine: context lifecycle, mixer buses, master dynamics,
// reverb sends, voice pools with priority stealing, rate limiting and
// listener-relative spatialisation. Everything here is defensive — if Web
// Audio is unavailable every entry point silently no-ops.
//
// Mixer graph
//   sfx ─► healthLP ─┐
//   ambience ────────┼─► gameMix ─► pauseLP ─► gate(video/pause) ─┐
//   music ─► duck ───┤                                           ├─► glue comp ─► limiter ─► master ─► out
//   worldVerb ───────┘                                           │
//   musicVerb ─────────────────────────────► (into music duck)   │
//   ui ──────────────────────────────────────────────────────────┘
import { settings } from '@/game/settings';

const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;

export const engine = {
  ctx: null,
  sr: 48000,
  ready: false,
  supported: !!AC,
  // presentation state (owned by director)
  paused: false,
  videoActive: false,
  hidden: false,
  sceneMounted: false,
  lowHealth: 0, // 0..1 tunnel amount
};

export const bus = {
  master: null, glue: null, limiter: null, pre: null,
  gameMix: null, pauseLP: null, gate: null,
  sfx: null, healthLP: null, ambience: null, music: null, musicDuck: null, ui: null,
  worldVerbIn: null, worldVerb: null, musicVerbIn: null, musicVerb: null,
};

// Listener (camera) — written each frame by AudioListenerBridge, no allocation.
export const listener = {
  x: 0, y: 30, z: 40,
  rx: 1, rz: 0,      // camera right (XZ, normalised)
  fx: 0, fz: -1,     // camera forward (XZ, normalised)
  strategic: true,
  valid: false,
};

// Output of spatial() — module-level scratch so the hot path never allocates.
export const sp = { gain: 0, pan: 0, dist: 0, cutoff: 20000, wet: 0 };

const readyCallbacks = [];
export function onReady(fn) {
  if (engine.ready) { try { fn(engine.ctx); } catch (e) { console.error('[audio] ready cb', e); } }
  else readyCallbacks.push(fn);
}

export const now = () => (engine.ctx ? engine.ctx.currentTime : 0);
export const rand = Math.random;

// ---------------------------------------------------------------------------
// Context + graph
function buildGraph(ctx) {
  const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  bus.master = g(0);
  bus.limiter = ctx.createDynamicsCompressor();
  bus.limiter.threshold.value = -3; bus.limiter.knee.value = 0; bus.limiter.ratio.value = 20;
  bus.limiter.attack.value = 0.002; bus.limiter.release.value = 0.12;
  bus.glue = ctx.createDynamicsCompressor();
  bus.glue.threshold.value = -20; bus.glue.knee.value = 12; bus.glue.ratio.value = 2.6;
  bus.glue.attack.value = 0.012; bus.glue.release.value = 0.28;
  bus.pre = g(0.9);
  bus.pre.connect(bus.glue); bus.glue.connect(bus.limiter); bus.limiter.connect(bus.master); bus.master.connect(ctx.destination);

  bus.gate = g(1); bus.gate.connect(bus.pre);
  bus.pauseLP = ctx.createBiquadFilter(); bus.pauseLP.type = 'lowpass'; bus.pauseLP.frequency.value = 20000; bus.pauseLP.Q.value = 0.5;
  bus.pauseLP.connect(bus.gate);
  bus.gameMix = g(1); bus.gameMix.connect(bus.pauseLP);

  bus.healthLP = ctx.createBiquadFilter(); bus.healthLP.type = 'lowpass'; bus.healthLP.frequency.value = 20000; bus.healthLP.Q.value = 0.4;
  bus.healthLP.connect(bus.gameMix);
  bus.sfx = g(1); bus.sfx.connect(bus.healthLP);
  bus.ambience = g(1); bus.ambience.connect(bus.gameMix);

  bus.musicDuck = g(1); bus.musicDuck.connect(bus.gameMix);
  bus.music = g(1); bus.music.connect(bus.musicDuck);
  bus.ui = g(1); bus.ui.connect(bus.pre);

  bus.worldVerbIn = g(1);
  bus.worldVerb = ctx.createConvolver();
  const worldVerbOut = g(0.55);
  bus.worldVerbIn.connect(bus.worldVerb); bus.worldVerb.connect(worldVerbOut); worldVerbOut.connect(bus.healthLP);
  bus.musicVerbIn = g(1);
  bus.musicVerb = ctx.createConvolver();
  const musicVerbOut = g(0.7);
  bus.musicVerbIn.connect(bus.musicVerb); bus.musicVerb.connect(musicVerbOut); musicVerbOut.connect(bus.music);
  bus.worldVerb.buffer = makeImpulse(ctx, 1.8, 2.6, 5200, 0.012);
  bus.musicVerb.buffer = makeImpulse(ctx, 3.6, 2.2, 6500, 0.02);
}

// Stereo impulse response: exponentially decaying noise that darkens over time,
// with a few discrete early reflections.
export function makeImpulse(ctx, seconds, decayPow, brightHz, predelay, early = 6) {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    const pre = Math.floor(predelay * sr);
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre);
      const env = Math.pow(1 - t, decayPow);
      // one-pole LP whose cutoff falls with time → natural HF damping
      const fc = brightHz * (1 - t * 0.85) + 300;
      const a = Math.exp(-2 * Math.PI * fc / sr);
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      d[i] = lp * env * 1.6;
    }
    for (let e = 0; e < early; e++) {
      const at = pre + Math.floor((0.008 + Math.random() * 0.07) * sr);
      if (at < len) d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - e * 0.05);
    }
  }
  return buf;
}

export function setWorldReverb(seconds, decayPow, brightHz, predelay) {
  if (!engine.ready) return;
  try { bus.worldVerb.buffer = makeImpulse(engine.ctx, seconds, decayPow, brightHz, predelay); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Volumes / settings
const curve = (v) => { const x = Math.max(0, Math.min(1, Number(v) || 0)); return x * x; };
export const MIX = { music: 0.55, sfx: 0.9, ambience: 0.55, ui: 0.55 };

function applySettings(s) {
  if (!engine.ready) return;
  const t = engine.ctx.currentTime;
  bus.master.gain.setTargetAtTime(curve(s.masterVolume) * 1.0, t, 0.05);
  bus.music.gain.setTargetAtTime(curve(s.musicVolume) * MIX.music * 1.6, t, 0.05);
  bus.sfx.gain.setTargetAtTime(curve(s.sfxVolume) * MIX.sfx * 1.2, t, 0.05);
  bus.ambience.gain.setTargetAtTime(curve(s.sfxVolume) * MIX.ambience * 1.2, t, 0.05);
  bus.ui.gain.setTargetAtTime(curve(s.uiVolume) * MIX.ui * 1.6, t, 0.05);
}

// ---------------------------------------------------------------------------
// Gate (video mute / pause muffle / health tunnel) — called by director.
export function updateGates() {
  if (!engine.ready) return;
  const t = engine.ctx.currentTime;
  const muted = engine.videoActive;
  bus.gate.gain.setTargetAtTime(muted ? 0 : (engine.paused ? 0.55 : 1), t, muted ? 0.08 : 0.25);
  bus.pauseLP.frequency.setTargetAtTime(engine.paused ? 520 : 20000, t, engine.paused ? 0.08 : 0.2);
  const h = engine.lowHealth;
  bus.healthLP.frequency.setTargetAtTime(h > 0 ? 20000 * Math.pow(0.12, h) : 20000, t, 0.3);
}

// Music ducking — deeper requests win until they release.
let duckDepth = 0, duckEnd = 0;
export function duckMusic(depth, attack = 0.04, hold = 0.4, release = 0.9) {
  if (!engine.ready) return;
  const t = engine.ctx.currentTime;
  if (t < duckEnd && depth <= duckDepth) return;
  duckDepth = depth; duckEnd = t + attack + hold;
  const p = bus.musicDuck.gain;
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(1 - depth, t + attack);
  p.setTargetAtTime(1, t + attack + hold, release / 3);
}

// ---------------------------------------------------------------------------
// Spatialisation relative to the camera listener. Writes into `sp`.
// Returns linear gain (0 = inaudible → caller should cull before creating nodes).
export function spatial(x, y, z, refDist, maxDist) {
  const dx = x - listener.x, dy = y - listener.y, dz = z - listener.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  sp.dist = d;
  if (d >= maxDist) { sp.gain = 0; return 0; }
  let gain = d <= refDist ? 1 : refDist / (refDist + (d - refDist) * 1.15);
  const e = d / maxDist; gain *= 1 - e * e * e * e;
  const hd = Math.sqrt(dx * dx + dz * dz);
  let pan = 0, front = 1;
  if (hd > 0.001) {
    pan = (dx * listener.rx + dz * listener.rz) / hd;
    front = (dx * listener.fx + dz * listener.fz) / hd;
  }
  // close sources and sources far below a high camera are less lateralised
  const lateral = Math.min(1, hd / Math.max(1, refDist * 0.8)) * (hd / (d + 0.001));
  pan *= 0.85 * lateral;
  let cutoff = 20000 / (1 + d * 0.035);
  if (front < 0) cutoff *= 1 + front * 0.35;
  sp.cutoff = cutoff < 400 ? 400 : cutoff;
  sp.pan = pan;
  sp.wet = Math.min(0.75, 0.06 + e * 0.9);
  sp.gain = gain;
  return gain;
}

// ---------------------------------------------------------------------------
// Voice pools — fixed slot arrays, zero allocation bookkeeping. Nodes are
// disconnected by a periodic sweep once their end time has passed.
function makeSlot() { return { active: false, end: 0, prio: 0, src: null, f: null, g: null, p: null, w: null }; }
function makePool(size, dying) {
  const slots = new Array(size); for (let i = 0; i < size; i++) slots[i] = makeSlot();
  const dyingSlots = new Array(dying); for (let i = 0; i < dying; i++) dyingSlots[i] = makeSlot();
  return { slots, dying: dyingSlots, count: 0, dropped: 0, stolen: 0 };
}
export const pools = { sfx: makePool(32, 8), ui: makePool(12, 4), amb: makePool(10, 2) };

function disconnectSlot(s) {
  try { s.src && s.src.disconnect(); } catch { /* noop */ }
  try { s.f && s.f.disconnect(); } catch { /* noop */ }
  try { s.g && s.g.disconnect(); } catch { /* noop */ }
  try { s.p && s.p.disconnect(); } catch { /* noop */ }
  try { s.w && s.w.disconnect(); } catch { /* noop */ }
  s.src = s.f = s.g = s.p = s.w = null; s.active = false;
}
function moveSlot(from, to) {
  to.src = from.src; to.f = from.f; to.g = from.g; to.p = from.p; to.w = from.w; to.end = from.end; to.active = true;
  from.src = from.f = from.g = from.p = from.w = null; from.active = false;
}

function acquire(pool, prio, t) {
  let low = null;
  const slots = pool.slots;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.active) return s;
    if (s.end <= t) { disconnectSlot(s); pool.count--; return s; }
    if (!low || s.prio < low.prio) low = s;
  }
  if (!low || low.prio >= prio) { pool.dropped++; return null; }
  // steal: fade the quietest voice and park it in a dying slot
  pool.stolen++;
  try {
    low.g.gain.cancelScheduledValues(t);
    low.g.gain.setTargetAtTime(0, t, 0.012);
    low.src.stop(t + 0.06);
  } catch { /* noop */ }
  let parked = false;
  for (let i = 0; i < pool.dying.length; i++) {
    const d = pool.dying[i];
    if (!d.active || d.end <= t) { if (d.active) disconnectSlot(d); moveSlot(low, d); d.end = t + 0.08; parked = true; break; }
  }
  if (!parked) disconnectSlot(low);
  low.active = false; pool.count--;
  return low;
}

function sweep() {
  if (!engine.ready) return;
  const t = engine.ctx.currentTime;
  for (const key in pools) {
    const pool = pools[key];
    for (let i = 0; i < pool.slots.length; i++) { const s = pool.slots[i]; if (s.active && s.end <= t) { disconnectSlot(s); pool.count--; } }
    for (let i = 0; i < pool.dying.length; i++) { const s = pool.dying[i]; if (s.active && s.end <= t) disconnectSlot(s); }
  }
}

/**
 * Play a mono/stereo buffer through a pooled voice. Positional args (no option
 * objects) keep the per-shot path allocation-free apart from the Web Audio nodes.
 * @returns {boolean} true if a voice was started
 */
export function playBuffer(buffer, out, gain, pan, rate, cutoff, wet, prio, poolName = 'sfx', delay = 0, verbBus = null) {
  if (!engine.ready || !buffer || gain < 0.002) return false;
  const ctx = engine.ctx;
  const t = ctx.currentTime + (delay > 0 ? delay : 0);
  const pool = pools[poolName];
  const slot = acquire(pool, prio, ctx.currentTime);
  if (!slot) return false;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (rate !== 1) src.playbackRate.value = rate;
    let node = src, f = null, p = null, w = null;
    if (cutoff < 18000) {
      f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.6;
      node.connect(f); node = f;
    }
    const g = ctx.createGain(); g.gain.value = gain;
    node.connect(g);
    if (pan > 0.02 || pan < -0.02) {
      p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(out);
    } else g.connect(out);
    if (wet > 0.01) {
      w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verbBus || bus.worldVerbIn);
    }
    src.start(t);
    slot.src = src; slot.f = f; slot.g = g; slot.p = p; slot.w = w;
    slot.prio = prio; slot.end = t + buffer.duration / rate + 0.05; slot.active = true;
    pool.count++;
    return true;
  } catch (err) {
    disconnectSlot(slot);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Rate limiting — token buckets, created once per sound type at module load.
export function limiter(gap, burst = 1) { return { gap, burst, tokens: burst, last: 0 }; }
export function allow(l, t, gapScale = 1) {
  const g = l.gap * gapScale;
  l.tokens = Math.min(l.burst, l.tokens + (t - l.last) / (g > 0.0001 ? g : 0.0001));
  l.last = t;
  if (l.tokens >= 1) { l.tokens -= 1; return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Lifecycle
let initialised = false;
function createContext() {
  if (engine.ctx || !AC) return engine.ctx;
  try {
    const ctx = new AC({ latencyHint: 'interactive' });
    engine.ctx = ctx; engine.sr = ctx.sampleRate;
    buildGraph(ctx);
    engine.ready = true;
    applySettings(settings.get());
    updateGates();
    settings.subscribe(applySettings);
    for (const fn of readyCallbacks.splice(0)) { try { fn(ctx); } catch (e) { console.error('[audio] ready cb', e); } }
  } catch (err) {
    console.warn('[audio] Web Audio unavailable', err);
    engine.supported = false;
    engine.ctx = null; engine.ready = false;
  }
  return engine.ctx;
}

function onGesture() {
  const ctx = engine.ctx || createContext();
  if (ctx && ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {});
}

function onVisibility() {
  engine.hidden = document.hidden;
  const ctx = engine.ctx;
  if (!ctx) return;
  if (document.hidden) { if (ctx.state === 'running') ctx.suspend().catch(() => {}); }
  else if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function initEngine() {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;
  if (!AC) return;
  const opts = { capture: true, passive: true };
  window.addEventListener('pointerdown', onGesture, opts);
  window.addEventListener('keydown', onGesture, opts);
  window.addEventListener('touchend', onGesture, opts);
  document.addEventListener('visibilitychange', onVisibility);
  setInterval(sweep, 100);
}

export function audioStats() {
  return {
    state: engine.ctx?.state ?? 'none',
    sfxVoices: pools.sfx.count, sfxDropped: pools.sfx.dropped, sfxStolen: pools.sfx.stolen,
    uiVoices: pools.ui.count, ambVoices: pools.amb.count,
    paused: engine.paused, video: engine.videoActive, scene: engine.sceneMounted,
    listener: { x: listener.x, y: listener.y, z: listener.z },
  };
}
