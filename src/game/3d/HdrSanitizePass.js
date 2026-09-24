import { ShaderPass } from 'postprocessing';
import { ShaderMaterial, Uniform } from 'three';

// A single NaN/Inf pixel in the HDR scene buffer is smeared across the whole
// screen by mipmap bloom and depth-of-field blurs, producing full black frames.
// This pass runs right after the scene render and replaces invalid values and
// clamps extreme radiance before any blur effect reads the buffer.
export function createHdrSanitizePass(maxRadiance = 64) {
  const material = new ShaderMaterial({
    name: 'HdrSanitize',
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { inputBuffer: new Uniform(null), maxRadiance: new Uniform(maxRadiance) },
    vertexShader: `varying vec2 vUv;
      void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,1.,1.);}`,
    fragmentShader: `uniform sampler2D inputBuffer;uniform float maxRadiance;varying vec2 vUv;
      void main(){vec4 c=texture2D(inputBuffer,vUv);
        if(any(isnan(c))||any(isinf(c)))c=vec4(0.,0.,0.,1.);
        gl_FragColor=vec4(clamp(c.rgb,0.,maxRadiance),clamp(c.a,0.,1.));}`,
  });
  return new ShaderPass(material, 'inputBuffer');
}