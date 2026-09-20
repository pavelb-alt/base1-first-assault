// Shared delivery queue between the wave pool and the cargo-ship manager.
// The wave pool pushes pending deliveries; the ship manager consumes them.
// When a ship lands, it pushes a ready delivery; the wave pool activates those slots.
export const cargoShipState = {
  pendingDeliveries: [],   // [{ deliveryId, slots: [{ index }], waveId }]
  readyDeliveries: [],    // [{ deliveryId, slots: [{ index, spawnOffset }] }]
  activeShipCount: 0,
  occupiedZones: new Set(),
  nextDeliveryId: 0,
  firstLanded: false,       // first cargo ship has touched down
  firstSquadDeployed: false, // first squad activated from a landed delivery
  reset() {
    this.pendingDeliveries.length = 0;
    this.readyDeliveries.length = 0;
    this.activeShipCount = 0;
    this.occupiedZones.clear();
    this.nextDeliveryId = 0;
    this.firstLanded = false;
    this.firstSquadDeployed = false;
  },
};