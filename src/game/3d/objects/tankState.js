// Shared state between the tank delivery manager (outside Physics) and the
// tank entity manager (inside Physics).  Delivery ships push pending spawns
// here when they land; the entity manager consumes them.
export const tankState = {
  pendingSpawns: [],       // [{ id, zone }]
  nextTankId: 0,
  nextShipId: 0,
  firstTankDelivered: false,
  reset() {
    this.pendingSpawns.length = 0;
    this.nextTankId = 0;
    this.nextShipId = 0;
    this.firstTankDelivered = false;
  },
};