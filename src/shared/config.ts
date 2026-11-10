/** Luật chơi bể cá (docs/plan-be-ca-hanh-phuc.md mục 3). Mọi số đều chỉnh được từ Admin. */
export interface Rules {
  /** Số like cần để đầy thanh thả trứng. */
  likesToHatch: number;
  /** Trứng không đủ like trong thời gian này thì vỡ. */
  eggTimeoutMs: number;
  /** Sau khi trứng vỡ, chờ bấy lâu mới được thử lại. */
  eggRetryCooldownMs: number;
  /** Số trứng nạp tim cùng lúc; thêm người thì vào hàng chờ. */
  maxCharging: number;
  maxFish: number;
  /** % đói mất mỗi phút. */
  hungerPerMin: number;
  feedHunger: number;
  feedGrowth: number;
  feedCooldownMs: number;
  /**
   * Thả tim là cách chính để cá lớn: mỗi chừng này like = +1 điểm tăng trưởng (một cấp cần 100–150 điểm,
   * nên 3 like/điểm ≈ 300–450 tim một cấp). Cầu vồng và Thuốc lớn nhân thêm như khi cho ăn.
   */
  likesPerGrowth: number;
  /** Trần điểm tăng trưởng từ like mỗi phút cho một con cá; 0 = không giới hạn. */
  likeGrowthCapPerMin: number;
  /** Mỗi chừng này like = +1% no (cá được thả tim thì không đói); 0 = tắt, chỉ comment "ăn" mới no. */
  likesPerHunger: number;
  /** Đói về 0 thì kiệt sức chừng này, cho ăn kịp thì sống. */
  exhaustedMs: number;
  warnHunger: number;
  crownCooldownMs: number;

  // ---- Thời tiết, ngày đêm, thử thách (plan mục 12) ----
  /** 1 = tự chạy lịch thời tiết và thử thách; 0 = chỉ khi Admin bấm. */
  autoEvents: number;
  /** 0 tắt (luôn ngày), 1 theo giờ thật 20h–5h, 2 luân phiên dayMinutes/nightMinutes, 3 luôn đêm. */
  nightMode: number;
  dayMinutes: number;
  nightMinutes: number;
  /** Phút nghỉ giữa hai đợt thời tiết (ngẫu nhiên ±30%). */
  weatherEveryMin: number;
  /** Tỷ lệ % đợt thời tiết là bão thay vì mưa. */
  stormChance: number;
  rainMs: number;
  rainbowMs: number;
  stormMs: number;
  stormWarnMs: number;
  /** Thức ăn rơi theo mưa: comment "đớp" để ăn. */
  dropHunger: number;
  dropGrowth: number;
  /** % bẩn tăng mỗi phút cho mỗi con cá. */
  dirtPerFishPerMin: number;
  /** Bẩn tới mức này thì nước đục (đói ×1,5) và mở thử thách dọn bể. */
  dirtyAt: number;
  cleanWindowMs: number;
  /** Số lượt "dọn" cần = số cá × hệ số này, kẹp trong [cleanMinNeeded, cleanMaxNeeded]. */
  cleanPerFish: number;
  cleanMinNeeded: number;
  cleanMaxNeeded: number;
  cleanMaxPerUser: number;
  rewardGrowth: number;
  predatorEveryMin: number;
  predatorWindowMs: number;
  /** Tim cần để đuổi mèo = số cá × hệ số (tối thiểu predatorMinLikes). */
  predatorLikesPerFish: number;
  predatorMinLikes: number;
  /** Thua thì tối đa chừng này cá nhỏ (cấp ≤ 3) mất 30% tăng trưởng. */
  predatorVictims: number;

  // ---- Quà tặng và tấn công (plan mục 5) ----
  /** 1 = quà chưa gán thì quy đổi theo giá kim cương sang phần thưởng gần nhất. */
  giftFallback: number;
  /** 1 = bật răng nanh / cắn; 0 = răng nanh đổi thành thức ăn ngon. */
  attackEnabled: number;
  /** Cá tấn công phải hơn ít nhất chừng này cấp. */
  biteStageGap: number;
  newbieImmuneMs: number;
  /** Một cá chỉ bị cắn tối đa 1 lần trong khoảng này. */
  biteCooldownMs: number;
  /** Cá tấn công được cộng chừng này điểm tăng trưởng. */
  biteGrowth: number;
  /** Có răng mà không ra lệnh "cắn @tên" thì sau chừng này cá tự cắn. */
  biteAutoMs: number;
  /** Lần thả trứng sau khi bị cắn chết chỉ cần (100 − %) tim. */
  eggDiscountPct: number;
  shieldMs: number;
  potionMs: number;
  immortalMs: number;
  reviveWindowMs: number;
}

export const DEFAULT_RULES: Rules = {
  likesToHatch: 60,
  eggTimeoutMs: 90_000,
  eggRetryCooldownMs: 30_000,
  maxCharging: 8,
  maxFish: 60,
  hungerPerMin: 5,
  feedHunger: 5,
  feedGrowth: 5,
  feedCooldownMs: 20_000,
  likesPerGrowth: 3,
  likeGrowthCapPerMin: 0,
  likesPerHunger: 10,
  exhaustedMs: 30_000,
  warnHunger: 15,
  crownCooldownMs: 60_000,

  autoEvents: 1,
  nightMode: 2,
  dayMinutes: 7,
  nightMinutes: 3,
  weatherEveryMin: 10,
  stormChance: 25,
  rainMs: 150_000,
  rainbowMs: 120_000,
  stormMs: 90_000,
  stormWarnMs: 20_000,
  dropHunger: 10,
  dropGrowth: 5,
  dirtPerFishPerMin: 0.06,
  dirtyAt: 70,
  cleanWindowMs: 60_000,
  cleanPerFish: 2.5,
  cleanMinNeeded: 25,
  cleanMaxNeeded: 150,
  cleanMaxPerUser: 5,
  rewardGrowth: 5,
  predatorEveryMin: 15,
  predatorWindowMs: 30_000,
  predatorLikesPerFish: 30,
  predatorMinLikes: 500,
  predatorVictims: 3,

  giftFallback: 1,
  attackEnabled: 1,
  biteStageGap: 2,
  newbieImmuneMs: 300_000,
  biteCooldownMs: 600_000,
  biteGrowth: 30,
  biteAutoMs: 30_000,
  eggDiscountPct: 50,
  shieldMs: 600_000,
  potionMs: 300_000,
  immortalMs: 1_800_000,
  reviveWindowMs: 60_000,
};

// ---------- Âm thanh & MC ----------

export interface AudioSettings {
  /** MC đọc giọng. */
  mc: boolean;
  /** Tên giọng (VieNeu hoặc macOS). Rỗng = giọng đầu tiên tìm được. */
  voice: string;
  /** Hiện phụ đề cho câu MC không có thông báo đi kèm. */
  subtitles: boolean;
  /** Bao lâu MC nhắc cách chơi khi bể yên ắng (giây, 0 = tắt). */
  ambientSec: number;
  music: boolean;
  bgm: number;
  sfx: number;
  voiceVol: number;
  /** Nhạc nhỏ xuống còn chừng này khi MC nói. */
  duck: number;
}

export const DEFAULT_AUDIO: AudioSettings = {
  mc: true,
  voice: "",
  subtitles: true,
  ambientSec: 75,
  music: true,
  bgm: 0.4,
  sfx: 0.8,
  voiceVol: 1,
  duck: 0.3,
};

// ---------- Quà tặng ----------

export type RewardKey = "food" | "hatch" | "shield" | "potion" | "bite" | "rareEgg" | "foodRain" | "revive" | "legendaryEgg";

export const REWARDS: Record<RewardKey, { icon: string; name: string; desc: string }> = {
  food: { icon: "🍤", name: "Thức ăn ngon", desc: "+15% đói · +10% lớn" },
  hatch: { icon: "🐣", name: "Nở ngay", desc: "Trứng nở liền" },
  shield: { icon: "🛡️", name: "Khiên", desc: "Chặn 1 cú cắn" },
  potion: { icon: "🧪", name: "Thuốc lớn", desc: "×2 tăng trưởng 5 phút" },
  bite: { icon: "🦷", name: "Răng nanh", desc: "Cắn cá nhỏ hơn" },
  rareEgg: { icon: "💎", name: "Trứng hiếm", desc: "Betta · thần tiên · cá ngựa" },
  foodRain: { icon: "🍱", name: "Mưa thức ăn", desc: "Cả bể +20% đói" },
  revive: { icon: "💖", name: "Hồi sinh", desc: "Cứu cá · bất tử 30 phút" },
  legendaryEgg: { icon: "🐉", name: "Trứng rồng", desc: "Cá rồng ánh kim" },
};

export interface GiftMapping {
  /** ID quà TikTok nếu biết; không có thì so theo tên. */
  giftId: number | null;
  giftName: string;
  /** Giá tham khảo (kim cương); dùng để xếp menu và quy đổi quà chưa gán. */
  coins: number;
  reward: RewardKey;
  enabled: boolean;
}

/**
 * Bảng mặc định theo mức giá (plan 5.1). Tên/giá quà TikTok đổi theo khu vực:
 * phải xác minh lại trong Admin với danh sách quà thật của phòng.
 */
export const DEFAULT_GIFTS: GiftMapping[] = [
  { giftId: 5655, giftName: "Rose", coins: 1, reward: "food", enabled: true },
  { giftId: null, giftName: "Finger Heart", coins: 5, reward: "hatch", enabled: true },
  { giftId: null, giftName: "Doughnut", coins: 30, reward: "shield", enabled: true },
  { giftId: null, giftName: "Hand Hearts", coins: 100, reward: "potion", enabled: true },
  { giftId: null, giftName: "Confetti", coins: 100, reward: "bite", enabled: true },
  { giftId: null, giftName: "Sunglasses", coins: 199, reward: "rareEgg", enabled: true },
  { giftId: null, giftName: "Corgi", coins: 299, reward: "foodRain", enabled: true },
  { giftId: null, giftName: "Money Gun", coins: 500, reward: "revive", enabled: true },
  { giftId: null, giftName: "Galaxy", coins: 1000, reward: "legendaryEgg", enabled: true },
];

/** Tìm phần thưởng cho một món quà: theo ID, rồi theo tên, rồi (nếu bật) theo giá. */
export function matchGift(gifts: GiftMapping[], giftId: number | null, giftName: string, diamonds: number | null, fallback: boolean) {
  const on = gifts.filter((g) => g.enabled);
  const byId = giftId !== null ? on.find((g) => g.giftId === giftId) : undefined;
  if (byId) return { mapping: byId, guessed: false };
  const name = normalize(giftName);
  const byName = name ? on.find((g) => normalize(g.giftName) === name) : undefined;
  if (byName) return { mapping: byName, guessed: false };
  if (!fallback || !on.length) return null;
  const price = diamonds ?? 1;
  const cheaper = on.filter((g) => g.coins <= price).sort((a, b) => b.coins - a.coins)[0];
  return { mapping: cheaper ?? [...on].sort((a, b) => a.coins - b.coins)[0], guessed: true };
}

export type WeatherKind = "sun" | "rain" | "rainbow" | "stormWarn" | "storm";

export const WEATHER_INFO: Record<WeatherKind, { icon: string; name: string }> = {
  sun: { icon: "☀️", name: "Nắng" },
  rain: { icon: "🌧️", name: "Mưa" },
  rainbow: { icon: "🌈", name: "Cầu vồng" },
  stormWarn: { icon: "⚠️", name: "Bão sắp tới" },
  storm: { icon: "⛈️", name: "Bão" },
};

/** Cấp 0 là trứng (đang nạp tim, chưa vào bể); cá trong bể từ cấp 1 đến MAX_STAGE. size = chiều dài cá trên Stage 1080px. */
export const STAGES = [
  { name: "Trứng", size: 40, growthNeed: 0 },
  { name: "Cá bột", size: 60, growthNeed: 100 },
  { name: "Cá con", size: 78, growthNeed: 100 },
  { name: "Cá nhỡ", size: 98, growthNeed: 110 },
  { name: "Thiếu niên", size: 122, growthNeed: 120 },
  { name: "Trưởng thành", size: 150, growthNeed: 130 },
  { name: "Cá lớn", size: 182, growthNeed: 150 },
  { name: "Cá chúa", size: 224, growthNeed: 0 },
] as const;
export const MAX_STAGE = STAGES.length - 1;

export type Tier = "common" | "rare" | "epic" | "legendary";
export type SpeciesId = "goldfish" | "guppy" | "puffer" | "neon" | "betta" | "angelfish" | "seahorse" | "dragonfish";

export interface Species {
  id: SpeciesId;
  name: string;
  tier: Tier;
  /** Ảnh theo cấp 1..7 (chỉ số 0 = trứng). */
  textures: string[];
  /** Màu nhuộm cá bột dùng chung. */
  fryTint: number;
  /** Biến thể màu (tint) chọn ngẫu nhiên khi nở. */
  variants: number[];
  /** Mép trên của cá cách tâm bao nhiêu (tính theo chiều dài cá), để đặt nhãn tên sát đầu. */
  labelTop: number;
}

export const SPECIES: Record<SpeciesId, Species> = {
  goldfish: {
    id: "goldfish",
    name: "Cá vàng tròn",
    tier: "common",
    textures: ["fish-egg-common", "fish-fry-base", "goldfish-juvenile", "goldfish-juvenile", "goldfish-teen", "goldfish-teen", "goldfish-adult", "goldfish-adult"],
    fryTint: 0xffc89a,
    variants: [0xffffff, 0xffe2ee, 0xfff1b8, 0xffd9c4, 0xf2ecff],
    labelTop: 0.46,
  },
  guppy: {
    id: "guppy",
    name: "Cá bảy màu",
    tier: "common",
    textures: ["fish-egg-common", "fish-fry-base", "guppy-juvenile", "guppy-juvenile", "guppy-teen", "guppy-teen", "guppy-adult", "guppy-adult"],
    fryTint: 0xd4e8ff,
    variants: [0xffffff, 0xffd6ec, 0xd6f0ff, 0xfff0c4],
    labelTop: 0.27,
  },
  puffer: {
    id: "puffer",
    name: "Cá nóc tròn",
    tier: "common",
    textures: ["fish-egg-common", "fish-fry-base", "puffer-juvenile", "puffer-juvenile", "puffer-teen", "puffer-teen", "puffer-adult", "puffer-adult"],
    fryTint: 0xfff0a8,
    variants: [0xffffff, 0xfff2dc, 0xe8ffdc],
    labelTop: 0.43,
  },
  neon: {
    id: "neon",
    name: "Cá neon",
    tier: "common",
    textures: ["fish-egg-common", "fish-fry-base", "neon-juvenile", "neon-juvenile", "neon-teen", "neon-teen", "neon-adult", "neon-adult"],
    fryTint: 0xdcecff,
    variants: [0xffffff, 0xeef6ff],
    labelTop: 0.22,
  },
  betta: {
    id: "betta",
    name: "Cá betta đuôi lụa",
    tier: "rare",
    textures: ["fish-egg-rare", "fish-fry-base", "betta-juvenile", "betta-juvenile", "betta-teen", "betta-teen", "betta-adult", "betta-adult"],
    fryTint: 0xffc2cf,
    variants: [0xffffff, 0xd8e4ff, 0xffe6b8],
    labelTop: 0.42,
  },
  angelfish: {
    id: "angelfish",
    name: "Cá thần tiên",
    tier: "rare",
    textures: ["fish-egg-rare", "fish-fry-base", "angelfish-juvenile", "angelfish-juvenile", "angelfish-teen", "angelfish-teen", "angelfish-adult", "angelfish-adult"],
    fryTint: 0xe6ecf4,
    variants: [0xffffff, 0xfff0d0, 0xe0ecff],
    labelTop: 0.48,
  },
  seahorse: {
    id: "seahorse",
    name: "Cá ngựa",
    tier: "rare",
    textures: ["fish-egg-rare", "fish-fry-base", "seahorse-juvenile", "seahorse-juvenile", "seahorse-teen", "seahorse-teen", "seahorse-adult", "seahorse-adult"],
    fryTint: 0xffd0a8,
    variants: [0xffffff, 0xffe0f0, 0xfff4c0],
    labelTop: 0.48,
  },
  dragonfish: {
    id: "dragonfish",
    name: "Cá rồng ánh kim",
    tier: "legendary",
    textures: ["fish-egg-legendary", "fish-fry-base", "dragonfish-juvenile", "dragonfish-juvenile", "dragonfish-teen", "dragonfish-teen", "dragonfish-adult", "dragonfish-king"],
    fryTint: 0xfbe39a,
    variants: [0xffffff],
    labelTop: 0.4,
  },
};

/** Loài cá thường: nở ngẫu nhiên khi người xem comment "cá" / thả tim. */
export const COMMON_SPECIES = (Object.keys(SPECIES) as SpeciesId[]).filter((id) => SPECIES[id].tier === "common");

export function randomCommonSpecies(): SpeciesId {
  return COMMON_SPECIES[Math.floor(Math.random() * COMMON_SPECIES.length)];
}

/** Loài hiếm: nở từ quà Trứng hiếm. */
export const RARE_SPECIES = (Object.keys(SPECIES) as SpeciesId[]).filter((id) => SPECIES[id].tier === "rare");

/** Chọn ngẫu nhiên một loài hiếm, khác loài đang có (nếu được) để quà luôn đổi được dáng cá. */
export function randomRareSpecies(except?: SpeciesId): SpeciesId {
  const pool = RARE_SPECIES.filter((id) => id !== except);
  const list = pool.length ? pool : RARE_SPECIES;
  return list[Math.floor(Math.random() * list.length)];
}

export const TIER_COLORS: Record<Tier, string> = {
  common: "#ffffff",
  rare: "#7fd4ff",
  epic: "#d59bff",
  legendary: "#ffd54a",
};

export const FISH_TEXTURES = [...new Set(Object.values(SPECIES).flatMap((s) => s.textures))];

/** Chuẩn hóa comment: bỏ dấu, viết thường, gộp khoảng trắng. */
export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "cắn @tên" → tên mục tiêu đã chuẩn hóa (bỏ @). */
export function parseBite(text: string): string | null {
  const m = normalize(text).match(/^(can|cap|🦷)\s+@?(.+)$/);
  return m ? m[2].trim() : null;
}

export type Command = "egg" | "feed" | "snap" | "clean" | null;

export function parseCommand(text: string): Command {
  const t = normalize(text);
  if (/^(ca|tha ca|nuoi ca|🐠|🐡)$/.test(t)) return "egg";
  if (/^(an|cho an|cho ca an|🐟|🍤|🦐)$/.test(t)) return "feed";
  if (/^(dop|dop moi|dop di|🪲|🐛)$/.test(t)) return "snap";
  if (/^(don|don be|don dep|lau be|🧽|🧹)$/.test(t)) return "clean";
  return null;
}
