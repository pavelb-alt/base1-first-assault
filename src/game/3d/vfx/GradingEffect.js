import { Effect } from 'postprocessing';
import { Uniform, Vector3 } from 'three';

// LUT-free per-level color grade + film grain, merged into the tone-mapping
// EffectPass (no extra full-screen pass). Runs after ACES on display-referred
// values: converts to gamma space, applies lift/gamma/gain (ASC-CDL style),
// saturation, contrast and zero-luminance split toning, then adds a fine
// luminance-weighted grain that stays out of the deep shadows and highlights.
const fragmentShader = /* glsl */`
uniform vec3 gradeLift;
uniform vec3 gradeGammaInv;
uniform vec3 gradeGain;
uniform vec3 gradeShadowTint;
uniform vec3 gradeHighlightTint;
uniform float gradeSaturation;
uniform float gradeContrast;
uniform float gradeBalance;
uniform float gradeGrain;
uniform float gradeTime;

float gradeHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = pow(clamp(inputColor.rgb, 0.0, 1.0), vec3(1.0 / 2.2));
  c = gradeGain * (c + gradeLift * (1.0 - c));
  c = pow(max(c, vec3(0.0)), gradeGammaInv);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, gradeSaturation);
  c = (c - 0.5) * gradeContrast + 0.5;
  float w = smoothstep(0.0, 1.0, clamp((l - gradeBalance) * 1.5 + 0.5, 0.0, 1.0));
  c += gradeShadowTint * (1.0 - w) * (1.0 - l) + gradeHighlightTint * w * l;
  if (gradeGrain > 0.0) {
    float n = gradeHash(gl_FragCoord.xy + fract(gradeTime * 7.31) * 113.0) - 0.5;
    c += n * gradeGrain * (0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0)));
  }
  outputColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(2.2)), inputColor.a);
}
`;

// sRGB hex → gamma-space components (the grade runs in gamma space).
function hexToGamma(hex, out) {
  const v = parseInt(hex.slice(1), 16);
  return out.set(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}
const scratch = new Vector3();
// A tint becomes a pure hue offset: subtract its own luminance, scale by strength.
function tintOffset(hex, strength, out) {
  hexToGamma(hex, scratch);
  const l = scratch.x * 0.2126 + scratch.y * 0.7152 + scratch.z * 0.0722;
  return out.set(scratch.x - l, scratch.y - l, scratch.z - l).multiplyScalar(strength * 2);
}

export class GradingEffect extends Effect {
  constructor() {
    super('GradingEffect', fragmentShader, {
      uniforms: new Map([
        ['gradeLift', new Uniform(new Vector3())],
        ['gradeGammaInv', new Uniform(new Vector3(1, 1, 1))],
        ['gradeGain', new Uniform(new Vector3(1, 1, 1))],
        ['gradeShadowTint', new Uniform(new Vector3())],
        ['gradeHighlightTint', new Uniform(new Vector3())],
        ['gradeSaturation', new Uniform(1)],
        ['gradeContrast', new Uniform(1)],
        ['gradeBalance', new Uniform(0.5)],
        ['gradeGrain', new Uniform(0)],
        ['gradeTime', new Uniform(0)],
      ]),
    });
    // Targets the uniforms ease toward, so level changes cross-fade the grade.
    this.target = {
      lift: new Vector3(), gammaInv: new Vector3(1, 1, 1), gain: new Vector3(1, 1, 1),
      shadow: new Vector3(), highlight: new Vector3(), saturation: 1, contrast: 1, balance: 0.5,
    };
    this.snap = true;
  }

  setGrade(grade) {
    if (!grade) return;
    const t = this.target;
    t.lift.fromArray(grade.lift);
    t.gammaInv.set(1 / grade.gamma[0], 1 / grade.gamma[1], 1 / grade.gamma[2]);
    t.gain.fromArray(grade.gain);
    tintOffset(grade.shadowTint, grade.shadowStrength, t.shadow);
    tintOffset(grade.highlightTint, grade.highlightStrength, t.highlight);
    t.saturation = grade.saturation; t.contrast = grade.contrast; t.balance = grade.balance;
  }

  setGrain(amount) { this.uniforms.get('gradeGrain').value = amount; }

  update(_renderer, _inputBuffer, deltaTime = 0.016) {
    const u = this.uniforms, t = this.target;
    u.get('gradeTime').value += deltaTime;
    const k = this.snap ? 1 : Math.min(1, deltaTime * 1.6);
    this.snap = false;
    u.get('gradeLift').value.lerp(t.lift, k);
    u.get('gradeGammaInv').value.lerp(t.gammaInv, k);
    u.get('gradeGain').value.lerp(t.gain, k);
    u.get('gradeShadowTint').value.lerp(t.shadow, k);
    u.get('gradeHighlightTint').value.lerp(t.highlight, k);
    u.get('gradeSaturation').value += (t.saturation - u.get('gradeSaturation').value) * k;
    u.get('gradeContrast').value += (t.contrast - u.get('gradeContrast').value) * k;
    u.get('gradeBalance').value += (t.balance - u.get('gradeBalance').value) * k;
  }
}
