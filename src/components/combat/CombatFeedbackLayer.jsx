// Combat feedback HUD layer — mount once inside the playing HUD container
// (an `absolute inset-0 pointer-events-none` element):
//
//   <CombatFeedbackLayer mode={mode} />   // mode: 'strategic' | 'third_person'
//
// Contents (all event-driven via gameEvents, refs + one shared rAF / one canvas):
//  - visor damage: low-health vignette + heartbeat, hit flash, critical fractures
//  - canvas: damage numbers, strategic scrap popups, directional damage arcs,
//    base-under-attack marker / off-screen arrow
//  - kill feed (top-right, below the top-right button row)
//  - kill-streak callouts (centre-lower)
import { useRef } from 'react';
import { VisorDamageOverlay } from '@/components/combat/VisorDamageOverlay';
import { FeedbackCanvas } from '@/components/combat/FeedbackCanvas';
import { KillFeed } from '@/components/combat/KillFeed';
import { StreakCallout } from '@/components/combat/StreakCallout';

export function CombatFeedbackLayer({ mode = 'strategic' }) {
  const modeRef = useRef(mode);
  modeRef.current = mode;
  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden" data-testid="combat-feedback">
      <VisorDamageOverlay modeRef={modeRef} />
      <FeedbackCanvas modeRef={modeRef} />
      <KillFeed />
      <StreakCallout />
    </div>
  );
}

export default CombatFeedbackLayer;
