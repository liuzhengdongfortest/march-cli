export class FakeTerminal {
  columns = 80;
  rows = 24;
  writes = [];
  events = [];
  stopped = false;
  onInput = null;
  onResize = null;

  start(onInput, onResize) {
    this.onInput = onInput;
    this.onResize = onResize;
  }

  stop() {
    this.stopped = true;
    this.events.push("stop");
  }

  async drainInput() {
    this.events.push("drain");
  }

  write(data) {
    this.writes.push(data);
  }

  hideCursor() {}

  showCursor() {}

  input(data) {
    this.onInput?.(data);
  }
}
