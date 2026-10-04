import { useEffect, useState } from 'react';
import { EventBus } from '@/game/EventBus';

export function RTSSelectionBox() {
  const [box, setBox] = useState(null);
  useEffect(() => {
    const update = value => setBox(value);
    EventBus.on('selection-box', update);
    return () => EventBus.off('selection-box', update);
  }, []);
  return box ? <div data-testid="rts-selection-box" className="fixed z-20 pointer-events-none border border-teal-300 bg-teal-300/15" style={box} /> : null;
}