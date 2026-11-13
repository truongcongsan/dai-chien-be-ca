import { describe, expect, it } from "vitest";
import { COMMON_SPECIES, DEFAULT_GIFTS, DEFAULT_RULES, FORM_STAGE, GIFT_HATCH_STAGE, LEGACY_STAGE_MAP, MAX_STAGE, SMALL_STAGE, SPECIES, STAGES, parseCommand, stageLabel } from "../src/shared/config";
import { Tank } from "../server/tank";

/** Bể yên tĩnh: không thời tiết/thử thách tự động, không đêm — để test không phụ thuộc giờ và may rủi. */
function mk(extra: Partial<typeof DEFAULT_RULES> = {}) {
  const tank = new Tank();
  tank.rules = { ...DEFAULT_RULES, autoEvents: 0, nightMode: 0, dirtPerFishPerMin: 0, ...extra };
  return tank;
}

const user = (n: number) => ({ userId: `u${n}`, uniqueId: `u${n}`, name: `Người ${n}` });
const MIN = 60_000;
let id = 0;
const chat = (n: number, text: string) => ({ type: "chat" as const, eventId: `e${id++}`, user: user(n), text });
const like = (n: number, count: number) => ({ type: "like" as const, eventId: `e${id++}`, user: user(n), count });

function hatched(tank: Tank, n: number, now = 0) {
  tank.handle(chat(n, "cá"), now);
  tank.handle(like(n, DEFAULT_RULES.likesToHatch), now);
  return tank.fishOf(`u${n}`)!;
}


/** Bỏ khiên cá mới nở để test cắn / mèo. */
function unguard(...list: { guardUntil?: number; bornAt: number }[]) {
  for (const f of list) (f.guardUntil = 0), (f.bornAt = -10 * MIN);
}

/** Chạy tick từng giây để mô phỏng thời gian trôi. */
function run(tank: Tank, from: number, ms: number) {
  for (let t = from; t <= from + ms; t += 1000) tank.tick(t);
  return from + ms;
}

describe("lệnh comment", () => {
  it("nhận lệnh không phân biệt dấu và hoa thường", () => {
    expect(parseCommand("Cá")).toBe("egg");
    expect(parseCommand("  THẢ   cá ")).toBe("egg");
    expect(parseCommand("ăn")).toBe("feed");
    expect(parseCommand("Cho ăn")).toBe("feed");
    expect(parseCommand("ăn cá đi")).toBe(null);
  });
});

describe("thả trứng bằng tim", () => {
  it("đủ like thì nở cá bột với đói 100%", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    expect(fish.stage).toBe(1);
    expect(fish.hunger).toBe(100);
    expect(tank.eggs.size).toBe(0);
    expect(tank.takeFx().some((f) => f.kind === "hatch")).toBe(true);
  });

  it("thả tim lần đầu cũng mở trứng, like cộng dồn theo lô", () => {
    const tank = mk();
    tank.handle(like(2, 20), 0);
    expect(tank.snapshot(0).eggs[0].pct).toBe(33);
    tank.handle(like(2, 40), 1000);
    expect(tank.fishOf("u2")).not.toBeNull();
  });

  it("hết hạn thì trứng vỡ và phải chờ hồi mới thử lại", () => {
    const tank = mk();
    tank.tick(0);
    tank.handle(chat(3, "cá"), 0);
    run(tank, 0, DEFAULT_RULES.eggTimeoutMs);
    expect(tank.eggs.size).toBe(0);
    expect(tank.startEgg(user(3), DEFAULT_RULES.eggTimeoutMs + 1000)).toBe("đang hồi");
    expect(tank.startEgg(user(3), DEFAULT_RULES.eggTimeoutMs + DEFAULT_RULES.eggRetryCooldownMs + 1000)).toBe("ok");
  });

  it("quá số trứng cùng lúc thì vào hàng chờ và tự lên khi có chỗ", () => {
    const tank = mk();
    for (let i = 0; i < DEFAULT_RULES.maxCharging; i++) tank.handle(chat(i, "cá"), 0);
    expect(tank.startEgg(user(99), 0)).toBe("vào hàng chờ");
    tank.handle(like(0, DEFAULT_RULES.likesToHatch), 0);
    expect(tank.eggs.has("u99")).toBe(true);
    expect(tank.waiting.length).toBe(0);
  });

  it("tim thả trong lúc chờ được giữ lại, đủ thì nở ngay khi tới lượt", () => {
    const tank = mk();
    for (let i = 0; i < DEFAULT_RULES.maxCharging; i++) tank.handle(chat(i, "cá"), 0);
    tank.handle(chat(50, "cá"), 0);
    tank.handle(chat(51, "cá"), 0);
    tank.handle(like(50, DEFAULT_RULES.likesToHatch), 0);
    tank.handle(like(51, 20), 0);
    tank.handle(like(0, DEFAULT_RULES.likesToHatch), 0);
    expect(tank.fishOf("u50")).not.toBeNull();
    tank.handle(like(1, DEFAULT_RULES.likesToHatch), 0);
    expect(tank.snapshot(0).eggs.find((e) => e.ownerId === "u51")?.pct).toBe(33);
  });

  it("một người chỉ có một cá sống", () => {
    const tank = mk();
    hatched(tank, 4);
    expect(tank.startEgg(user(4), 0)).toBe("đã có cá");
  });

  it("bỏ qua event trùng id", () => {
    const tank = mk();
    const e = like(5, 40);
    tank.handle(e, 0);
    tank.handle(e, 0);
    expect(tank.snapshot(0).eggs[0].pct).toBe(67);
  });
});

describe("đói, cho ăn, tăng trưởng", () => {
  it("mất 5% mỗi phút", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    run(tank, 0, 4 * MIN);
    expect(Math.round(fish.hunger)).toBe(80);
  });

  it("cho ăn +5% đói +5% tăng trưởng và có cooldown", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    fish.stage = 20; // cấp đủ cao để 2 lần cho ăn không làm lên cấp
    fish.hunger = 50;
    expect(tank.feed(user(1), 1000)).toBe("ok");
    expect(fish.hunger).toBe(55);
    expect(fish.growth).toBe(5);
    expect(tank.feed(user(1), 5000)).toBe("đang hồi");
    expect(tank.feed(user(1), 1000 + DEFAULT_RULES.feedCooldownMs)).toBe("ok");
    expect(fish.growth).toBe(10);
  });

  it("đầy tăng trưởng thì lên cấp, dư thì giữ lại", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    fish.growth = STAGES[1].growthNeed - 2;
    tank.feed(user(1), 1000);
    expect(fish.stage).toBe(2);
    expect(fish.growth).toBe(DEFAULT_RULES.feedGrowth - 2);
  });

  it("cấp tối đa thì dừng lớn", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    fish.stage = MAX_STAGE - 1;
    fish.growth = STAGES[MAX_STAGE - 1].growthNeed - 1;
    tank.feed(user(1), 1000);
    expect(fish.stage).toBe(MAX_STAGE);
    tank.feed(user(1), 1000 + DEFAULT_RULES.feedCooldownMs);
    expect(fish.stage).toBe(MAX_STAGE);
  });

  it("thả tim là cách chính để lớn: cá bé lên cấp nhanh, cấp cao cần vài trăm tim", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    const likesFor = (stage: number) => STAGES[stage].growthNeed * DEFAULT_RULES.likesPerGrowth;
    // Lv1–10 rất rẻ: Lv1 ≤ 30 tim, mỗi cấp dưới 200 tim, cả chặng Lv1→10 dưới 800 tim; Lv14 cần vài trăm.
    expect(likesFor(1)).toBeLessThanOrEqual(30);
    for (let st = 1; st <= 10; st++) expect(likesFor(st)).toBeLessThan(200);
    let total = 0;
    for (let st = 1; st < 10; st++) total += likesFor(st);
    expect(total).toBeLessThan(800);
    expect(likesFor(14)).toBeGreaterThanOrEqual(500);
    for (let st = 2; st < FORM_STAGE; st++) expect(STAGES[st].growthNeed).toBeGreaterThanOrEqual(STAGES[st - 1].growthNeed);
    const need = likesFor(fish.stage);
    const stage = fish.stage;
    tank.handle(like(1, need - DEFAULT_RULES.likesPerGrowth), 1000);
    expect(fish.stage).toBe(stage);
    tank.handle(like(1, DEFAULT_RULES.likesPerGrowth), 2000);
    expect(fish.stage).toBe(stage + 1);
  });

  it("tim cũng làm cá no và cứu cá kiệt sức", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    fish.hunger = 0;
    fish.status = "exhausted";
    tank.handle(like(1, DEFAULT_RULES.likesPerHunger * 20), 1000);
    expect(fish.hunger).toBe(20);
    expect(fish.status).toBe("alive");
  });

  it("trần tim mỗi phút vẫn dùng được khi Admin đặt", () => {
    const tank = mk({ likeGrowthCapPerMin: 5 });
    const fish = hatched(tank, 1);
    tank.handle(like(1, 3 * 100), 1000);
    expect(fish.growth).toBe(5);
  });
});

describe("chết và cứu", () => {
  it("đói về 0 thì kiệt sức, hết thời gian kiệt sức thì chết", () => {
    const tank = mk();
    hatched(tank, 1);
    let t = run(tank, 0, 20 * MIN + 1000);
    expect(tank.fishOf("u1")?.status).toBe("exhausted");
    t = run(tank, t, DEFAULT_RULES.exhaustedMs + 1000);
    expect(tank.fishOf("u1")).toBeNull();
    expect(tank.totals.died).toBe(1);
  });

  it("cho ăn khi kiệt sức thì cứu được", () => {
    const tank = mk();
    hatched(tank, 1);
    const t = run(tank, 0, 20 * MIN + 5000);
    expect(tank.feed(user(1), t)).toBe("ok");
    expect(tank.fishOf("u1")?.status).toBe("alive");
  });

  it("tắt live thì đói đóng băng", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    tank.tick(0);
    tank.setLive(false, 0);
    run(tank, 0, 60 * MIN);
    expect(fish.hunger).toBe(100);
  });

  it("chết xong được thả trứng lại ngay", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    tank.kill(fish, 0);
    expect(tank.startEgg(user(1), 0)).toBe("ok");
  });
});

describe("cá chúa và vô địch", () => {
  it("chỉ cá từ Lv15 mới làm cá chúa", () => {
    expect(DEFAULT_RULES.crownMinStage).toBe(15);
    const tank = mk();
    const a = hatched(tank, 1);
    a.stage = DEFAULT_RULES.crownMinStage - 1;
    tank.tick(0);
    expect(tank.crownId).toBeNull();
    a.stage = DEFAULT_RULES.crownMinStage;
    tank.tick(1000);
    expect(tank.crownId).toBe(a.id);
    expect(tank.snapshot(1000).crown?.name).toBe(a.name);
  });

  it("cá khác cao cấp hơn chiếm ngôi thì bộ đếm chạy lại; cùng cấp thì chờ cooldown", () => {
    const tank = mk();
    const a = hatched(tank, 1);
    a.stage = DEFAULT_RULES.crownMinStage + 2;
    a.growth = 10;
    tank.tick(0);
    const b = hatched(tank, 2);
    b.stage = DEFAULT_RULES.crownMinStage + 2;
    b.growth = 50;
    tank.tick(1000);
    expect(tank.crownId).toBe(a.id);
    tank.tick(DEFAULT_RULES.crownCooldownMs + 1000);
    expect(tank.crownId).toBe(b.id);
    expect(tank.snapshot(DEFAULT_RULES.crownCooldownMs + 1000).crown?.holdEndsAt).toBe(DEFAULT_RULES.crownCooldownMs + 1000 + DEFAULT_RULES.championHoldMs);
  });

  it("giữ ngôi đủ 10 phút thì vô địch: sang màn mới, ai cũng về trứng, vô địch được trứng rồng", () => {
    const tank = mk();
    const king = hatched(tank, 1);
    king.stage = 20;
    const other = hatched(tank, 2);
    other.stage = 3;
    tank.tick(0);
    expect(tank.crownId).toBe(king.id);
    tank.tick(DEFAULT_RULES.championHoldMs - 1000);
    expect(tank.round).toBe(1);
    tank.tick(DEFAULT_RULES.championHoldMs);
    expect(tank.round).toBe(2);
    expect(tank.lastChampion).toEqual({ name: "Người 1", round: 1 });
    expect(tank.fish.size).toBe(0);
    expect(tank.eggs.get("u1")?.species).toBe("dragonfish");
    expect(SPECIES[tank.eggs.get("u2")!.species].tier).toBe("common");
    expect(tank.snapshot(DEFAULT_RULES.championHoldMs).fish).toHaveLength(0);
    // Nhà vô địch có huy hiệu 🏆.
    tank.handle(like(1, 1000), DEFAULT_RULES.championHoldMs + 1000);
    expect(tank.snapshot(DEFAULT_RULES.championHoldMs + 1000).fish.find((x) => x.ownerId === "u1")?.badges).toContain("🏆");
  });

  it("tắt live thì bộ đếm vô địch đứng yên", () => {
    const tank = mk();
    const king = hatched(tank, 1);
    king.stage = 20;
    tank.tick(0);
    tank.setLive(false, 1000);
    tank.tick(DEFAULT_RULES.championHoldMs * 2);
    expect(tank.round).toBe(1);
    expect(tank.fish.size).toBe(1);
  });
});

describe("100 cấp", () => {
  it("Lv1–15 đổi hình và to rõ; Lv15–100 giữ hình thái cuối, to chậm; ảnh đủ cho mọi cấp", () => {
    expect(MAX_STAGE).toBe(100);
    expect(FORM_STAGE).toBe(15);
    for (let s = 2; s <= FORM_STAGE; s++) expect(STAGES[s].size).toBeGreaterThan(STAGES[s - 1].size);
    for (let s = FORM_STAGE + 1; s <= MAX_STAGE; s++) {
      expect(STAGES[s].size).toBeGreaterThanOrEqual(STAGES[s - 1].size);
      expect(STAGES[s].art).toBe(STAGES[FORM_STAGE].art);
    }
    // To vọt đúng ở các mốc Lv20, 30, 50, 100; giữa các mốc giữ nguyên.
    for (const m of [20, 30, 50, 100]) expect(STAGES[m].size).toBeGreaterThan(STAGES[m - 1].size + 30);
    expect(STAGES[25].size).toBe(STAGES[20].size);
    expect(STAGES[MAX_STAGE].size).toBe(440);
    for (const sp of Object.values(SPECIES)) {
      expect(sp.textures).toHaveLength(MAX_STAGE + 1);
      expect(sp.textures[1]).toBe("fish-fry-base");
    }
    expect(SPECIES.dragonfish.textures[FORM_STAGE]).toBe("dragonfish-king");
    expect(SPECIES.dragonfish.textures[MAX_STAGE]).toBe("dragonfish-king");
    expect(STAGES.some((st) => st.name === "Cá chúa")).toBe(false);
  });

  it("qua Lv15 vẫn lên cấp tiếp, dừng ở Lv100", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    fish.stage = FORM_STAGE;
    fish.growth = STAGES[FORM_STAGE].growthNeed - 1;
    tank.handle(like(1, DEFAULT_RULES.likesPerGrowth), 1000);
    expect(fish.stage).toBe(FORM_STAGE + 1);
    fish.stage = MAX_STAGE;
    fish.growth = 0;
    tank.handle(like(1, 3000), 2000);
    expect(fish.stage).toBe(MAX_STAGE);
    expect(fish.growth).toBe(0);
  });

  it("cá chúa là con cấp cao nhất bể, hiện danh hiệu Cá chúa", () => {
    const tank = mk();
    const a = hatched(tank, 1);
    a.stage = 40;
    const b = hatched(tank, 2);
    b.stage = 62;
    tank.tick(0);
    expect(tank.crownId).toBe(b.id);
    expect(stageLabel(b.stage, true)).toBe("Lv62 · Cá chúa");
    expect(stageLabel(a.stage)).toBe("Lv40 · Cá bá chủ");
  });

  it("bể đóng băng (chưa live) vẫn đổi cá chúa", () => {
    const tank = mk();
    const a = hatched(tank, 1);
    a.stage = 20;
    tank.tick(0);
    tank.setLive(false, 1000);
    const b = hatched(tank, 2);
    b.stage = 30;
    tank.tick(2000);
    expect(tank.crownId).toBe(b.id);
  });

  it("bản lưu 7 cấp cũ được đổi sang 15 cấp, giữ % tiến độ", () => {
    const old = { fish: [] as unknown[], owners: [] as unknown[], totals: { hatched: 0, died: 0, fed: 0 }, nextId: 10 };
    const base = { ownerId: "u1", name: "A", species: "goldfish", variant: 0xffffff, hunger: 80, status: "alive", bornAt: 0, exhaustedFor: 0, lastFedAt: 0, activeAt: 0, warned: false, likeCarry: 0, likeWindowStart: 0, likeWindowGrowth: 0 };
    old.fish.push({ ...base, id: "f1", stage: 7, growth: 0 }, { ...base, id: "f2", ownerId: "u2", stage: 4, growth: 60 });
    old.owners.push({ id: "u2", name: "B", bestStage: 4, raised: 1, retryAt: 0 });
    const tank = mk();
    tank.restore(old as never);
    expect(tank.fish.get("f1")!.stage).toBe(FORM_STAGE);
    const f2 = tank.fish.get("f2")!;
    expect(f2.stage).toBe(LEGACY_STAGE_MAP[4]);
    expect(f2.growth).toBe(Math.round(0.5 * STAGES[f2.stage].growthNeed));
    // Lưu lại rồi khôi phục: không đổi lần hai.
    const again = mk();
    again.restore(JSON.parse(JSON.stringify(tank.serialize())));
    expect(again.fish.get("f2")!.stage).toBe(LEGACY_STAGE_MAP[4]);
  });
});

describe("lưu trữ", () => {
  it("khôi phục cá và chủ cá", () => {
    const tank = mk();
    hatched(tank, 1).stage = 3;
    const again = mk();
    again.restore(JSON.parse(JSON.stringify(tank.serialize())));
    expect(again.fishOf("u1")?.stage).toBe(3);
    expect(hatched(again, 2).id).not.toBe(again.fishOf("u1")?.id);
  });
});

describe("thời tiết và đêm", () => {
  it("bão làm đói nhanh gấp đôi, đêm chậm một nửa", () => {
    const storm = mk();
    const a = hatched(storm, 1);
    storm.tick(0);
    storm.startWeather("storm", 0);
    run(storm, 0, MIN);
    expect(Math.round(a.hunger)).toBe(90);

    const night = mk({ nightMode: 3 });
    const b = hatched(night, 1);
    run(night, 0, 4 * MIN);
    expect(Math.round(b.hunger)).toBe(90);
  });

  it("mưa xong có cầu vồng, cầu vồng cho ăn ×1,5 tăng trưởng", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    tank.tick(0);
    tank.startWeather("rain", 0);
    run(tank, 0, DEFAULT_RULES.rainMs + 1000);
    expect(tank.weather).toBe("rainbow");
    tank.feed(user(1), DEFAULT_RULES.rainMs + 2000);
    expect(fish.growth).toBe(7.5);
  });

  it("mưa thả côn trùng, ai đớp trước thì được ăn", () => {
    const tank = mk();
    const a = hatched(tank, 1);
    hatched(tank, 2);
    a.hunger = 50;
    tank.tick(0);
    tank.startWeather("rain", 0);
    run(tank, 0, 5000);
    expect(tank.snapshot(5000).env.drops.length).toBe(1);
    tank.handle(chat(1, "đớp"), 5000);
    expect(a.hunger).toBeCloseTo(60, 0);
    expect(tank.snap(user(2), 5000)).toBe("không có gì để đớp");
  });

  it("sống qua bão thì có huy hiệu ⚡", () => {
    const tank = mk();
    hatched(tank, 1);
    tank.tick(0);
    tank.startWeather("storm", 0);
    run(tank, 0, DEFAULT_RULES.stormMs + 1000);
    expect(tank.weather).toBe("sun");
    expect(tank.snapshot(0).fish[0].badges).toBe("⚡");
  });
});

describe("nước bẩn", () => {
  it("bể đông thì bẩn dần, quá ngưỡng thì đục và đói nhanh hơn", () => {
    const tank = mk({ dirtPerFishPerMin: 1 });
    for (let i = 0; i < 10; i++) hatched(tank, i);
    run(tank, 0, 8 * MIN);
    expect(tank.dirt).toBeGreaterThanOrEqual(70);
    expect(tank.murky).toBe(true);
    expect(tank.hungerMul(0)).toBe(1.5);
  });

  it("cả phòng comment “dọn” đủ lượt thì bể sạch và người dọn được thưởng", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    tank.dirt = 90;
    tank.startCleanup(0);
    const needed = (tank.challenge as { needed: number }).needed;
    // Mỗi người chỉ tính tối đa cleanMaxPerUser lượt.
    for (let i = 0; i < 10; i++) tank.handle(chat(1, "dọn"), 0);
    expect((tank.challenge as { count: number }).count).toBe(DEFAULT_RULES.cleanMaxPerUser);
    for (let i = 100; i < 100 + needed; i++) tank.handle(chat(i, "dọn"), 0);
    expect(tank.challenge).toBeNull();
    expect(tank.dirt).toBe(0);
    expect(fish.growth).toBe(DEFAULT_RULES.rewardGrowth);
  });

  it("hết giờ chưa đủ thì thất bại, 2 phút sau mới mở lại", () => {
    const tank = mk({ autoEvents: 1 });
    hatched(tank, 1);
    tank.dirt = 90;
    tank.tick(0);
    expect(tank.challenge?.kind).toBe("clean");
    run(tank, 0, DEFAULT_RULES.cleanWindowMs + 1000);
    expect(tank.challenge).toBeNull();
    tank.tick(DEFAULT_RULES.cleanWindowMs + 30_000);
    expect(tank.challenge).toBeNull();
    tank.tick(DEFAULT_RULES.cleanWindowMs + 3 * MIN);
    expect(tank.challenge?.kind).toBe("clean");
  });
});

describe("độ khó thử thách", () => {
  it("mèo luôn cần 200 tim; dọn bể cố định 10 comment", () => {
    const tank = mk({ maxFish: 500, maxCharging: 500 });
    const needed = () => (tank.challenge as unknown as { needed: number }).needed;
    for (let i = 1; i <= 40; i++) hatched(tank, i);
    tank.startPredator(0);
    expect(needed()).toBe(200); // mèo luôn 200 tim, không phụ thuộc số cá
    tank.challenge = null;
    tank.startCleanup(0);
    expect(needed()).toBe(10);
    tank.challenge = null;
    for (let i = 41; i <= 100; i++) hatched(tank, i);
    tank.startCleanup(0);
    expect(needed()).toBe(10);
  });
});

describe("kẻ săn mồi", () => {
  it("thả tim đủ thì đuổi được mèo, người thả tim có cá được thưởng", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    fish.stage = 30; // cấp cao để thưởng không làm lên cấp
    tank.startPredator(0);
    const needed = (tank.challenge as { needed: number }).needed;
    expect(needed).toBe(DEFAULT_RULES.predatorMinLikes);
    // Thiếu 1 tim thì mèo vẫn còn.
    tank.handle(like(1, Math.floor(needed / 2)), 0);
    tank.handle(like(77, Math.ceil(needed / 2) - 1), 0);
    expect(tank.challenge?.kind).toBe("predator");
    tank.handle(like(77, 1), 0);
    expect(tank.challenge).toBeNull();
    expect(tank.takeFx().some((f) => f.kind === "predatorWin")).toBe(true);
    expect(fish.growth).toBeGreaterThanOrEqual(DEFAULT_RULES.rewardGrowth);
  });

  it("không đủ tim thì mèo cào 3 cá to nhất: −5 cấp, có khiên thì mất khiên", () => {
    const tank = mk();
    const fish = [1, 2, 3, 4].map((n) => hatched(tank, n));
    unguard(...fish);
    [fish[0].stage, fish[1].stage, fish[2].stage, fish[3].stage] = [30, 20, 12, 2];
    fish[1].guardUntil = 10 * MIN; // cá thứ 2 có khiên
    tank.tick(0);
    tank.startPredator(0);
    run(tank, 0, DEFAULT_RULES.predatorWindowMs + 1000);
    expect(tank.challenge).toBeNull();
    expect(fish[0].stage).toBe(25);
    expect(fish[1].stage).toBe(20);
    expect(fish[1].guardUntil).toBe(0);
    expect(fish[2].stage).toBe(7);
    expect(fish[3].stage).toBe(2); // cá nhỏ không bị cào
    expect(tank.fish.size).toBe(4);
  });
});

const gift = (n: number, giftName: string, count = 1, diamonds: number | null = null, giftId: number | null = null) => ({
  type: "gift" as const,
  eventKey: `g${id++}`,
  user: user(n),
  giftId,
  giftName,
  count,
  diamonds,
});

describe("quà tặng", () => {
  it("nhận quà theo ID, rồi theo tên; quà lạ quy đổi theo giá và được ghi lại cho Admin", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    fish.hunger = 50;
    tank.handle(gift(1, "Hoa hồng", 1, 1, 5655), 1000);
    expect(fish.hunger).toBe(65);
    tank.handle(gift(1, "doughnut"), 1000);
    expect(tank.snapshot(1000).fish[0].shield).toBe(true);
    const before = fish.stage;
    tank.handle(gift(1, "Quà Lạ", 1, 150), 1000);
    expect([...tank.unmapped.values()][0].giftName).toBe("Quà Lạ");
    expect(fish.stage).toBe(before + 10); // 150 kim cương → quà gần nhất 100 (Thuốc lớn: +10 cấp)
  });

  it("quà combo chỉ tính một lần dù sự kiện về hai lần", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    fish.hunger = 10;
    const e = gift(1, "Rose", 3, 1, 5655);
    tank.handle(e, 1000);
    tank.handle(e, 1000);
    expect(fish.hunger).toBe(55);
  });

  it("chưa có cá: thức ăn ngon nạp nửa thanh tim, quà khác chờ tới lúc nở", () => {
    const tank = mk();
    tank.handle(gift(2, "Rose", 1, 1, 5655), 0);
    expect(tank.snapshot(0).eggs[0].pct).toBe(50);
    tank.handle(gift(2, "Doughnut"), 0);
    tank.handle(like(2, 30), 0);
    const fish = tank.fishOf("u2")!;
    expect(fish.shieldCharges).toBe(1);
  });

  it("Trứng thường nở ra đủ các loài thường", () => {
    const tank = mk({ maxFish: 500, maxCharging: 500 });
    const seen = new Set<string>();
    for (let i = 100; i < 300; i++) {
      tank.startEgg(user(i), 0);
      seen.add(tank.hatchNow(user(i), 0)!.species);
    }
    expect([...seen].sort()).toEqual([...COMMON_SPECIES].sort());
    expect(COMMON_SPECIES.length).toBeGreaterThanOrEqual(4);
  });

  it("Trứng hiếm: nở cá hiếm, đổi loài giữ cấp, không hạ cá rồng", () => {
    const tank = mk();
    tank.handle(gift(5, "Capybara"), 0);
    const hatched = tank.fishOf("u5")!;
    expect(SPECIES[hatched.species].tier).toBe("rare");
    expect(hatched.stage).toBe(GIFT_HATCH_STAGE);
    // Đã có cá thường cấp 5: hóa cá hiếm, giữ cấp.
    tank.hatchNow(user(6), 0, "goldfish")!.stage = 5;
    tank.handle(gift(6, "Capybara"), 0);
    expect(SPECIES[tank.fishOf("u6")!.species].tier).toBe("rare");
    expect(tank.fishOf("u6")!.stage).toBe(5);
    // Tặng lần nữa: đổi sang loài hiếm khác.
    const before = tank.fishOf("u6")!.species;
    tank.handle(gift(6, "Capybara"), 1000);
    expect(tank.fishOf("u6")!.species).not.toBe(before);
    // Cá rồng nhận trứng hiếm vẫn là cá rồng.
    tank.hatchNow(user(7), 0, "dragonfish");
    tank.handle(gift(7, "Capybara"), 0);
    expect(tank.fishOf("u7")!.species).toBe("dragonfish");
  });

  it("Nở ngay và Trứng rồng", () => {
    const tank = mk();
    tank.handle(gift(3, "Finger Heart"), 0);
    expect(SPECIES[tank.fishOf("u3")!.species].tier).toBe("common");
    tank.handle(gift(4, "Little Crown"), 0);
    expect(tank.fishOf("u4")?.species).toBe("dragonfish");
    expect(tank.fishOf("u4")?.stage).toBe(GIFT_HATCH_STAGE);
    // Đã có cá thường: hóa rồng, giữ cấp.
    tank.fishOf("u3")!.stage = 4;
    tank.handle(gift(3, "Little Crown"), 0);
    expect(tank.fishOf("u3")?.species).toBe("dragonfish");
    expect(tank.fishOf("u3")?.stage).toBe(4);
  });

  it("thuốc lớn: lên thẳng 10 cấp, giữ % tiến độ, dừng ở Lv100", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    fish.stage = 4;
    fish.growth = Math.floor(STAGES[4].growthNeed / 2);
    const pct = fish.growth / STAGES[4].growthNeed;
    tank.handle(gift(1, "Hand Heart"), 0);
    expect(fish.stage).toBe(14);
    expect(fish.growth).toBe(Math.floor(pct * STAGES[14].growthNeed));
    fish.stage = MAX_STAGE - 3;
    tank.handle(gift(1, "Hand Heart"), 1000);
    expect(fish.stage).toBe(MAX_STAGE);
    expect(fish.growth).toBe(0);
  });

  it("Tăng 35lv (Corgi): lên thẳng 35 cấp", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    fish.stage = 5;
    tank.handle(gift(1, "Corgi"), 0);
    expect(fish.stage).toBe(40);
  });

  it("mưa thức ăn (Admin gán được) cho cả bể no và lên 5 cấp", () => {
    const tank = mk();
    const a = hatched(tank, 1);
    const b = hatched(tank, 2);
    a.hunger = 10;
    b.hunger = 50;
    b.stage = 7;
    tank.applyReward(user(9), "foodRain", 1, 0);
    expect(a.hunger).toBe(30);
    expect(b.hunger).toBe(70);
    expect(a.stage).toBe(6);
    expect(b.stage).toBe(12);
  });

  it("cá hiếm lớn ×1.5, cá rồng lớn ×1.8", () => {
    const tank = mk();
    const [c, r, d] = [1, 2, 3].map((n) => hatched(tank, n));
    tank.applyReward(user(2), "rareEgg", 1, 0);
    tank.applyReward(user(3), "legendaryEgg", 1, 0);
    for (const fish of [c, r, d]) (fish.stage = 30), (fish.growth = 0);
    for (const n of [1, 2, 3]) tank.handle(like(n, 30), 1000);
    expect(c.growth).toBe(10);
    expect(r.growth).toBe(15);
    expect(d.growth).toBe(18);
  });

  it("Hủy diệt (Galaxy): diệt cả bể, người tặng vô địch ngay, sang màn mới", () => {
    const tank = mk();
    [1, 2, 3].forEach((n) => (hatched(tank, n).stage = 20));
    tank.handle(gift(9, "Galaxy"), 0);
    expect(tank.fish.size).toBe(0);
    expect(tank.round).toBe(2);
    expect(tank.lastChampion?.name).toBe("Người 9");
    expect(tank.eggs.get("u9")?.species).toBe("dragonfish");
    expect(tank.eggs.has("u1")).toBe(true);
    expect(tank.totals.died).toBe(3);
  });

  it("Cắn chết (Confetti): cú cắn tới không hụt, chết luôn, không phải chờ hồi; khiên vẫn chặn", () => {
    const tank = mk();
    tank.random = () => 0; // cắn thường sẽ hụt
    const [big, a, b] = [1, 2, 3].map((n) => hatched(tank, n));
    unguard(big, a, b);
    big.stage = 40;
    a.stage = 30;
    b.stage = 30;
    tank.handle(gift(1, "Confetti"), 0);
    tank.handle(gift(1, "Confetti"), 0);
    expect(tank.snapshot(0).fish.find((x) => x.id === big.id)?.killBite).toBe(true);
    tank.handle(chat(1, "cắn @u2"), 1000);
    expect(tank.fishOf("u2")).toBeNull();
    tank.handle(gift(3, "Doughnut"), 1000);
    tank.handle(chat(1, "cắn @u3"), 1500);
    expect(tank.fishOf("u3")).toBe(b);
    expect(big.killBites).toBe(0);
  });

  it("Admin đặt cấp bất kỳ cho cá của người chơi", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    tank.setLevel(fish, 77);
    expect(fish.stage).toBe(77);
    tank.setLevel(fish, 999);
    expect(fish.stage).toBe(MAX_STAGE);
    tank.setLevel(fish, 0);
    expect(fish.stage).toBe(1);
  });

  it("cá đã cắn và hồi xong lượt cắn thì hiện 🦷", () => {
    const tank = mk();
    tank.random = () => 0.99;
    const big = hatched(tank, 1);
    const small = hatched(tank, 2);
    unguard(big, small);
    big.stage = 20;
    small.stage = 10;
    const view = (t: number) => tank.snapshot(t).fish.find((f) => f.id === big.id)!;
    tank.tick(0);
    expect(view(0).canBite).toBe(false); // chưa cắn lần nào
    tank.handle(chat(1, "cắn @u2"), 1000);
    tank.tick(2000);
    expect(view(2000).canBite).toBe(false); // đang chờ hồi
    tank.tick(1000 + DEFAULT_RULES.biteAttackCooldownMs);
    expect(view(1000 + DEFAULT_RULES.biteAttackCooldownMs).canBite).toBe(true);
  });

  it("hồi sinh: cứu cá vừa chết trong 60 giây, quá hạn thì không", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    fish.stage = 5;
    tank.kill(fish, 0);
    tank.handle(gift(1, "Mishka Bear"), 30_000);
    expect(tank.fishOf("u1")?.stage).toBe(5);
    expect(tank.fishOf("u1")?.immortalUntil).toBeGreaterThan(30_000);

    const late = mk();
    const f2 = hatched(late, 2);
    late.kill(f2, 0);
    late.handle(gift(2, "Mishka Bear"), 90_000);
    expect(late.fishOf("u2")).toBeNull();
  });

  it("bất tử thì không đói", () => {
    const tank = mk();
    const fish = hatched(tank, 1);
    tank.handle(gift(1, "Mishka Bear"), 0);
    run(tank, 0, 5 * MIN);
    expect(fish.hunger).toBe(100);
  });
});

describe("cắn nhau và khiên", () => {
  /** u1 hơn u2 đúng biteStageGap cấp, đã qua khiên cá mới nở. Không cắn trượt trừ khi test đặt lại random. */
  function arena(smallStage = 20) {
    const tank = mk();
    tank.random = () => 0.99;
    const big = hatched(tank, 1);
    const small = hatched(tank, 2);
    unguard(big, small);
    small.stage = smallStage;
    big.stage = smallStage + DEFAULT_RULES.biteStageGap;
    return { tank, big, small };
  }

  it("phải hơn ít nhất 1 cấp mới cắn được", () => {
    expect(DEFAULT_RULES.biteStageGap).toBe(1);
    const { tank, big, small } = arena();
    big.stage = small.stage;
    tank.handle(chat(1, "cắn @u2"), 1000);
    expect(small.stage).toBe(20);
    expect(big.lastBiteAt).toBeUndefined();
  });

  it("cắn trúng: cá kia −10 cấp và được khiên 5 phút; người cắn +tăng trưởng", () => {
    const { tank, big, small } = arena();
    const g = big.growth;
    tank.handle(chat(1, "cắn @u2"), 1000);
    expect(tank.fishOf("u2")).toBe(small);
    expect(small.stage).toBe(10);
    expect(small.guardUntil).toBe(1000 + DEFAULT_RULES.biteCooldownMs);
    expect(big.growth - g).toBe(DEFAULT_RULES.biteGrowth);
    expect(tank.snapshot(1000).fish.find((x) => x.id === small.id)?.shield).toBe(true);
  });

  it("cá từ Lv10 trở xuống bị cắn trúng thì chết; chủ cá được giảm tim lần sau", () => {
    const { tank } = arena(DEFAULT_RULES.biteLevelLoss);
    tank.handle(chat(1, "cắn @u2"), 1000);
    expect(tank.fishOf("u2")).toBeNull();
    tank.handle(chat(2, "cá"), 2000);
    tank.handle(like(2, 30), 2000);
    expect(tank.fishOf("u2")).not.toBeNull();
  });

  it("mỗi cá cắn 1 lần mỗi 1 phút 30 giây", () => {
    expect(DEFAULT_RULES.biteAttackCooldownMs).toBe(90_000);
    const { tank, big } = arena();
    const c = hatched(tank, 3);
    unguard(c);
    c.stage = 12;
    tank.handle(chat(1, "cắn @u2"), 1000);
    tank.handle(chat(1, "cắn @u3"), 1000 + DEFAULT_RULES.biteAttackCooldownMs - 1000);
    expect(c.stage).toBe(12);
    tank.handle(chat(1, "cắn @u3"), 1000 + DEFAULT_RULES.biteAttackCooldownMs);
    expect(c.stage).toBe(2);
    expect(big.stage).toBeGreaterThan(c.stage);
  });

  it("cắn hụt: cá kia giữ cấp nhưng vẫn được khiên 5 phút", () => {
    const { tank, big, small } = arena();
    tank.random = () => 0;
    tank.handle(chat(1, "cắn @u2"), 1000);
    expect(small.stage).toBe(20);
    expect(small.guardUntil).toBe(1000 + DEFAULT_RULES.biteCooldownMs);
    expect(big.lastBiteAt).toBe(1000);
    expect(tank.takeFx().some((f) => f.kind === "bite" && f.missed)).toBe(true);
    // Đang có khiên: lần sau không cắn được.
    tank.handle(chat(1, "cắn @u2"), 1000 + DEFAULT_RULES.biteAttackCooldownMs);
    expect(small.stage).toBe(20);
  });

  it("khiên quà (Doughnut) chặn được một cú cắn", () => {
    const { tank, small } = arena();
    tank.handle(gift(2, "Doughnut"), 0);
    tank.handle(chat(1, "cắn @u2"), 1000);
    expect(small.stage).toBe(20);
    expect(small.shieldCharges).toBe(0);
  });

  it("cá nhỏ không cắn được cá to; cá mới nở có khiên 5 phút", () => {
    const { tank, big, small } = arena();
    tank.handle(chat(2, "cắn @u1"), 1000);
    expect(big.stage).toBe(small.stage + DEFAULT_RULES.biteStageGap);
    const baby = hatched(tank, 3, 0);
    expect(tank.snapshot(1000).fish.find((x) => x.id === baby.id)?.shield).toBe(true);
    tank.handle(chat(1, "cắn @u3"), 1000);
    expect(tank.fishOf("u3")).toBe(baby);
    tank.tick(DEFAULT_RULES.newbieImmuneMs + 1);
    tank.handle(chat(1, "cắn @u3"), DEFAULT_RULES.newbieImmuneMs + 1);
    expect(tank.fishOf("u3")).toBeNull();
    void small;
  });

  it("tắt cắn thì không ai cắn được", () => {
    const tank = mk({ attackEnabled: 0 });
    tank.random = () => 0.99;
    const big = hatched(tank, 1);
    const small = hatched(tank, 2);
    unguard(big, small);
    big.stage = 30;
    tank.handle(chat(1, "cắn @u2"), 1000);
    expect(tank.fishOf("u2")).toBe(small);
    expect(DEFAULT_GIFTS.some((g) => g.reward === "killBite" && g.giftName === "Confetti")).toBe(true);
  });
});

describe("ngày đêm luân phiên", () => {
  it("ngày 7 phút rồi đêm 3 phút, lặp lại", () => {
    const tank = mk({ nightMode: 2 });
    expect(tank.isNight(0)).toBe(false);
    expect(tank.isNight(6.9 * MIN)).toBe(false);
    expect(tank.isNight(7.1 * MIN)).toBe(true);
    expect(tank.isNight(9.9 * MIN)).toBe(true);
    expect(tank.isNight(10.1 * MIN)).toBe(false);
    expect(tank.dayPhaseEndsAt(2 * MIN)).toBe(7 * MIN);
    expect(tank.dayPhaseEndsAt(8 * MIN)).toBe(10 * MIN);
  });

  it("đổi thời lượng trong Admin là áp dụng ngay", () => {
    const tank = mk({ nightMode: 2, dayMinutes: 1, nightMinutes: 1 });
    expect(tank.isNight(1.5 * MIN)).toBe(true);
  });
});
