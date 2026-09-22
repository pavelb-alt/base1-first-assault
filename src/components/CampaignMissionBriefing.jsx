import { EventBus } from '@/game/EventBus';
import { getLevelConfig } from '@/game/config';

export function CampaignMissionBriefing({ currentLevel }) {
  const next = getLevelConfig(currentLevel + 1);
  const city = next.id === 5;
  return <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/90 pointer-events-auto p-6">
    <section className="w-full max-w-lg rounded-2xl border border-cyan-200/30 bg-slate-900 p-8 text-center shadow-2xl">
      <div className="text-cyan-200 text-xs font-bold tracking-[0.3em]">{getLevelConfig(currentLevel).name} SECURED · OPERATION {String(next.id).padStart(2, '0')}</div>
      <div aria-hidden="true" className="my-5 text-6xl text-cyan-100">{city ? '▥' : '❄'}</div>
      <h2 className="text-4xl font-extrabold tracking-widest text-white">{next.name}</h2>
      <p className="mt-4 text-slate-300 leading-relaxed">{city
        ? `The battle reaches the city. Hold the fortified streets beneath a shattered skyline and withstand ${next.maxWaves} enemy waves.`
        : `The campaign moves into winter. Hold the frozen trenches beneath falling snow and withstand ${next.maxWaves} enemy waves.`}</p>
      <p className="mt-3 text-sm text-cyan-200">Your towers and scrap carry forward.</p>
      <button onClick={() => EventBus.emit(city ? 'proceed-to-city' : 'proceed-to-frost')} className="mt-7 rounded-lg bg-cyan-200 px-8 py-3 font-bold text-slate-950 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-100">Continue to {city ? 'City' : 'Frost'}</button>
    </section>
  </div>;
}