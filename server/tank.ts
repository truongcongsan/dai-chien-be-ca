import {
  DEFAULT_AUDIO,
  DEFAULT_GIFTS,
  DEFAULT_RULES,
  MAX_STAGE,
  REWARDS,
  SPECIES,
  STAGES,
  matchGift,
  normalize,
  parseBite,
  parseCommand,
  randomCommonSpecies,
  randomRareSpecies,
  type AudioSettings,
  type GiftMapping,
  type RewardKey,
  type Rules,
  type SpeciesId,
  type WeatherKind,
} from "../src/shared/config";
import type { AdminState, ChallengeView, EggView, FishView, Fx, LogEntry, Snapshot } from "../src/shared/protocol";
import type { SourceEvent, SourceUser } from "./adapters/source";

export interface Fish {
  id: string;
  ownerId: string;
  name: string;
  species: SpeciesId;
  variant: number;
  stage: number;
  /** Điểm tăng trưởng trong cấp hiện tại; đủ STAGES[stage].growthNeed thì lên cấp. */
  growth: number;
  hunger: number;
  status: "alive" | "exhausted";
  bornAt: number;
  exhaustedFor: number;
  lastFedAt: number;
  activeAt: number;
  warned: boolean;
  likeCarry: number;
  likeWindowStart: number;
  likeWindowGrowth: number;
  /** Tim dư chưa đủ đổi thành +1% no (có thể thiếu ở dữ liệu cũ). */
  likeHungerCarry?: number;
  // Quà tặng (có thể thiếu ở dữ liệu cũ)
  shieldUntil?: number;
  shieldCharges?: number;
  boostUntil?: number;
  immortalUntil?: number;
  bites?: number;
  biteAutoAt?: number;
  lastBittenAt?: number;
}

interface Egg {
  ownerId: string;
  name: string;
  species: SpeciesId;
  likes: number;
  /** Số tim cần (giảm khi vừa bị cắn chết). */
  need: number;
  startedAt: number;
  expiresAt: number;
}

interface Owner {
  id: string;
  name: string;
  bestStage: number;
  raised: number;
  retryAt: number;
  /** Số lần giữ cá sống qua bão. */
  storms?: number;
  uniqueId?: string;
  /** Quà tặng lúc chưa có cá, dùng ngay khi cá nở. */
  pending?: RewardKey[];
  /** % giảm tim cho lần thả trứng tới (sau khi bị cắn chết). */
  eggDiscount?: number;
  /** Cá vừa chết, giữ lại để quà Hồi sinh cứu trong reviveWindowMs. */
  lastDead?: { fish: Fish; at: number };
}

interface Saved {
  fish: Fish[];
  owners: Owner[];
  totals: Snapshot["totals"];
  nextId: number;
  dirt?: number;
}

const BITE_AUTO_RETRY = 30_000;

type Challenge =
  | { kind: "clean"; count: number; needed: number; endsAt: number; by: Map<string, number> }
  | { kind: "predator"; likes: number; needed: number; endsAt: number; x: number; by: Set<string> };

const MIN = 60_000;
const jitter = (base: number, spread: number) => base * (1 - spread + Math.random() * spread * 2);

const SEEN_LIMIT = 5000;

type FeedOpts = { hunger?: number; growth?: number; ignoreCooldown?: boolean; quiet?: boolean };

/**
 * Toàn bộ luật bể cá. Không tự đọc đồng hồ: mọi hàm nhận `now` để test được và để
 * thời gian chỉ trôi khi đang LIVE (plan mục 3.2).
 */
export class Tank {
  rules: Rules = { ...DEFAULT_RULES };
  readonly fish = new Map<string, Fish>();
  readonly eggs = new Map<string, Egg>();
  readonly owners = new Map<string, Owner>();
  /** Người chờ thả trứng; tim họ thả trong lúc chờ được giữ lại (`likes`). */
  waiting: { ownerId: string; name: string; species: SpeciesId; likes: number }[] = [];
  live = true;
  totals = { hatched: 0, died: 0, fed: 0, gifts: 0, coins: 0 };
  gifts: GiftMapping[] = DEFAULT_GIFTS.map((g) => ({ ...g }));
  audio: AudioSettings = { ...DEFAULT_AUDIO };
  /** Quà không có trong bảng (để Admin gán). */
  readonly unmapped = new Map<string, { giftId: number | null; giftName: string; diamonds: number | null; count: number; lastAt: number }>();
  log: LogEntry[] = [];
  crownId: string | null = null;
  private crownAt = 0;
  private lastTick: number | null = null;
  private seq = 0;
  private dirty = true;
  private nextId = 1;
  private fx: Fx[] = [];
  private readonly seen = new Set<string>();

  // Môi trường (plan mục 12)
  weather: WeatherKind = "sun";
  weatherEndsAt = 0;
  dirt = 0;
  challenge: Challenge | null = null;
  drops: { id: string; x: number; expiresAt: number }[] = [];
  private nextWeatherAt: number | null = null;
  private nextPredatorAt: number | null = null;
  private nextDropAt = 0;
  private cleanRetryAt = 0;
  private stormSurvivors: Set<string> | null = null;
  private wasNight: boolean | null = null;

  // ---------- đầu vào ----------

  handle(event: SourceEvent, now: number) {
    if ("eventId" in event && this.isDuplicate(event.eventId)) return;
    if (event.type === "gift") {
      if (this.isDuplicate(event.eventKey)) return;
      this.gift(event.user, event.giftId, event.giftName, event.count, event.diamonds, now);
      return;
    }
    if (event.type === "chat") {
      const target = parseBite(event.text);
      if (target) {
        this.biteByName(event.user, target, now);
        return;
      }
      const cmd = parseCommand(event.text);
      if (cmd === "egg") this.startEgg(event.user, now);
      else if (cmd === "feed") this.feed(event.user, now);
      else if (cmd === "snap") this.snap(event.user, now);
      else if (cmd === "clean") this.cleanVote(event.user, now);
    } else if (event.type === "like") {
      this.addLikes(event.user, event.count, now);
    }
  }

  private isDuplicate(id: string) {
    if (this.seen.has(id)) return true;
    this.seen.add(id);
    if (this.seen.size > SEEN_LIMIT) this.seen.delete(this.seen.values().next().value as string);
    return false;
  }

  private owner(user: SourceUser) {
    let o = this.owners.get(user.userId);
    if (!o) {
      o = { id: user.userId, name: user.name, bestStage: 0, raised: 0, retryAt: 0 };
      this.owners.set(user.userId, o);
    }
    o.name = user.name;
    o.uniqueId = user.uniqueId;
    return o;
  }

  fishOf(ownerId: string) {
    for (const f of this.fish.values()) if (f.ownerId === ownerId) return f;
    return null;
  }

  /** Mở trứng nạp tim. Trả về lý do khi không mở được (để Admin/test đọc). */
  startEgg(user: SourceUser, now: number, species: SpeciesId = randomCommonSpecies()): string {
    const o = this.owner(user);
    if (this.fishOf(o.id)) return "đã có cá";
    if (this.eggs.has(o.id)) return "đang có trứng";
    if (this.waiting.some((w) => w.ownerId === o.id)) return "đang chờ";
    if (o.retryAt > now) return "đang hồi";
    if (!this.hasRoom()) {
      this.waiting.push({ ownerId: o.id, name: o.name, species, likes: 0 });
      this.dirty = true;
      return "vào hàng chờ";
    }
    this.openEgg(o.id, o.name, species, now);
    return "ok";
  }

  private hasRoom() {
    return this.eggs.size < this.rules.maxCharging && this.fish.size + this.eggs.size < this.rules.maxFish;
  }

  private openEgg(ownerId: string, name: string, species: SpeciesId, now: number, likes = 0) {
    const o = this.owners.get(ownerId);
    const need = Math.max(1, Math.round(this.rules.likesToHatch * (1 - (o?.eggDiscount ?? 0) / 100)));
    if (o) o.eggDiscount = 0;
    this.eggs.set(ownerId, { ownerId, name, species, likes, need, startedAt: now, expiresAt: now + this.rules.eggTimeoutMs });
    this.dirty = true;
    this.addLog("game", `${name} bắt đầu nạp trứng`);
  }

  addLikes(user: SourceUser, count: number, now: number) {
    if (count <= 0) return;
    // Đang có mèo: mọi lượt tim của cả phòng đều góp vào thanh đuổi mèo.
    const c = this.challenge;
    if (c?.kind === "predator") {
      c.likes += count;
      c.by.add(user.userId);
      this.dirty = true;
      if (c.likes >= c.needed) this.predatorWin(now);
    }
    const fish = this.fishOf(user.userId);
    if (fish) {
      fish.activeAt = now;
      this.likeGrowth(fish, count, now);
      return;
    }
    // Lần thả tim đầu tiên của người chưa có cá cũng mở trứng (plan 3.1).
    if (!this.eggs.has(user.userId)) this.startEgg(user, now);
    const egg = this.eggs.get(user.userId);
    if (!egg) {
      // Đang chờ: giữ tim lại, mở trứng là được tính ngay.
      const w = this.waiting.find((x) => x.ownerId === user.userId);
      if (w) w.likes += count;
      return;
    }
    egg.likes += count;
    this.dirty = true;
    if (egg.likes >= egg.need) this.hatch(egg, now);
  }

  private likeGrowth(fish: Fish, count: number, now: number) {
    if (now - fish.likeWindowStart >= 60_000) {
      fish.likeWindowStart = now;
      fish.likeWindowGrowth = 0;
    }
    const r = this.rules;
    // Tim cũng cho cá no: người chỉ thả tim không phải comment "ăn" mới giữ được cá.
    if (r.likesPerHunger > 0) {
      fish.likeHungerCarry = (fish.likeHungerCarry ?? 0) + count;
      const fed = Math.floor(fish.likeHungerCarry / r.likesPerHunger);
      fish.likeHungerCarry -= fed * r.likesPerHunger;
      if (fed > 0) {
        fish.hunger = Math.min(100, fish.hunger + fed);
        if (fish.status === "exhausted") {
          fish.status = "alive";
          fish.exhaustedFor = 0;
          this.fx.push({ kind: "announce", text: `💚 ${fish.name} thả tim cứu kịp bé cá!`, tone: "info" });
        }
        if (fish.hunger > r.warnHunger) fish.warned = false;
        this.dirty = true;
      }
    }
    if (r.likesPerGrowth <= 0) return;
    fish.likeCarry += count;
    const units = Math.floor(fish.likeCarry / r.likesPerGrowth);
    fish.likeCarry -= units * r.likesPerGrowth;
    const room = r.likeGrowthCapPerMin > 0 ? r.likeGrowthCapPerMin - fish.likeWindowGrowth : Number.POSITIVE_INFINITY;
    const add = Math.min(units, Math.max(0, room));
    if (add > 0) {
      fish.likeWindowGrowth += add;
      const boost = (fish.boostUntil ?? 0) > now ? 2 : 1;
      this.grow(fish, add * this.growthMul() * boost);
    }
  }

  /** Nở ngay (dùng cho quà tặng sau này và lệnh Admin). */
  hatchNow(user: SourceUser, now: number, species: SpeciesId = randomCommonSpecies()) {
    const o = this.owner(user);
    if (this.fishOf(o.id)) return null;
    this.waiting = this.waiting.filter((w) => w.ownerId !== o.id);
    const egg = this.eggs.get(o.id) ?? { ownerId: o.id, name: o.name, species, likes: 0, need: 0, startedAt: now, expiresAt: now };
    egg.species = species;
    return this.hatch(egg, now);
  }

  private hatch(egg: Egg, now: number) {
    this.eggs.delete(egg.ownerId);
    const spec = SPECIES[egg.species];
    const fish: Fish = {
      id: `f${this.nextId++}`,
      ownerId: egg.ownerId,
      name: egg.name,
      species: egg.species,
      variant: spec.variants[Math.floor(Math.random() * spec.variants.length)],
      stage: 1,
      growth: 0,
      hunger: 100,
      status: "alive",
      bornAt: now,
      exhaustedFor: 0,
      lastFedAt: 0,
      activeAt: now,
      warned: false,
      likeCarry: 0,
      likeWindowStart: now,
      likeWindowGrowth: 0,
    };
    this.fish.set(fish.id, fish);
    const o = this.owners.get(egg.ownerId);
    if (o) {
      o.raised++;
      o.bestStage = Math.max(o.bestStage, 1);
    }
    this.totals.hatched++;
    this.dirty = true;
    this.fx.push({ kind: "hatch", fishId: fish.id, name: fish.name, tier: spec.tier });
    this.fx.push({ kind: "announce", text: `🐣 Chào mừng bé ${spec.name.toLowerCase()} của ${fish.name}!`, tone: spec.tier === "common" ? "info" : "gold", mc: spec.tier === "common" ? "hatch" : undefined });
    this.addLog("game", `${fish.name} nở ${spec.name}`);
    // Quà tặng trước khi có cá giờ mới dùng.
    if (o?.pending?.length) {
      const pending = o.pending;
      o.pending = [];
      for (const r of pending) this.applyToFish(fish, r, 1, now);
    }
    this.promoteWaiting(now);
    return fish;
  }

  feed(user: SourceUser, now: number, opts: FeedOpts = {}) {
    const fish = this.fishOf(user.userId);
    if (!fish) return "chưa có cá";
    return this.feedFish(fish, now, opts);
  }

  feedFish(fish: Fish, now: number, opts: FeedOpts = {}) {
    fish.activeAt = now;
    if (!opts.ignoreCooldown && fish.lastFedAt && now - fish.lastFedAt < this.rules.feedCooldownMs) return "đang hồi";
    if (!opts.ignoreCooldown) fish.lastFedAt = now;
    const addHunger = opts.hunger ?? this.rules.feedHunger;
    fish.hunger = Math.min(100, fish.hunger + addHunger);
    if (fish.status === "exhausted") {
      fish.status = "alive";
      fish.exhaustedFor = 0;
      this.fx.push({ kind: "announce", text: `💚 ${fish.name} đã cứu kịp bé cá!`, tone: "info" });
    }
    if (fish.hunger > this.rules.warnHunger) fish.warned = false;
    this.totals.fed++;
    if (!opts.quiet) this.fx.push({ kind: "feed", fishId: fish.id, amount: addHunger });
    const boost = (fish.boostUntil ?? 0) > now ? 2 : 1;
    this.grow(fish, (opts.growth ?? this.rules.feedGrowth) * this.growthMul() * boost);
    this.dirty = true;
    return "ok";
  }

  private grow(fish: Fish, amount: number) {
    if (fish.stage >= MAX_STAGE) return;
    fish.growth += amount;
    this.dirty = true;
    while (fish.stage < MAX_STAGE && fish.growth >= STAGES[fish.stage].growthNeed) {
      fish.growth -= STAGES[fish.stage].growthNeed;
      fish.stage++;
      const o = this.owners.get(fish.ownerId);
      if (o) o.bestStage = Math.max(o.bestStage, fish.stage);
      this.fx.push({ kind: "levelup", fishId: fish.id, stage: fish.stage, name: fish.name });
      if (fish.stage >= 5) this.fx.push({ kind: "announce", text: `🎉 Cá của ${fish.name} lớn thành ${STAGES[fish.stage].name}!`, tone: "gold" });
      this.addLog("game", `${fish.name} lên ${STAGES[fish.stage].name}`);
    }
    if (fish.stage >= MAX_STAGE) fish.growth = 0;
  }

  // ---------- thời gian ----------

  setLive(live: boolean, now: number) {
    if (live === this.live) return;
    this.live = live;
    this.lastTick = now;
    this.dirty = true;
  }

  tick(now: number) {
    const dt = this.lastTick === null ? 0 : Math.max(0, now - this.lastTick);
    this.lastTick = now;
    if (!this.live) {
      // Đóng băng: trứng cũng không hết hạn khi tắt live.
      for (const egg of this.eggs.values()) egg.expiresAt += dt;
      return;
    }
    for (const egg of [...this.eggs.values()]) {
      if (now < egg.expiresAt) continue;
      this.eggs.delete(egg.ownerId);
      const o = this.owners.get(egg.ownerId);
      if (o) o.retryAt = now + this.rules.eggRetryCooldownMs;
      this.fx.push({ kind: "eggfail", ownerId: egg.ownerId, name: egg.name });
      this.addLog("game", `Trứng của ${egg.name} vỡ (không đủ tim)`);
      this.dirty = true;
    }
    this.promoteWaiting(now);

    this.tickEnv(now, dt);

    const loss = (this.rules.hungerPerMin * dt * this.hungerMul(now)) / 60_000;
    for (const fish of [...this.fish.values()]) {
      if ((fish.immortalUntil ?? 0) > now) continue; // Bất tử: không đói.
      if (fish.status === "alive") {
        const before = Math.ceil(fish.hunger);
        fish.hunger = Math.max(0, fish.hunger - loss);
        if (Math.ceil(fish.hunger) !== before) this.dirty = true;
        if (!fish.warned && fish.hunger <= this.rules.warnHunger) {
          fish.warned = true;
          this.fx.push({ kind: "warn", fishId: fish.id, name: fish.name });
          this.fx.push({ kind: "announce", text: `😵 Cá của ${fish.name} sắp đói lả, thả tim ❤️ cứu đi!`, tone: "sad", mc: "warn" });
        }
        if (fish.hunger <= 0) {
          fish.status = "exhausted";
          fish.exhaustedFor = 0;
          this.dirty = true;
        }
      } else {
        fish.exhaustedFor += dt;
        if (fish.exhaustedFor >= this.rules.exhaustedMs) this.kill(fish, now);
      }
    }
    this.tickGifts(now);
    this.updateCrown(now);
  }

  // ---------- môi trường: thời tiết, đêm, nước bẩn, thử thách ----------

  isNight(now: number) {
    switch (this.rules.nightMode) {
      case 1: {
        const h = new Date(now).getHours();
        return h >= 20 || h < 5;
      }
      case 2: {
        const { day, cycle } = this.dayCycle();
        return (now / MIN) % cycle >= day;
      }
      case 3:
        return true;
      default:
        return false;
    }
  }

  private dayCycle() {
    const day = Math.max(0.5, this.rules.dayMinutes);
    const night = Math.max(0.5, this.rules.nightMinutes);
    return { day, night, cycle: day + night };
  }

  /** Lúc ngày/đêm hiện tại kết thúc (chỉ có ở chế độ luân phiên). */
  dayPhaseEndsAt(now: number) {
    if (this.rules.nightMode !== 2) return 0;
    const { day, cycle } = this.dayCycle();
    const t = (now / MIN) % cycle;
    return now + ((t >= day ? cycle : day) - t) * MIN;
  }

  get murky() {
    return this.dirt >= this.rules.dirtyAt;
  }

  /** Bão ×2, nước đục ×1,5, ban đêm ×0,5. */
  hungerMul(now: number) {
    return (this.weather === "storm" ? 2 : 1) * (this.murky ? 1.5 : 1) * (this.isNight(now) ? 0.5 : 1);
  }

  growthMul() {
    return this.weather === "rainbow" ? 1.5 : 1;
  }

  private tickEnv(now: number, dt: number) {
    const auto = this.rules.autoEvents > 0;
    if (this.nextWeatherAt === null) this.nextWeatherAt = now + 3 * MIN;
    if (this.nextPredatorAt === null) this.nextPredatorAt = now + 8 * MIN;

    const night = this.isNight(now);
    if (this.wasNight !== null && night !== this.wasNight) {
      this.fx.push({ kind: "announce", text: night ? "🌙 Trời tối rồi, cá đi ngủ — đói chậm lại" : "🌅 Trời sáng rồi, cá thức dậy!", tone: "info" });
      this.dirty = true;
    }
    this.wasNight = night;

    // Bể càng đông càng mau bẩn.
    const before = Math.floor(this.dirt);
    this.dirt = Math.min(100, this.dirt + (this.rules.dirtPerFishPerMin * this.fish.size * dt) / MIN);
    if (Math.floor(this.dirt) !== before) this.dirty = true;

    if (this.weather !== "sun" && now >= this.weatherEndsAt) this.endWeather(now);
    if (auto && this.weather === "sun" && now >= this.nextWeatherAt) {
      if (this.challenge) this.nextWeatherAt = now + MIN;
      else this.startWeather(Math.random() * 100 < this.rules.stormChance ? "stormWarn" : "rain", now);
    }

    // Mưa thả côn trùng xuống mặt nước, từng con một.
    const alive = this.drops.filter((d) => d.expiresAt > now);
    if (alive.length !== this.drops.length) this.dirty = true;
    this.drops = this.weather === "rain" ? alive : [];
    if (this.weather === "rain" && !this.drops.length && now >= this.nextDropAt) {
      this.drops.push({ id: `d${this.nextId++}`, x: 0.12 + Math.random() * 0.76, expiresAt: now + 12_000 });
      this.nextDropAt = now + 8_000 + Math.random() * 6_000;
      this.dirty = true;
    }

    const c = this.challenge;
    if (c && now >= c.endsAt) {
      if (c.kind === "clean") this.cleanFail(now);
      else this.predatorLose(now);
    }
    if (!this.challenge && auto && this.fish.size > 0) {
      if (this.murky && now >= this.cleanRetryAt) this.startCleanup(now);
      else if (now >= this.nextPredatorAt && this.fish.size >= 3 && this.weather !== "storm" && this.weather !== "stormWarn") this.startPredator(now);
    }
  }

  startWeather(kind: WeatherKind, now: number) {
    this.weather = kind;
    this.dirty = true;
    const r = this.rules;
    if (kind === "sun") {
      this.weatherEndsAt = 0;
      this.nextWeatherAt = now + jitter(r.weatherEveryMin * MIN, 0.3);
      this.stormSurvivors = null;
      return;
    }
    const ms = { rain: r.rainMs, rainbow: r.rainbowMs, stormWarn: r.stormWarnMs, storm: r.stormMs }[kind];
    this.weatherEndsAt = now + ms;
    if (kind === "rain") {
      this.nextDropAt = now + 4_000;
      this.fx.push({ kind: "announce", text: "🌧️ Trời mưa! Côn trùng rơi xuống — comment “đớp” để cá mình ăn trước!", tone: "info" });
    } else if (kind === "rainbow") {
      this.fx.push({ kind: "announce", text: "🌈 Cầu vồng! Thả tim lúc này cá lớn ×1,5", tone: "gold" });
    } else if (kind === "stormWarn") {
      this.fx.push({ kind: "announce", text: "⚠️ Bão sắp tới! Cho cá ăn no đi nào!", tone: "sad" });
    } else {
      this.stormSurvivors = new Set([...this.fish.values()].filter((f) => f.status === "alive").map((f) => f.id));
      this.fx.push({ kind: "announce", text: "⛈️ Bão tới! Cá đói nhanh gấp đôi — giữ cá sống để nhận huy hiệu ⚡", tone: "sad" });
    }
    this.addLog("game", `Thời tiết: ${kind}`);
  }

  private endWeather(now: number) {
    if (this.weather === "rain") return this.startWeather("rainbow", now);
    if (this.weather === "stormWarn") return this.startWeather("storm", now);
    if (this.weather === "storm" && this.stormSurvivors) {
      let n = 0;
      for (const id of this.stormSurvivors) {
        const f = this.fish.get(id);
        const o = f && this.owners.get(f.ownerId);
        if (!o) continue;
        o.storms = (o.storms ?? 0) + 1;
        n++;
      }
      if (n) this.fx.push({ kind: "announce", text: `⚡ ${n} bé cá đã sống sót qua bão — chủ cá nhận huy hiệu ⚡`, tone: "gold" });
    }
    this.startWeather("sun", now);
  }

  /** Comment "đớp" khi mưa: cá của người nhanh tay ăn con côn trùng đang trôi. */
  snap(user: SourceUser, now: number) {
    const fish = this.fishOf(user.userId);
    const drop = this.drops[0];
    if (!fish || !drop) return "không có gì để đớp";
    this.drops.shift();
    this.fx.push({ kind: "dropEaten", dropId: drop.id, fishId: fish.id });
    this.feed(user, now, { hunger: this.rules.dropHunger, growth: this.rules.dropGrowth, ignoreCooldown: true, quiet: true });
    this.fx.push({ kind: "announce", text: `🪲 ${fish.name} đớp được côn trùng!`, tone: "info", mc: "skip" });
    return "ok";
  }

  startCleanup(now: number) {
    if (this.challenge) return false;
    const r = this.rules;
    const needed = Math.round(Math.min(Math.max(r.cleanMinNeeded, r.cleanMaxNeeded), Math.max(r.cleanMinNeeded, this.fish.size * r.cleanPerFish)));
    this.challenge = { kind: "clean", count: 0, needed, endsAt: now + this.rules.cleanWindowMs, by: new Map() };
    this.dirty = true;
    this.fx.push({ kind: "announce", text: "🧽 Bể bẩn quá! Cả phòng comment “dọn” để làm sạch!", tone: "sad" });
    this.addLog("game", `Thử thách dọn bể: cần ${needed} lượt`);
    return true;
  }

  cleanVote(user: SourceUser, now: number) {
    const c = this.challenge;
    if (c?.kind !== "clean") return "không có thử thách";
    const n = c.by.get(user.userId) ?? 0;
    if (n >= this.rules.cleanMaxPerUser) return "đủ lượt";
    c.by.set(user.userId, n + 1);
    c.count++;
    this.dirty = true;
    const fish = this.fishOf(user.userId);
    if (fish) fish.activeAt = now;
    if (c.count >= c.needed) {
      this.challenge = null;
      this.dirt = 0;
      this.cleanRetryAt = now;
      const helped = this.reward(c.by.keys());
      this.fx.push({ kind: "cleaned" });
      this.fx.push({ kind: "announce", text: `✨ Bể sạch bong! Cảm ơn ${c.by.size} bạn đã dọn${helped ? ` — ${helped} bé cá được +${this.rules.rewardGrowth}% tăng trưởng` : ""}`, tone: "gold" });
      this.addLog("game", `Dọn bể thành công (${c.by.size} người)`);
    }
    return "ok";
  }

  private cleanFail(now: number) {
    this.challenge = null;
    this.cleanRetryAt = now + 2 * MIN;
    this.dirty = true;
    this.fx.push({ kind: "announce", text: "😣 Chưa dọn kịp, nước vẫn đục… 2 phút nữa thử lại nhé", tone: "sad" });
    this.addLog("game", "Dọn bể thất bại");
  }

  startPredator(now: number) {
    if (this.challenge) return false;
    const r = this.rules;
    const needed = Math.round(Math.max(r.predatorMinLikes, this.fish.size * r.predatorLikesPerFish));
    this.challenge = { kind: "predator", likes: 0, needed, endsAt: now + r.predatorWindowMs, x: 0.2 + Math.random() * 0.6, by: new Set() };
    this.nextPredatorAt = now + jitter(r.predatorEveryMin * MIN, 0.2);
    this.dirty = true;
    this.fx.push({ kind: "announce", text: "🐱 Mèo thò tay vào bể! Cả phòng thả tim ❤️ đuổi mèo đi!", tone: "sad" });
    this.addLog("game", `Mèo xuất hiện: cần ${needed} tim`);
    return true;
  }

  private predatorWin(now: number) {
    const c = this.challenge;
    if (c?.kind !== "predator") return;
    this.challenge = null;
    const helped = this.reward(c.by);
    this.fx.push({ kind: "predatorWin" });
    this.fx.push({ kind: "announce", text: `😾 Mèo chạy mất rồi! Cảm ơn ${c.by.size} bạn thả tim${helped ? ` — ${helped} bé cá được +${this.rules.rewardGrowth}%` : ""}`, tone: "gold" });
    this.addLog("game", `Đuổi mèo thành công (${c.by.size} người)`);
    void now;
  }

  private predatorLose(now: number) {
    this.challenge = null;
    this.dirty = true;
    const small = [...this.fish.values()].filter((f) => f.stage <= 3 && f.growth > 0).sort(() => Math.random() - 0.5);
    const victims = small.slice(0, this.rules.predatorVictims);
    for (const f of victims) f.growth = Math.max(0, f.growth - STAGES[f.stage].growthNeed * 0.3);
    this.fx.push({ kind: "predatorLose", victims: victims.map((f) => f.id) });
    this.fx.push({
      kind: "announce",
      text: victims.length ? `😿 Mèo khều mất tăng trưởng của ${victims.length} bé cá nhỏ…` : "🐱 Mèo bỏ đi tay không",
      tone: "sad",
    });
    this.addLog("game", `Đuổi mèo thất bại, ${victims.length} cá bị khều`);
    void now;
  }

  // ---------- quà tặng (plan mục 5) ----------

  gift(user: SourceUser, giftId: number | null, giftName: string, count: number, diamonds: number | null, now: number) {
    const found = matchGift(this.gifts, giftId, giftName, diamonds, this.rules.giftFallback > 0);
    const key = giftId !== null ? `id:${giftId}` : `name:${normalize(giftName)}`;
    const known = found && !found.guessed;
    if (!known) {
      const u = this.unmapped.get(key) ?? { giftId, giftName, diamonds, count: 0, lastAt: now };
      u.count += count;
      u.lastAt = now;
      this.unmapped.set(key, u);
    }
    if (!found) {
      this.addLog("gift", `${user.name} tặng ${giftName} ×${count} (chưa gán phần thưởng)`);
      return null;
    }
    const n = Math.max(1, Math.min(50, count));
    const reward = found.mapping.reward;
    this.totals.gifts += n;
    this.totals.coins += (diamonds ?? found.mapping.coins) * n;
    this.addLog("gift", `${user.name} tặng ${giftName} ×${n} → ${REWARDS[reward].name}${found.guessed ? " (quy đổi theo giá)" : ""}`);
    const fish = this.applyReward(user, reward, n, now, giftName);
    this.fx.push({ kind: "gift", name: user.name, giftName, reward, count: n, fishId: fish?.id ?? null });
    this.dirty = true;
    return reward;
  }

  /** Trao phần thưởng; trả về cá nhận quà (nếu có). */
  applyReward(user: SourceUser, reward: RewardKey, n: number, now: number, giftName = REWARDS[reward].name): Fish | null {
    const o = this.owner(user);
    let fish = this.fishOf(o.id);
    const thanks = (text: string) =>
      this.fx.push({ kind: "announce", text: `🎁 ${o.name} tặng ${giftName}${n > 1 ? ` ×${n}` : ""}: ${text}`, tone: "gold" });

    if (reward === "legendaryEgg") {
      if (fish) {
        fish.species = "dragonfish";
        fish.variant = 0xffffff;
        this.fx.push({ kind: "transform", fishId: fish.id });
        thanks("cá hóa rồng ánh kim! 🐉");
      } else {
        fish = this.hatchNow(user, now, "dragonfish");
        if (fish) fish.stage = Math.max(fish.stage, 2);
        thanks("nở cá rồng ánh kim! 🐉");
      }
      return fish;
    }
    if (reward === "rareEgg") {
      if (fish && SPECIES[fish.species].tier === "legendary") {
        reward = "food"; // Cá rồng không bị "hạ bậc": đổi thành thức ăn ngon.
      } else {
        const species = randomRareSpecies(fish?.species);
        const spec = SPECIES[species];
        if (fish) {
          fish.species = species;
          fish.variant = spec.variants[Math.floor(Math.random() * spec.variants.length)];
          this.fx.push({ kind: "transform", fishId: fish.id });
          thanks(`cá hóa ${spec.name.toLowerCase()}! 💎`);
        } else {
          fish = this.hatchNow(user, now, species);
          if (fish) fish.stage = Math.max(fish.stage, 2);
          thanks(`nở ${spec.name.toLowerCase()}! 💎`);
        }
        if (fish && n > 1) this.applyToFish(fish, "food", n - 1, now);
        this.dirty = true;
        return fish;
      }
    }
    if (reward === "foodRain") {
      for (const f of this.fish.values()) {
        f.hunger = Math.min(100, f.hunger + 20 * Math.min(n, 3));
        if (f.status === "exhausted") (f.status = "alive"), (f.exhaustedFor = 0);
        f.warned = false;
      }
      this.fx.push({ kind: "foodRain" });
      thanks("cả bể được ăn no! 🍱");
      return fish;
    }
    if (reward === "hatch") {
      if (!fish) {
        fish = this.hatchNow(user, now, this.eggs.get(o.id)?.species ?? randomCommonSpecies());
        thanks("trứng nở liền! 🐣");
        if (fish && n > 1) this.applyToFish(fish, "food", n - 1, now);
        return fish;
      }
      reward = "food"; // Đã có cá: đổi thành thức ăn ngon.
    }
    if (reward === "revive" && !fish && o.lastDead && now - o.lastDead.at <= this.rules.reviveWindowMs && !this.eggs.has(o.id)) {
      const back: Fish = { ...o.lastDead.fish, status: "alive", hunger: 60, exhaustedFor: 0, warned: false, immortalUntil: now + this.rules.immortalMs, activeAt: now };
      o.lastDead = undefined;
      this.fish.set(back.id, back);
      this.totals.died = Math.max(0, this.totals.died - 1);
      this.fx.push({ kind: "revive", fishId: back.id });
      thanks("cá sống lại rồi! 💖");
      this.dirty = true;
      return back;
    }
    if (!fish) {
      if (reward === "food") {
        // Chưa có cá: thức ăn ngon nạp sẵn nửa thanh tim cho trứng.
        if (!this.eggs.has(o.id)) this.startEgg(user, now);
        const egg = this.eggs.get(o.id);
        if (egg) {
          egg.likes += Math.ceil(egg.need * 0.5) * n;
          thanks("trứng được nạp tim! ❤️");
          if (egg.likes >= egg.need) return this.hatch(egg, now);
        }
        return null;
      }
      o.pending = [...(o.pending ?? []), ...Array<RewardKey>(Math.min(n, 5)).fill(reward)].slice(-10);
      thanks(`${REWARDS[reward].name} sẽ dùng ngay khi cá nở`);
      return null;
    }
    this.applyToFish(fish, reward, n, now);
    thanks(`${REWARDS[reward].icon} ${REWARDS[reward].desc}`);
    return fish;
  }

  applyToFish(fish: Fish, reward: RewardKey, n: number, now: number): void {
    const r = this.rules;
    fish.activeAt = now;
    this.dirty = true;
    switch (reward) {
      case "food":
      case "hatch":
        for (let i = 0; i < Math.min(n, 10); i++) this.feedFish(fish, now, { hunger: 15, growth: 10, ignoreCooldown: true, quiet: i > 0 });
        break;
      case "shield": {
        const active = (fish.shieldUntil ?? 0) > now ? (fish.shieldCharges ?? 0) : 0;
        fish.shieldCharges = Math.min(3, active + n);
        fish.shieldUntil = now + r.shieldMs;
        break;
      }
      case "potion":
        fish.boostUntil = Math.max(now, fish.boostUntil ?? 0) + r.potionMs * Math.min(n, 6);
        this.grow(fish, 20 * Math.min(n, 5));
        break;
      case "bite":
        if (!r.attackEnabled) {
          this.applyToFish(fish, "food", n, now);
          return;
        }
        fish.bites = Math.min(3, (fish.bites ?? 0) + n);
        fish.biteAutoAt = now + r.biteAutoMs;
        this.fx.push({ kind: "announce", text: `🦷 ${fish.name} có răng nanh! Comment "cắn @tên" để cắn cá nhỏ hơn`, tone: "info" });
        break;
      case "revive":
        if (fish.status === "exhausted") {
          fish.status = "alive";
          fish.exhaustedFor = 0;
          fish.hunger = Math.max(fish.hunger, 60);
          this.fx.push({ kind: "revive", fishId: fish.id });
        }
        fish.immortalUntil = Math.max(now, fish.immortalUntil ?? 0) + r.immortalMs * Math.min(n, 3);
        break;
      default:
        break;
    }
  }

  // ---------- tấn công ----------

  private findByName(target: string) {
    const t = normalize(target);
    const list = [...this.fish.values()];
    const exact = list.find((f) => {
      const o = this.owners.get(f.ownerId);
      return normalize(o?.uniqueId ?? "") === t || normalize(f.name) === t;
    });
    return exact ?? list.find((f) => normalize(f.name).startsWith(t) || normalize(this.owners.get(f.ownerId)?.uniqueId ?? "").startsWith(t)) ?? null;
  }

  biteByName(user: SourceUser, target: string, now: number) {
    const att = this.fishOf(user.userId);
    if (!att || !(att.bites ?? 0)) return "không có răng";
    const vic = this.findByName(target);
    if (!vic) return "không thấy cá";
    return this.resolveBite(att, vic, now);
  }

  /** Lý do cá `vic` chưa bị cắn được (null = cắn được). */
  private biteBlock(att: Fish, vic: Fish, now: number) {
    const r = this.rules;
    if (vic.id === att.id) return "chính mình";
    if (att.stage < vic.stage + r.biteStageGap) return "chưa đủ lớn";
    if (now - vic.bornAt < r.newbieImmuneMs) return "cá mới";
    if ((vic.immortalUntil ?? 0) > now) return "bất tử";
    if (vic.lastBittenAt && now - vic.lastBittenAt < r.biteCooldownMs) return "vừa bị cắn";
    return null;
  }

  resolveBite(att: Fish, vic: Fish, now: number) {
    if (!this.rules.attackEnabled) return "tắt";
    const block = this.biteBlock(att, vic, now);
    if (block) {
      const why: Record<string, string> = {
        "chưa đủ lớn": `phải lớn hơn ít nhất ${this.rules.biteStageGap} cấp`,
        "cá mới": "cá mới nở đang được bảo vệ",
        "bất tử": "cá đang bất tử",
        "vừa bị cắn": "cá vừa bị cắn, đang được bảo vệ",
        "chính mình": "không tự cắn được",
      };
      this.fx.push({ kind: "announce", text: `🦷 ${att.name} chưa cắn được ${vic.name}: ${why[block]}`, tone: "info", mc: "skip" });
      return block;
    }
    att.bites = Math.max(0, (att.bites ?? 0) - 1);
    att.biteAutoAt = att.bites ? now + this.rules.biteAutoMs : 0;
    att.activeAt = now;
    vic.lastBittenAt = now;
    this.dirty = true;
    if ((vic.shieldUntil ?? 0) > now && (vic.shieldCharges ?? 0) > 0) {
      vic.shieldCharges = (vic.shieldCharges ?? 1) - 1;
      if (!vic.shieldCharges) vic.shieldUntil = 0;
      this.fx.push({ kind: "bite", attackerId: att.id, victimId: vic.id, blocked: true });
      this.fx.push({ kind: "announce", text: `🛡️ Khiên của ${vic.name} chặn cú cắn của ${att.name}!`, tone: "gold" });
      this.addLog("game", `${att.name} cắn ${vic.name} — bị khiên chặn`);
      return "khiên";
    }
    this.fx.push({ kind: "bite", attackerId: att.id, victimId: vic.id, blocked: false });
    const o = this.owners.get(vic.ownerId);
    if (o) o.eggDiscount = this.rules.eggDiscountPct;
    this.kill(vic, now, `🦈 ${att.name} đớp mất cá của ${vic.name}!`);
    this.fx.push({ kind: "announce", text: `🥚 ${vic.name} thả trứng lại chỉ cần ${100 - this.rules.eggDiscountPct}% tim`, tone: "info", mc: "skip" });
    this.grow(att, this.rules.biteGrowth);
    this.addLog("game", `${att.name} cắn chết cá của ${vic.name}`);
    return "ok";
  }

  /** Có răng mà không ra lệnh thì tự cắn một cá nhỏ hơn không có khiên. */
  private tickGifts(now: number) {
    for (const f of this.fish.values()) {
      if ((f.shieldUntil ?? 0) && (f.shieldUntil ?? 0) <= now) (f.shieldUntil = 0), (f.shieldCharges = 0), (this.dirty = true);
      if ((f.boostUntil ?? 0) && (f.boostUntil ?? 0) <= now) (f.boostUntil = 0), (this.dirty = true);
      if ((f.immortalUntil ?? 0) && (f.immortalUntil ?? 0) <= now) (f.immortalUntil = 0), (this.dirty = true);
    }
    if (!this.rules.attackEnabled) return;
    for (const att of [...this.fish.values()]) {
      if (!(att.bites ?? 0) || !att.biteAutoAt || now < att.biteAutoAt || !this.fish.has(att.id)) continue;
      const prey = [...this.fish.values()].filter((v) => !this.biteBlock(att, v, now) && !((v.shieldUntil ?? 0) > now));
      if (!prey.length) {
        att.biteAutoAt = now + BITE_AUTO_RETRY;
        continue;
      }
      this.resolveBite(att, prey[Math.floor(Math.random() * prey.length)], now);
    }
  }

  /** Thưởng tăng trưởng cho cá của những người đã góp sức; trả về số cá được thưởng. */
  private reward(userIds: Iterable<string>) {
    let n = 0;
    for (const id of userIds) {
      const f = this.fishOf(id);
      if (!f) continue;
      this.grow(f, this.rules.rewardGrowth);
      n++;
    }
    return n;
  }

  kill(fish: Fish, now: number, message?: string) {
    this.fish.delete(fish.id);
    this.totals.died++;
    this.dirty = true;
    const o = this.owners.get(fish.ownerId);
    if (o) o.lastDead = { fish: { ...fish }, at: now };
    this.fx.push({ kind: "death", fishId: fish.id, name: fish.name });
    this.fx.push({ kind: "announce", text: message ?? `🫧 Cá của ${fish.name} đã về trời…`, tone: "sad", mc: message ? undefined : "death" });
    this.addLog("game", `Cá của ${fish.name} chết (cấp ${fish.stage})`);
    if (this.crownId === fish.id) this.crownId = null;
    this.promoteWaiting(now);
  }

  private promoteWaiting(now: number) {
    const ready: Egg[] = [];
    while (this.waiting.length && this.hasRoom()) {
      const next = this.waiting.shift()!;
      if (this.fishOf(next.ownerId) || this.eggs.has(next.ownerId)) continue;
      this.openEgg(next.ownerId, next.name, next.species, now, next.likes);
      const egg = this.eggs.get(next.ownerId)!;
      if (egg.likes >= egg.need) ready.push(egg);
    }
    // Ai đã nhấp đủ tim trong lúc chờ thì nở luôn.
    for (const egg of ready) if (this.eggs.get(egg.ownerId) === egg) this.hatch(egg, now);
  }

  private rank(f: Fish) {
    const need = STAGES[f.stage].growthNeed || 1;
    return f.stage * 1000 + (f.growth / need) * 999;
  }

  /** Cá to nhất: cấp → % tăng trưởng → cá già hơn. */
  ranked() {
    return [...this.fish.values()].sort((a, b) => this.rank(b) - this.rank(a) || a.bornAt - b.bornAt);
  }

  private updateCrown(now: number) {
    const best = this.ranked()[0];
    if (!best || best.id === this.crownId) return;
    const current = this.crownId ? this.fish.get(this.crownId) : null;
    if (current && this.rank(best) <= this.rank(current)) return;
    // Cùng cấp thì chờ cooldown để vương miện không nhảy qua lại; hơn hẳn một cấp thì đổi ngay.
    if (current && best.stage === current.stage && now - this.crownAt < this.rules.crownCooldownMs) return;
    this.crownId = best.id;
    this.crownAt = now;
    this.dirty = true;
    if (best.stage >= 2) {
      this.fx.push({ kind: "crown", fishId: best.id, name: best.name });
      this.fx.push({ kind: "announce", text: `👑 ${best.name} là vua bể mới!`, tone: "gold" });
    }
  }

  // ---------- đầu ra ----------

  takeFx() {
    const out = this.fx;
    this.fx = [];
    return out;
  }

  takeDirty() {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }

  addLog(kind: LogEntry["kind"], text: string) {
    this.log.unshift({ at: Date.now(), kind, text });
    if (this.log.length > 300) this.log.length = 300;
  }

  fishView(f: Fish): FishView {
    const need = STAGES[f.stage].growthNeed;
    return {
      id: f.id,
      ownerId: f.ownerId,
      name: f.name,
      species: f.species,
      tier: SPECIES[f.species].tier,
      variant: f.variant,
      stage: f.stage,
      growth: need ? Math.min(100, Math.round((f.growth / need) * 100)) : 100,
      hunger: Math.round(f.hunger),
      status: f.status,
      crowned: f.id === this.crownId,
      badges: (this.owners.get(f.ownerId)?.storms ?? 0) > 0 ? "⚡" : "",
      shield: (f.shieldUntil ?? 0) > this.lastNow && (f.shieldCharges ?? 0) > 0,
      boost: (f.boostUntil ?? 0) > this.lastNow,
      immortal: (f.immortalUntil ?? 0) > this.lastNow,
      bites: f.bites ?? 0,
      activeAt: f.activeAt,
    };
  }

  /** Thời điểm snapshot gần nhất, để fishView biết khiên/thuốc còn hiệu lực. */
  private lastNow = 0;

  snapshot(now: number): Snapshot {
    this.lastNow = now;
    const eggs: EggView[] = [...this.eggs.values()]
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((e) => ({
        ownerId: e.ownerId,
        name: e.name,
        species: e.species,
        tier: SPECIES[e.species].tier,
        pct: Math.min(100, Math.round((e.likes / e.need) * 100)),
        expiresAt: e.expiresAt,
      }));
    return {
      seq: ++this.seq,
      now,
      live: this.live,
      fish: [...this.fish.values()].map((f) => this.fishView(f)),
      eggs,
      waiting: this.waiting.length,
      env: {
        weather: this.weather,
        weatherEndsAt: this.weatherEndsAt,
        night: this.isNight(now),
        phaseEndsAt: this.dayPhaseEndsAt(now),
        dirt: Math.round(this.dirt),
        murky: this.murky,
        drops: this.drops.map((d) => ({ ...d })),
      },
      challenge: this.challengeView(),
      audio: this.audio,
      gifts: this.gifts.filter((g) => g.enabled).sort((a, b) => a.coins - b.coins).map((g) => ({ giftName: g.giftName, coins: g.coins, reward: g.reward })),
      top: this.ranked()
        .slice(0, 3)
        .map((f) => ({ name: f.name, stage: f.stage, growth: this.fishView(f).growth, species: f.species, crowned: f.id === this.crownId })),
      totals: { ...this.totals },
    };
  }

  challengeView(): ChallengeView | null {
    const c = this.challenge;
    if (!c) return null;
    return c.kind === "clean"
      ? { kind: "clean", count: c.count, needed: c.needed, endsAt: c.endsAt }
      : { kind: "predator", likes: c.likes, needed: c.needed, endsAt: c.endsAt, x: c.x };
  }

  adminFish(): AdminState["fish"] {
    return this.ranked().map((f) => ({ id: f.id, name: f.name, species: f.species, stage: f.stage, growth: this.fishView(f).growth, hunger: Math.round(f.hunger), status: f.status }));
  }

  // ---------- lưu trữ ----------

  serialize(): Saved {
    return { fish: [...this.fish.values()], owners: [...this.owners.values()], totals: this.totals, nextId: this.nextId, dirt: this.dirt };
  }

  restore(data: Partial<Saved>) {
    this.fish.clear();
    this.owners.clear();
    for (const f of data.fish ?? []) if (SPECIES[f.species]) this.fish.set(f.id, f);
    for (const o of data.owners ?? []) this.owners.set(o.id, o);
    if (data.totals) this.totals = { ...this.totals, ...data.totals };
    for (const f of this.fish.values()) f.immortalUntil = f.immortalUntil ?? 0;
    this.nextId = Math.max(this.nextId, data.nextId ?? 1);
    this.dirt = data.dirt ?? 0;
    this.dirty = true;
  }
}
