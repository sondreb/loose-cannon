/**
 * Lightweight Web Audio SFX — no external files.
 * Punchy procedural combat + UI sounds (90s arcade / crime game energy).
 */

export type Sfx =
  | "gun"
  | "pistol"
  | "shotgun"
  | "uzi"
  | "tommy"
  | "minigun"
  | "melee"
  | "blade"
  | "flame"
  | "hit"
  | "crit"
  | "miss"
  | "death"
  | "playerDeath"
  | "lootFanfare"
  | "buy"
  | "door"
  | "ui"
  | "hurt"
  | "cash"
  | "dumpster";

export class SfxBus {
  private ctx: AudioContext | null = null;
  private muted = false;
  /** Overall loudness — combat needs to cut through */
  private master = 0.55;
  private lastPlay = new Map<string, number>();

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  /** Call from any user gesture so browsers allow audio. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx?.state === "suspended") void ctx.resume();
  }

  /**
   * Play a named sound. Optional rate-limit key prevents machine-gun clipping
   * from stacking dozens of identical buffers in one frame.
   */
  play(name: Sfx, opts?: { force?: boolean; gain?: number }): void {
    const now = performance.now();
    const minGap =
      name === "minigun"
        ? 28
        : name === "uzi" || name === "tommy"
          ? 40
          : name === "gun" || name === "pistol"
            ? 55
            : name === "hit" || name === "crit"
              ? 35
              : 20;
    const last = this.lastPlay.get(name) ?? 0;
    if (!opts?.force && now - last < minGap) return;
    this.lastPlay.set(name, now);

    const ctx = this.ensure();
    if (!ctx) return;
    // Always try resume (autoplay policy)
    if (ctx.state === "suspended") void ctx.resume();

    const t = ctx.currentTime;
    const master = this.master * (opts?.gain ?? 1);
    const out = ctx.createGain();
    out.gain.value = master;
    out.connect(ctx.destination);

    switch (name) {
      case "pistol":
      case "gun":
        this.gunshot(ctx, out, t, { bass: 140, body: 0.07, crack: 0.9, noise: 0.32 });
        break;
      case "shotgun":
        this.gunshot(ctx, out, t, { bass: 70, body: 0.14, crack: 1.15, noise: 0.55 });
        this.noiseBurst(ctx, out, t + 0.02, 0.1, 0.25, 800);
        break;
      case "uzi":
        this.gunshot(ctx, out, t, { bass: 200, body: 0.04, crack: 0.7, noise: 0.22 });
        break;
      case "tommy":
        this.gunshot(ctx, out, t, { bass: 110, body: 0.055, crack: 0.85, noise: 0.28 });
        this.tone(ctx, out, t, 90, 0.04, "sawtooth", 0.12);
        break;
      case "minigun":
        // High-rate rotary brrrt
        this.gunshot(ctx, out, t, { bass: 95, body: 0.035, crack: 0.75, noise: 0.26 });
        this.tone(ctx, out, t, 160, 0.025, "sawtooth", 0.1);
        this.noiseBurst(ctx, out, t, 0.03, 0.18, 2500);
        break;
      case "melee":
        // Pipe / blunt thwack
        this.noiseBurst(ctx, out, t, 0.05, 0.35, 400);
        this.tone(ctx, out, t, 80, 0.08, "triangle", 0.28);
        this.tone(ctx, out, t + 0.02, 180, 0.05, "square", 0.12);
        break;
      case "blade":
        // Switchblade slice
        this.noiseBurst(ctx, out, t, 0.035, 0.22, 3000);
        this.tone(ctx, out, t, 520, 0.04, "sawtooth", 0.1);
        this.tone(ctx, out, t + 0.02, 280, 0.05, "triangle", 0.08);
        break;
      case "flame":
        this.noiseBurst(ctx, out, t, 0.2, 0.4, 600);
        this.tone(ctx, out, t, 55, 0.18, "sawtooth", 0.22);
        this.tone(ctx, out, t + 0.03, 110, 0.14, "sawtooth", 0.12);
        this.noiseBurst(ctx, out, t + 0.05, 0.12, 0.2, 1200);
        break;
      case "hit":
        this.noiseBurst(ctx, out, t, 0.04, 0.28, 900);
        this.tone(ctx, out, t, 100, 0.05, "square", 0.22);
        this.tone(ctx, out, t + 0.01, 55, 0.06, "sine", 0.15);
        break;
      case "crit":
        this.noiseBurst(ctx, out, t, 0.06, 0.4, 700);
        this.tone(ctx, out, t, 90, 0.07, "square", 0.3);
        this.tone(ctx, out, t + 0.03, 220, 0.08, "sawtooth", 0.18);
        this.tone(ctx, out, t + 0.06, 440, 0.05, "square", 0.1);
        break;
      case "miss":
        this.noiseBurst(ctx, out, t, 0.03, 0.12, 2500);
        this.tone(ctx, out, t, 480, 0.04, "triangle", 0.08);
        break;
      case "death":
        this.noiseBurst(ctx, out, t, 0.08, 0.3, 500);
        this.tone(ctx, out, t, 180, 0.12, "sawtooth", 0.22);
        this.tone(ctx, out, t + 0.06, 70, 0.22, "square", 0.18);
        this.tone(ctx, out, t + 0.12, 40, 0.2, "sine", 0.12);
        break;
      case "playerDeath":
        // Heavier, longer "you're dead" sting
        this.noiseBurst(ctx, out, t, 0.14, 0.5, 400);
        this.tone(ctx, out, t, 200, 0.1, "sawtooth", 0.28);
        this.tone(ctx, out, t + 0.05, 110, 0.18, "square", 0.24);
        this.tone(ctx, out, t + 0.12, 55, 0.35, "sine", 0.22);
        this.tone(ctx, out, t + 0.2, 40, 0.4, "triangle", 0.15);
        this.noiseBurst(ctx, out, t + 0.08, 0.2, 0.25, 200);
        break;
      case "lootFanfare":
        this.tone(ctx, out, t, 392, 0.08, "square", 0.14);
        this.tone(ctx, out, t + 0.07, 523, 0.09, "square", 0.16);
        this.tone(ctx, out, t + 0.15, 659, 0.12, "square", 0.18);
        this.tone(ctx, out, t + 0.24, 784, 0.18, "triangle", 0.14);
        this.noiseBurst(ctx, out, t + 0.1, 0.06, 0.12, 3000);
        break;
      case "buy":
        this.tone(ctx, out, t, 520, 0.05, "square", 0.12);
        this.tone(ctx, out, t + 0.06, 780, 0.08, "square", 0.12);
        break;
      case "door":
        this.tone(ctx, out, t, 140, 0.08, "triangle", 0.14);
        this.noiseBurst(ctx, out, t + 0.02, 0.04, 0.1, 800);
        break;
      case "ui":
        this.tone(ctx, out, t, 660, 0.03, "square", 0.07);
        break;
      case "hurt":
        this.tone(ctx, out, t, 160, 0.09, "sawtooth", 0.2);
        this.noiseBurst(ctx, out, t, 0.05, 0.15, 600);
        break;
      case "cash":
        this.tone(ctx, out, t, 880, 0.04, "square", 0.1);
        this.tone(ctx, out, t + 0.05, 1100, 0.05, "square", 0.09);
        break;
      case "dumpster":
        this.noiseBurst(ctx, out, t, 0.1, 0.25, 300);
        this.tone(ctx, out, t, 60, 0.1, "triangle", 0.14);
        break;
    }
  }

  /** Layered gunshot: low boom + mid body + high crack noise */
  private gunshot(
    ctx: AudioContext,
    dest: AudioNode,
    t: number,
    p: { bass: number; body: number; crack: number; noise: number },
  ): void {
    // Slight pitch jitter so repeated fire doesn't sound robotic
    const j = 0.92 + Math.random() * 0.16;
    this.tone(ctx, dest, t, p.bass * j, p.body * 1.2, "sine", 0.35 * p.crack);
    this.tone(ctx, dest, t, p.bass * 1.6 * j, p.body, "triangle", 0.22 * p.crack);
    this.tone(ctx, dest, t, 320 * j, p.body * 0.45, "square", 0.1 * p.crack);
    this.noiseBurst(ctx, dest, t, p.body * 0.9, p.noise * p.crack, 1800);
    // Short high click / chamber
    this.noiseBurst(ctx, dest, t, 0.015, 0.2 * p.crack, 6000);
  }

  private tone(
    ctx: AudioContext,
    dest: AudioNode,
    t: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
  ): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    // Snap attack, exponential decay
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, dur));
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  /**
   * Filtered noise burst. `bright` is a crude low-pass cutoff (Hz) via simple averaging
   * for duller thuds vs sharper gun cracks.
   */
  private noiseBurst(
    ctx: AudioContext,
    dest: AudioNode,
    t: number,
    dur: number,
    vol: number,
    bright = 4000,
  ): void {
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Soft low-pass: mix with previous sample based on brightness
    const smooth = Math.min(0.95, Math.max(0.05, 1 - bright / 8000));
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      prev = prev * smooth + white * (1 - smooth);
      const env = 1 - i / n;
      data[i] = prev * env * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(g);
    g.connect(dest);
    src.start(t);
  }
}

export const sfx = new SfxBus();
