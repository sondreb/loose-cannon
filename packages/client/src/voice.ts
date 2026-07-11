/**
 * Offline NPC / combat voice.
 * Prefer /voice/{id}.mp3 (Grok TTS); fall back to Web Speech API for banks
 * (crew acks, rival warzone taunts) so we don't need dozens of MP3s.
 */

/** Short posse acks — male */
export const CREW_ACK_M = [
  "I'm here boss.",
  "What's up?",
  "Ready.",
  "Say the word.",
  "On you.",
  "Yeah boss.",
  "Let's go.",
  "I got this.",
] as const;

/** Short posse acks — female */
export const CREW_ACK_F = [
  "I'm here.",
  "What's up?",
  "Ready when you are.",
  "Say it.",
  "On you boss.",
  "Yeah?",
  "Let's move.",
  "I got it.",
] as const;

/** Kingpin-energy warzone taunts (18+) */
export const RIVAL_TAUNTS = [
  "You want a piece of this, motherfucker?",
  "Kiss my ass you piece of shit!",
  "Come get some, bitch!",
  "I'll paint the sidewalk with you!",
  "Wrong block, asshole!",
  "You just signed your fucking death warrant!",
  "Eat lead, you cheap suit!",
  "Bring it, pussy!",
  "This is our turf, motherfucker!",
  "You're already dead!",
  "Fuck around and find out!",
  "Time to die, shithead!",
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export class VoiceBus {
  private current: HTMLAudioElement | null = null;
  private lastLineId: string | null = null;
  private muted = false;
  private volume = 0.85;
  private lastSpeakAt = 0;

  setMuted(m: boolean): void {
    this.muted = m;
    if (m) this.stop();
  }

  isMuted(): boolean {
    return this.muted;
  }

  stop(): void {
    if (this.current) {
      this.current.pause();
      this.current.src = "";
      this.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }

  /**
   * Play a catalog line. Same lineId twice in a row is skipped unless force.
   * Missing files fall back to speech for known banks.
   */
  play(lineId: string | undefined | null, opts?: { force?: boolean; gender?: "male" | "female" }): void {
    if (!lineId || this.muted) return;
    if (!opts?.force && lineId === this.lastLineId && this.current && !this.current.paused) {
      return;
    }
    this.lastLineId = lineId;

    // Special banks — TTS first-class (optional MP3 override if present)
    if (lineId === "crew_ack_m" || lineId === "crew_ack_f" || lineId === "rival_taunt") {
      const text =
        lineId === "crew_ack_f"
          ? pick(CREW_ACK_F)
          : lineId === "crew_ack_m"
            ? pick(CREW_ACK_M)
            : pick(RIVAL_TAUNTS);
      const gender =
        opts?.gender ??
        (lineId === "crew_ack_f" ? "female" : lineId === "crew_ack_m" ? "male" : "male");
      this.tryMp3ThenSpeak(lineId, text, gender, opts?.force);
      return;
    }

    this.stop();
    const audio = new Audio(`/voice/${lineId}.mp3`);
    audio.volume = this.volume;
    audio.preload = "auto";
    this.current = audio;
    void audio.play().catch(() => {
      /* missing file / autoplay */
    });
    audio.addEventListener("ended", () => {
      if (this.current === audio) this.current = null;
    });
  }

  /** Crew member selected — short ack in character voice. */
  playCrewAck(female: boolean): void {
    this.play(female ? "crew_ack_f" : "crew_ack_m", { force: true, gender: female ? "female" : "male" });
  }

  /** Rival engaged in war zone. */
  playRivalTaunt(): void {
    this.play("rival_taunt", { force: true, gender: "male" });
  }

  private tryMp3ThenSpeak(
    lineId: string,
    text: string,
    gender: "male" | "female",
    force?: boolean,
  ): void {
    this.stop();
    const audio = new Audio(`/voice/${lineId}.mp3`);
    audio.volume = this.volume;
    let fellBack = false;
    const fallback = () => {
      if (fellBack) return;
      fellBack = true;
      this.speak(text, gender);
    };
    audio.addEventListener("error", fallback);
    void audio.play().then(() => {
      this.current = audio;
    }).catch(fallback);
    // If play "succeeds" but file is silent 404 in some browsers — speak after short timeout if not playing
    window.setTimeout(() => {
      if (this.current === audio && audio.readyState < 2) fallback();
    }, 120);
    audio.addEventListener("ended", () => {
      if (this.current === audio) this.current = null;
    });
    void force;
  }

  /** Web Speech API bark (18+ lines ok). */
  speak(text: string, gender: "male" | "female" = "male"): void {
    if (this.muted || !text) return;
    const now = performance.now();
    if (now - this.lastSpeakAt < 400) return;
    this.lastSpeakAt = now;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.volume = this.volume;
      u.rate = gender === "female" ? 1.05 : 0.95;
      u.pitch = gender === "female" ? 1.15 : 0.85;
      const voices = synth.getVoices();
      const prefer = voices.find((v) =>
        gender === "female"
          ? /female|zira|samantha|woman/i.test(v.name)
          : /male|david|mark|guy|man/i.test(v.name),
      );
      if (prefer) u.voice = prefer;
      synth.speak(u);
    } catch {
      /* ignore */
    }
  }
}

export const voice = new VoiceBus();
