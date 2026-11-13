import type { AudioSettings, GiftMapping, RewardKey, Rules, SpeciesId, Tier, WeatherKind } from "./config";

export interface FishView {
  id: string;
  ownerId: string;
  name: string;
  species: SpeciesId;
  tier: Tier;
  variant: number;
  stage: number;
  growth: number;
  hunger: number;
  status: "alive" | "exhausted";
  crowned: boolean;
  /** Huy hiệu của chủ cá, ví dụ "⚡" khi từng giữ cá sống qua bão. */
  badges: string;
  /** Cá đã hồi xong lượt cắn (từng cắn ít nhất một lần). */
  canBite: boolean;
  shield: boolean;
  boost: boolean;
  immortal: boolean;
  /** Đang giữ lượt "Cắn chết" (quà). */
  killBite: boolean;
  /** Lần cuối chủ cá tương tác (ms server) — Stage dùng để bung nhãn chi tiết. */
  activeAt: number;
}

export interface EggView {
  ownerId: string;
  name: string;
  species: SpeciesId;
  tier: Tier;
  pct: number;
  expiresAt: number;
}

export interface EnvView {
  weather: WeatherKind;
  weatherEndsAt: number;
  night: boolean;
  /** Khi ngày/đêm luân phiên: lúc chuyển pha tiếp theo (0 nếu không luân phiên). */
  phaseEndsAt: number;
  /** 0..100 */
  dirt: number;
  murky: boolean;
  /** Thức ăn trôi trên mặt nước khi mưa; x là 0..1 theo bề ngang bể. */
  drops: { id: string; x: number; expiresAt: number }[];
}

export type ChallengeView =
  | { kind: "clean"; count: number; needed: number; endsAt: number }
  | { kind: "predator"; likes: number; needed: number; endsAt: number; x: number };

export interface Snapshot {
  seq: number;
  now: number;
  live: boolean;
  fish: FishView[];
  eggs: EggView[];
  waiting: number;
  env: EnvView;
  challenge: ChallengeView | null;
  audio: AudioSettings;
  /** Menu quà bên phải Stage. */
  /** image: file ảnh quà thật (engine phục vụ ở /gift-img/<file>), null thì dùng icon phần thưởng. */
  gifts: { giftName: string; coins: number; reward: RewardKey; image: string | null }[];
  top: { name: string; stage: number; growth: number; species: SpeciesId; crowned: boolean }[];
  totals: { hatched: number; died: number; fed: number; gifts: number; coins: number };
  /** Màn chơi hiện tại (tăng mỗi khi có nhà vô địch). */
  round: number;
  /** Cá chúa đang giữ ngôi: giữ tới holdEndsAt (giờ server) thì vô địch. */
  crown: { name: string; holdEndsAt: number } | null;
  /** Nhà vô địch màn trước. */
  champion: { name: string; round: number } | null;
}

export type Fx =
  | { kind: "hatch"; fishId: string; name: string; tier: Tier }
  | { kind: "feed"; fishId: string; amount: number }
  | { kind: "levelup"; fishId: string; stage: number; name: string }
  | { kind: "death"; fishId: string; name: string }
  | { kind: "eggfail"; ownerId: string; name: string }
  | { kind: "warn"; fishId: string; name: string }
  | { kind: "crown"; fishId: string; name: string }
  /** `mc`: cách MC xử lý câu này — gộp chung (hatch/death/warn) hoặc bỏ qua (skip). Mặc định đọc nguyên câu. */
  | { kind: "announce"; text: string; tone: "info" | "gold" | "sad"; mc?: "hatch" | "death" | "warn" | "skip" }
  | { kind: "narrate"; id: string; text: string; file: string | null; priority: number; subtitle: boolean }
  | { kind: "dropEaten"; dropId: string; fishId: string }
  | { kind: "cleaned" }
  | { kind: "predatorWin" }
  | { kind: "predatorLose"; victims: string[] }
  | { kind: "gift"; name: string; giftName: string; reward: RewardKey; count: number; fishId: string | null }
  | { kind: "bite"; attackerId: string; victimId: string; blocked: boolean; missed?: boolean }
  | { kind: "transform"; fishId: string }
  | { kind: "revive"; fishId: string }
  | { kind: "foodRain" }
  | { kind: "champion"; name: string; round: number; how: "crown" | "doom" };

export interface LogEntry {
  at: number;
  kind: "system" | "chat" | "like" | "gift" | "game" | "error";
  text: string;
}

export interface ConnectorStatus {
  kind: "none" | "demo" | "tiktok";
  state: "idle" | "connecting" | "connected" | "disconnected" | "error";
  message: string;
  username: string;
}

export interface VoiceStatus {
  engine: "vieneu" | "macos" | "windows" | "none";
  state: "off" | "ready" | "generating" | "error";
  message: string;
  voices: string[];
  pending: number;
  lastMs: number | null;
}

export interface AdminState {
  voice: VoiceStatus;
  narration: { text: string; priority: number }[];
  audio: AudioSettings;
  connector: ConnectorStatus;
  env: { weather: WeatherKind; night: boolean; dirt: number; challenge: string | null };
  demo: { running: boolean; rate: number };
  rules: Rules;
  gifts: GiftMapping[];
  unmapped: { giftId: number | null; giftName: string; diamonds: number | null; count: number; lastAt: number; image?: string | null }[];
  log: LogEntry[];
  fish: { id: string; name: string; species: SpeciesId; stage: number; growth: number; hunger: number; status: string }[];
  totals: Snapshot["totals"];
}

export type ServerMessage =
  | { type: "snapshot"; snap: Snapshot }
  | { type: "fx"; fx: Fx[] }
  | { type: "admin"; state: AdminState }
  | { type: "ack"; id: number; ok: boolean; error?: string; data?: unknown };

export interface ClientCommand {
  type: "cmd";
  id: number;
  cmd: string;
  args?: Record<string, unknown>;
}
