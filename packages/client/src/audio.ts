/**
 * Lightweight Web Audio SFX — no external files.
 * Funny, crunchy, 90s-arcade energy.
 */

type Sfx =
  | "gun"
  | "shotgun"
  | "uzi"
  | "melee"
  | "flame"
  | "hit"
  | "miss"
  | "death"
  | "buy"
  | "door"
  | "ui"
  | "hurt"
  | "cash"
  | "dumpster";

export class SfxBus {
  private ctx: AudioContext | null = null;
  private muted = false;
  private master = 0.35;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  unlock(): void {
    this.ensure();
  }

  play(name: Sfx): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(ctx.destination);
    g.gain.value = this.master;

    switch (name) {
      case "gun":
        this.noiseBurst(ctx, g, t, 0.06, 0.25);
        this.tone(ctx, g, t, 180, 0.05, "square", 0.15);
        break;
      case "shotgun":
        this.noiseBurst(ctx, g, t, 0.12, 0.4);
        this.tone(ctx, g, t, 90, 0.1, "sawtooth", 0.2);
        break;
      case "uzi":
        this.noiseBurst(ctx, g, t, 0.035, 0.18);
        this.tone(ctx, g, t, 240, 0.03, "square", 0.1);
        break;
      case "melee":
        this.noiseBurst(ctx, g, t, 0.04, 0.12);
        this.tone(ctx, g, t, 90, 0.06, "triangle", 0.14);
        this.tone(ctx, g, t + 0.02, 200, 0.04, "square", 0.08);
        break;
      case "flame":
        this.noiseBurst(ctx, g, t, 0.16, 0.28);
        this.tone(ctx, g, t, 70, 0.14, "sawtooth", 0.12);
        this.tone(ctx, g, t + 0.04, 140, 0.1, "sawtooth", 0.08);
        break;
      case "hit":
        this.tone(ctx, g, t, 120, 0.04, "square", 0.2);
        this.noiseBurst(ctx, g, t, 0.03, 0.15);
        break;
      case "miss":
        this.tone(ctx, g, t, 400, 0.03, "triangle", 0.06);
        break;
      case "death":
        this.tone(ctx, g, t, 220, 0.15, "sawtooth", 0.18);
        this.tone(ctx, g, t + 0.05, 80, 0.2, "square", 0.12);
        break;
      case "buy":
        this.tone(ctx, g, t, 520, 0.05, "square", 0.1);
        this.tone(ctx, g, t + 0.06, 780, 0.08, "square", 0.1);
        break;
      case "door":
        this.tone(ctx, g, t, 140, 0.08, "triangle", 0.12);
        this.noiseBurst(ctx, g, t + 0.02, 0.04, 0.08);
        break;
      case "ui":
        this.tone(ctx, g, t, 660, 0.03, "square", 0.05);
        break;
      case "hurt":
        this.tone(ctx, g, t, 160, 0.08, "sawtooth", 0.15);
        break;
      case "cash":
        this.tone(ctx, g, t, 880, 0.04, "square", 0.08);
        this.tone(ctx, g, t + 0.05, 1100, 0.05, "square", 0.07);
        break;
      case "dumpster":
        this.noiseBurst(ctx, g, t, 0.1, 0.2);
        this.tone(ctx, g, t, 60, 0.1, "triangle", 0.1);
        break;
    }
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
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(ctx: AudioContext, dest: AudioNode, t: number, dur: number, vol: number): void {
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(dest);
    src.start(t);
  }
}

export const sfx = new SfxBus();
