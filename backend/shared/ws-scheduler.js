// Only presentation/control traffic may bypass ordered game mutations. Room
// lifecycle changes fence both lanes, so a preview cannot cross a leave/join.
class WsScheduler {
  constructor(handle, onError) { this.handle = handle; this.onError = onError; this.main = Promise.resolve(); this.visual = Promise.resolve(); this.lifecycle = Promise.resolve(); }
  push(data, receivedAt = Date.now()) {
    const run = () => this.handle(data, receivedAt);
    const safe = promise => promise.catch(this.onError);
    if (['ping', 'pong'].includes(data.type)) return safe(Promise.resolve().then(run));
    if (['joinRoom', 'joinWsRoom', 'joinTavern', 'leaveRoom'].includes(data.type)) {
      this.main = safe(Promise.all([this.main, this.visual]).then(run));
      this.lifecycle = this.main; this.visual = this.main;
      return this.main;
    }
    if (['diceEvent', 'fogPreview', 'presenceTouch'].includes(data.type)) {
      this.visual = safe(Promise.all([this.visual, this.lifecycle]).then(run));
      return this.visual;
    }
    this.main = safe(this.main.then(run));
    return this.main;
  }
}
module.exports = WsScheduler;
