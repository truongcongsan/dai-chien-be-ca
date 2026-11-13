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
  /** Chỉ cá từ cấp này trở lên mới được làm cá chúa. */
  crownMinStage: number;
  /** Cá chúa giữ vương miện liền chừng này thì vô địch → sang màn mới. */
  championHoldMs: number;

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
  /** Tim cần để đuổi mèo = số cá × hệ số (tối thiểu predatorMinLikes); 0 = luôn predatorMinLikes. */
  predatorLikesPerFish: number;
  predatorMinLikes: number;
  /** Thua thì mèo cào chừng này cá TO NHẤT: có khiên thì mất khiên, không thì −predatorLevelLoss cấp. */
  predatorVictims: number;
  predatorLevelLoss: number;

  // ---- Quà tặng và tấn công (plan mục 5) ----
  /** 1 = quà chưa gán thì quy đổi theo giá kim cương sang phần thưởng gần nhất. */
  giftFallback: number;
  /** 1 = ai có cá cũng comment "cắn @tên" được; 0 = tắt cắn. */
  attackEnabled: number;
  /** Cá tấn công phải hơn ít nhất chừng này cấp. */
  biteStageGap: number;
  /** Cá mới nở có khiên (miễn bị cắn) trong khoảng này. */
  newbieImmuneMs: number;
  /** Cá bị cắn trúng hoặc cắn hụt được tặng khiên trong khoảng này. */
  biteCooldownMs: number;
  /** Cắn trúng thì cá bị cắn mất chừng này cấp; cá ở cấp ≤ số này thì chết. */
  biteLevelLoss: number;
  /** Mỗi cá chỉ được cắn 1 lần trong khoảng này (kể cả cắn trượt). */
  biteAttackCooldownMs: number;
  /** % cú cắn bị trượt. */
  biteMissPct: number;
  /** Cá tấn công được cộng chừng này điểm tăng trưởng. */
  biteGrowth: number;
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
  crownMinStage: 15,
  championHoldMs: 600_000,

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
  cleanPerFish: 0,
  cleanMinNeeded: 10,
  cleanMaxNeeded: 10,
  cleanMaxPerUser: 5,
  rewardGrowth: 5,
  predatorEveryMin: 15,
  predatorWindowMs: 30_000,
  predatorLikesPerFish: 0,
  predatorMinLikes: 200,
  predatorVictims: 3,
  predatorLevelLoss: 5,

  giftFallback: 1,
  attackEnabled: 1,
  biteStageGap: 1,
  newbieImmuneMs: 300_000,
  biteCooldownMs: 300_000,
  biteLevelLoss: 10,
  biteAttackCooldownMs: 90_000,
  biteMissPct: 30,
  biteGrowth: 30,
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
  /**
   * Nơi phát âm thanh (MC, nhạc, hiệu ứng): "stage" = trang Stage (OBS tự phát được);
   * "admin" = trang Admin mở trong Chrome (TikTok LIVE Studio chặn tự phát tiếng trong nguồn link, nên để Admin phát
   * và LIVE Studio thu qua âm thanh hệ thống). Chỉ một nơi phát để không bị vang đôi.
   */
  output: AudioOutput;
}

export type AudioOutput = "stage" | "admin";

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
  output: "stage",
};

// ---------- Quà tặng ----------

export type RewardKey =
  | "food"
  | "hatch"
  | "shield"
  | "rareEgg"
  | "potion"
  | "killBite"
  | "revive"
  | "legendaryEgg"
  | "megaPotion"
  | "foodRain"
  | "doom";

export const REWARDS: Record<RewardKey, { icon: string; name: string; desc: string }> = {
  food: { icon: "🍤", name: "Thức ăn ngon", desc: "+15% đói · +10% lớn" },
  hatch: { icon: "🐣", name: "Nở ngay", desc: "Trứng nở liền" },
  shield: { icon: "🛡️", name: "Khiên", desc: "Chặn 1 cú cắn" },
  rareEgg: { icon: "💎", name: "Trứng hiếm", desc: "Cá hiếm · lớn ×1.5" },
  potion: { icon: "🧪", name: "Tăng 10lv", desc: "Lên thẳng 10 cấp" },
  killBite: { icon: "🗡️", name: "Cắn chết", desc: "Cú cắn tới: chết luôn, không hụt" },
  revive: { icon: "💖", name: "Hồi sinh", desc: "Cứu cá · bất tử 30 phút" },
  legendaryEgg: { icon: "🐉", name: "Trứng rồng", desc: "Cá rồng · lớn ×1.8" },
  megaPotion: { icon: "⚗️", name: "Tăng 35lv", desc: "Lên thẳng 35 cấp" },
  foodRain: { icon: "🍱", name: "Mưa thức ăn", desc: "Cả bể no + lên 5 cấp" },
  doom: { icon: "☄️", name: "Hủy diệt", desc: "Diệt cả bể · vô địch ngay" },
};

export interface GiftMapping {
  /** ID quà TikTok nếu biết; không có thì so theo tên. */
  giftId: number | null;
  giftName: string;
  /** Giá tham khảo (kim cương); dùng để xếp menu và quy đổi quà chưa gán. */
  coins: number;
  reward: RewardKey;
  enabled: boolean;
  /** Ảnh quà thật (file trong data/gift-img do engine tải từ TikTok); thiếu thì menu dùng icon phần thưởng. */
  image?: string | null;
}

/**
 * Bảng mặc định theo mức giá (plan 5.1). ID/giá đã đối chiếu danh sách quà TikTok (11/2026);
 * engine tự cập nhật ID, giá và ảnh theo danh sách quà của phòng mỗi lần kết nối.
 */
export const DEFAULT_GIFTS: GiftMapping[] = [
  { giftId: 5655, giftName: "Rose", coins: 1, reward: "food", enabled: true },
  { giftId: 5487, giftName: "Finger Heart", coins: 5, reward: "hatch", enabled: true },
  { giftId: 5879, giftName: "Doughnut", coins: 30, reward: "shield", enabled: true },
  // Phòng không có quà 50 xu: dùng Capybara (30 xu) cho Trứng hiếm.
  { giftId: 14488, giftName: "Capybara", coins: 30, reward: "rareEgg", enabled: true },
  { giftId: 6097, giftName: "Little Crown", coins: 99, reward: "legendaryEgg", enabled: true },
  { giftId: 5660, giftName: "Hand Heart", coins: 100, reward: "potion", enabled: true },
  { giftId: 5585, giftName: "Confetti", coins: 100, reward: "killBite", enabled: true },
  { giftId: 5582, giftName: "Mishka Bear", coins: 100, reward: "revive", enabled: true },
  { giftId: 6267, giftName: "Corgi", coins: 299, reward: "megaPotion", enabled: true },
  { giftId: 11046, giftName: "Galaxy", coins: 1000, reward: "doom", enabled: true },
];

/** Tăng khi đổi bảng quà mặc định mà bản lưu cũ cần nhận bảng mới (2 = Đại Chiến Bể Cá). */
export const GIFTS_VERSION = 2;

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

/** Giai đoạn hình ảnh: mỗi cấp dùng ảnh của giai đoạn nào (mỗi loài có 1 ảnh cho mỗi giai đoạn). */
export type ArtPhase = "egg" | "fry" | "juvenile" | "teen" | "adult" | "king";

export interface StageInfo {
  name: string;
  /** Chiều dài cá trên Stage 1080px. */
  size: number;
  /** Điểm để lên cấp kế (3 tim = 1 điểm); 0 ở cấp cuối. */
  growthNeed: number;
  art: ArtPhase;
  /** Lên tới cấp này thì thông báo to + nhạc fanfare. */
  announce: boolean;
}

/** Cấp có hình thái cuối cùng (ảnh trưởng thành / cá chúa của cá rồng); từ đây cá vẫn lên cấp nhưng không đổi hình. */
export const FORM_STAGE = 15;

/**
 * Cấp 0..15: lớn dần và đổi hình qua 4 giai đoạn. Lv1–10 rất rẻ (Lv1→10 ≈ 680 tim) để người mới thấy cá lớn nhanh;
 * Lv10–15 tăng dần cho mượt tới mức 240 điểm/cấp của Lv15.
 */
const FORM_STAGES: StageInfo[] = [
  { name: "Trứng", size: 40, growthNeed: 0, art: "egg", announce: false },
  { name: "Cá bột", size: 58, growthNeed: 10, art: "fry", announce: false },
  { name: "Cá bột lớn", size: 66, growthNeed: 12, art: "fry", announce: false },
  { name: "Cá con", size: 76, growthNeed: 15, art: "juvenile", announce: false },
  { name: "Cá con lanh lợi", size: 86, growthNeed: 18, art: "juvenile", announce: false },
  { name: "Cá nhỡ", size: 97, growthNeed: 22, art: "juvenile", announce: true },
  { name: "Cá nhỡ khỏe", size: 108, growthNeed: 27, art: "juvenile", announce: false },
  { name: "Thiếu niên", size: 120, growthNeed: 33, art: "teen", announce: true },
  { name: "Thiếu niên dũng mãnh", size: 132, growthNeed: 40, art: "teen", announce: false },
  { name: "Thiếu niên tinh anh", size: 145, growthNeed: 50, art: "teen", announce: false },
  { name: "Trưởng thành", size: 158, growthNeed: 65, art: "teen", announce: true },
  { name: "Cá lớn", size: 172, growthNeed: 95, art: "adult", announce: true },
  { name: "Cá khổng lồ", size: 186, growthNeed: 125, art: "adult", announce: true },
  { name: "Cá thần", size: 200, growthNeed: 160, art: "adult", announce: true },
  { name: "Cá huyền thoại", size: 214, growthNeed: 200, art: "adult", announce: true },
];

/** Tên bậc từ Lv15 trở lên (hình thái cuối). "Cá chúa" không phải cấp mà là danh hiệu của con cấp cao nhất bể. */
const HIGH_TITLES: [from: number, name: string][] = [
  [15, "Cá vương giả"],
  [30, "Cá bá chủ"],
  [50, "Cá thần thoại"],
  [75, "Cá bất tử"],
  [100, "Cá tối thượng"],
];

/** Kích thước từ Lv15: giữ hình, to vọt ở từng mốc (px chiều dài trên Stage 1080px). */
const HIGH_SIZES: [from: number, size: number][] = [
  [15, 232],
  [20, 275],
  [30, 320],
  [50, 370],
  [100, 440],
];

/**
 * Cấp 0 là trứng (đang nạp tim, chưa vào bể); cá trong bể từ cấp 1 đến MAX_STAGE (100).
 * Lv1–15 đổi hình và to nhanh; Lv15–100 giữ hình thái cuối, chỉ to vọt ở các mốc Lv20/30/50/100 (HIGH_SIZES),
 * mỗi cấp cần 240 điểm + 5 điểm mỗi cấp trên 15; thông báo to mỗi 5 cấp.
 */
export const STAGES: readonly StageInfo[] = [
  ...FORM_STAGES,
  ...Array.from({ length: 100 - FORM_STAGE + 1 }, (_, i): StageInfo => {
    const stage = FORM_STAGE + i;
    const name = HIGH_TITLES.filter(([from]) => stage >= from).pop()![1];
    return {
      name,
      size: HIGH_SIZES.filter(([from]) => stage >= from).pop()![1],
      growthNeed: stage === 100 ? 0 : 240 + (stage - FORM_STAGE) * 5,
      art: "king",
      announce: stage === FORM_STAGE || stage % 5 === 0,
    };
  }),
];
export const MAX_STAGE = STAGES.length - 1;

/** Cá "nhỏ" (tới hết giai đoạn cá con): mèo khều được, bơi sát đáy khi có nguy hiểm. */
export const SMALL_STAGE = 6;
/** Cá ở cấp này trở lên luôn hiện tên kể cả khi bể đông. */
export const NAME_STAGE = 8;
/** Trứng hiếm/trứng rồng nở thẳng lên cấp này (đủ lớn để thấy ngay dáng loài). */
export const GIFT_HATCH_STAGE = 3;

/** "Lv7 · Thiếu niên"; con đội vương miện (cấp cao nhất bể) hiện "Cá chúa". */
export const stageLabel = (stage: number, crowned = false) =>
  stage <= 0 ? STAGES[0].name : `Lv${stage} · ${crowned ? "Cá chúa" : (STAGES[stage]?.name ?? "")}`;

/**
 * Đổi cấp của bản lưu cũ (7 cấp) sang 15 cấp, giữ đúng giai đoạn hình ảnh:
 * bột→1, con→3, nhỡ→5, thiếu niên→7, trưởng thành→10, cá lớn→12, cá chúa cũ→15 (hình thái cuối).
 */
export const LEGACY_STAGE_MAP = [0, 1, 3, 5, 7, 10, 12, 15] as const;

export type Tier = "common" | "rare" | "epic" | "legendary";
export type SpeciesId = "goldfish" | "guppy" | "puffer" | "neon" | "clownfish" | "butterfly" | "betta" | "angelfish" | "seahorse" | "dragonfish";

export interface Species {
  id: SpeciesId;
  name: string;
  tier: Tier;
  /** Ảnh theo cấp 0..MAX_STAGE (chỉ số 0 = trứng), dựng từ ảnh từng giai đoạn bằng artLadder(). */
  textures: string[];
  /** Màu nhuộm cá bột dùng chung. */
  fryTint: number;
  /** Biến thể màu (tint) chọn ngẫu nhiên khi nở. */
  variants: number[];
  /** Mép trên của cá cách tâm bao nhiêu (tính theo chiều dài cá), để đặt nhãn tên sát đầu. */
  labelTop: number;
}

/** Ảnh cho từng cấp 0..MAX_STAGE từ ảnh các giai đoạn của loài (<id>-juvenile/-teen/-adult, cá chúa riêng nếu có). */
function artLadder(egg: string, id: string, king = `${id}-adult`): string[] {
  const byPhase: Record<ArtPhase, string> = { egg, fry: "fish-fry-base", juvenile: `${id}-juvenile`, teen: `${id}-teen`, adult: `${id}-adult`, king };
  return STAGES.map((s) => byPhase[s.art]);
}

export const SPECIES: Record<SpeciesId, Species> = {
  goldfish: {
    id: "goldfish",
    name: "Cá vàng tròn",
    tier: "common",
    textures: artLadder("fish-egg-common", "goldfish"),
    fryTint: 0xffc89a,
    variants: [0xffffff, 0xffe2ee, 0xfff1b8, 0xffd9c4, 0xf2ecff],
    labelTop: 0.46,
  },
  guppy: {
    id: "guppy",
    name: "Cá bảy màu",
    tier: "common",
    textures: artLadder("fish-egg-common", "guppy"),
    fryTint: 0xd4e8ff,
    variants: [0xffffff, 0xffd6ec, 0xd6f0ff, 0xfff0c4],
    labelTop: 0.27,
  },
  puffer: {
    id: "puffer",
    name: "Cá nóc tròn",
    tier: "common",
    textures: artLadder("fish-egg-common", "puffer"),
    fryTint: 0xfff0a8,
    variants: [0xffffff, 0xfff2dc, 0xe8ffdc],
    labelTop: 0.43,
  },
  neon: {
    id: "neon",
    name: "Cá neon",
    tier: "common",
    textures: artLadder("fish-egg-common", "neon"),
    fryTint: 0xdcecff,
    variants: [0xffffff, 0xeef6ff],
    labelTop: 0.22,
  },
  clownfish: {
    id: "clownfish",
    name: "Cá hề",
    tier: "common",
    textures: artLadder("fish-egg-common", "clownfish"),
    fryTint: 0xffc49a,
    variants: [0xffffff, 0xfff0d8, 0xffe0e8],
    labelTop: 0.31,
  },
  butterfly: {
    id: "butterfly",
    name: "Cá bướm vàng",
    tier: "common",
    textures: artLadder("fish-egg-common", "butterfly"),
    fryTint: 0xfff2a0,
    variants: [0xffffff, 0xfff6d8, 0xe8f6ff],
    labelTop: 0.42,
  },
  betta: {
    id: "betta",
    name: "Cá betta đuôi lụa",
    tier: "rare",
    textures: artLadder("fish-egg-rare", "betta"),
    fryTint: 0xffc2cf,
    variants: [0xffffff, 0xd8e4ff, 0xffe6b8],
    labelTop: 0.42,
  },
  angelfish: {
    id: "angelfish",
    name: "Cá thần tiên",
    tier: "rare",
    textures: artLadder("fish-egg-rare", "angelfish"),
    fryTint: 0xe6ecf4,
    variants: [0xffffff, 0xfff0d0, 0xe0ecff],
    labelTop: 0.48,
  },
  seahorse: {
    id: "seahorse",
    name: "Cá ngựa",
    tier: "rare",
    textures: artLadder("fish-egg-rare", "seahorse"),
    fryTint: 0xffd0a8,
    variants: [0xffffff, 0xffe0f0, 0xfff4c0],
    labelTop: 0.48,
  },
  dragonfish: {
    id: "dragonfish",
    name: "Cá rồng ánh kim",
    tier: "legendary",
    textures: artLadder("fish-egg-legendary", "dragonfish", "dragonfish-king"),
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

/** Màu tên + Lv theo bậc cá: thường xám, hiếm xanh, rồng cam. */
export const TIER_COLORS: Record<Tier, string> = {
  common: "#d3d9df",
  rare: "#4da8ff",
  epic: "#c58bff",
  legendary: "#ff9a2e",
};

/** Hệ số tăng trưởng theo bậc: cá hiếm lớn ×1.5, cá rồng ×1.8. */
export const TIER_GROWTH: Record<Tier, number> = {
  common: 1,
  rare: 1.5,
  epic: 1.65,
  legendary: 1.8,
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
