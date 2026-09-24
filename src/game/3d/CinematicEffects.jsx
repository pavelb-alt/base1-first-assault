import { useEffect, useMemo } from 'react';
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { LIGHTING } from '@/game/config';
import { BattlefieldDepthOfField } from '@/game/3d/BattlefieldDepthOfField';
import { createHdrSanitizePass } from '@/game/3d/HdrSanitizePass';

// HDR bloom runs before the single final filmic conversion. The composer disables
// renderer tonemapping while mounted; ToneMapping restores ACES here (mode 6 in
// postprocessing's ToneMappingMode enum) without clipping emissive highlights first.
// The sanitize pass must stay first so invalid pixels never reach the blurs.
export function CinematicEffects() {
  const sanitize = useMemo(() => createHdrSanitizePass(), []);
  useEffect(() => () => sanitize.dispose(), [sanitize]);
  return <EffectComposer multisampling={0} enableNormalPass={false}>
    <primitive object={sanitize} />
    <Bloom mipmapBlur intensity={LIGHTING.bloomIntensity}
      luminanceThreshold={LIGHTING.bloomThreshold} luminanceSmoothing={LIGHTING.bloomSmoothing} />
    <BattlefieldDepthOfField />
    <ToneMapping mode={6} />
    <Vignette eskil={false} offset={LIGHTING.vignetteOffset} darkness={LIGHTING.vignetteDarkness} />
    <SMAA />
  </EffectComposer>;
}