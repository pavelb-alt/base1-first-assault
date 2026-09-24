import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { LIGHTING } from '@/game/config';
import { BattlefieldDepthOfField } from '@/game/3d/BattlefieldDepthOfField';

// HDR bloom runs before the single final filmic conversion. The composer disables
// renderer tonemapping while mounted; ToneMapping restores ACES here (mode 6 in
// postprocessing's ToneMappingMode enum) without clipping emissive highlights first.
export function CinematicEffects() {
  return <EffectComposer multisampling={0} enableNormalPass={false}>
    <Bloom mipmapBlur intensity={LIGHTING.bloomIntensity}
      luminanceThreshold={LIGHTING.bloomThreshold} luminanceSmoothing={LIGHTING.bloomSmoothing} />
    <BattlefieldDepthOfField />
    <ToneMapping mode={6} />
    <Vignette eskil={false} offset={LIGHTING.vignetteOffset} darkness={LIGHTING.vignetteDarkness} />
    <SMAA />
  </EffectComposer>;
}