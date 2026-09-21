import { useState, useEffect, useRef, useCallback } from 'react';
import { EventBus } from '@/game/EventBus';
import { TOWER_DEFENSE, getMaxWaves } from '@/game/config';
import { towerDefenseState } from '@/game/3d/towerDefenseState';
import { gameState } from '@/game/3d/world';

const TOWER_KEYS = ['mg', 'cannon', 'frost'];

export function TowerDefenseHUD({ visible }) {
  const [scrap, setScrap] = useState(towerDefenseState.scrap);
  const [wave, setWave] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(1);
  const [showPieMenu, setShowPieMenu] = useState(false);
  const [piePos, setPiePos] = useState({ x: 0, y: 0 });
  const [worldPos, setWorldPos] = useState(null);

  useEffect(() => {
    const onCurrency = (amt) => setScrap(amt);
    const onWave = (w) => setWave(w);
    const onLevelChanged = (l) => setLevel(l);
    EventBus.on('currency-changed', onCurrency);
    EventBus.on('wave-changed', onWave);
    EventBus.on('level-changed', onLevelChanged);
    return () => { EventBus.off('currency-changed', onCurrency); EventBus.off('wave-changed', onWave); EventBus.off('level-changed', onLevelChanged); };
  }, []);

  // Survival timer
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      if (!gameState.paused) {
        setElapsed(Math.floor((Date.now() - (towerDefenseState.startTime || Date.now())) / 1000));
      }
    }, 500);
    return () => clearInterval(interval);
  }, [visible]);

  // Right-click on canvas opens radial pie menu
  useEffect(() => {
    if (!visible) return;
    const canvas = document.querySelector('#game-container canvas');
    if (!canvas) return;

    const onContextMenu = (e) => {
      if (gameState.mode !== 'strategic') return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setPiePos({ x, y });
      // Request world position from game via EventBus
      EventBus.emit('request-ground-position', { x, y, rect });
    };

    const onGroundPos = (pos) => {
      if (!pos) return;
      // Validate friendly half
      if (pos.z <= TOWER_DEFENSE.friendlyHalfZ) return;
      // Check spacing
      for (const t of towerDefenseState.towers) {
        if (Math.hypot(t.position.x - pos.x, t.position.z - pos.z) < TOWER_DEFENSE.minSpacing) return;
      }
      setWorldPos(pos);
      setShowPieMenu(true);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowPieMenu(false);
    };

    const onClickOutside = () => setShowPieMenu(false);

    canvas.addEventListener('contextmenu', onContextMenu);
    EventBus.on('ground-position-response', onGroundPos);
    window.addEventListener('keydown', onKeyDown);
    if (showPieMenu) window.addEventListener('click', onClickOutside);

    return () => {
      canvas.removeEventListener('contextmenu', onContextMenu);
      EventBus.off('ground-position-response', onGroundPos);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('click', onClickOutside);
    };
  }, [visible, showPieMenu]);

  const handleSelect = useCallback((type) => {
    if (!worldPos) return;
    const cfg = TOWER_DEFENSE.towers[type];
    if (!cfg || scrap < cfg.cost) return;
    if (towerDefenseState.spend(type, worldPos)) {
      setScrap(towerDefenseState.scrap);
    }
    setShowPieMenu(false);
    setWorldPos(null);
  }, [worldPos, scrap]);

  if (!visible) return null;

  return (
    <>
      {/* Resource counter — top center pill */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          top: '12px',
          padding: '13px 24px',
          border: '1px solid #ff8c426e',
          background: '#201c1cdd',
          backdropFilter: 'blur(14px)',
          borderRadius: '999px',
          boxShadow: '0 0 30px #ff8c4226',
          color: '#ffad75',
          font: '800 17px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          letterSpacing: '0.12em',
        }}
      >
        ◈ {scrap}
      </div>

      {/* Wave counter + survival timer — top left */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '56px',
          left: '16px',
          padding: '8px 14px',
          border: '1px solid #454149',
          background: '#17171bd9',
          backdropFilter: 'blur(12px)',
          borderRadius: '8px',
          color: '#bebac2',
          fontSize: '12px',
          lineHeight: 1.8,
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        <div style={{ color: '#ff9b5a', fontWeight: 800, letterSpacing: '0.1em' }}>
          {level === 2 ? '🌙 NIGHT' : '☀ DAY'} WAVE {wave}/{getMaxWaves(level)}
        </div>
        <div>⏱ {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</div>
      </div>

      {/* Radial pie menu */}
      {showPieMenu && piePos && (
        <RadialPieMenu
          x={piePos.x}
          y={piePos.y}
          scrap={scrap}
          onSelect={handleSelect}
          onClose={() => setShowPieMenu(false)}
        />
      )}
    </>
  );
}

function RadialPieMenu({ x, y, scrap, onSelect, onClose }) {
  // Position is set to the cursor — we use fixed positioning relative to the game frame
  // The 3 tower choices are arranged in a circle at 120° intervals
  const radius = 70;
  const angles = [-90, 30, 150]; // top, bottom-right, bottom-left (in degrees)

  return (
    <div
      className="absolute pointer-events-auto"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -50%)',
        zIndex: 40,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Backdrop circle */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '180px',
          height: '180px',
          borderRadius: '50%',
          border: '1px solid #ff8c4266',
          background: '#17171bd9',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 18px 40px #0009, 0 0 34px #ff8c4218',
        }}
      />
      {/* Center button */}
      <button
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          border: '1px solid #ffb581',
          background: '#ff8c42',
          color: '#151216',
          fontSize: '10px',
          fontWeight: 900,
          letterSpacing: '0.08em',
          boxShadow: '0 0 28px #ff8c4288',
          cursor: 'pointer',
          transition: '0.2s',
        }}
        onClick={onClose}
      >
        CLOSE
      </button>
      {/* Tower choice buttons */}
      {TOWER_KEYS.map((key, i) => {
        const cfg = TOWER_DEFENSE.towers[key];
        const angle = (angles[i] * Math.PI) / 180;
        const bx = Math.cos(angle) * radius;
        const by = Math.sin(angle) * radius;
        const affordable = scrap >= cfg.cost;
        return (
          <button
            key={key}
            disabled={!affordable}
            aria-label={cfg.name}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${bx}px), calc(-50% + ${by}px))`,
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              border: '1px solid #5c5962',
              background: affordable ? '#29272d' : '#1a181c',
              color: affordable ? '#fff' : '#555',
              fontSize: '9px',
              fontWeight: 700,
              display: 'grid',
              placeItems: 'center',
              transition: '0.2s',
              boxShadow: '0 8px 16px #0008',
              cursor: affordable ? 'pointer' : 'not-allowed',
              opacity: affordable ? 1 : 0.4,
              textAlign: 'center',
              lineHeight: 1.3,
            }}
            onMouseEnter={(e) => {
              if (affordable) {
                e.currentTarget.style.background = '#ff8c42';
                e.currentTarget.style.color = '#171216';
                e.currentTarget.style.boxShadow = '0 0 24px #ff8c42';
              }
            }}
            onMouseLeave={(e) => {
              if (affordable) {
                e.currentTarget.style.background = '#29272d';
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.boxShadow = '0 8px 16px #0008';
              }
            }}
            onClick={() => onSelect(key)}
          >
            {cfg.name.split(' ')[0]}
            <br />
            <span style={{ fontSize: '8px', opacity: 0.8 }}>{cfg.cost}</span>
          </button>
        );
      })}
    </div>
  );
}