// The anti-spoiler buffer. A stream reaches viewers 20-60 seconds after the match
// happened, so every piece of match data waits here until it matches the broadcast.

// Events released this late belong to a moment viewers have already passed.
const STALE_EVENT_MS = 15000;

class DelayLine {
  constructor(delayMs = 0) {
    this.delayMs = delayMs;
    this.queue = [];
  }

  push(kind, data, at) {
    this.queue.push({ kind, data, at });
  }

  setDelay(delayMs) {
    this.delayMs = delayMs;
  }

  // Everything now due, oldest first. Lowering the delay can release a backlog:
  // the latest data still goes out, but celebrations that are long past do not.
  release(now) {
    const due = [];
    while (this.queue.length && this.queue[0].at + this.delayMs <= now) {
      const item = this.queue.shift();
      if (item.kind === 'event' && now - (item.at + this.delayMs) > STALE_EVENT_MS) continue;
      due.push(item);
    }
    return due;
  }

  get pending() {
    return this.queue.length;
  }
}

module.exports = { DelayLine, STALE_EVENT_MS };
