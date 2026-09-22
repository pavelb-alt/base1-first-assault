import { EventBus } from '@/game/EventBus';
import { LEVELS } from '@/game/config';

export function FrostMissionBriefing() {
  return <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/90 pointer-events-auto p-6">
    <section className="w-full max-w-lg rounded-2xl border border-cyan-200/30 bg-slate-900 p-8 text-center shadow-2xl">
      <div className="text-cyan-200 text-xs font-bold tracking-[0.3em]">FOREST SECURED · OPERATION 04</div>
      <div aria-hidden="true" className="my-5 text-6xl text-cyan-100">❄</div>
      <h2 className="text-4xl font-extrabold tracking-widest text-white">FROST</h2>
      <p className="mt-4 text-slate-300 leading-relaxed">The campaign moves into winter. Hold the frozen trenches beneath falling snow and withstand {LEVELS.frost.maxWaves} enemy waves.</p>
      <p className="mt-3 text-sm text-cyan-200">Your towers and scrap carry forward.</p>
      <button onClick={() => EventBus.emit('proceed-to-frost')} className="mt-7 rounded-lg bg-cyan-200 px-8 py-3 font-bold text-slate-950 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-100">Continue to Frost</button>
    </section>
  </div>;
}