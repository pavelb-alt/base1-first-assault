// Adaptive procedural score. A lookahead step sequencer (16ths) drives live
// oscillator pads/bass/ostinato plus pre-rendered percussion & bells. Each
// theme (menu + 5 levels) has its own tonal palette; intensity (0..1) from the
// director fades layers in/out and selects denser patterns. Themes crossfade.
import { engine, bus } from '@/game/audio/engine';
import { getSound } from '@/game/audio/sounds';
import { mtof } from '@/game/audio/dsp';

const R = Math.random;
const SCALES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};

// --- Percussion kits: [sound, patterns (16 steps), intensity threshold, gain, rate]
const kit = (snd, pats, th, gain, rate = 1) => ({ snd, pats, th, gain, rate });
const PERC = {
  menu: [kit('m_taiko', ['x...............', 'x.......x.......'], 0, 0.34, 0.7), kit('m_shaker', ['....x.......x...'], 0.5, 0.06)],
  cinematic: [
    kit('m_taiko', ['x.......x..x....', 'x.....x...x.....', 'x..x....x...x...'], 0.25, 0.5),
    kit('m_tom', ['....x.......x.x.', '......x.....x...', '..x...x.....x.xx'], 0.45, 0.28),
    kit('m_hat', ['..x...x...x...x.', 'x.x.x.x.x.x.x.x.', 'x.xxx.x.x.xxx.x.'], 0.55, 0.06),
    kit('m_snare', ['........x.......', '....x.......x...'], 0.72, 0.22),
    kit('m_kick', ['x.......x.......', 'x.....x.x.......'], 0.82, 0.32),
  ],
  ticks: [
    kit('m_rim', ['...x.....x......', '.....x.......x..', '...x...x.....x..'], 0.15, 0.1),
    kit('m_kick', ['x.........x.....', 'x...............', 'x.....x...x.....'], 0.35, 0.38),
    kit('m_hat', ['......x.......x.', '..x...x...x...x.'], 0.5, 0.05),
    kit('m_taiko', ['x.......x...x...'], 0.75, 0.38, 0.85),
  ],
  wood: [
    kit('m_log', ['x..x..x...x.x...', 'x.x...x..x..x...', 'x..x.x..x..x.x..'], 0.2, 0.22),
    kit('m_shaker', ['x.x.x.x.x.x.x.x.', 'xxxxxxxxxxxxxxxx'], 0.4, 0.05),
    kit('m_taiko', ['x.......x.......', 'x.....x.x.......'], 0.5, 0.42),
    kit('m_tom', ['............x.x.', '..........x.x.x.'], 0.7, 0.28),
  ],
  deep: [
    kit('m_kick', ['x.......x.......', 'x..........x....'], 0.3, 0.38),
    kit('m_shaker', ['....x.......x...', '..x...x...x...x.'], 0.45, 0.04),
    kit('m_taiko', ['..........x.....', 'x.......x.....x.'], 0.55, 0.38, 0.9),
    kit('m_snare', ['........x.......'], 0.8, 0.18),
  ],
  industrial: [
    kit('m_kick', ['x...x...x...x...', 'x..x..x...x.....', 'x..x..x.x..x..x.'], 0.3, 0.42),
    kit('m_hat', ['x.x.x.x.x.x.x.x.', 'xxxxxxxxxxxxxxxx'], 0.4, 0.05),
    kit('m_metal', ['....x.......x...', '....x.......x..x', '..x.x.....x.x...'], 0.45, 0.16),
    kit('m_snare', ['....x.......x...', '....x.......x.x.'], 0.65, 0.22),
    kit('m_taiko', ['x.........x.....'], 0.82, 0.38),
  ],
};

// Ostinato patterns: chord-tone indices (0 root, 1 third, 2 fifth, 3 octave, 4 oct+3rd), -1 rest
const _ = -1;
const OST = {
  sparse: [[0, _, _, _, 2, _, _, _, 3, _, _, _, 2, _, _, _], [0, _, _, 2, _, _, 3, _, _, 2, _, _, 1, _, _, _], [3, _, _, _, _, _, 2, _, _, _, 1, _, _, _, _, _]],
  mid: [[0, _, 0, _, 2, _, 0, _, 3, _, 0, _, 2, _, 1, _], [3, _, 2, _, 1, _, 0, _, 3, _, 2, _, 1, _, 2, _], [0, _, 2, _, 3, _, 2, _, 0, _, 2, _, 4, _, 2, _]],
  dense: [[0, 0, 2, 0, 3, 0, 2, 0, 0, 0, 2, 0, 3, 2, 1, 2], [0, 2, 3, 2, 0, 2, 3, 4, 0, 2, 3, 2, 1, 2, 3, 2], [3, 2, 0, 2, 3, 2, 0, 2, 4, 3, 1, 3, 4, 3, 1, 3]],
};
const BASS = {
  pedal: [[0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _]],
  drive: [[0, _, 0, _, 0, _, 0, _, 0, _, 0, _, 0, _, 12, _], [0, _, _, 0, _, _, 0, _, 0, _, _, 0, _, _, 12, _]],
  pulse: [[0, _, _, _, 0, _, _, _, 0, _, _, _, 0, _, _, _], [0, _, _, _, _, _, 0, _, _, _, 0, _, _, _, _, _]],
  distort: [[0, 0, _, 0, 0, _, 0, _, 0, 0, _, 0, 12, _, 0, _], [0, _, 0, 0, _, 0, 0, _, 0, _, 0, 0, _, 12, 0, _]],
};

const PALETTES = {
  menu: { root: 45, scale: 'aeolian', bpm: 64, bpc: 2, progs: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 3, 4]],
    pad: { wave: 'sawtooth', cutoff: 900, gain: 0.2 }, bass: 'pedal', bassGain: 0.26, ost: { wave: 'square', oct: 2, gain: 0.05, cut: 1400 },
    perc: 'menu', bells: 0.3, braam: 0.5, fixed: 0.38 },
  1: { root: 38, scale: 'aeolian', bpm: 96, bpc: 1, progs: [[0, 5, 3, 6], [0, 3, 6, 5], [0, 6, 5, 4], [0, 5, 2, 4]],
    pad: { wave: 'sawtooth', cutoff: 1100, gain: 0.17 }, bass: 'drive', bassGain: 0.26, ost: { wave: 'sawtooth', oct: 2, gain: 0.055, cut: 2400 },
    perc: 'cinematic', bells: 0, braam: 1 },
  2: { root: 37, scale: 'phrygian', bpm: 80, bpc: 2, progs: [[0, 1, 0, 6], [0, 5, 1, 0], [0, 6, 5, 1]],
    pad: { wave: 'sawtooth', cutoff: 600, gain: 0.18 }, bass: 'pulse', bassGain: 0.3, ost: { wave: 'sine', oct: 3, gain: 0.07, cut: 1800 },
    perc: 'ticks', bells: 0.12, braam: 0.6, sparse: true },
  3: { root: 40, scale: 'dorian', bpm: 102, bpc: 1, progs: [[0, 3, 4, 0], [0, 6, 3, 4], [0, 4, 6, 3]],
    pad: { wave: 'triangle', cutoff: 1500, gain: 0.2 }, bass: 'pulse', bassGain: 0.26, ost: { wave: 'triangle', oct: 3, gain: 0.08, cut: 3000 },
    perc: 'wood', bells: 0.08, braam: 0.5 },
  4: { root: 47, scale: 'aeolian', bpm: 86, bpc: 2, progs: [[0, 5, 2, 6], [0, 3, 4, 0], [5, 6, 0, 0]],
    pad: { wave: 'triangle', cutoff: 2400, gain: 0.2 }, bass: 'pedal', bassGain: 0.26, ost: { wave: 'sine', oct: 2, gain: 0.075, cut: 4000 },
    perc: 'deep', bells: 0.55, braam: 0.6 },
  5: { root: 41, scale: 'phrygian', bpm: 112, bpc: 1, progs: [[0, 0, 1, 6], [0, 5, 6, 1], [0, 1, 5, 0]],
    pad: { wave: 'sawtooth', cutoff: 800, gain: 0.15 }, bass: 'distort', bassGain: 0.28, ost: { wave: 'sawtooth', oct: 2, gain: 0.05, cut: 1800 },
    perc: 'industrial', bells: 0, braam: 1 },
};

const music = { sessions: [], current: null, theme: null, intensity: 0.2, aftermath: false, timer: 0 };
export const musicState = music;

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function degreeSemis(scale, k) { const n = scale.length; const o = Math.floor(k / n); return scale[((k % n) + n) % n] + 12 * o; }

class Session {
  constructor(key) {
    const ctx = engine.ctx;
    this.key = key;
    this.pal = PALETTES[key] || PALETTES[1];
    this.scale = SCALES[this.pal.scale];
    this.stepDur = 60 / this.pal.bpm / 4;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.stopping = false;
    this.prog = this.pal.progs[0];
    this.chord = [0, 3, 7, 12, 15];
    this.chordRoot = 0;
    this.patVar = 0; this.ostPat = OST.sparse[0]; this.bassPat = BASS[this.pal.bass][0];
    this.breakdown = false;
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.out = g(0);
    this.out.connect(bus.music);
    this.verb = g(1); this.verb.connect(bus.musicVerbIn);
    this.layers = { pad: g(0.8), bass: g(0), ost: g(0), perc: g(0), bell: g(0.8) };
    this.levels = { pad: 0.8, bass: 0, ost: 0, perc: 0, bell: 0.8 };
    const sends = { pad: 0.45, bass: 0.05, ost: 0.25, perc: 0.18, bell: 0.7 };
    this.nodes = [this.out, this.verb];
    for (const k in this.layers) {
      const l = this.layers[k]; l.connect(this.out);
      const s = g(sends[k]); l.connect(s); s.connect(this.verb); this.nodes.push(l, s);
    }
    // tempo-synced dotted-8th echo on the ostinato
    this.delay = ctx.createDelay(2); this.delay.delayTime.value = this.stepDur * 3;
    const fb = g(0.3), dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2200;
    const wet = g(0.28);
    this.layers.ost.connect(this.delay); this.delay.connect(dlp); dlp.connect(fb); fb.connect(this.delay); dlp.connect(wet); wet.connect(this.out); wet.connect(this.verb);
    this.nodes.push(this.delay, fb, dlp, wet);
    this.out.gain.setTargetAtTime(1, ctx.currentTime, 0.9);
  }
  stop() {
    if (this.stopping) return;
    this.stopping = true;
    const t = engine.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.setTargetAtTime(0, t, 0.8);
    this.dieAt = t + 4.5;
  }
  dispose() { for (const n of this.nodes) { try { n.disconnect(); } catch { /* noop */ } } }

  intensityValue() {
    if (this.pal.fixed != null) return this.pal.fixed;
    return music.aftermath ? 0.05 : music.intensity;
  }

  updateLayers(I, t) {
    const L = this.levels;
    L.pad = 0.95 - I * 0.3;
    L.bass = smoothstep(0.12, 0.35, I) * (this.breakdown ? 0.4 : 1);
    L.ost = smoothstep(0.2, 0.45, I) * (this.breakdown ? 0.5 : 1);
    L.perc = smoothstep(0.22, 0.5, I) * (this.breakdown ? 0.15 : 1);
    L.bell = 0.9 - I * 0.5;
    if (this.pal.fixed != null) { L.bass = 0.8; L.ost = 0.7; L.perc = 0.7; }
    for (const k in L) this.layers[k].gain.setTargetAtTime(L[k], t, 1.4);
  }

  onBar(bar, t, I) {
    const pal = this.pal;
    if (bar % 4 === 0) {
      this.patVar = Math.floor(R() * 3);
      const band = I < 0.3 || pal.sparse && I < 0.55 ? OST.sparse : I < 0.72 ? OST.mid : OST.dense;
      this.ostPat = band[Math.floor(R() * band.length)];
      const bp = BASS[pal.bass]; this.bassPat = I < 0.25 ? BASS.pedal[0] : bp[Math.floor(R() * bp.length)];
    }
    this.breakdown = bar % 16 === 15 && I < 0.85 && R() < 0.6;
    this.updateLayers(I, t);
    if (bar % pal.bpc === 0) {
      const ci = Math.floor(bar / pal.bpc) % this.prog.length;
      if (ci === 0 && bar > 0 && R() < 0.55) this.prog = pal.progs[Math.floor(R() * pal.progs.length)];
      const d = this.prog[ci];
      const s = this.scale;
      this.chordRoot = degreeSemis(s, d);
      this.chord[0] = this.chordRoot; this.chord[1] = degreeSemis(s, d + 2); this.chord[2] = degreeSemis(s, d + 4);
      this.chord[3] = this.chordRoot + 12; this.chord[4] = this.chord[1] + 12;
      const barDur = this.stepDur * 16;
      this.pad(t, barDur * pal.bpc + 0.6, I);
    }
    // braam at section starts when things are hot (or periodically in menu)
    if (bar % 8 === 0 && pal.braam && (I > 0.7 || pal.fixed != null) && R() < pal.braam) {
      let rate = mtof(pal.root + this.chordRoot) / mtof(38); // braam is rendered on D
      while (rate > 1.42) rate *= 0.5;
      this.oneShot('m_braam', t, 0.22, rate, 'pad');
    }
    if (bar % 8 === 7 && I > 0.6 && R() < 0.6) this.oneShot('m_riser', t, 0.12, 1, 'perc');
  }

  playStep(step, t) {
    const pal = this.pal, st = step & 15, bar = step >> 4;
    const I = this.intensityValue();
    if (st === 0) this.onBar(bar, t, I);
    const L = this.levels;
    // percussion
    if (L.perc > 0.02) {
      const kitList = PERC[pal.perc];
      for (let k = 0; k < kitList.length; k++) {
        const inst = kitList[k];
        if (I < inst.th) continue;
        let pat = inst.pats[Math.min(inst.pats.length - 1, Math.floor((this.patVar + I * 2) % inst.pats.length))];
        // fills on the last bar of each 8
        if (bar % 8 === 7 && st >= 12 && inst.snd === 'm_tom' && I > 0.5) pat = 'xxxxxxxxxxxxxxxx';
        if (pat.charCodeAt(st) !== 120) continue; // 'x'
        const accent = st === 0 ? 1.15 : (st & 3) === 0 ? 1 : 0.78;
        this.oneShot(inst.snd, t + (R() - 0.5) * 0.006, inst.gain * accent * (0.9 + R() * 0.2), inst.rate * (0.98 + R() * 0.04), 'perc');
      }
    }
    // ostinato
    if (L.ost > 0.02) {
      const tone = this.ostPat[st];
      if (tone >= 0 && R() > 0.08) this.pluck(mtof(pal.root + 12 * pal.ost.oct + this.chord[tone]), t, st % 4 === 0 ? 1 : 0.75, I);
    }
    // bass
    if (L.bass > 0.02) {
      const b = this.bassPat[st];
      if (b >= 0) {
        let len = 1; while (st + len < 16 && this.bassPat[st + len] < 0 && len < 8) len++;
        this.bass(mtof(pal.root + this.chordRoot + b), t, Math.max(0.12, len * this.stepDur * 0.92), I);
      }
    }
    // bells — sparser as intensity rises
    if (pal.bells && (st & 1) === 0 && R() < pal.bells * (1 - I * 0.6) * 0.16) {
      const deg = [0, 2, 4, 7, 9, 11][Math.floor(R() * 6)];
      let midi = pal.root + 24 + degreeSemis(this.scale, deg) + (R() < 0.3 ? 12 : 0);
      while (midi > 93) midi -= 12;
      this.oneShot('m_bell', t, 0.11 * (0.7 + R() * 0.3), mtof(midi) / mtof(84), 'bell');
    }
  }

  schedule(until) {
    const ctx = engine.ctx;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05; // resync after suspend
    while (this.nextTime < until) {
      this.playStep(this.step, this.nextTime);
      this.step++;
      this.nextTime += this.stepDur;
    }
  }

  // --- instruments ---------------------------------------------------------
  oneShot(name, t, gain, rate, layer) {
    const b = getSound(name); if (!b) return;
    const ctx = engine.ctx;
    const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(this.layers[layer]);
    src.onended = () => { src.disconnect(); g.disconnect(); };
    src.start(Math.max(t, ctx.currentTime));
  }

  pad(t, dur, I) {
    const ctx = engine.ctx, p = this.pal.pad;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
    const cut = p.cutoff * (0.7 + I * 0.7);
    f.frequency.setValueAtTime(cut * 0.5, t); f.frequency.linearRampToValueAtTime(cut, t + dur * 0.5); f.frequency.linearRampToValueAtTime(cut * 0.6, t + dur);
    const g = ctx.createGain();
    const atk = Math.min(1.4, dur * 0.3), rel = 1.2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p.gain, t + atk);
    g.gain.setValueAtTime(p.gain, t + dur - 0.1); g.gain.linearRampToValueAtTime(0, t + dur + rel);
    f.connect(g); g.connect(this.layers.pad);
    const notes = [this.chord[0], this.chord[1], this.chord[2], this.chord[3]];
    let last = null;
    for (let i = 0; i < notes.length; i++) {
      const fr = mtof(this.pal.root + 12 + notes[i]);
      for (let d = -1; d <= 1; d += 2) {
        const o = ctx.createOscillator(); o.type = p.wave; o.frequency.value = fr; o.detune.value = d * (6 + R() * 4);
        const og = ctx.createGain(); og.gain.value = 0.25;
        o.connect(og); og.connect(f); o.start(t); o.stop(t + dur + rel + 0.05);
        o.onended = () => { o.disconnect(); og.disconnect(); };
        last = o;
      }
    }
    // sub drone under the pad
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = mtof(this.pal.root + this.chordRoot - 12 + (this.chordRoot > 6 ? 0 : 12));
    const sg = ctx.createGain(); sg.gain.value = 0.18; sub.connect(sg); sg.connect(g); sub.start(t); sub.stop(t + dur + rel + 0.05);
    sub.onended = () => { sub.disconnect(); sg.disconnect(); };
    if (last) { const prev = last.onended; last.onended = () => { prev(); f.disconnect(); g.disconnect(); }; }
  }

  pluck(fr, t, vel, I) {
    const ctx = engine.ctx, p = this.pal.ost;
    const o = ctx.createOscillator(); o.type = p.wave; o.frequency.value = fr;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
    const top = p.cut * (0.6 + I * 0.6) * vel;
    f.frequency.setValueAtTime(top, t); f.frequency.setTargetAtTime(fr * 1.2 + 200, t + 0.004, 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p.gain * vel, t + 0.004); g.gain.setTargetAtTime(0, t + 0.01, 0.1);
    o.connect(f); f.connect(g); g.connect(this.layers.ost);
    o.start(t); o.stop(t + 0.6);
    o.onended = () => { o.disconnect(); f.disconnect(); g.disconnect(); };
  }

  bass(fr, t, dur, I) {
    const ctx = engine.ctx;
    const gain = this.pal.bassGain;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr;
    const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = fr;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = this.pal.bass === 'distort' ? 6 : 1.2;
    const cut = 220 + I * 700;
    f.frequency.setValueAtTime(cut * 2, t); f.frequency.setTargetAtTime(cut, t + 0.005, 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.setValueAtTime(gain, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.12);
    const sg = ctx.createGain(); sg.gain.value = 0.9;
    o.connect(f); s.connect(sg); sg.connect(g); f.connect(g); g.connect(this.layers.bass);
    o.start(t); s.start(t); o.stop(t + dur + 0.15); s.stop(t + dur + 0.15);
    o.onended = () => { o.disconnect(); s.disconnect(); f.disconnect(); g.disconnect(); sg.disconnect(); };
  }
}

function tick() {
  if (!engine.ready) return;
  const ctx = engine.ctx;
  if (ctx.state !== 'running') return;
  const until = ctx.currentTime + 0.22;
  const t = ctx.currentTime;
  for (let i = music.sessions.length - 1; i >= 0; i--) {
    const s = music.sessions[i];
    if (s.stopping && t > s.dieAt) { s.dispose(); music.sessions.splice(i, 1); continue; }
    try { s.schedule(until); } catch (err) { console.error('[audio] music', err); s.stop(); }
  }
}

/** Switch theme: 'menu' | 1..5 | null (silence). Crossfades. */
export function setMusicTheme(key) {
  if (!engine.ready) { music.theme = key; return; }
  if (key === music.theme && (key === null || music.current)) return;
  music.theme = key;
  if (music.current) music.current.stop();
  music.current = null;
  if (key === null || key === undefined) return;
  try {
    const s = new Session(key);
    music.sessions.push(s);
    music.current = s;
  } catch (err) { console.error('[audio] music session', err); }
}

export function setMusicIntensity(i) { music.intensity = Math.max(0, Math.min(1, i)); }
export function setMusicAftermath(on) { music.aftermath = !!on; }

export function initMusic() {
  if (music.timer) return;
  music.timer = setInterval(tick, 30);
  if (music.theme !== null && !music.current && engine.ready) { const k = music.theme; music.theme = undefined; setMusicTheme(k); }
}
