import type { WorldSnapshot } from "@loose-cannon/shared";

/** A small, persistent sound stage. No downloads, timers, or per-frame audio buffers. */
export class StreetSoundscape {
  private rain: GainNode;
  private traffic: GainNode;
  private room: GainNode;
  private output: GainNode;
  private noise: AudioBuffer;
  private step: AudioBuffer;
  private environment = "";
  private previous: { x: number; y: number; id: string; layer: string | null } | null = null;
  private stride = 0;
  private foot = 1;
  private lastStep = 0;
  private nextDetail = 0;
  private transientCount = 0;

  constructor(private ctx: AudioContext, destination: AudioNode) {
    this.output = ctx.createGain();
    this.output.connect(destination);
    this.noise = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = this.noise.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    this.step = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
    const samples = this.step.getChannelData(0);
    let low = 0;
    for (let i = 0; i < samples.length; i++) {
      low = low * 0.65 + (Math.random() * 2 - 1) * 0.35;
      samples[i] = low * Math.pow(1 - i / samples.length, 3);
    }
    this.rain = this.bed("highpass", 1400);
    this.traffic = this.bed("lowpass", 190);
    this.room = this.bed("bandpass", 120);
  }

  private bed(type: BiquadFilterType, frequency: number): GainNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.65;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    src.start(0, Math.random() * 3);
    return gain;
  }

  resetMovement(): void {
    this.previous = null;
    this.stride = 0;
  }

  stop(): void {
    this.output.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    this.environment = "";
    this.resetMovement();
  }

  sync(s: WorldSnapshot): void {
    if (this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const inside = !!s.you.insideBuildingId;
    const building = s.buildings.find((b) => b.id === s.you.insideBuildingId);
    const club = building?.id === "club_neon" || /titty|twister/i.test(building?.name ?? "");
    const scene = `${s.you.insideBuildingId ?? "street"}:${s.weather}:${s.dayPhase}:${s.you.inSafeZone}`;
    if (scene !== this.environment) {
      this.environment = scene;
      this.output.gain.setTargetAtTime(1, now, 0.25);
      const rain = s.weather === "storm" ? 0.075 : s.weather === "rain" ? 0.04 : 0;
      this.rain.gain.setTargetAtTime(rain * (inside ? 0.11 : 1), now, 1.2);
      this.traffic.gain.setTargetAtTime(inside ? 0.008 : s.you.inSafeZone ? 0.1 : 0.065, now, 1.2);
      this.room.gain.setTargetAtTime(inside ? club ? 0.07 : 0.035 : 0, now, 0.7);
      // Give a newly entered space a moment to establish its bed before a detail.
      this.nextDetail = now + 8 + Math.random() * 9;
    }

    const leaderId = s.posses.find((p) => p.id === s.you.posseId)?.leaderId;
    const leader = s.units.find((u) => u.id === leaderId);
    if (leader?.alive && !leader.incapacitated && !s.you.respawnIn) {
      const prev = this.previous;
      if (prev && prev.id === leader.id && prev.layer === s.you.insideBuildingId) {
        const distance = Math.hypot(leader.x - prev.x, leader.y - prev.y);
        // Snapshots, not input, drive footsteps. Reject teleports and layer changes.
        if (distance > 0.002 && distance < 1.25) {
          this.stride += distance;
          if (this.stride >= 0.65 && now - this.lastStep > 0.2) {
            this.stride %= 0.65;
            this.lastStep = now;
            this.foot *= -1;
            this.footstep(inside, !inside && s.weather !== "clear");
          }
        } else if (distance >= 1.25) this.stride = 0;
      }
      this.previous = { x: leader.x, y: leader.y, id: leader.id, layer: s.you.insideBuildingId };
    } else this.resetMovement();

    if (now > this.nextDetail) {
      this.nextDetail = now + 17 + Math.random() * 21;
      if (s.weather === "storm") this.thunder(inside);
      else if (!inside) this.distantHorn();
    }
  }

  private footstep(inside: boolean, wet: boolean): void {
    if (this.transientCount >= 8) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.step;
    src.playbackRate.value = (inside ? 1.25 : wet ? 0.82 : 1) * (0.93 + Math.random() * 0.14);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = wet ? 2400 : inside ? 1300 : 900;
    const gain = this.ctx.createGain();
    gain.gain.value = inside ? 0.15 : 0.12;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = this.foot * 0.13;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.output);
    this.transientCount++;
    src.onended = () => {
      src.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect();
      this.transientCount--;
    };
    src.start();
  }

  private thunder(inside: boolean): void {
    if (this.transientCount >= 8) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(310, now);
    filter.frequency.exponentialRampToValueAtTime(70, now + 3);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(inside ? 0.14 : 0.4, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.6);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    this.transientCount++;
    src.onended = () => {
      src.disconnect(); filter.disconnect(); gain.disconnect(); this.transientCount--;
    };
    src.start(now);
    src.stop(now + 3.7);
  }

  private distantHorn(): void {
    if (this.transientCount >= 8) return;
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(147 + Math.random() * 35, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.012, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.random() > 0.5 ? 0.75 : -0.75;
    oscillator.connect(gain);
    gain.connect(pan);
    pan.connect(this.output);
    this.transientCount++;
    oscillator.onended = () => {
      oscillator.disconnect(); gain.disconnect(); pan.disconnect(); this.transientCount--;
    };
    oscillator.start(now);
    oscillator.stop(now + 0.7);
  }
}
