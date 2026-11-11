import { ShaderPass } from 'postprocessing';
import { ShaderMaterial, Uniform } from 'three';

// A single NaN/Inf pixel in the HDR scene buffer is smeared across the whole
// screen by mipmap bloom and depth-of-field blurs, producing full black frames.
// This pass runs right after the scene render and replaces invalid values and
// clamps extreme radiance before any blur effect reads the buffer.
//
// It also carries the (very subtle) lens chromatic aberration for free: the
// red/blue taps are offset radially, so the screen center stays perfectly
// sharp and only the corners fringe. chromatic = 0 skips the extra taps.
export function createHdrSanitizePass(maxRadiance = 64) {
  const material = new ShaderMaterial({
    name: 'HdrSanitize',
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { inputBuffer: new Uniform(null), maxRadiance: new Uniform(maxRadiance), chromatic: new Uniform(0) },
    vertexShader: `varying vec2 vUv;
      void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,1.,1.);}`,
    fragmentShader: `uniform sampler2D inputBuffer;uniform float maxRadiance;uniform float chromatic;varying vec2 vUv;
      void main(){vec4 c=texture2D(inputBuffer,vUv);
        if(chromatic>0.){vec2 d=vUv-.5;vec2 o=d*dot(d,d)*chromatic*4.;
          c.r=texture2D(inputBuffer,vUv+o).r;c.b=texture2D(inputBuffer,vUv-o).b;}
        if(any(isnan(c))||any(isinf(c)))c=vec4(0.,0.,0.,1.);
        gl_FragColor=vec4(clamp(c.rgb,0.,maxRadiance),clamp(c.a,0.,1.));}`,
  });
  const pass = new ShaderPass(material, 'inputBuffer');
  pass.setChromatic = value => { material.uniforms.chromatic.value = value; };
  return pass;
}
