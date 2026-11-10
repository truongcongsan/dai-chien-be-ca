import type { SourceAdapter, SourceCallbacks, SourceEvent, SourceUser } from "./source";

const FIRST_RETRY_MS = 10_000;
const MAX_RETRY_MS = 120_000;

/* Field names differ between connector versions, so both layouts are accepted. */
interface Payload {
  comment?: string;
  /** Bản connector 2.x gửi nội dung comment ở `content`. */
  content?: string;
  msgId?: string;
  userId?: string;
  uniqueId?: string;
  nickname?: string;
  /** 2.x: user.id (số), user.displayId (tên @), user.nickname. */
  user?: { userId?: string; uniqueId?: string; nickname?: string; id?: string | number; displayId?: string };
  /** 2.x: số tim của lô (LIKE) và số người xem (ROOM_USER, dạng chuỗi). */
  count?: number | string;
  total?: number | string;
  common?: { msgId?: string };
  giftId?: number | string;
  giftName?: string;
  giftType?: number;
  groupId?: string | number;
  repeatCount?: number;
  repeatEnd?: boolean | number;
  diamondCount?: number;
  giftDetails?: { giftName?: string; giftType?: number; diamondCount?: number };
  extendedGiftInfo?: { name?: string; diamond_count?: number };
  likeCount?: number;
  viewerCount?: number;
  displayType?: string;
}

interface Connection {
  connect(): Promise<unknown>;
  disconnect(): Promise<unknown> | void;
  on(event: string, listener: (payload: never) => void): unknown;
}

export function userOf(data: Payload): SourceUser | null {
  const u = data.user;
  const rawId = u?.userId ?? u?.id ?? (data.userId && data.userId !== "0" ? data.userId : undefined) ?? u?.uniqueId ?? u?.displayId ?? data.uniqueId;
  if (rawId === undefined || rawId === null || rawId === "" || String(rawId) === "0") return null;
  const userId = String(rawId);
  const uniqueId = u?.uniqueId ?? u?.displayId ?? data.uniqueId ?? userId;
  return { userId, uniqueId, name: u?.nickname || data.nickname || uniqueId };
}

/** Nội dung comment (1.x: comment, 2.x: content). */
export const commentOf = (data: Payload) => (typeof data.comment === "string" ? data.comment : typeof data.content === "string" ? data.content : null);

/** Số tim trong một lô (1.x: likeCount, 2.x: count). */
export const likesOf = (data: Payload) => Number(data.likeCount ?? data.count) || 1;

/** Số người xem (1.x: viewerCount, 2.x: total dạng chuỗi). */
export const viewersOf = (data: Payload) => {
  const n = Number(data.viewerCount ?? data.total);
  return Number.isFinite(n) ? n : null;
};

const msgId = (data: Payload) => data.common?.msgId ?? data.msgId;

/**
 * A streakable gift (giftType 1) fires on every repeat and once more with repeatEnd and the final count.
 * Only that final event is passed on, keyed by its streak group, so the count is never added twice (GDD 19.3).
 */
export function toGiftEvent(data: Payload): SourceEvent | null {
  const giftType = data.giftType ?? data.giftDetails?.giftType;
  if (giftType === 1 && !data.repeatEnd) return null;
  const user = userOf(data);
  const id = msgId(data);
  if (!user || (!id && !data.groupId)) return null;
  const giftId = data.giftId !== undefined && data.giftId !== null ? Number(data.giftId) : null;
  const diamonds = data.diamondCount ?? data.giftDetails?.diamondCount ?? data.extendedGiftInfo?.diamond_count ?? null;
  return {
    type: "gift",
    eventKey: data.groupId ? `tt:${user.userId}:${giftId}:${data.groupId}` : `tt:${id}`,
    user,
    giftId: Number.isFinite(giftId) ? giftId : null,
    giftName: data.giftName ?? data.giftDetails?.giftName ?? data.extendedGiftInfo?.name ?? "",
    count: Math.max(1, Number(data.repeatCount) || 1),
    diamonds: typeof diamonds === "number" ? diamonds : null,
  };
}

export function describeConnectError(error: unknown): { message: string; retry: boolean } {
  const text = error instanceof Error ? `${error.constructor.name} ${error.name}: ${error.message}` : String(error);
  if (/offline|isn't online|not.?live|LIVE has ended/i.test(text)) return { message: "Tài khoản chưa phát live. Bắt đầu live rồi bấm Kết nối lại.", retry: false };
  if (/rate.?limit|429/i.test(text)) return { message: "Máy chủ ký kết nối đang giới hạn lượt. Thử lại sau hoặc đặt TIKTOK_SIGN_API_KEY.", retry: false };
  if (/InvalidUniqueId|not.?found|invalid.*user/i.test(text)) return { message: "Không tìm thấy tài khoản TikTok này.", retry: false };
  return { message: "Không kết nối được TikTok LIVE, đang thử lại.", retry: true };
}

export class TikTokAdapter implements SourceAdapter {
  private callbacks: SourceCallbacks | null = null;
  private connection: Connection | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryMs = FIRST_RETRY_MS;
  private generation = 0;

  constructor(private readonly username: string) {}

  start(callbacks: SourceCallbacks) {
    this.callbacks = callbacks;
    void this.open();
  }

  stop() {
    this.callbacks = null;
    this.generation += 1;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const connection = this.connection;
    this.connection = null;
    if (connection) void Promise.resolve(connection.disconnect()).catch(() => undefined);
  }

  /** Exponential backoff with jitter (FR-TIKTOK-02). */
  private scheduleRetry() {
    if (!this.callbacks || this.retryTimer) return;
    const delay = this.retryMs * (0.8 + Math.random() * 0.4);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.open();
    }, delay);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
  }

  private async open() {
    if (!this.username) {
      this.callbacks?.onStatus("error", "Chưa nhập tên tài khoản TikTok.");
      return;
    }
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    const emit = (event: SourceEvent | null) => {
      if (current() && event) this.callbacks?.onEvent(event);
    };
    this.callbacks?.onStatus("connecting", `Đang kết nối @${this.username}`);
    try {
      const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import("tiktok-live-connector");
      if (!current()) return;
      const connection = new TikTokLiveConnection(this.username, {
        // Initial data replays recent chat, and old commands must not fire again after a reconnect.
        processInitialData: false,
        // Tải danh sách quà của phòng cần gói Euler Business; không có thì cả kết nối thất bại.
        // Sự kiện quà vẫn mang sẵn tên + giá (giftDetails), nên mặc định tắt. TIKTOK_EXTENDED_GIFTS=1 để bật.
        enableExtendedGiftInfo: process.env.TIKTOK_EXTENDED_GIFTS === "1",
        signApiKey: process.env.TIKTOK_SIGN_API_KEY || undefined,
      }) as unknown as Connection;
      this.connection = connection;
      const on = (event: string, handler: (data: Payload) => void) => connection.on(event, handler as (payload: never) => void);
      on(WebcastEvent.CHAT, (data) => {
        const user = userOf(data);
        const id = msgId(data);
        const text = commentOf(data);
        if (user && id && text !== null) emit({ type: "chat", eventId: `tt:${id}`, user, text });
      });
      on(WebcastEvent.GIFT, (data) => emit(toGiftEvent(data)));
      on(WebcastEvent.LIKE, (data) => {
        const user = userOf(data);
        const id = msgId(data);
        if (user && id) emit({ type: "like", eventId: `tt:${id}`, user, count: likesOf(data) });
      });
      for (const [name, type] of [
        [WebcastEvent.FOLLOW, "follow"],
        [WebcastEvent.SHARE, "share"],
        [WebcastEvent.MEMBER, "member"],
      ] as const) {
        on(name, (data) => {
          const user = userOf(data);
          const id = msgId(data) ?? `${type}:${user?.userId}:${Date.now()}`;
          if (user) emit({ type, eventId: `tt:${id}`, user });
        });
      }
      on(WebcastEvent.ROOM_USER, (data) => {
        const count = viewersOf(data);
        if (count !== null) emit({ type: "viewers", count });
      });
      on(ControlEvent.DISCONNECTED, () => {
        if (!current()) return;
        this.callbacks?.onStatus("disconnected", "Mất kết nối TikTok, đang thử lại.");
        this.scheduleRetry();
      });
      on(WebcastEvent.STREAM_END, () => {
        if (current()) this.callbacks?.onStatus("disconnected", "Phiên live đã kết thúc.");
      });
      on(ControlEvent.ERROR, (error) => {
        if (current()) console.error("[tiktok]", error instanceof Error ? error.message : error);
      });
      await connection.connect();
      if (!current()) {
        await Promise.resolve(connection.disconnect()).catch(() => undefined);
        return;
      }
      this.retryMs = FIRST_RETRY_MS;
      this.callbacks?.onStatus("connected", `Đã nối @${this.username}`);
    } catch (error) {
      if (!current()) return;
      console.error("[tiktok] connect failed:", error instanceof Error ? error.message : error);
      const { message, retry } = describeConnectError(error);
      this.callbacks?.onStatus("error", message);
      if (retry) this.scheduleRetry();
    }
  }
}
