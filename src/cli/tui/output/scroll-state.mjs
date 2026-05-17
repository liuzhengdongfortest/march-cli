export class OutputScrollState {
  constructor() {
    this.offset = 0;
    this.anchorStart = null;
    this.viewportHeight = null;
    this.totalLines = 0;
  }

  clear() {
    this.offset = 0;
    this.anchorStart = null;
    this.viewportHeight = null;
    this.totalLines = 0;
  }

  setTotalLines(total) {
    this.totalLines = Math.max(0, Math.trunc(total));
  }

  scroll(delta, { step = this.getStep() } = {}) {
    const total = this.totalLines;
    const win = this._windowHeight();
    const maxOffset = this.getMaxOffset();
    step = Math.max(1, Math.trunc(step));
    const currentStart = this.anchorStart ?? Math.max(0, total - this.offset - win);
    const maxStart = Math.max(0, total - win);
    const nextStart = clamp(currentStart + (delta < 0 ? -step : step), 0, maxStart);
    const nextEnd = Math.min(total, nextStart + win);
    this.offset = clamp(total - nextEnd, 0, maxOffset);
    this.anchorStart = this.offset > 0 ? nextStart : null;
    return { offset: this.offset, maxOffset, atTail: this.offset === 0 };
  }

  getStep() {
    return Math.max(1, Math.floor(this._windowHeight() / 3));
  }

  getMaxOffset() {
    return Math.max(0, this.totalLines - this._windowHeight());
  }

  setViewportHeight(height) {
    this.viewportHeight = Math.max(1, Math.trunc(height));
    this.offset = clamp(this.offset, 0, this.getMaxOffset());
    if (this.offset === 0) this.anchorStart = null;
  }

  reset() {
    this.offset = 0;
    this.anchorStart = null;
  }

  sliceRange() {
    const win = this.viewportHeight;
    if (win === null) return null;
    const maxOffset = this.getMaxOffset();
    if (this.anchorStart !== null && this.offset > 0) {
      const start = clamp(this.anchorStart, 0, Math.max(0, this.totalLines - win));
      const end = Math.min(this.totalLines, start + win);
      this.offset = clamp(this.totalLines - end, 0, maxOffset);
      if (this.offset === 0) this.anchorStart = null;
      else this.anchorStart = start;
      return { start, end };
    }

    this.offset = clamp(this.offset, 0, maxOffset);
    if (this.offset === 0) this.anchorStart = null;
    const end = Math.max(0, this.totalLines - this.offset);
    return { start: Math.max(0, end - win), end };
  }

  _windowHeight() {
    return this.viewportHeight || (process.stdout.rows || 30) - 2;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
