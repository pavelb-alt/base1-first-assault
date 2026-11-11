import * as THREE from 'three';

// GPU-integrated particle layers. Each particle is written ONCE at spawn into a
// fixed ring buffer (per-instance attributes); the vertex shader integrates its
// motion analytically (velocity, exponential drag, gravity/buoyancy, floor) and
// its size/fade from (time - birth). No per-frame CPU work per particle, no
// allocations, one draw call per layer. Dead slots collapse off-screen.
//
// Per-instance layout (5 x vec4):
//   iPos   xyz birth position, w birth time
//   iVel   xyz velocity,       w life (s)
//   iSize  x start size, y end size (STREAK: length), z gravity (+down / -buoyant), w drag
//   iColor rgb color (linear, may exceed 1 for HDR), a opacity
//   iMisc  x shape (+10 = additive inside a premultiplied layer), y orientation, z seed, w floor y
export const SHAPE = { FIRE: 0, SMOKE: 1, GLOW: 2, STAR: 3, CHUNK: 4, RING: 5, SCORCH: 6, STREAK: 7 };
export const ORIENT = { BILLBOARD: 0, STREAK: 1, GROUND: 2 };
export const ADDITIVE = 10;

const vertexShader = /* glsl */`
attribute vec4 iPos;
attribute vec4 iVel;
attribute vec4 iSize;
attribute vec4 iColor;
attribute vec4 iMisc;
uniform float uTime;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vInfo; // x life fraction, y shape, z seed
#include <fog_pars_vertex>
void main() {
  float age = uTime - iPos.w;
  float life = iVel.w;
  float t = age / max(life, 1e-4);
  if (age < 0.0 || t >= 1.0 || life <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float drag = iSize.w;
  float k = drag > 0.001 ? (1.0 - exp(-drag * age)) / drag : age;
  vec3 p = iPos.xyz + iVel.xyz * k - vec3(0.0, 0.5 * iSize.z * age * age, 0.0);
  p.y = max(p.y, iMisc.w);
  float ease = 1.0 - (1.0 - t) * (1.0 - t);
  float size = mix(iSize.x, iSize.y, ease);
  float seed = iMisc.z;
  vec2 corner = position.xy;
  vec4 mvPosition;
  if (iMisc.y < 0.5) {
    float rot = seed * 6.2831 + (seed - 0.5) * 3.0 * age;
    float cs = cos(rot), sn = sin(rot);
    mvPosition = modelViewMatrix * vec4(p, 1.0);
    mvPosition.xy += vec2(cs * corner.x - sn * corner.y, sn * corner.x + cs * corner.y) * size;
  } else if (iMisc.y < 1.5) {
    // Velocity-aligned streak in view space: head at the particle, tail behind.
    vec3 vel = iVel.xyz * exp(-drag * age) - vec3(0.0, iSize.z * age, 0.0);
    if (p.y <= iMisc.w + 0.001) vel *= 0.1;
    mvPosition = modelViewMatrix * vec4(p, 1.0);
    vec2 dir = (modelViewMatrix * vec4(vel, 0.0)).xy;
    float speed = length(dir);
    dir = speed > 1e-4 ? dir / speed : vec2(0.0, 1.0);
    vec2 side = vec2(-dir.y, dir.x);
    float len = iSize.y * (0.4 + min(speed * 0.06, 1.6)) * (1.0 - 0.5 * t);
    mvPosition.xy += dir * (corner.y * 0.5 - 0.5) * len + side * corner.x * iSize.x;
  } else {
    float rot = seed * 6.2831;
    float cs = cos(rot), sn = sin(rot);
    vec2 c = vec2(cs * corner.x - sn * corner.y, sn * corner.x + cs * corner.y) * size;
    mvPosition = modelViewMatrix * vec4(p + vec3(c.x, 0.0, c.y), 1.0);
  }
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv;
  vColor = iColor;
  vInfo = vec3(t, iMisc.x, seed);
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */`
uniform float uRadiance;
uniform float uPremultiplied;
uniform vec3 uLightTint;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vInfo;
#include <fog_pars_fragment>
float pHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float pNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float pFbm(vec2 p) { return pNoise(p) * 0.55 + pNoise(p * 2.07 + 5.3) * 0.3 + pNoise(p * 4.3 + 1.7) * 0.15; }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float t = vInfo.x;
  float shape = vInfo.y;
  float additive = 0.0;
  if (shape >= 9.5) { additive = 1.0; shape -= 10.0; }
  float seed = vInfo.z * 37.0;
  vec3 col = vColor.rgb;
  float alpha;
  if (shape < 0.5) {
    // FIRE: turbulent fireball; white-hot core that cools to ember red.
    float n = pFbm(p * 2.1 + vec2(seed, -t * 2.6));
    float edge = r + (0.5 - n) * 0.6;
    float core = 1.0 - smoothstep(0.0, 0.62, edge + t * 0.55);
    vec3 hot = mix(col, vec3(1.0, 0.93, 0.78) * 1.6, core);
    col = mix(hot, col * vec3(0.55, 0.22, 0.08), smoothstep(0.35, 1.0, t)) * (1.0 + core * 1.8);
    alpha = (1.0 - smoothstep(0.38, 0.95, edge)) * (1.0 - smoothstep(0.5, 1.0, t)) * smoothstep(0.0, 0.04, t);
  } else if (shape < 1.5) {
    // SMOKE: billowing noise edge, self-shadowed bottom, lighter rim on top.
    float n = pFbm(p * 1.7 + vec2(seed + t * 0.5, -t * 0.8));
    float edge = r + (0.5 - n) * 0.65;
    alpha = (1.0 - smoothstep(0.3, 1.0, edge)) * smoothstep(0.0, 0.07, t) * (1.0 - t) * (1.0 - t * 0.4);
    col *= mix(0.62, 1.12, n) * (0.88 + 0.22 * p.y);
  } else if (shape < 2.5) {
    // GLOW: soft gaussian dot (flash cores, embers, energy wisps).
    alpha = exp(-r * r * 4.5) * (1.0 - t);
  } else if (shape < 3.5) {
    // STAR: muzzle-flash star with 4 long + 4 short spikes.
    float ang = atan(p.y, p.x);
    float spikes = pow(abs(cos(ang * 2.0)), 28.0) + pow(abs(cos(ang * 2.0 + 0.785)), 60.0) * 0.5;
    alpha = (exp(-r * r * 14.0) * 1.3 + spikes * (1.0 - smoothstep(0.0, 1.0, r))) * (1.0 - t * t);
    col = mix(col, vec3(1.0, 0.96, 0.85) * 1.6, exp(-r * r * 30.0));
  } else if (shape < 4.5) {
    // CHUNK: hard-edged irregular debris fragment, top-lit.
    float n = pNoise(p * 2.2 + seed);
    alpha = (1.0 - smoothstep(0.62, 0.7, r + (n - 0.5) * 0.55)) * (1.0 - smoothstep(0.75, 1.0, t));
    col *= 0.65 + 0.45 * (p.y * 0.5 + 0.5);
  } else if (shape < 5.5) {
    // RING: expanding shockwave band with a broken, dusty edge.
    float n = pNoise(vec2(atan(p.y, p.x) * 4.0 + seed, t * 3.0));
    float band = smoothstep(0.5, 0.86, r) * (1.0 - smoothstep(0.86, 1.0, r));
    alpha = band * (0.55 + 0.45 * n) * (1.0 - t) * (1.0 - t);
  } else if (shape < 6.5) {
    // SCORCH: dark irregular burn with radial ejecta streaks; fades late.
    float n = pFbm(p * 2.4 + seed);
    float rays = pow(pNoise(vec2(atan(p.y, p.x) * 6.0 + seed, 0.5)), 3.0) * 0.45;
    float edge = r + (n - 0.5) * 0.55 - rays * smoothstep(0.3, 0.9, r);
    alpha = (1.0 - smoothstep(0.32, 0.92, edge)) * (1.0 - smoothstep(0.65, 1.0, t)) * smoothstep(0.0, 0.015, t);
    col *= 0.7 + 0.6 * n;
  } else {
    // STREAK: hot spark line, brightest at the head (uv.y = 1).
    alpha = (1.0 - smoothstep(0.0, 1.0, abs(p.x))) * smoothstep(0.0, 0.7, vUv.y) * (1.0 - t * t);
    col = mix(col, vec3(1.0, 0.95, 0.85) * 1.4, smoothstep(0.75, 1.0, vUv.y) * 0.6);
  }
  alpha *= vColor.a;
  if (alpha < 0.004) discard;
  float fogFactor = 0.0;
  vec3 fogTint = vec3(0.0);
  #ifdef USE_FOG
    fogTint = fogColor;
    #ifdef FOG_EXP2
      fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
  #endif
  col *= uRadiance;
  if (uPremultiplied > 0.5) {
    if (additive > 0.5) gl_FragColor = vec4(col * alpha * (1.0 - fogFactor), 0.0);
    else gl_FragColor = vec4(mix(col * uLightTint, fogTint, fogFactor) * alpha, alpha);
  } else {
    gl_FragColor = vec4(col, alpha * (1.0 - fogFactor));
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const timeUniform = { value: 0 };
export const particleClock = timeUniform;
// Scene-light tint for non-emissive particles (smoke must not glow at night).
const lightTint = { value: new THREE.Color(1, 1, 1) };
export function setParticleLightTint(color) { lightTint.value.copy(color); }

export function createParticleLayer({ name, capacity, additive = false, radiance = 1, renderOrder = 0, depthTest = true, polygonOffset = false }) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const names = ['iPos', 'iVel', 'iSize', 'iColor', 'iMisc'];
  const arrays = names.map(() => new Float32Array(capacity * 4));
  const attributes = names.map((attr, i) => {
    const attribute = new THREE.InstancedBufferAttribute(arrays[i], 4);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(attr, attribute);
    return attribute;
  });
  geometry.instanceCount = capacity;
  const material = new THREE.ShaderMaterial({
    name: `VFX ${name}`,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uRadiance: { value: radiance }, uPremultiplied: { value: additive ? 0 : 1 },
    }]),
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, depthTest, fog: true,
    polygonOffset, polygonOffsetFactor: polygonOffset ? -2 : 0, polygonOffsetUnits: polygonOffset ? -4 : 0,
  });
  material.uniforms.uTime = timeUniform; // shared clock across all layers
  material.uniforms.uLightTint = lightTint;
  if (additive) material.blending = THREE.AdditiveBlending;
  else {
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `VFX ${name}`;
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.raycast = () => null;

  const [pos, vel, size, color, misc] = arrays;
  const layer = {
    mesh, capacity, cursor: 0, dirtyStart: 0, dirtyCount: 0, spawned: 0,
    // Writes one particle from the shared descriptor; overwrites the oldest slot.
    emit(d) {
      const i = layer.cursor, o = i * 4;
      if (layer.dirtyCount === 0) layer.dirtyStart = i;
      if (layer.dirtyCount < capacity) layer.dirtyCount++;
      layer.cursor = (i + 1) % capacity;
      layer.spawned++;
      pos[o] = d.x; pos[o + 1] = d.y; pos[o + 2] = d.z; pos[o + 3] = timeUniform.value + d.delay;
      vel[o] = d.vx; vel[o + 1] = d.vy; vel[o + 2] = d.vz; vel[o + 3] = d.life;
      size[o] = d.size0; size[o + 1] = d.size1; size[o + 2] = d.gravity; size[o + 3] = d.drag;
      color[o] = d.r; color[o + 1] = d.g; color[o + 2] = d.b; color[o + 3] = d.a;
      misc[o] = d.shape; misc[o + 1] = d.orient; misc[o + 2] = d.seed; misc[o + 3] = d.floor;
    },
    // Uploads only the slots written since the last flush (one or two ranges).
    flush() {
      const count = layer.dirtyCount;
      if (!count) return;
      const start = layer.dirtyStart;
      for (const attribute of attributes) {
        attribute.clearUpdateRanges();
        if (count >= capacity) attribute.addUpdateRange(0, capacity * 4);
        else if (start + count <= capacity) attribute.addUpdateRange(start * 4, count * 4);
        else {
          attribute.addUpdateRange(start * 4, (capacity - start) * 4);
          attribute.addUpdateRange(0, (start + count - capacity) * 4);
        }
        attribute.needsUpdate = true;
      }
      layer.dirtyCount = 0;
    },
    live() {
      let n = 0;
      const now = timeUniform.value;
      for (let i = 0; i < capacity; i++) { const o = i * 4; if (now - pos[o + 3] < vel[o + 3] && vel[o + 3] > 0) n++; }
      return n;
    },
    clear() {
      for (let i = 0; i < capacity; i++) vel[i * 4 + 3] = 0;
      layer.dirtyStart = 0; layer.dirtyCount = capacity;
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
  return layer;
}

// Shared, reused spawn descriptor: callers mutate fields then call layer.emit(P).
export const P = {
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, delay: 0,
  size0: 1, size1: 1, gravity: 0, drag: 0, r: 1, g: 1, b: 1, a: 1,
  shape: 0, orient: 0, seed: 0, floor: -1e4,
};
