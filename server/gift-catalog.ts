import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalize } from "../src/shared/config";

/** Một món quà trong danh sách quà của phòng LIVE (ID, tên, giá xu, link ảnh trên CDN TikTok). */
export interface CatalogGift {
  id: number;
  name: string;
  coins: number;
  image: string | null;
}

export const GIFT_IMAGE_FILE = /^[a-f0-9]{40}\.(webp|png|jpg|gif)$/;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const TIMEOUT_MS = 20_000;

/**
 * Danh sách quà TikTok + ảnh quà lưu sẵn trên máy (data/gift-img), để menu quà trên Stage dùng đúng hình quà thật
 * và vẫn hiện khi mạng chập chờn. Danh sách lấy từ endpoint gift/list của webcast (không cần ký, không cần gói Euler).
 */
export class GiftCatalog {
  gifts: CatalogGift[] = [];
  fetchedAt = 0;
  private readonly imgDir: string;
  private readonly file: string;
  private readonly pending = new Map<string, Promise<string | null>>();

  constructor(dataDir: string) {
    this.imgDir = join(dataDir, "gift-img");
    this.file = join(dataDir, "gift-catalog.json");
    mkdirSync(this.imgDir, { recursive: true });
    try {
      const saved = JSON.parse(readFileSync(this.file, "utf8")) as { fetchedAt?: number; gifts?: CatalogGift[] };
      this.gifts = Array.isArray(saved.gifts) ? saved.gifts : [];
      this.fetchedAt = saved.fetchedAt ?? 0;
    } catch {
      // Chưa có danh sách: tải khi kết nối TikTok.
    }
  }

  /** Tải lại danh sách quà của phòng đang LIVE. Trả về số quà. */
  async refresh(username: string): Promise<number> {
    const { TikTokLiveConnection } = await import("tiktok-live-connector");
    const connection = new TikTokLiveConnection(username, { processInitialData: false });
    const roomId = await connection.fetchRoomId();
    const qs = new URLSearchParams({ aid: "1988", app_name: "tiktok_web", device_platform: "web_pc", app_language: "vi-VN", browser_language: "vi-VN", room_id: String(roomId) });
    const res = await fetch(`https://webcast.tiktok.com/webcast/gift/list/?${qs}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`gift/list ${res.status}`);
    const body = (await res.json()) as { data?: { gifts?: { id?: number; name?: string; diamond_count?: number; image?: { url_list?: string[] }; icon?: { url_list?: string[] } }[] } };
    const seen = new Set<number>();
    const gifts: CatalogGift[] = [];
    for (const g of body.data?.gifts ?? []) {
      if (typeof g.id !== "number" || !g.name || seen.has(g.id)) continue;
      seen.add(g.id);
      gifts.push({ id: g.id, name: g.name, coins: Number(g.diamond_count) || 0, image: g.image?.url_list?.[0] ?? g.icon?.url_list?.[0] ?? null });
    }
    if (!gifts.length) throw new Error("gift/list rỗng");
    this.gifts = gifts.sort((a, b) => a.coins - b.coins || a.name.localeCompare(b.name));
    this.fetchedAt = Date.now();
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ fetchedAt: this.fetchedAt, gifts: this.gifts }));
    renameSync(tmp, this.file);
    return gifts.length;
  }

  /** Tìm quà theo ID, không có thì theo tên (không phân biệt hoa thường, dấu). */
  find(giftId: number | null, giftName: string): CatalogGift | undefined {
    if (giftId !== null) {
      const byId = this.gifts.find((g) => g.id === giftId);
      if (byId) return byId;
    }
    const name = normalize(giftName);
    return name ? this.gifts.find((g) => normalize(g.name) === name) : undefined;
  }

  /** Ảnh quà lưu trên máy (tải một lần từ CDN TikTok). Trả về tên file trong data/gift-img, hoặc null. */
  imageFile(url: string | null | undefined): Promise<string | null> {
    if (!url) return Promise.resolve(null);
    const stem = createHash("sha1").update(url).digest("hex");
    for (const ext of ["webp", "png", "jpg", "gif"]) if (existsSync(join(this.imgDir, `${stem}.${ext}`))) return Promise.resolve(`${stem}.${ext}`);
    const running = this.pending.get(stem);
    if (running) return running;
    const job = (async () => {
      try {
        const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) return null;
        const type = res.headers.get("content-type") ?? "";
        const ext = type.includes("png") ? "png" : type.includes("jpeg") ? "jpg" : type.includes("gif") ? "gif" : "webp";
        const name = `${stem}.${ext}`;
        writeFileSync(join(this.imgDir, name), Buffer.from(await res.arrayBuffer()));
        return name;
      } catch {
        return null;
      } finally {
        this.pending.delete(stem);
      }
    })();
    this.pending.set(stem, job);
    return job;
  }

  imagePath(file: string) {
    return GIFT_IMAGE_FILE.test(file) ? join(this.imgDir, file) : null;
  }
}
