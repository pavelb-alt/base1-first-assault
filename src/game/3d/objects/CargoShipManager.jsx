import { useRef, useReducer, useCallback, useEffect, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { EventBus } from '@/game/EventBus';
import { CARGO_SHIP } from '@/game/config';
import { cargoShipState } from '@/game/3d/objects/cargoShipState';
import { gameState } from '@/game/3d/world';
import { CargoShip } from '@/game/3d/objects/CargoShip';

useGLTF.preload(CARGO_SHIP.modelUrl);

function findFreeLandingZone() {
  for (const zone of CARGO_SHIP.landingZones) {
    if (!cargoShipState.occupiedZones.has(zone.id)) return zone;
  }
  return null;
}

export function CargoShipManager() {
  const shipsRef = useRef([]);
  const launchCooldown = useRef(0);
  const [, publish] = useReducer(n => n + 1, 0);

  useEffect(() => {
    const reset = () => {
      shipsRef.current = [];
      launchCooldown.current = 0;
      publish();
    };
    EventBus.on('reset-game', reset);
    return () => EventBus.off('reset-game', reset);
  }, []);

  useFrame((_, delta) => {
    if (gameState.paused) return;

    // Stagger ship launches with occasional bursts so 2–4 ships sometimes
    // land together instead of always trickling in one at a time.
    if (launchCooldown.current > 0) {
      launchCooldown.current = Math.max(0, launchCooldown.current - delta);
      return;
    }

    // Launch one ship at a time when capacity allows.
    if (cargoShipState.pendingDeliveries.length > 0 && cargoShipState.activeShipCount < CARGO_SHIP.maxShips) {
      const delivery = cargoShipState.pendingDeliveries[0];
      const zone = findFreeLandingZone();
      if (zone) {
        cargoShipState.pendingDeliveries.shift();
        cargoShipState.occupiedZones.add(zone.id);
        cargoShipState.activeShipCount++;
        shipsRef.current.push({
          id: cargoShipState.nextDeliveryId++,
          delivery,
          zone,
        });
        // 40% chance of no delay (burst — another ship launches next frame),
        // 60% chance of a 2–5 second gap.
        launchCooldown.current = Math.random() < 0.4 ? 0 : 2 + Math.random() * 3;
        publish();
      }
    }
  });

  const handleComplete = useCallback((shipId) => {
    const ship = shipsRef.current.find(s => s.id === shipId);
    if (ship) {
      cargoShipState.occupiedZones.delete(ship.zone.id);
      cargoShipState.activeShipCount--;
    }
    shipsRef.current = shipsRef.current.filter(s => s.id !== shipId);
    publish();
  }, []);

  return (
    <>
      {shipsRef.current.map(ship => (
        <Suspense key={ship.id} fallback={null}>
          <CargoShip
            shipId={ship.id}
            delivery={ship.delivery}
            zone={ship.zone}
            onComplete={handleComplete}
          />
        </Suspense>
      ))}
    </>
  );
}