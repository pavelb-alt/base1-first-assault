// Offline DSP toolkit used to synthesise sound buffers in plain JS. Rendering
// happens once per variant (idle-time prewarm or lazily), never per play.
export const TAU = Math.PI * 2;

export function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

// Topology-preserving state variable filter (Zavalishin). run() updates lp/bp/hp.
export class SVF {
  constructor(sr, fc = 1000, q = 0.707) { this.sr = sr; this.ic1 = 0; this.ic2 = 0; this.lp = 0; this.bp = 0; this.hp = 0; this.set(fc, q); }
  set(fc, q = this.q) {
    this.q = q;
    const g = Math.tan(Math.PI * Math.min(Math.max(fc, 10), this.sr * 0.48) / this.sr);
    this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  run(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = x - this.k * v1 - v2;
    return v2;
  }
}

// Brown-ish noise source (integrated white noise with leak).
export function brown(R) { let b = 0; return () => { b = (b + (R() * 2 - 1) * 0.02) * 0.998; return b * 3.5; }; }

export const expEnv = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function normalize(x, peak = 0.9) {
  let m = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; }
  if (m > 0) { const k = peak / m; for (let i = 0; i < x.length; i++) x[i] *= k; }
  return x;
}

export function fade(x, sr, inMs = 0.5, outMs = 8) {
  const ni = Math.floor(sr * inMs / 1000), no = Math.floor(sr * outMs / 1000);
  for (let i = 0; i < ni && i < x.length; i++) x[i] *= i / ni;
  for (let i = 0; i < no && i < x.length; i++) x[x.length - 1 - i] *= i / no;
  return x;
}

// Make a seamless loop: render dur+xf seconds, then fold the tail into the head
// with an equal-power crossfade.
export function makeLoop(sr, dur, xf, renderFn) {
  const n = Math.floor(sr * dur), nx = Math.floor(sr * xf);
  const raw = renderFn(n + nx);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = raw[i];
  for (let i = 0; i < nx; i++) {
    const a = i / nx;
    out[i] = raw[i] * Math.sin(a * Math.PI / 2) + raw[n + i] * Math.cos(a * Math.PI / 2);
  }
  return out;
}

// Inharmonic metallic partial cluster added into `out` starting at sample `at`.
export function addPartials(out, sr, at, freqs, amps, taus, R, gain = 1) {
  for (let p = 0; p < freqs.length; p++) {
    const f = freqs[p] * (0.98 + R() * 0.04), tau = taus[p] ?? taus[0], a = (amps[p] ?? amps[0]) * gain;
    let ph = R() * TAU; const inc = TAU * f / sr;
    const len = Math.min(out.length - at, Math.floor(tau * 6 * sr));
    for (let i = 0; i < len; i++) { out[at + i] += Math.sin(ph) * a * Math.exp(-i / sr / tau); ph += inc; }
  }
}

/**
 * Parametric gunshot / cannon renderer.
 * Layers: HP crack, BP body, pitched thump, LP tail, optional metallic ring and
 * mechanical click, finished with tanh drive.
 */
export function gunshot(sr, R, o) {
  const n = Math.floor(sr * o.dur);
  const out = new Float32Array(n);
  const v = 1 + (R() - 0.5) * 0.25; // per-variant colour
  const hp = new SVF(sr, o.crackHz * v, 0.7);
  const bp = new SVF(sr, o.bodyHz * v, o.bodyQ ?? 1.1);
  const lp = new SVF(sr, o.tailHz, 0.6);
  const nb = brown(R);
  let ph = 0;
  const f0 = o.thumpHz * (0.9 + R() * 0.2), f1 = o.thumpEnd ?? 40;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = R() * 2 - 1;
    hp.run(w); const crack = hp.hp * Math.exp(-t / o.crackTau) * (o.crackAmt ?? 1);
    bp.run(w); const body = bp.bp * expEnv(t, 0.0008, o.bodyTau) * (o.bodyAmt ?? 1.5);
    const f = f1 + (f0 - f1) * Math.exp(-t / (o.thumpTau * 0.6));
    ph += TAU * f / sr;
    const thump = Math.sin(ph) * expEnv(t, 0.001, o.thumpTau) * (o.thumpAmt ?? 0.8);
    if ((i & 31) === 0 && o.tailSweep) lp.set(o.tailHz * (0.25 + 0.75 * Math.exp(-t / o.tailSweep)));
    lp.run(o.tailBrown ? nb() : w);
    const tail = lp.lp * expEnv(t, o.tailAttack ?? 0.006, o.tailTau) * (o.tailAmt ?? 0.3);
    out[i] = crack + body + thump + tail;
  }
  if (o.ring) addPartials(out, sr, 0, o.ring, [o.ringAmt ?? 0.15], [o.ringTau ?? 0.12], R);
  if (o.clickAt) {
    const at = Math.floor(sr * (o.clickAt + R() * 0.01));
    addPartials(out, sr, at, [3100, 4700, 6900], [o.clickAmt ?? 0.08], [0.008], R);
  }
  const drive = o.drive ?? 1.6;
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * drive);
  return fade(normalize(out, 0.92), sr, 0.2, 30);
}

/** Parametric explosion: crack, sub thump, sweeping LP noise body, debris crackle. */
export function explosion(sr, R, o) {
  const n = Math.floor(sr * o.dur);
  const out = new Float32Array(n);
  const lp = new SVF(sr, o.lpStart, 0.7);
  const hp = new SVF(sr, 1800, 0.7);
  const nb = brown(R);
  let ph = 0;
  const f0 = o.thumpHz * (0.85 + R() * 0.3);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 31) === 0) lp.set(o.lpEnd + (o.lpStart - o.lpEnd) * Math.exp(-t / o.lpTau));
    const w = R() * 2 - 1;
    lp.run(w * 0.6 + nb() * 0.6);
    const body = lp.lp * expEnv(t, o.attack ?? 0.004, o.noiseTau) * 1.4;
    hp.run(w); const crack = hp.hp * Math.exp(-t / 0.006) * (o.crackAmt ?? 0.8);
    const f = 18 + (f0 - 18) * Math.exp(-t / (o.thumpTau * 0.5));
    ph += TAU * f / sr;
    const thump = Math.sin(ph) * expEnv(t, 0.002, o.thumpTau) * (o.thumpAmt ?? 1.1);
    out[i] = body + crack + thump;
  }
  // debris: scattered tiny clicks / pebbles
  const debris = o.debris ?? 0;
  const dbp = new SVF(sr, 2500, 2);
  for (let k = 0; k < debris; k++) {
    const at = Math.floor(sr * (0.08 + Math.pow(R(), 1.6) * (o.dur * 0.6)));
    const len = Math.floor(sr * (0.004 + R() * 0.02));
    dbp.set(1200 + R() * 4000, 1.5);
    const a = (0.05 + R() * 0.12) * Math.exp(-(at / sr) / (o.dur * 0.4));
    for (let i = 0; i < len && at + i < n; i++) { dbp.run(R() * 2 - 1); out[at + i] += dbp.bp * a * (1 - i / len) * 3; }
  }
  const drive = o.drive ?? 1.8;
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * drive);
  return fade(normalize(out, 0.95), sr, 0.3, 120);
}
