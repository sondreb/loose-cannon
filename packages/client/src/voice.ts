/**
 * Offline NPC / combat voice — Grok TTS MP3s only (`/voice/{id}.mp3`).
 * No browser Speech Synthesis (system TTS).
 * Generate clips: `node scripts/voice/generate-voice.mjs`
 */

import {
  CREW_ACK_F_IDS,
  CREW_ACK_M_IDS,
  RIVAL_TAUNT_IDS,
  pickCrewAckId,
  pickRivalTauntId,
} from "@loose-cannon/shared";

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
   * Play a catalog line by id (`/voice/{id}.mp3` from Grok Voice API).
   * Missing files fail silently — never falls back to system TTS.
   */
  play(lineId: string | undefined | null, opts?: { force?: boolean }): void {
    if (!lineId || this.muted) return;
    if (!opts?.force && lineId === this.lastLineId && this.current && !this.current.paused) {
      return;
    }
    this.lastLineId = lineId;
    this.stop();

    // Legacy bank aliases → concrete catalog id (MP3 must exist)
    let id = lineId;
    if (lineId === "crew_ack_m") id = pickCrewAckId(false);
    else if (lineId === "crew_ack_f") id = pickCrewAckId(true);
    else if (lineId === "rival_taunt") id = pickRivalTauntId();

    const audio = new Audio(`/voice/${id}.mp3`);
    audio.volume = this.volume;
    audio.preload = "auto";
    this.current = audio;
    void audio.play().catch(() => {
      // Autoplay policy or missing MP3 — silent (generate with voice:gen)
      if (this.current === audio) this.current = null;
    });
    audio.addEventListener("ended", () => {
      if (this.current === audio) this.current = null;
    });
    audio.addEventListener("error", () => {
      if (this.current === audio) this.current = null;
    });
  }

  /** Crew member selected — short Grok TTS ack (male/female pool). */
  playCrewAck(female: boolean): void {
    this.play(pickCrewAckId(female), { force: true });
  }

  /** Rival engaged in war zone — Grok TTS taunt. */
  playRivalTaunt(): void {
    this.play(pickRivalTauntId(), { force: true });
  }
}

export const voice = new VoiceBus();

export { CREW_ACK_F_IDS, CREW_ACK_M_IDS, RIVAL_TAUNT_IDS };
