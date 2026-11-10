"use client";

import type { AudioSettings } from "@/shared/config";
import type { Snapshot } from "@/shared/protocol";

/**
 * Âm thanh Stage: nhạc nền (BGM), tiếng hiệu ứng (SFX), tiếng mưa và giọng MC trên các kênh riêng;
 * nhạc tự nhỏ lại khi MC nói. Nhạc được tổng hợp ngay trong trình duyệt nên không vướng bản quyền.
 * Chỉ Stage phát tiếng; bản preview trong Admin tắt tiếng để OBS không nghe hai lần.
 */

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

export type MusicCue = "day" | "night" | "storm" | "tense";

export type SfxName =
  | "bubble"
  | "hatch"
  | "plop"
  | "levelup"
  | "coin"
  | "fanfare"
  | "chomp"
  | "shield"
  | "death"
  | "crown"
  | "thunder"
  | "meow"
  | "sparkle"
  | "swipe"
  | "warn"
  | "chime";

interface Track {
  bpm: number;
  /** Mỗi ô nhịp một hợp âm (nốt MIDI). */
  chords: number[][];
  /** Giai điệu theo nốt móc kép trong cả vòng lặp, 0 = nghỉ. */
  melody: number[];
  lead: OscillatorType;
  /** Tiếng đệm rải hợp âm (arpeggio) kiểu hộp nhạc dưới nước. */
  arp: boolean;
  drums: "none" | "soft" | "pulse";
  /** Âm lượng tương đối của bản nhạc. */
  level: number;
}

const TRACKS: Record<MusicCue, Track> = {
  // Ngày: thong thả, sáng, kiểu hộp nhạc dưới nước.
  day: {
    bpm: 88,
    chords: [
      [60, 64, 67, 71],
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [55, 59, 62, 65],
    ],
    melody: [76, 0, 0, 79, 0, 0, 76, 0, 74, 0, 0, 0, 72, 0, 0, 0, 72, 0, 0, 76, 0, 0, 74, 0, 72, 0, 69, 0, 0, 0, 0, 0, 69, 0, 0, 72, 0, 0, 77, 0, 76, 0, 74, 0, 72, 0, 0, 0, 74, 0, 0, 0, 71, 0, 72, 0, 74, 0, 0, 0, 0, 0, 0, 0],
    lead: "triangle",
    arp: true,
    drums: "soft",
    level: 1,
  },
  // Đêm: chậm, ít nốt, nhiều khoảng lặng.
  night: {
    bpm: 66,
    chords: [
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [50, 53, 57, 60],
      [52, 55, 59, 62],
    ],
    melody: [0, 0, 0, 0, 76, 0, 0, 0, 0, 0, 74, 0, 0, 0, 0, 0, 72, 0, 0, 0, 0, 0, 0, 0, 69, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 72, 0, 0, 0, 0, 0, 71, 0, 0, 0, 0, 0, 67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    lead: "sine",
    arp: true,
    drums: "none",
    level: 0.75,
  },
  // Bão: giọng thứ, trầm, có nhịp đập.
  storm: {
    bpm: 112,
    chords: [
      [45, 48, 52],
      [41, 45, 48],
      [43, 47, 50],
      [40, 44, 47],
    ],
    melody: [69, 0, 0, 0, 72, 0, 71, 0, 69, 0, 0, 0, 64, 0, 0, 0, 65, 0, 0, 0, 69, 0, 67, 0, 65, 0, 0, 0, 64, 0, 0, 0, 67, 0, 0, 0, 71, 0, 69, 0, 67, 0, 0, 0, 62, 0, 0, 0, 64, 0, 0, 68, 0, 0, 71, 0, 69, 0, 0, 0, 0, 0, 0, 0],
    lead: "sawtooth",
    arp: false,
    drums: "pulse",
    level: 0.9,
  },
  // Thử thách (mèo, dọn bể): nhanh, gấp gáp.
  tense: {
    bpm: 136,
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
      [52, 56, 59],
    ],
    melody: [69, 0, 69, 72, 0, 69, 0, 76, 0, 74, 72, 0, 71, 0, 72, 0, 69, 0, 69, 72, 0, 69, 0, 77, 0, 76, 74, 0, 72, 0, 71, 0, 67, 0, 67, 71, 0, 67, 0, 74, 0, 72, 71, 0, 69, 0, 71, 0, 68, 0, 71, 0, 74, 0, 76, 0, 0, 0, 74, 0, 71, 0, 68, 0],
    lead: "square",
    arp: false,
    drums: "pulse",
    level: 0.85,
  },
};

/** Chọn nhạc theo tình hình bể. */
export function cueFor(snap: Snapshot): MusicCue {
  if (snap.challenge) return "tense";
  if (snap.env.weather === "storm" || snap.env.weather === "stormWarn") return "storm";
  return snap.env.night ? "night" : "day";
}

export class StageAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bgmGain!: GainNode;
  private trackGain!: GainNode;
  private sfxGain!: GainNode;
  private rainGain!: GainNode;
  private noise!: AudioBuffer;
  private track: Track = TRACKS.day;
  private cue: MusicCue = "day";
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private settings: AudioSettings | null = null;
  private rain = 0;
  private voiceQueue: { url: string | null; text: string; subtitle: boolean }[] = [];
  private voicePlaying = false;
  private lastSfx = new Map<SfxName, number>();
  onSubtitle: (text: string | null) => void = () => undefined;

  constructor(private readonly muted: boolean) {}

  get blocked() {
    return !this.muted && this.ctx?.state === "suspended";
  }

  start() {
    if (this.muted || this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.bgmGain = ctx.createGain();
    this.bgmGain.gain.value = 0;
    this.bgmGain.connect(this.master);
    this.trackGain = ctx.createGain();
    this.trackGain.connect(this.bgmGain);
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    this.sfxGain.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    // Tiếng mưa: nhiễu trắng lọc thông dải, lặp liên tục, to nhỏ theo thời tiết.
    const rain = ctx.createBufferSource();
    rain.buffer = this.noise;
    rain.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6000;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(hp).connect(lp).connect(this.rainGain).connect(this.sfxGain);
    rain.start();
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  resume() {
    void this.ctx?.resume();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }

  /** Theo snapshot: âm lượng, nhạc theo tình hình bể, tiếng mưa. */
  follow(snap: Snapshot) {
    this.settings = snap.audio;
    this.music(cueFor(snap));
    this.rain = snap.env.weather === "storm" ? 0.16 : snap.env.weather === "rain" ? 0.08 : 0;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxGain.gain.setTargetAtTime(snap.audio.sfx, t, 0.1);
    this.rainGain.gain.setTargetAtTime(this.rain, t, 1.2);
    this.applyDuck();
  }

  private music(cue: MusicCue) {
    if (cue === this.cue) return;
    this.cue = cue;
    // Đổi bài mượt: nhỏ dần rồi vào bài mới từ đầu.
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.trackGain.gain.cancelScheduledValues(t);
      this.trackGain.gain.setTargetAtTime(0, t, 0.25);
      this.trackGain.gain.setTargetAtTime(TRACKS[cue].level, t + 0.9, 0.4);
    }
    setTimeout(() => {
      this.track = TRACKS[cue];
      this.step = 0;
    }, 900);
  }

  private applyDuck() {
    if (!this.ctx || !this.settings) return;
    const s = this.settings;
    const level = s.music ? s.bgm * (this.voicePlaying ? s.duck : 1) : 0;
    this.bgmGain.gain.setTargetAtTime(level, this.ctx.currentTime, this.voicePlaying ? 0.08 : 0.4);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const sixteenth = 60 / this.track.bpm / 4;
      this.playStep(this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % Math.max(this.track.chords.length * 16, this.track.melody.length);
    }
  }

  private playStep(time: number, sixteenth: number) {
    const t = this.track;
    const out = this.trackGain;
    const bar = Math.floor(this.step / 16) % t.chords.length;
    const inBar = this.step % 16;
    const chord = t.chords[bar];
    if (inBar === 0) {
      for (const n of chord) this.tone(NOTE(n), time, sixteenth * 15, "sine", 0.045, out, 0.08);
      this.tone(NOTE(chord[0] - 12), time, sixteenth * 8, "triangle", 0.11, out, 0.02);
    }
    if (t.arp && inBar % 2 === 0) {
      const n = chord[(inBar / 2) % chord.length] + 12;
      this.tone(NOTE(n), time, sixteenth * 3, "sine", 0.03, out, 0.005);
    }
    const note = t.melody[this.step % t.melody.length];
    if (note) this.tone(NOTE(note), time, sixteenth * 3, t.lead, t.lead === "square" || t.lead === "sawtooth" ? 0.03 : 0.07, out, 0.01);
    if (t.drums === "soft") {
      if (inBar === 0) this.kick(time, 0.18, out);
      if (inBar % 4 === 2) this.hit(time, 0.03, 7000, 0.035, out);
    } else if (t.drums === "pulse") {
      if (inBar % 4 === 0) this.kick(time, 0.32, out);
      if (inBar === 4 || inBar === 12) this.hit(time, 0.1, 1800, 0.1, out);
      if (inBar % 2 === 1) this.hit(time, 0.03, 8000, 0.04, out);
    }
  }

  private tone(freq: number, time: number, duration: number, type: OscillatorType, volume: number, out: AudioNode, attack = 0.005) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain).connect(out);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  /** Nốt có cao độ trượt (tiếng "bloop" dưới nước, tiếng cắn…). */
  private glide(from: number, to: number, time: number, duration: number, type: OscillatorType, volume: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, time);
    osc.frequency.exponentialRampToValueAtTime(to, time + duration);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  private hit(time: number, duration: number, freq: number, volume: number, out: AudioNode = this.sfxGain, type: BiquadFilterType = "bandpass") {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    src.connect(filter).connect(gain).connect(out);
    src.start(time, Math.random() * 1.5);
    src.stop(time + duration + 0.05);
  }

  private kick(time: number, volume: number, out: AudioNode) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.15);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
    osc.connect(gain).connect(out);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  /** Tiếng hiệu ứng. Cùng một tiếng không phát dày hơn `gap` để bể đông không bị ồn. */
  sfx(name: SfxName, gap = 120) {
    const ctx = this.ctx;
    if (!ctx || !this.settings) return;
    const now = performance.now();
    if (now - (this.lastSfx.get(name) ?? 0) < gap) return;
    this.lastSfx.set(name, now);
    const t = ctx.currentTime + 0.01;
    const out = this.sfxGain;
    const arp = (notes: number[], step: number, type: OscillatorType, vol: number, len = 0.25) => notes.forEach((n, i) => this.tone(NOTE(n), t + i * step, len, type, vol, out));
    switch (name) {
      case "bubble":
        return this.glide(500 + Math.random() * 300, 1400, t, 0.12, "sine", 0.12);
      case "plop":
        return this.glide(900, 250, t, 0.14, "sine", 0.22);
      case "hatch":
        this.hit(t, 0.08, 3500, 0.25);
        this.hit(t + 0.07, 0.06, 4200, 0.2);
        return arp([79, 84, 88], 0.08, "triangle", 0.12, 0.35);
      case "levelup":
        return arp([72, 76, 79, 84, 88], 0.07, "triangle", 0.12, 0.3);
      case "coin":
        return arp([83, 88], 0.06, "square", 0.06, 0.2);
      case "fanfare":
        arp([67, 72, 76, 79], 0.1, "sawtooth", 0.05, 0.4);
        return arp([84, 88, 91], 0.12, "triangle", 0.1, 0.8);
      case "chomp":
        this.glide(320, 90, t, 0.12, "square", 0.18);
        return this.hit(t + 0.02, 0.12, 600, 0.35, out, "lowpass");
      case "shield":
        this.tone(NOTE(96), t, 0.6, "sine", 0.12, out);
        return this.tone(NOTE(103), t + 0.02, 0.5, "sine", 0.08, out);
      case "death":
        return arp([72, 67, 64, 60], 0.14, "sine", 0.09, 0.4);
      case "crown":
        return arp([72, 76, 79, 84], 0.09, "square", 0.06, 0.5);
      case "thunder":
        this.hit(t, 0.25, 180, 0.6, out, "lowpass");
        return this.hit(t + 0.15, 2.2, 90, 0.5, out, "lowpass");
      case "meow":
        this.glide(700, 1100, t, 0.18, "sawtooth", 0.06);
        return this.glide(1100, 520, t + 0.18, 0.35, "sawtooth", 0.06);
      case "sparkle":
        return arp([88, 91, 95, 100], 0.05, "sine", 0.07, 0.4);
      case "swipe":
        return this.hit(t, 0.35, 2200, 0.3);
      case "warn":
        return arp([64, 60], 0.18, "triangle", 0.08, 0.25);
      case "chime":
        return arp([84, 88, 91, 96], 0.1, "sine", 0.1, 0.9);
    }
  }

  /** Câu MC phát lần lượt; phụ đề vẫn hiện khi không có tiếng hoặc phát lỗi. */
  voice(url: string | null, text: string, subtitle: boolean) {
    if (this.voiceQueue.length > 3) this.voiceQueue.shift();
    this.voiceQueue.push({ url: this.muted ? null : url, text, subtitle });
    if (!this.voicePlaying) this.nextVoice();
  }

  private nextVoice() {
    const item = this.voiceQueue.shift();
    if (!item) {
      this.voicePlaying = false;
      this.applyDuck();
      this.onSubtitle(null);
      return;
    }
    this.voicePlaying = true;
    this.applyDuck();
    this.onSubtitle(item.subtitle && this.settings?.subtitles !== false ? item.text : null);
    const fallback = () => setTimeout(() => this.nextVoice(), 1800 + item.text.length * 55);
    if (!item.url || this.muted) return fallback();
    const audio = new Audio(item.url);
    audio.volume = Math.min(1, this.settings?.voiceVol ?? 1);
    audio.onended = () => setTimeout(() => this.nextVoice(), 250);
    audio.onerror = () => fallback();
    audio.play().catch(() => fallback());
  }
}
