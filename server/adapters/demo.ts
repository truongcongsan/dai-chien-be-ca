import type { GiftMapping } from "../../src/shared/config";
import type { SourceAdapter, SourceCallbacks, SourceEvent, SourceUser } from "./source";

const FIRST = ["Mai", "Lan", "Hùng", "Tú", "Vy", "Nam", "Linh", "Khoa", "Trang", "Bảo", "Ngọc", "Phúc", "Hà", "Minh", "Thảo", "Duy", "Yến", "Quân", "Nhi", "Long"];
const LAST = ["", " Béo", " Xinh", " 99", " Cute", " Sài Gòn", " Hà Nội", "_tt", " Mập", " Kool"];

interface Tapper {
  user: SourceUser;
  /** Like còn định thả; có người bỏ cuộc giữa chừng. */
  left: number;
}

/**
 * Giả lập người xem: comment "cá", nhấp tim theo từng đợt, rồi quay lại cho ăn.
 * Một phần người chơi bỏ đi giữa chừng để thấy cá đói, kiệt sức và chết.
 */
export class DemoAdapter implements SourceAdapter {
  running = false;
  /** Số hành động mỗi giây (xấp xỉ). */
  rate = 3;
  private callbacks: SourceCallbacks | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private counter = 0;
  readonly users: SourceUser[] = [];
  private readonly tappers = new Map<string, Tapper>();
  /** Người chơi đang chăm cá; khi rời đi thì không cho ăn nữa. */
  private readonly keepers = new Map<string, { user: SourceUser; care: number }>();

  constructor(
    private readonly peek: () => { challenge: "clean" | "predator" | null; drops: number } = () => ({ challenge: null, drops: 0 }),
    private readonly gifts: (() => GiftMapping[]) | null = null,
  ) {
    for (let i = 0; i < 200; i++) {
      const name = `${FIRST[i % FIRST.length]}${LAST[Math.floor(i / FIRST.length) % LAST.length]}`;
      this.users.push({ userId: `demo-${i}`, uniqueId: `demo${i}`, name });
    }
  }

  start(callbacks: SourceCallbacks) {
    this.callbacks = callbacks;
    callbacks.onStatus("connected", "Demo Mode: đang mô phỏng người xem");
    this.setRunning(true);
  }

  stop() {
    this.setRunning(false);
    this.callbacks = null;
  }

  setRunning(running: boolean) {
    this.running = running;
    if (this.timer) clearInterval(this.timer);
    this.timer = running ? setInterval(() => this.tick(), 250) : null;
  }

  private id() {
    return `demo:${Date.now()}:${this.counter++}`;
  }

  private emit(event: SourceEvent) {
    this.callbacks?.onEvent(event);
  }

  private pick() {
    return this.users[Math.floor(Math.random() * this.users.length)];
  }

  private tick() {
    // Người đang nạp trứng thả tim theo lô như TikTok gửi.
    for (const t of [...this.tappers.values()]) {
      if (Math.random() < 0.55) continue;
      const count = Math.min(t.left, 3 + Math.floor(Math.random() * 9));
      t.left -= count;
      this.emit({ type: "like", eventId: this.id(), user: t.user, count });
      if (t.left <= 0) {
        this.tappers.delete(t.user.userId);
        this.keepers.set(t.user.userId, { user: t.user, care: Math.random() });
      }
    }
    this.react();
    if (Math.random() > this.rate / 4) return;
    const roll = Math.random();
    if (roll < 0.25) this.newPlayer(this.pick());
    else if (roll < 0.9) {
      const list = [...this.keepers.values()];
      const k = list[Math.floor(Math.random() * list.length)];
      // care thấp = hay quên chăm; người chăm chủ yếu thả tim (cá lớn + no), thỉnh thoảng comment "ăn".
      if (k && Math.random() < k.care) {
        if (Math.random() < 0.75) this.emit({ type: "like", eventId: this.id(), user: k.user, count: 10 + Math.floor(Math.random() * 40) });
        else this.emit({ type: "chat", eventId: this.id(), user: k.user, text: Math.random() < 0.8 ? "ăn" : "cho ăn" });
      }
      if (k && Math.random() < 0.01) this.keepers.delete(k.user.userId);
    } else {
      const list = [...this.keepers.values()];
      const k = list[Math.floor(Math.random() * list.length)];
      if (k) this.emit({ type: "like", eventId: this.id(), user: k.user, count: 5 + Math.floor(Math.random() * 25) });
    }
  }

  /** Người chơi giả phản ứng với thử thách: phần lớn tham gia, nhưng không phải ai cũng nhanh. */
  private react() {
    const { challenge, drops } = this.peek();
    const keepers = [...this.keepers.values()];
    const anyone = () => (keepers.length && Math.random() < 0.7 ? keepers[Math.floor(Math.random() * keepers.length)].user : this.pick());
    if (challenge === "clean" && Math.random() < 0.35 * Math.min(2, this.rate / 3)) {
      this.emit({ type: "chat", eventId: this.id(), user: anyone(), text: "dọn" });
    } else if (challenge === "predator" && Math.random() < 0.5 * Math.min(2, this.rate / 3)) {
      this.emit({ type: "like", eventId: this.id(), user: anyone(), count: 8 + Math.floor(Math.random() * 25) });
    }
    // Thỉnh thoảng có người tặng quà; quà rẻ hay gặp hơn quà đắt.
    if (this.gifts && keepers.length && Math.random() < 0.012 * Math.min(2, this.rate / 3)) {
      const list = this.gifts().filter((g) => g.enabled);
      const weights = list.map((g) => 1 / Math.sqrt(g.coins || 1));
      let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
      const g = list.find((_, i) => (roll -= weights[i]) <= 0) ?? list[0];
      const giver = Math.random() < 0.8 ? keepers[Math.floor(Math.random() * keepers.length)].user : this.pick();
      if (g) this.emit({ type: "gift", eventKey: this.id(), user: giver, giftId: g.giftId, giftName: g.giftName, count: g.coins <= 1 ? 1 + Math.floor(Math.random() * 5) : 1, diamonds: g.coins });
    }
    if (drops && keepers.length && Math.random() < 0.06) {
      this.emit({ type: "chat", eventId: this.id(), user: keepers[Math.floor(Math.random() * keepers.length)].user, text: "đớp" });
    }
  }

  /** Comment "cá" rồi nhấp tim; 15% bỏ cuộc trước khi đầy. */
  newPlayer(user: SourceUser) {
    if (this.tappers.has(user.userId) || this.keepers.has(user.userId)) return;
    this.emit({ type: "chat", eventId: this.id(), user, text: "cá" });
    this.tappers.set(user.userId, { user, left: Math.random() < 0.15 ? 25 : 70 });
  }

  /** Lệnh Admin: thả nhanh N người chơi mới. */
  joinMany(count: number) {
    const fresh = this.users.filter((u) => !this.tappers.has(u.userId) && !this.keepers.has(u.userId));
    fresh.sort(() => Math.random() - 0.5).slice(0, count).forEach((u, i) => setTimeout(() => this.newPlayer(u), i * 120));
  }

  /** Lệnh Admin: mọi người đang chăm cá cùng cho ăn. */
  feedAll() {
    [...this.keepers.values()].forEach((k, i) => setTimeout(() => this.emit({ type: "chat", eventId: this.id(), user: k.user, text: "ăn" }), i * 30));
  }

  forget(userId: string) {
    this.keepers.delete(userId);
    this.tappers.delete(userId);
  }
}
