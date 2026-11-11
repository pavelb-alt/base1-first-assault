// Branded boot screen shown while auth / public settings resolve. CSS-only animation
// so it renders instantly before any heavy bundle work.
export function BootScreen({ label = 'Initializing tactical network' }) {
  return (
    <div className="hud-root fixed inset-0 bg-[#07080a] grid place-items-center overflow-hidden" role="status" aria-live="polite">
      <div className="absolute inset-0 hud-grid-bg opacity-40" />
      <div className="hud-screen-fx" />
      <div className="relative text-center px-6">
        <div className="font-display font-extrabold text-6xl sm:text-7xl tracking-[0.12em] text-stone-50 leading-none">
          BASE<span className="text-amber-400">1</span>
        </div>
        <div className="hud-label mt-3 !text-[11px] !tracking-[0.5em] text-stone-400">First Assault</div>
        <div className="mx-auto mt-8 w-64 h-[3px] bg-white/10 overflow-hidden relative">
          <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-amber-400 to-transparent"
            style={{ animation: 'hud-boot-sweep 1.4s ease-in-out infinite' }} />
        </div>
        <div className="mt-3 font-mono text-[11px] tracking-[0.2em] uppercase text-stone-500">
          {label}<span className="hud-blink">_</span>
        </div>
      </div>
    </div>
  );
}
