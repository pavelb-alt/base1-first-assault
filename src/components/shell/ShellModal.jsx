import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useKeyLayer } from './keyLayers';

/**
 * Full-screen dimmed/blurred modal frame used by settings, controls, credits and the
 * pause menu sub-screens. Esc closes unless `handleKeys` is false (child owns keys).
 */
export function ShellModal({ title, eyebrow, onClose, children, width = 'max-w-3xl', handleKeys = true, footer }) {
  useKeyLayer((e) => {
    if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); onClose?.(); }
  }, { active: handleKeys });

  return (
    <motion.div
      className="hud-root absolute inset-0 z-[60] grid place-items-center p-4 pointer-events-auto"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <motion.section
        role="dialog" aria-modal="true" aria-label={title}
        className={`hud-panel hud-brackets relative w-full ${width} max-h-[calc(100dvh-2rem)] flex flex-col`}
        initial={{ y: 18, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 10, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        <header className="flex items-center justify-between gap-4 px-6 pt-5 pb-3 border-b border-white/10">
          <div>
            {eyebrow && <div className="hud-label text-amber-400/80">{eyebrow}</div>}
            <h2 className="hud-title text-xl md:text-2xl text-stone-50">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="hud-btn flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
            <span className="hud-key">ESC</span><X size={14} />
          </button>
        </header>
        <div className="hud-scroll flex-1 min-h-0 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="px-6 py-3 border-t border-white/10">{footer}</footer>}
      </motion.section>
    </motion.div>
  );
}
