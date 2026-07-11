/**
 * Lightweight Web Audio SFX — no external files.
 * Punchy procedural combat + UI sounds (90s arcade / crime game energy).
 * Plus HTMLAudio music beds under /music/ (kept quieter than SFX).
 */

/** Title / splash (login) */
const TITLE_TRACK = "/music/rain-city-ledger.mp3";
/** In-game explore / safe streets */
const EXPLORE_TRACK = "/music/neon-blackout.mp3";
/** War zone, instances, active firefight energy */
const ACTION_TRACK = "/music/neon-heist-run.mp3";

/** Music bed level — must stay under SFX master (~0.55) and voice (~0.85). */
const MUSIC_VOLUME = 0.12;
/** Fade title out before starting the in-game track */
const TITLE_FADE_MS = 2800;
/** Crossfade between explore ↔ action beds */
const MOOD_CROSSFADE_MS = 1600;
/** Hold action bed after last combat cue so it doesn't thrash */
const ACTION_HOLD_MS = 14_000;

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
  /** Job complete / payday sting (gritty brass-ish arpeggio) */
  | "payday"
  /** Job failed / wipe-adjacent dull thud */
  | "jobFail"
  | "buy"
  | "door"
  | "ui"
  | "hurt"
  | "cash"
  | "dumpster";

/** In-game bed mood (title is separate) */
export type MusicMood = "explore" | "action";

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

  isMuted(): boolean {
    return this.muted;
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
      case "payday":
        // Cheap street triumph — cash register + swagger, not victory fanfare
        this.tone(ctx, out, t, 196, 0.06, "triangle", 0.16);
        this.tone(ctx, out, t + 0.05, 294, 0.07, "square", 0.14);
        this.tone(ctx, out, t + 0.12, 392, 0.08, "square", 0.16);
        this.tone(ctx, out, t + 0.2, 523, 0.1, "triangle", 0.18);
        this.tone(ctx, out, t + 0.3, 659, 0.16, "square", 0.12);
        this.noiseBurst(ctx, out, t + 0.08, 0.05, 0.1, 3500);
        this.tone(ctx, out, t + 0.18, 880, 0.04, "square", 0.08);
        this.tone(ctx, out, t + 0.24, 1100, 0.05, "square", 0.07);
        break;
      case "jobFail":
        this.noiseBurst(ctx, out, t, 0.12, 0.28, 450);
        this.tone(ctx, out, t, 140, 0.14, "sawtooth", 0.18);
        this.tone(ctx, out, t + 0.08, 90, 0.2, "triangle", 0.16);
        this.tone(ctx, out, t + 0.16, 55, 0.28, "sine", 0.12);
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

type MusicPhase = "idle" | "title" | "game";

/**
 * Background music from /public/music.
 * - Title: rain-city-ledger (login / splash)
 * - Explore: neon-blackout (safe streets / hub)
 * - Action: neon-heist-run (war zone, instances, firefight hold)
 * Starts on first user gesture (autoplay policy). Volume stays low under SFX/VO.
 */
export class MusicBus {
  private audio: HTMLAudioElement | null = null;
  private muted = false;
  private volume = MUSIC_VOLUME;
  /** Browser allowed playback after a user gesture */
  private gestureOk = false;
  private phase: MusicPhase = "idle";
  private mood: MusicMood = "explore";
  private fading = false;
  private fadeRaf = 0;
  /** performance.now() until which we prefer action bed after combat cues */
  private actionUntil = 0;

  setMuted(m: boolean): void {
    this.muted = m;
    if (m) {
      this.audio?.pause();
      return;
    }
    if (!this.gestureOk) return;
    if (this.phase === "idle") {
      this.playTitle();
      return;
    }
    if (this.audio) {
      this.audio.volume = this.volume;
      void this.audio.play().catch(() => undefined);
    } else if (this.phase === "title") {
      this.playTitle();
    } else if (this.phase === "game") {
      this.playMoodTrack(this.mood, false);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.audio && !this.fading) this.audio.volume = this.volume;
  }

  /**
   * Call from any user gesture. On the login screen this starts the title track.
   * In-game it resumes the current bed if paused.
   */
  unlock(): void {
    this.gestureOk = true;
    if (this.muted) return;
    if (this.fading) return;
    if (this.phase === "idle" || this.phase === "title") {
      this.playTitle();
      return;
    }
    if (this.phase === "game") {
      if (this.audio) {
        if (this.audio.paused) void this.audio.play().catch(() => undefined);
      } else {
        this.playMoodTrack(this.mood, false);
      }
    }
  }

  /** Login / splash bed (loops). Safe to call repeatedly. */
  playTitle(): void {
    if (this.muted || !this.gestureOk) return;
    if (this.phase === "game" || this.fading) return;
    if (this.phase === "title" && this.audio && !this.audio.paused) return;
    this.cancelFade();
    this.startTrack(TITLE_TRACK, true);
    this.phase = "title";
  }

  /**
   * After "Hit the Streets": fade out title, then start the explore bed.
   * If title never played, starts game music immediately.
   */
  enterGame(fadeMs = TITLE_FADE_MS): void {
    this.gestureOk = true;
    this.mood = "explore";
    if (this.muted) {
      this.phase = "game";
      this.cancelFade();
      this.disposeAudio();
      return;
    }
    if (this.phase === "game" && this.audio && !this.audio.paused && !this.fading) {
      return;
    }
    if (this.phase === "title" && this.audio && !this.audio.paused) {
      this.fadeOutThen(() => this.playMoodTrack("explore", true), fadeMs);
      return;
    }
    this.cancelFade();
    this.playMoodTrack("explore", true);
  }

  /**
   * Snapshot-driven mood: war / instances / combat hold → action bed;
   * safe streets → explore. Crossfades; ignores title phase.
   */
  setGameMood(want: MusicMood, opts?: { force?: boolean }): void {
    if (this.phase !== "game") return;
    if (this.muted) {
      this.mood = want;
      return;
    }
    if (!opts?.force && want === this.mood && this.audio && !this.audio.paused && !this.fading) {
      return;
    }
    if (want === this.mood && this.fading) return;
    if (this.fading) return;
    if (want === this.mood) {
      this.playMoodTrack(want, false);
      return;
    }
    this.mood = want;
    if (this.audio && !this.audio.paused) {
      this.fadeOutThen(() => this.playMoodTrack(want, true), MOOD_CROSSFADE_MS);
    } else {
      this.playMoodTrack(want, true);
    }
  }

  /**
   * Call from combat FX / fire SFX so action bed holds a few seconds after
   * the last bang even if you step back into a quiet tile.
   */
  noteCombatActivity(): void {
    this.actionUntil = performance.now() + ACTION_HOLD_MS;
    if (this.phase === "game") this.setGameMood("action");
  }

  /** True while combat hold window is open (for snapshot mood merge). */
  isActionHeld(): boolean {
    return performance.now() < this.actionUntil;
  }

  /**
   * Derive explore vs action from world state + recent combat.
   * Prefer action for war zone, instanced jobs, or held combat.
   */
  syncFromWorld(state: {
    inSafeZone: boolean;
    instancedMission: boolean;
    combatFx: boolean;
  }): void {
    if (this.phase !== "game") return;
    if (state.combatFx) this.noteCombatActivity();
    const wantAction =
      this.isActionHeld() || !state.inSafeZone || state.instancedMission;
    this.setGameMood(wantAction ? "action" : "explore");
  }

  stop(): void {
    this.cancelFade();
    this.disposeAudio();
    this.phase = "idle";
    this.mood = "explore";
    this.actionUntil = 0;
  }

  private trackForMood(mood: MusicMood): string {
    return mood === "action" ? ACTION_TRACK : EXPLORE_TRACK;
  }

  private trackMatches(el: HTMLAudioElement, src: string): boolean {
    const path = src.split("/").pop() ?? src;
    return el.src.includes(path);
  }

  private playMoodTrack(mood: MusicMood, forceRestart: boolean): void {
    if (this.muted) {
      this.phase = "game";
      this.mood = mood;
      return;
    }
    const src = this.trackForMood(mood);
    if (
      !forceRestart &&
      this.phase === "game" &&
      this.mood === mood &&
      this.audio &&
      this.trackMatches(this.audio, src)
    ) {
      this.audio.volume = this.volume;
      void this.audio.play().catch(() => undefined);
      return;
    }
    this.mood = mood;
    this.startTrack(src, true);
    this.phase = "game";
  }

  private startTrack(src: string, loop: boolean): void {
    this.disposeAudio();
    const el = new Audio(src);
    el.volume = this.volume;
    el.loop = loop;
    el.preload = "auto";
    this.audio = el;
    void el.play().catch(() => {
      // Autoplay blocked or missing file — wait for another unlock
      if (this.audio === el) {
        this.disposeAudio();
        if (this.phase !== "game") this.phase = "idle";
      }
    });
  }

  private fadeOutThen(done: () => void, ms: number): void {
    const el = this.audio;
    if (!el) {
      done();
      return;
    }
    this.cancelFade();
    this.fading = true;
    const startVol = el.volume;
    const t0 = performance.now();
    const step = (now: number) => {
      if (this.audio !== el) {
        this.fading = false;
        done();
        return;
      }
      const t = Math.min(1, (now - t0) / Math.max(1, ms));
      // Smooth ease-out curve
      const k = 1 - (1 - t) * (1 - t);
      el.volume = Math.max(0, startVol * (1 - k));
      if (t < 1) {
        this.fadeRaf = requestAnimationFrame(step);
      } else {
        this.fading = false;
        el.pause();
        this.disposeAudio();
        done();
      }
    };
    this.fadeRaf = requestAnimationFrame(step);
  }

  private cancelFade(): void {
    if (this.fadeRaf) {
      cancelAnimationFrame(this.fadeRaf);
      this.fadeRaf = 0;
    }
    this.fading = false;
  }

  private disposeAudio(): void {
    if (!this.audio) return;
    try {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    } catch {
      /* ignore */
    }
    this.audio = null;
  }
}

export const music = new MusicBus();
