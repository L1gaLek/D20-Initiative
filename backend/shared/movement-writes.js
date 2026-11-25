'use strict';

// Reserve in preview order across sockets. Different maps remain independent.
// A room's commands still fence previews in WsScheduler before reserving here.
class MovementWrites {
  constructor() { this.tails = new Map(); }
  reserve(roomId, mapId) {
    const key = JSON.stringify([roomId, mapId]);
    const wait = this.tails.get(key) || Promise.resolve();
    let done;
    const tail = new Promise(resolve => { done = resolve; });
    this.tails.set(key, tail);
    let released = false;
    return { wait, release:() => {
      if (released) return;
      released = true; done();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    } };
  }
}
module.exports = MovementWrites;
