// Only presentation/control traffic may bypass ordered game mutations. Room
// lifecycle changes fence both lanes, so a preview cannot cross a leave/join.
class WsScheduler {
  constructor(handle, onError, prepareMove = null) {
    this.handle = handle; this.onError = onError; this.prepareMove = prepareMove;
    this.main = Promise.resolve(); this.visual = Promise.resolve(); this.lifecycle = Promise.resolve();
    this.previews = Promise.resolve(); this.movementFence = this.main;
    this.background = Promise.resolve();
  }
  push(data, receivedAt = Date.now()) {
    const run = () => this.handle(data, receivedAt);
    const safe = promise => promise.catch(this.onError);
    if (['ping', 'pong'].includes(data.type)) return safe(Promise.resolve().then(run));
    if (['joinRoom', 'joinWsRoom', 'joinTavern', 'leaveRoom'].includes(data.type)) {
      this.main = safe(Promise.all([this.main, this.visual, this.previews, this.background]).then(run));
      this.lifecycle = this.main; this.visual = this.main; this.previews = this.main; this.movementFence = this.main;
      this.background = this.main;
      return this.main;
    }
    if (data.type === 'presenceTouch') {
      this.background = safe(Promise.all([this.background, this.lifecycle]).then(run));
      return this.background;
    }
    if (['diceEvent', 'fogPreview'].includes(data.type)) {
      this.visual = safe(Promise.all([this.visual, this.lifecycle]).then(run));
      return this.visual;
    }
    if (data.type === 'moveToken' && this.prepareMove) {
      // Preview the next movement while a previous movement is being saved.
      // All other mutations fence this lane: previews cannot cross a phase,
      // ownership, sheet, map or lifecycle command from the same client.
      const prepared = Promise.all([this.previews, this.movementFence]).then(() => this.prepareMove(data, receivedAt));
      this.previews = prepared.then(() => {}, () => {});
      this.main = safe(Promise.all([this.main, prepared.then(value => ({ value }), error => ({ error }))]).then(([, result]) => {
        if (result.error) throw result.error;
        return this.handle(data, receivedAt, result.value);
      }));
      return this.main;
    }
    this.main = safe(this.main.then(run));
    this.movementFence = this.main;
    return this.main;
  }
}
module.exports = WsScheduler;
