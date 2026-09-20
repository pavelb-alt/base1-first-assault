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
  const [, publish] = useReducer(n => n + 1, 0);

  useEffect(() => {
    const reset = () => {
      shipsRef.current = [];
      publish();
    };
    EventBus.on('reset-game', reset);
    return () => EventBus.off('reset-game', reset);
  }, []);

  useFrame(() => {
    if (gameState.paused) return;

    // Spawn ships from pending deliveries when capacity allows.
    while (cargoShipState.pendingDeliveries.length > 0) {
      if (cargoShipState.activeShipCount >= CARGO_SHIP.maxShips) break;
      const delivery = cargoShipState.pendingDeliveries[0];
      const zone = findFreeLandingZone();
      if (!zone) break;
      cargoShipState.pendingDeliveries.shift();
      cargoShipState.occupiedZones.add(zone.id);
      cargoShipState.activeShipCount++;
      shipsRef.current.push({
        id: cargoShipState.nextDeliveryId++,
        delivery,
        zone,
      });
      publish();
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