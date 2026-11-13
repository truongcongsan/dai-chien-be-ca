import { randomUUID } from "node:crypto";
import type { AudioSettings } from "../src/shared/config";
import type { Fx } from "../src/shared/protocol";
import type { Voice } from "./voice";

/** Ưu tiên câu MC: sự kiện lớn 5 > quà/tin vui 4 > cảnh báo 3 > chào/tin thường 2 > nhắc cách chơi 1. */
export const P = { event: 5, big: 4, warn: 3, info: 2, ambient: 1 } as const;

/** Câu MC nhắc cách chơi lúc bể yên ắng (được tạo giọng sẵn). */
export const AMBIENT = [
  "Bình luận cá rồi thả tim liên tục để nở trứng nhé!",
  "Thả tim thật nhiều để cá lớn nhanh và không bị đói nha!",
  "Vài trăm tim là cá lên một cấp đó, thả tim liên tục nào!",
  "Cá cấp cao nhất bể sẽ thành cá chúa, đội vương miện đó!",
  "Lên cấp mười lăm là cá đạt hình thái cuối, nhưng vẫn lên cấp tiếp tới một trăm nha!",
  "Tặng quà để nhận khiên, thuốc lớn nhanh, hay trứng rồng ánh kim nha!",
  "Bình luận cắn, a còng, tên bạn để đớp cá nhỏ hơn mình, trúng thì cá kia mất mười cấp, mỗi phút rưỡi một lần nha!",
  "Cá to nhất bể từ cấp mười lăm sẽ làm cá chúa, giữ ngôi mười phút là vô địch!",
  "Cá mới nở có khiên năm phút, yên tâm nuôi nha!",
  "Trời mưa thì bình luận đớp để bắt côn trùng cho cá nhé!",
  "Cảm ơn cả nhà đã ghé Đại Chiến Bể Cá hôm nay!",
];

/**
 * Đổi chữ trên màn hình thành câu dễ đọc: bỏ emoji, ký hiệu và tên có gạch dưới,
 * "comment" → "bình luận", "%" → "phần trăm".
 */
export function speakable(text: string) {
  return text
    .replace(/\p{Extended_Pictographic}|️|‍/gu, "")
    .replace(/[“”"]/g, "")
    .replace(/\bcomment\b/gi, "bình luận")
    .replace(/×\s*1,5/g, "gấp rưỡi")
    .replace(/×\s*(\d+)/g, " $1 lần")
    .replace(/\+\s*(\d+)\s*%/g, "cộng $1 phần trăm")
    .replace(/(\d+)\s*%/g, "$1 phần trăm")
    .replace(/@/g, " a còng ")
    .replace(/[_—–]/g, ", ")
    .replace(/…/g, ".")
    .replace(/\s*·\s*/g, ", ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const list = (names: string[]) => {
  if (names.length === 1) return names[0];
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} và ${names[names.length - 1]}`;
  return `${names[0]}, ${names[1]} và ${names.length - 2} bạn nữa`;
};

/**
 * MC của bể: nghe fx của game, đọc các thông báo; sự kiện dồn dập (nở, chết, đói) thì gộp thành một câu;
 * bể yên ắng thì nhắc cách chơi. Không có giọng đọc thì vẫn phát phụ đề.
 */
export class Narrator {
  private lastLineAt = 0;
  private lastAmbientAt = Date.now();
  private ambientIndex = 0;
  private batches: Record<"hatch" | "death" | "warn", { names: string[]; since: number }> = {
    hatch: { names: [], since: 0 },
    death: { names: [], since: 0 },
    warn: { names: [], since: 0 },
  };
  recent: { text: string; priority: number }[] = [];

  constructor(
    private readonly voice: Voice | null,
    private readonly settings: () => AudioSettings,
    private readonly emit: (fx: Fx) => void,
  ) {
    if (voice) {
      voice.onReady = (file, text, priority) => this.emit({ kind: "narrate", id: randomUUID(), text, file, priority, subtitle: this.subtitleFor.has(text) });
      voice.prepare(AMBIENT, this.voiceName());
    }
  }

  /** Câu nào không có thông báo trên màn hình đi kèm thì cần phụ đề. */
  private readonly subtitleFor = new Set<string>();

  private voiceName() {
    // Giọng đã lưu có thể của máy khác (vd. "Linh" từ Mac): không có trên máy này thì dùng giọng đầu tiên.
    const saved = this.settings().voice;
    const available = this.voice?.voices ?? [];
    return saved && (available.length === 0 || available.includes(saved)) ? saved : available[0] || saved || "";
  }

  /** Câu cách nhau ít nhất 2,5 giây để MC không nói chồng; câu quan trọng luôn được đọc. */
  say(text: string, priority: number, subtitle = false, now = Date.now(), ttlMs = 15_000) {
    const s = this.settings();
    if (!s.mc || !text) return false;
    if (priority < P.big && now - this.lastLineAt < 2500) return false;
    this.lastLineAt = now;
    this.recent = [{ text, priority }, ...this.recent].slice(0, 12);
    if (subtitle) {
      this.subtitleFor.add(text);
      if (this.subtitleFor.size > 50) this.subtitleFor.delete(this.subtitleFor.values().next().value as string);
    }
    if (this.voice) this.voice.say(text, this.voiceName(), priority, ttlMs);
    else this.emit({ kind: "narrate", id: randomUUID(), text, file: null, priority, subtitle });
    return true;
  }

  consume(fx: Fx[], now = Date.now()) {
    for (const f of fx) {
      if (f.kind !== "announce" || f.mc === "skip") continue;
      if (f.mc) {
        const name = f.text.match(/của (.+?)(?:!| sắp| đã|…|$)/)?.[1]?.trim();
        const b = this.batches[f.mc];
        if (!b.names.length) b.since = now;
        if (name && b.names.length < 20) b.names.push(name);
        continue;
      }
      const priority = f.tone === "gold" ? P.big : f.tone === "sad" ? P.warn : P.info;
      // Quà tặng: mở đầu bằng lời cảm ơn cho tự nhiên.
      const gift = f.text.match(/^🎁 (.+?) tặng (.+?): (.+)$/u);
      const reward = gift ? speakable(gift[3]) : "";
      const line = gift ? `Cảm ơn ${gift[1]} đã tặng ${gift[2]}! ${reward.charAt(0).toUpperCase()}${reward.slice(1)}` : f.text;
      this.say(speakable(line), priority, false, now);
    }
  }

  tick(now = Date.now(), quiet = true) {
    const flush = (key: "hatch" | "death" | "warn", wait: number, line: (who: string) => string, priority: number) => {
      const b = this.batches[key];
      if (!b.names.length || now - b.since < wait) return;
      const names = b.names.splice(0);
      this.say(speakable(line(list(names))), priority, true, now);
    };
    flush("warn", 4000, (who) => `Cá của ${who} đang đói lả, thả tim cứu ngay nhé!`, P.warn);
    flush("hatch", 5000, (who) => `Chào mừng bé cá của ${who}!`, P.info);
    flush("death", 5000, (who) => `Ôi, cá của ${who} đã về trời mất rồi.`, P.info);

    const s = this.settings();
    if (s.ambientSec > 0 && quiet && now - this.lastAmbientAt > s.ambientSec * 1000 && now - this.lastLineAt > 15_000) {
      this.lastAmbientAt = now;
      this.say(AMBIENT[this.ambientIndex++ % AMBIENT.length], P.ambient, true, now);
    }
  }
}
