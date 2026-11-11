import * as THREE from 'three';

// Physically-inspired procedural sky dome, drawn at the far plane (xyww) so it
// never clips and costs nothing where geometry covers it:
//  - exponential Rayleigh-like zenith→horizon gradient that meets the fog color
//  - Henyey-Greenstein Mie forward-scatter glow around the sun + HDR sun disc
//  - two drifting fbm cloud decks projected on a virtual plane, sun-lit edges
//  - two parallax ridge silhouettes on the horizon (or a city skyline)
//  - night: hashed star field with twinkle, faint milky band, shaded moon
const vertexShader = /* glsl */`
varying vec3 vSkyDir;
void main() {
  vSkyDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
  gl_Position.z = p.w * 0.99999;
}`;

const fragmentShader = /* glsl */`
uniform vec3 zenith, horizon, glow, sunDir, cloudColor, cloudShade, ridgeColor;
uniform float sunDisc, sunSize, mie, clouds, cloudSpeed, time, ridgeHeight, ridgeHaze, stars, moon, city;
varying vec3 vSkyDir;

float skyHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float skyHash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float skyNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), f.x), mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float skyFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * skyNoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return s;
}
float ridgeNoise(float x, float seed) {
  float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(skyHash(vec2(i, seed)), skyHash(vec2(i + 1.0, seed)), f);
}
float ridgeProfile(float az, float scale, float seed) {
  return ridgeNoise(az * scale, seed) * 0.55 + ridgeNoise(az * scale * 2.7, seed + 3.1) * 0.3 + ridgeNoise(az * scale * 7.3, seed + 7.7) * 0.15;
}

void main() {
  vec3 d = normalize(vSkyDir);
  float y = d.y;
  float up = max(y, 0.0);
  vec3 col = mix(horizon, zenith, 1.0 - exp(-up * 3.4));
  float mu = dot(d, sunDir);
  float horizonBand = 1.0 - smoothstep(0.0, 0.45, up);

  // Mie forward scattering, strongest toward the horizon (longer optical path).
  float g = 0.76;
  float hg = (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * mu, 1e-4), 1.5);
  col += glow * hg * 0.025 * mie * (0.4 + horizonBand);
  col += glow * pow(max(mu, 0.0), 5.0) * mie * 0.22 * horizonBand;

  // Night: stars, milky band and the moon (it shares the key light direction).
  if (stars > 0.5 && y > 0.0) {
    vec3 sp = d * 130.0;
    vec3 cell = floor(sp);
    float h = skyHash3(cell);
    vec3 starOff = vec3(skyHash3(cell + 11.0), skyHash3(cell + 23.0), skyHash3(cell + 37.0)) - 0.5;
    float r = length(fract(sp) - 0.5 - starOff * 0.6);
    float star = step(0.93, h) * (1.0 - smoothstep(0.0, 0.11, r)) * (0.65 + 0.35 * sin(time * (1.5 + h * 3.0) + h * 60.0));
    float band = skyFbm(vec2(atan(d.z, d.x) * 3.0, d.y * 6.0)) * (1.0 - smoothstep(0.0, 0.35, abs(dot(d, normalize(vec3(0.3, 0.6, -0.74))))));
    col += vec3(0.85, 0.9, 1.0) * star * (0.6 + h * 1.4) * smoothstep(0.02, 0.25, y);
    col += vec3(0.25, 0.3, 0.45) * band * 0.12 * smoothstep(0.05, 0.3, y);
  }
  if (moon > 0.5) {
    float disc = smoothstep(0.99955, 0.99965, mu);
    vec3 tangent = normalize(cross(sunDir, vec3(0.0, 1.0, 0.0)));
    vec3 bitangent = cross(tangent, sunDir);
    vec2 mp = vec2(dot(d, tangent), dot(d, bitangent)) * 40.0;
    float maria = skyFbm(mp * 1.6 + 4.0);
    col += vec3(0.82, 0.88, 1.0) * disc * (1.6 + maria * 1.4);
    col += vec3(0.35, 0.45, 0.7) * (pow(max(mu, 0.0), 900.0) * 0.5 + pow(max(mu, 0.0), 24.0) * 0.06);
  }

  // Sun disc: HDR so bloom adds the corona; the sanitize pass caps its radiance.
  col += glow * smoothstep(sunSize, sunSize + 0.00025, mu) * sunDisc;
  col += vec3(1.0, 0.97, 0.9) * smoothstep(sunSize + 0.0001, sunSize + 0.0003, mu) * sunDisc * 0.5;

  // Two cloud decks on a virtual plane; parallax comes from different heights.
  if (clouds > 0.0 && y > 0.0) {
    vec2 drift = vec2(time * cloudSpeed, time * cloudSpeed * 0.35);
    vec2 uv = d.xz / (y + 0.12);
    float n = skyFbm(uv * 1.1 + drift);
    float cover = smoothstep(1.0 - clouds, 1.0 - clouds + 0.38, n);
    float hi = skyFbm(uv * 0.35 + drift * 0.5 + 9.0);
    float cirrus = smoothstep(0.55, 0.95, hi) * 0.35;
    float lit = clamp(0.35 + (n - 0.5) * 1.4 + mu * 0.35, 0.0, 1.0);
    vec3 cloud = mix(cloudShade, cloudColor, lit);
    cloud += glow * pow(max(mu, 0.0), 8.0) * (1.0 - cover) * cover * 2.5 * mie;
    float fade = smoothstep(0.0, 0.18, y);
    col = mix(col, cloud, cover * 0.88 * fade);
    col = mix(col, cloudColor, cirrus * fade * (1.0 - cover));
  }

  // Distant silhouettes: far ridge is hazier and taller, near ridge darker.
  if (ridgeHeight > 0.0 && y < ridgeHeight * 2.0) {
    float az = atan(d.z, d.x);
    float farR, nearR;
    if (city > 0.5) {
      float b = floor(az * 70.0), b2 = floor(az * 38.0 + 0.5);
      float hb = skyHash(vec2(b, 4.0)), hb2 = skyHash(vec2(b2, 9.0));
      farR = ridgeHeight * (0.45 + hb2 * hb2 * 1.3);
      nearR = ridgeHeight * (0.2 + hb * hb * 0.9) * step(0.25, skyHash(vec2(b, 2.0)));
    } else {
      farR = ridgeHeight * (0.35 + ridgeProfile(az, 3.0, 1.0) * 0.95);
      nearR = ridgeHeight * (0.12 + ridgeProfile(az + 1.3, 6.0, 5.0) * 0.6);
    }
    vec3 farCol = mix(horizon, ridgeColor, ridgeHaze * 0.55);
    vec3 nearCol = mix(horizon, ridgeColor, ridgeHaze);
    float aa = 0.0015;
    col = mix(col, farCol, 1.0 - smoothstep(farR - aa, farR + aa, y));
    col = mix(col, nearCol, 1.0 - smoothstep(nearR - aa, nearR + aa, y));
  }

  // Below the horizon the dome dissolves into the scene fog color.
  col = mix(col, horizon, 1.0 - smoothstep(-0.06, -0.005, y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const color = hex => new THREE.Color(hex);
export function createSkyMaterial(atmosphere, look) {
  return new THREE.ShaderMaterial({
    name: 'ProceduralSky', side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: color(look.zenith) }, horizon: { value: color(atmosphere.horizon) },
      glow: { value: color(look.glow) }, sunDir: { value: new THREE.Vector3(...atmosphere.sunPosition).normalize() },
      cloudColor: { value: color(look.cloudColor) }, cloudShade: { value: color(look.cloudShade) },
      ridgeColor: { value: color(look.ridge) },
      sunDisc: { value: look.sunDisc }, sunSize: { value: look.sunSize }, mie: { value: look.mie },
      clouds: { value: look.clouds }, cloudSpeed: { value: look.cloudSpeed }, time: { value: 0 },
      ridgeHeight: { value: look.ridgeHeight }, ridgeHaze: { value: look.ridgeHaze },
      stars: { value: look.stars }, moon: { value: look.moon }, city: { value: look.city },
    },
    vertexShader, fragmentShader,
  });
}
