import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { DEFAULT_AUDIO, DEFAULT_GIFTS, DEFAULT_RULES, REWARDS, SPECIES, WEATHER_INFO, normalize, randomCommonSpecies, type AudioSettings, type GiftMapping, type Rules, type SpeciesId, type WeatherKind } from "../src/shared/config";
import type { AdminState, ClientCommand, ConnectorStatus, Fx, ServerMessage, VoiceStatus } from "../src/shared/protocol";
import { DemoAdapter } from "./adapters/demo";
import type { SourceAdapter } from "./adapters/source";
import { TikTokAdapter } from "./adapters/tiktok";
import { Narrator, P } from "./narrator";
import { Tank } from "./tank";
import { Voice } from "./voice";

if (existsSync(".env")) process.loadEnvFile(".env");

const dataDir = process.env.DATA_DIR ?? "data";
const host = process.env.ENGINE_HOST ?? "127.0.0.1";
const port = Number(process.env.ENGINE_PORT ?? 3321);
const savePath = join(dataDir, "tank.json");
mkdirSync(dataDir, { recursive: true });

const tank = new Tank();
let saved: { connector?: { kind: string; username: string }; rules?: Partial<Rules>; gifts?: GiftMapping[]; audio?: Partial<AudioSettings> } = {};
if (existsSync(savePath)) {
  try {
    const data = JSON.parse(readFileSync(savePath, "utf8"));
    tank.restore(data.tank ?? {});
    saved = data;
    tank.rules = { ...DEFAULT_RULES, ...(data.rules ?? {}) };
    if (Array.isArray(data.gifts) && data.gifts.length) {
      tank.gifts = data.gifts.filter((g: GiftMapping) => g.reward in REWARDS);
      // Phần thưởng ra đời sau lần lưu (vd. Trứng hiếm): thêm quà mặc định của nó; phần thưởng cũ bị xóa tay thì không thêm lại.
      const known: string[] = Array.isArray(data.knownRewards) ? data.knownRewards : Object.keys(REWARDS).filter((k) => k !== "rareEgg");
      for (const g of DEFAULT_GIFTS) if (!known.includes(g.reward)) tank.gifts.push({ ...g });
    }
    tank.audio = { ...DEFAULT_AUDIO, ...(data.audio ?? {}) };
  } catch (error) {
    console.error("[engine] Không đọc được dữ liệu cũ:", error);
  }
}

function persist() {
  const tmp = `${savePath}.tmp`;
  writeFileSync(tmp, JSON.stringify({ tank: tank.serialize(), rules: tank.rules, gifts: tank.gifts, knownRewards: Object.keys(REWARDS), audio: tank.audio, connector: { kind: connector.kind, username: connector.username } }));
  renameSync(tmp, savePath);
}

// ---------- MC & giọng đọc ----------

/** Token của app VieNeu-TTS desktop (giống game quán ăn); TTS_API_KEY ghi đè. */
function vieneuKey() {
  if (process.env.TTS_API_KEY) return process.env.TTS_API_KEY;
  const path = join(homedir(), "Library/Application Support/local.vieneu-tts.desktop/api_token");
  return existsSync(path) ? readFileSync(path, "utf8").trim() : "";
}

const voice =
  process.env.TTS_DISABLED === "1"
    ? null
    : await Voice.create(join(dataDir, "voice"), {
        vieneuUrl: process.env.TTS_API_URL ?? "http://127.0.0.1:8765",
        vieneuKey: vieneuKey(),
        allowSystem: process.env.TTS_MAC !== "0" && process.env.TTS_SYSTEM !== "0",
      });
const NO_VOICE: VoiceStatus = {
  engine: "none",
  state: "off",
  message: "Chưa có giọng đọc: cài VieNeu-TTS, hoặc giọng tiếng Việt của hệ điều hành (macOS: Linh, Windows: Microsoft An). MC vẫn hiện phụ đề.",
  voices: [],
  pending: 0,
  lastMs: null,
};
const narrator = new Narrator(voice, () => tank.audio, (fx) => broadcast({ type: "fx", fx: [fx as Fx] }, [...viewers, ...admins]));
console.log(`[engine] Giọng MC: ${voice ? `${voice.status().engine} (${voice.voices.join(", ")})` : "không có, chỉ phụ đề"}`);

// ---------- connector ----------

let adapter: SourceAdapter | null = null;
let connector: ConnectorStatus = { kind: "none", state: "idle", message: "Chưa kết nối", username: "" };

/** Thời gian (đói, hạn trứng) chỉ trôi khi nguồn đang kết nối: tắt live thì cá đóng băng. */
function syncLive() {
  tank.setLive(connector.state === "connected", Date.now());
}

function useAdapter(next: SourceAdapter | null, kind: ConnectorStatus["kind"], username = "") {
  adapter?.stop();
  adapter = next;
  connector = { kind, state: next ? "connecting" : "idle", message: next ? "Đang khởi động" : "Chưa kết nối", username };
  syncLive();
  next?.start({
    onEvent: (event) => {
      if (event.type === "chat") tank.addLog("chat", `${event.user.name}: ${event.text}`);
      tank.handle(event, Date.now());
    },
    onStatus: (state, message) => {
      connector = { ...connector, state, message };
      syncLive();
      tank.addLog(state === "error" ? "error" : "system", message);
    },
  });
}

const demo = () => (adapter instanceof DemoAdapter ? adapter : null);
/** Demo nhìn được thử thách đang diễn ra để người chơi giả phản ứng (dọn bể, thả tim đuổi mèo, đớp mồi). */
function newDemo() {
  return new DemoAdapter(
    () => ({ challenge: tank.challenge?.kind ?? null, drops: tank.drops.length }),
    () => tank.gifts,
  );
}

if (process.env.TIKTOK_USERNAME) useAdapter(new TikTokAdapter(process.env.TIKTOK_USERNAME), "tiktok", process.env.TIKTOK_USERNAME);
else if (saved.connector?.kind === "tiktok" && saved.connector.username) useAdapter(new TikTokAdapter(saved.connector.username), "tiktok", saved.connector.username);
else useAdapter(newDemo(), "demo");

// ---------- lệnh Admin ----------

function runCommand(cmd: string, args: Record<string, unknown> = {}): { ok: boolean; error?: string; data?: unknown } {
  const now = Date.now();
  switch (cmd) {
    case "connectTikTok": {
      const username = String(args.username ?? "").replace(/^@/, "").trim();
      if (!username) return { ok: false, error: "Thiếu username" };
      useAdapter(new TikTokAdapter(username), "tiktok", username);
      return { ok: true };
    }
    case "useDemo":
      useAdapter(newDemo(), "demo");
      return { ok: true };
    case "disconnect":
      useAdapter(null, "none");
      return { ok: true };
    case "demoRunning":
      demo()?.setRunning(Boolean(args.running));
      return { ok: true };
    case "demoRate": {
      const d = demo();
      if (d) d.rate = Math.max(0.2, Math.min(20, Number(args.rate) || 3));
      return { ok: true };
    }
    case "demoJoin":
      demo()?.joinMany(Math.max(1, Math.min(60, Number(args.count) || 10)));
      return { ok: true };
    case "demoFeedAll":
      demo()?.feedAll();
      return { ok: true };
    case "spawn": {
      const d = demo();
      // Loài lạ hoặc không truyền: chọn ngẫu nhiên một loài thường.
      const species = typeof args.species === "string" && args.species in SPECIES ? (args.species as SpeciesId) : randomCommonSpecies();
      const pool = d?.users ?? [];
      const user = pool.find((u) => !tank.fishOf(u.userId) && !tank.eggs.has(u.userId)) ?? { userId: `admin-${now}`, uniqueId: `admin${now}`, name: "Khách Admin" };
      const fish = tank.hatchNow(user, now, species);
      const stage = Number(args.stage) || 0;
      if (fish && stage > 1) fish.stage = Math.min(7, stage);
      return { ok: Boolean(fish) };
    }
    case "feedFish": {
      const fish = tank.fish.get(String(args.id));
      if (!fish) return { ok: false, error: "Không thấy cá" };
      tank.feed({ userId: fish.ownerId, uniqueId: fish.ownerId, name: fish.name }, now, { ignoreCooldown: true, hunger: 100, growth: 0 });
      return { ok: true };
    }
    case "growFish": {
      const fish = tank.fish.get(String(args.id));
      if (!fish) return { ok: false, error: "Không thấy cá" };
      tank.feed({ userId: fish.ownerId, uniqueId: fish.ownerId, name: fish.name }, now, { ignoreCooldown: true, hunger: 0, growth: 200 });
      return { ok: true };
    }
    case "killFish": {
      const fish = tank.fish.get(String(args.id));
      if (fish) tank.kill(fish, now);
      return { ok: Boolean(fish) };
    }
    case "setWeather": {
      const kind = String(args.kind) as WeatherKind;
      if (!(kind in WEATHER_INFO)) return { ok: false, error: "Thời tiết lạ" };
      tank.startWeather(kind, now);
      return { ok: true };
    }
    case "setNight":
      tank.rules = { ...tank.rules, nightMode: Math.max(0, Math.min(3, Number(args.mode) || 0)) };
      return { ok: true };
    case "setDirt":
      tank.dirt = Math.max(0, Math.min(100, Number(args.value) || 0));
      return { ok: true };
    case "startCleanup":
      return tank.startCleanup(now) ? { ok: true } : { ok: false, error: "Đang có thử thách khác" };
    case "startPredator":
      return tank.startPredator(now) ? { ok: true } : { ok: false, error: "Đang có thử thách khác" };
    case "setGifts": {
      const list = Array.isArray(args.gifts) ? (args.gifts as GiftMapping[]) : [];
      const clean = list
        .filter((g) => g && typeof g.giftName === "string" && g.reward in REWARDS)
        .map((g) => ({
          giftId: g.giftId === null || g.giftId === undefined || String(g.giftId) === "" ? null : Number(g.giftId),
          giftName: g.giftName.trim(),
          coins: Math.max(0, Number(g.coins) || 0),
          reward: g.reward,
          enabled: g.enabled !== false,
        }));
      tank.gifts = clean;
      for (const g of clean) tank.unmapped.delete(g.giftId !== null ? `id:${g.giftId}` : `name:${normalize(g.giftName)}`);
      persist();
      return { ok: true };
    }
    case "resetGifts":
      tank.gifts = DEFAULT_GIFTS.map((g) => ({ ...g }));
      persist();
      return { ok: true };
    case "testGift": {
      // Giả lập một người xem tặng quà (dùng được cả khi đang LIVE thật, để thử hiệu ứng).
      const g = tank.gifts.find((x) => x.giftName === args.giftName);
      if (!g) return { ok: false, error: "Không có quà này" };
      const pool = demo()?.users ?? [];
      const withFish = pool.filter((u) => tank.fishOf(u.userId));
      const who = args.newViewer ? pool.find((u) => !tank.fishOf(u.userId) && !tank.eggs.has(u.userId)) : withFish[Math.floor(Math.random() * withFish.length)];
      const user = who ?? { userId: `admin-${now}`, uniqueId: `admin${now}`, name: "Khách Admin" };
      tank.handle({ type: "gift", eventKey: `admin:${now}:${Math.random()}`, user, giftId: g.giftId, giftName: g.giftName, count: Number(args.count) || 1, diamonds: g.coins }, now);
      return { ok: true };
    }
    case "chatAs": {
      // Thử lệnh comment dưới tên một chủ cá (ví dụ "cắn @tên").
      const fish = [...tank.fish.values()].find((f) => f.name === args.name) ?? tank.ranked()[0];
      if (!fish) return { ok: false, error: "Bể trống" };
      const o = tank.owners.get(fish.ownerId);
      tank.handle({ type: "chat", eventId: `admin:${now}:${Math.random()}`, user: { userId: fish.ownerId, uniqueId: o?.uniqueId ?? fish.ownerId, name: fish.name }, text: String(args.text ?? "") }, now);
      return { ok: true };
    }
    case "giveReward": {
      const fish = tank.fish.get(String(args.id));
      const reward = String(args.reward) as keyof typeof REWARDS;
      if (!fish || !(reward in REWARDS)) return { ok: false, error: "Sai cá hoặc phần thưởng" };
      tank.applyToFish(fish, reward, 1, now);
      return { ok: true };
    }
    case "setAudio": {
      const next = { ...tank.audio };
      for (const [key, value] of Object.entries(args)) {
        if (!(key in DEFAULT_AUDIO)) continue;
        const def = DEFAULT_AUDIO[key as keyof AudioSettings];
        if (typeof def === "boolean") (next as Record<string, unknown>)[key] = Boolean(value);
        else if (typeof def === "string") (next as Record<string, unknown>)[key] = String(value);
        else if (Number.isFinite(Number(value))) (next as Record<string, unknown>)[key] = Math.max(0, key === "ambientSec" ? Number(value) : Math.min(1, Number(value)));
      }
      tank.audio = next;
      persist();
      return { ok: true };
    }
    case "testVoice": {
      const text = String(args.text ?? "").trim() || "Xin chào cả nhà, chào mừng tới Bể Cá Hạnh Phúc!";
      if (!tank.audio.mc) return { ok: false, error: "MC đang tắt" };
      narrator.say(text.slice(0, 200), P.event, true);
      return { ok: true };
    }
    case "starveAll":
      // Thử nghiệm: kéo đói cả bể xuống để xem cảnh báo, kiệt sức và chết.
      for (const f of tank.fish.values()) f.hunger = Math.min(f.hunger, Number(args.to ?? 12));
      return { ok: true };
    case "clearTank":
      // Dọn bể khi thử nghiệm: không tính là cá chết, không thông báo.
      tank.fish.clear();
      tank.eggs.clear();
      tank.waiting = [];
      tank.crownId = null;
      tank.challenge = null;
      tank.addLog("system", "Admin đã dọn bể");
      return { ok: true };
    case "setRules": {
      const next = { ...tank.rules };
      for (const [key, value] of Object.entries(args)) {
        if (key in DEFAULT_RULES && Number.isFinite(Number(value)) && Number(value) >= 0) (next as Record<string, number>)[key] = Number(value);
      }
      tank.rules = next;
      persist();
      return { ok: true };
    }
    case "resetRules":
      tank.rules = { ...DEFAULT_RULES };
      return { ok: true };
    default:
      return { ok: false, error: `Lệnh lạ: ${cmd}` };
  }
}

// ---------- transport ----------

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, fish: tank.fish.size, connector: connector.state, voice: voice?.status().engine ?? "none" }));
    return;
  }
  // File giọng MC (Stage phát bằng <audio>, nên OBS thu được tiếng).
  const file = req.url?.match(/^\/voice\/([^/?]+)$/)?.[1];
  const path = file && voice?.audioPath(file);
  if (path && existsSync(path)) {
    const type = path.endsWith(".mp3") ? "audio/mpeg" : path.endsWith(".m4a") ? "audio/mp4" : "audio/wav";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" });
    createReadStream(path).pipe(res);
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
const admins = new Set<WebSocket>();
const viewers = new Set<WebSocket>();

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMessage, targets: Iterable<WebSocket>) {
  const text = JSON.stringify(msg);
  for (const ws of targets) if (ws.readyState === ws.OPEN) ws.send(text);
}

function adminState(): AdminState {
  const d = demo();
  return {
    connector,
    voice: voice?.status() ?? NO_VOICE,
    narration: narrator.recent,
    audio: tank.audio,
    env: { weather: tank.weather, night: tank.isNight(Date.now()), dirt: Math.round(tank.dirt), challenge: tank.challenge?.kind ?? null },
    demo: { running: d?.running ?? false, rate: d?.rate ?? 0 },
    rules: tank.rules,
    gifts: tank.gifts,
    unmapped: [...tank.unmapped.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, 30),
    log: tank.log.slice(0, 120),
    fish: tank.adminFish(),
    totals: tank.totals,
  };
}

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://engine");
  if (url.pathname !== "/ws") return socket.destroy();
  const role = url.searchParams.get("role") === "admin" ? "admin" : "stage";
  wss.handleUpgrade(req, socket, head, (ws) => {
    const set = role === "admin" ? admins : viewers;
    set.add(ws);
    send(ws, { type: "snapshot", snap: tank.snapshot(Date.now()) });
    if (role === "admin") send(ws, { type: "admin", state: adminState() });
    ws.on("close", () => set.delete(ws));
    if (role !== "admin") return; // Stage chỉ đọc.
    ws.on("message", (raw) => {
      let msg: ClientCommand;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg?.type !== "cmd") return;
      let result;
      try {
        result = runCommand(msg.cmd, msg.args);
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : "Lỗi" };
      }
      send(ws, { type: "ack", id: msg.id, ...result });
      broadcast({ type: "admin", state: adminState() }, admins);
    });
  });
});

let lastSnapshotAt = 0;
setInterval(() => {
  const now = Date.now();
  tank.tick(now);
  const fx = tank.takeFx();
  if (fx.length) broadcast({ type: "fx", fx }, [...viewers, ...admins]);
  narrator.consume(fx, now);
  // Đang có thử thách thì MC không chen câu nhắc cách chơi.
  narrator.tick(now, !tank.challenge);
  if (tank.takeDirty() || now - lastSnapshotAt > 1000) {
    lastSnapshotAt = now;
    broadcast({ type: "snapshot", snap: tank.snapshot(now) }, [...viewers, ...admins]);
  }
}, 250);
setInterval(() => admins.size && broadcast({ type: "admin", state: adminState() }, admins), 1000);
setInterval(persist, 10_000);

server.listen(port, host, () => console.log(`[engine] ws://${host}:${port}/ws`));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    persist();
    adapter?.stop();
    process.exit(0);
  });
}
