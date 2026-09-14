// Engine-agnostic event emitter (no Phaser/Three dependency) used to
// communicate between React and the running game.
class Emitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, fn, context) {
    const list = this.listeners.get(event) ?? [];
    list.push({ fn, context, once: false });
    this.listeners.set(event, list);
    return this;
  }

  once(event, fn, context) {
    const list = this.listeners.get(event) ?? [];
    list.push({ fn, context, once: true });
    this.listeners.set(event, list);
    return this;
  }

  off(event, fn, context) {
    if (!fn) {
      this.listeners.delete(event);
      return this;
    }
    const list = this.listeners.get(event)?.filter(
      (listener) => listener.fn !== fn || (context !== undefined && listener.context !== context)
    );
    if (list?.length) {
      this.listeners.set(event, list);
    } else {
      this.listeners.delete(event);
    }
    return this;
  }

  emit(event, ...args) {
    const list = this.listeners.get(event);
    if (!list?.length) {
      return false;
    }
    // Drop once-listeners before invoking so a handler that re-subscribes
    // (or unsubscribes others) sees consistent state; `list` stays intact
    // as the invocation snapshot since filter returns a new array.
    const remaining = list.filter((listener) => !listener.once);
    if (remaining.length) {
      this.listeners.set(event, remaining);
    } else {
      this.listeners.delete(event);
    }
    for (const listener of list) {
      listener.fn.apply(listener.context, args);
    }
    return true;
  }

  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}

Emitter.prototype.addListener = Emitter.prototype.on;
Emitter.prototype.removeListener = Emitter.prototype.off;

export const EventBus = new Emitter();
