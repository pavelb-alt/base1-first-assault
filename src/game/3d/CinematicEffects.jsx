import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { LIGHTING, GRADING } from '@/game/config';
import { BattlefieldDepthOfField } from '@/game/3d/BattlefieldDepthOfField';
import { createHdrSanitizePass } from '@/game/3d/HdrSanitizePass';
import { GradingEffect } from '@/game/3d/vfx/GradingEffect';
import { useRenderQuality } from '@/game/3d/vfx/quality';
import { useLevel } from '@/game/3d/vfx/useLevel';

// Post stack (per quality preset):
//   HdrSanitize(+radial CA) → [N8AO] → Bloom → [DoF] → ACES → Grade(+grain) → Vignette → [SMAA]
// HDR bloom runs before the single final filmic conversion. The composer disables
// renderer tonemapping while mounted; ToneMapping restores ACES here (mode 6 in
// postprocessing's ToneMappingMode enum) without clipping emissive highlights first.
// The sanitize pass must stay first so invalid pixels never reach AO or the blurs.
// settings.postProcessing = false unmounts the composer entirely: the renderer's
// own ACES tone mapping (set on the Canvas) then applies directly.
export function CinematicEffects() {
  const quality = useRenderQuality();
  if (!quality.postProcessing) return null;
  // The composition key remounts only the composer (never the canvas) when its
  // pass list changes, so pass order is always rebuilt correctly.
  const key = `${quality.level}:${quality.ao ? 1 : 0}${quality.dof ? 1 : 0}`;
  return <Composition key={key} quality={quality} />;
}

function Composition({ quality }) {
  const { preset, ao, dof } = quality;
  const level = useLevel();
  const sanitize = useMemo(() => createHdrSanitizePass(LIGHTING.sanitizeMaxRadiance), []);
  const grading = useMemo(() => new GradingEffect(), []);
  useEffect(() => () => { sanitize.dispose(); grading.dispose(); }, [sanitize, grading]);
  useEffect(() => {
    sanitize.setChromatic(preset.chromatic ? LIGHTING.chromaticOffset : 0);
    grading.setGrain(preset.grain ? LIGHTING.grainIntensity : 0);
  }, [preset, sanitize, grading]);
  useEffect(() => { grading.setGrade(GRADING[level] ?? GRADING[1]); }, [level, grading]);
  // The adaptive governor changes only the pixel ratio (CSS size is unchanged),
  // so resize the composer's targets explicitly when it does.
  const composer = useRef(null);
  const dpr = useThree(state => state.viewport.dpr);
  useEffect(() => { composer.current?.setSize?.(); }, [dpr]);

  return <EffectComposer ref={composer} multisampling={0} enableNormalPass={false}>
    <primitive object={sanitize} />
    {ao ? <BattlefieldAO preset={preset} level={level} /> : null}
    <Bloom mipmapBlur intensity={LIGHTING.bloomIntensity} resolutionScale={preset.bloomResolution}
      luminanceThreshold={LIGHTING.bloomThreshold} luminanceSmoothing={LIGHTING.bloomSmoothing} />
    {dof ? <BattlefieldDepthOfField /> : null}
    <ToneMapping mode={6} />
    <primitive object={grading} />
    <Vignette eskil={false} offset={LIGHTING.vignetteOffset} darkness={LIGHTING.vignetteDarkness} />
    {preset.smaa ? <SMAA /> : null}
  </EffectComposer>;
}

// Screen-space AO sized for ~0.7m soldiers: contact darkening under feet, at
// trench lips and around props. The world radius grows with camera height so
// the strategic view still reads grounded silhouettes instead of 1px halos.
function BattlefieldAO({ preset, level }) {
  const pass = useRef(null);
  const radius = useRef(LIGHTING.aoRadius);
  const strength = GRADING[level]?.ao ?? 1;
  useLayoutEffect(() => {
    // Inside a postprocessing chain the composer owns color-space conversion.
    const config = pass.current?.configuration;
    if (config && config.gammaCorrection !== false) config.gammaCorrection = false;
  }, []);
  useFrame(({ camera }) => {
    const config = pass.current?.configuration;
    if (!config) return;
    const target = Math.min(4.5, Math.max(LIGHTING.aoRadius, camera.position.y * 0.025));
    if (Math.abs(target - radius.current) < 0.08) return;
    radius.current = target;
    config.aoRadius = target;
    config.distanceFalloff = LIGHTING.aoDistanceFalloff * target / LIGHTING.aoRadius;
  });
  return <N8AO ref={pass} quality={preset.aoQuality} halfRes={!!preset.aoHalfRes} depthAwareUpsampling
    aoRadius={LIGHTING.aoRadius} distanceFalloff={LIGHTING.aoDistanceFalloff}
    intensity={LIGHTING.aoIntensity * strength} />;
}
