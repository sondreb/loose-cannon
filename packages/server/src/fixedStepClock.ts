/** Fixed simulation steps paced by monotonic elapsed time, not timer callback count. */
export class FixedStepClock {
  private accumulatedMs = 0;

  constructor(
    private readonly stepMs: number,
    private previousMs: number,
    private readonly maxCatchUpSteps = 5,
  ) {}

  advance(nowMs: number, step: (dtSeconds: number) => void): number {
    // performance.now() is monotonic; guarding backward samples also makes clock
    // resets harmless in callers/tests instead of crediting that time twice.
    if (nowMs <= this.previousMs) return 0;
    this.accumulatedMs += nowMs - this.previousMs;
    this.previousMs = nowMs;
    const available = Math.floor((this.accumulatedMs + this.stepMs * 1e-9) / this.stepMs);
    const count = Math.min(available, this.maxCatchUpSteps);

    // Discard whole excess steps after a debugger pause or suspended laptop.
    // Keep the fractional remainder so normal scheduling stays on its phase.
    this.accumulatedMs = Math.max(0, this.accumulatedMs - available * this.stepMs);
    for (let i = 0; i < count; i++) step(this.stepMs / 1000);
    return count;
  }
}
