// Wind sway for instanced foliage (unit geometry, y in -0.5..0.5). Displacement
// grows with height² so trunks/bases stay planted; phase comes from each
// instance's world position so neighbouring trees move as a rolling gust.
// Visual only; strength 0 (low preset) leaves vertices untouched.
export const windUniforms = { windTime: { value: 0 }, windStrength: { value: 1 } };

export function createWindMaterial(base) {
  const material = base.clone();
  material.onBeforeCompile = shader => {
    shader.uniforms.windTime = windUniforms.windTime;
    shader.uniforms.windStrength = windUniforms.windStrength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float windTime;
        uniform float windStrength;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 windOrigin = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #else
          vec2 windOrigin = vec2(0.0);
        #endif
        float windH = clamp(position.y + 0.5, 0.0, 1.0);
        float windPhase = dot(windOrigin, vec2(0.071, 0.053));
        float windGust = 0.65 + 0.35 * sin(windTime * 0.37 + windOrigin.x * 0.02);
        float windSway = (sin(windTime * 1.35 + windPhase) * 0.7 + sin(windTime * 3.1 + windPhase * 2.3) * 0.3) * windGust;
        transformed.x += windSway * windH * windH * 0.045 * windStrength;
        transformed.z += cos(windTime * 1.05 + windPhase * 1.4) * windH * windH * 0.02 * windStrength;`);
  };
  material.customProgramCacheKey = () => 'foliage-wind-v1';
  return material;
}
