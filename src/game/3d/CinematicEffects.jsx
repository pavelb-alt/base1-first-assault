import { useContext, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, EffectComposerContext, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { LIGHTING } from '@/game/config';

// Resize the HDR buffers as well as the canvas when adaptive resolution changes.
// Logical CSS dimensions can stay fixed while the GPU pixel ratio changes.
function AdaptiveEffectBuffers() {
  const { composer } = useContext(EffectComposerContext);
  const dpr = useThree(state => state.viewport.dpr);
  const size = useThree(state => state.size);
  useEffect(() => { composer.setSize(size.width, size.height); }, [composer, size.width, size.height, dpr]);
  return null;
}

// HDR bloom runs before the single final filmic conversion. The composer disables
// renderer tonemapping while mounted; ToneMapping restores ACES here (mode 6 in
// postprocessing's ToneMappingMode enum) without clipping emissive highlights first.
export function CinematicEffects() {
  return <EffectComposer multisampling={0} enableNormalPass={false}>
    <Bloom mipmapBlur intensity={LIGHTING.bloomIntensity}
      luminanceThreshold={LIGHTING.bloomThreshold} luminanceSmoothing={LIGHTING.bloomSmoothing} />
    <ToneMapping mode={6} />
    <Vignette eskil={false} offset={LIGHTING.vignetteOffset} darkness={LIGHTING.vignetteDarkness} />
    <SMAA />
    <AdaptiveEffectBuffers />
  </EffectComposer>;
}