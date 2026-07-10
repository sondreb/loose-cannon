/**
 * Offline NPC voice playback (Grok TTS clips under /voice/{id}.mp3).
 */

export class VoiceBus {
  private current: HTMLAudioElement | null = null;
  private lastLineId: string | null = null;
  private muted = false;
  private volume = 0.85;

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
  }

  /**
   * Play a catalog line. Same lineId twice in a row is skipped unless force.
   * Missing files fail silently (dev without generated assets).
   */
  play(lineId: string | undefined | null, opts?: { force?: boolean }): void {
    if (!lineId || this.muted) return;
    if (!opts?.force && lineId === this.lastLineId && this.current && !this.current.paused) {
      return;
    }
    this.lastLineId = lineId;
    this.stop();

    const audio = new Audio(`/voice/${lineId}.mp3`);
    audio.volume = this.volume;
    audio.preload = "auto";
    this.current = audio;
    void audio.play().catch(() => {
      // Autoplay policy or missing file — ignore
    });
    audio.addEventListener("ended", () => {
      if (this.current === audio) this.current = null;
    });
  }
}

export const voice = new VoiceBus();
