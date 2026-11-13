"use client";

import * as Phaser from "phaser";
import { FISH_TEXTURES, FORM_STAGE, NAME_STAGE, REWARDS, SMALL_STAGE, SPECIES, STAGES, TIER_COLORS } from "@/shared/config";
import type { EggView, FishView, Fx, Snapshot } from "@/shared/protocol";
import type { EngineClient } from "./engine-client";
import { EnvLayer } from "./env-layer";
import { CANVAS_H, CANVAS_W, SAND_Y, SURFACE_Y, SWIM_BOTTOM, SWIM_TOP } from "./stage-size";

/** Ảnh cá cho game: 512px, cá chiếm ~96% bề ngang (scripts/draw-fish.mjs --export). */
const TEX_PX = 512;
const FISH_SPAN = TEX_PX * 0.96;
const ROPE_POINTS = 12;
/** Hai hàng trứng ngay dưới dải hướng dẫn ở đầu màn. */
const EGG_SLOTS = [
  [150, 455], [390, 455], [630, 455], [870, 455],
  [150, 610], [390, 610], [630, 610], [870, 610],
] as const;
const EGG_SIZE = 84;
const NAME_MAX = 22;
/** Bong bóng "đói" (lời cá nói): hiện khi đói dưới mức này, tối đa MAX_BUBBLES cái cùng lúc. */
const HUNGRY_AT = 30;
const CRITICAL_AT = 15;
const MAX_BUBBLES = 6;
type BubbleMood = "hungry" | "critical" | "happy";
const BUBBLE_STYLE: Record<BubbleMood, { fill: number; line: number; text: string }> = {
  hungry: { fill: 0xffffff, line: 0xff8a3d, text: "#7a2e00" },
  critical: { fill: 0xffe1e1, line: 0xff3b3b, text: "#8a0f0f" },
  happy: { fill: 0xeaffea, line: 0x57c46f, text: "#1d5b2a" },
};
const HUNGRY_LINES = ["Đói quá 🥺", "Cho tui ăn đi!", "Bụng réo rồi…", "Đói bụng nè 😢", "Ai cho ăn với!", "{name} ơi, đói!"];
const CRITICAL_LINES = ["Đói lả rồi… 😵", "Cứu tui với!!", "Sắp xỉu rồi…", "{name} ơi, cứu!"];
const EXHAUSTED_LINES = ["Thả tim cứu tui… 😵", "Hết sức rồi…"];
const HAPPY_LINES = ["Ngon quá! 😋", "No rồi nè 🥰", "Cảm ơn nha!", "Măm măm 🍤"];
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

const short = (name: string) => (name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface FishSprite {
  view: FishView;
  root: Phaser.GameObjects.Container;
  rope: Phaser.GameObjects.Rope;
  texKey: string;
  label: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  crown: Phaser.GameObjects.Text;
  bars: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  facing: 1 | -1;
  /** -1..1 khi đang quay đầu. */
  turn: number;
  phase: number;
  size: number;
  /** Phóng to tạm thời khi lên cấp. */
  pop: number;
  hidden: boolean;
  /** Đang bơi tới viên thức ăn. */
  chaseUntil: number;
  warnUntil: number;
  bubble: Phaser.GameObjects.Container | null;
  /** Khiên (bong bóng xanh) và hào quang bất tử, vẽ riêng để không bị lật theo thân cá. */
  shieldImg: Phaser.GameObjects.Image | null;
  haloImg: Phaser.GameObjects.Image | null;
  nextSpark: number;
  bubbleMood: BubbleMood | null;
  bubbleUntil: number;
  nextBubbleAt: number;
}

interface EggSprite {
  view: EggView;
  root: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  pct: Phaser.GameObjects.Text;
  timer: Phaser.GameObjects.Text;
  slot: number;
  shown: number;
}

class TankScene extends Phaser.Scene {
  private client!: EngineClient;
  private font = "sans-serif";
  private readonly fish = new Map<string, FishSprite>();
  private readonly eggs = new Map<string, EggSprite>();
  /** Vị trí trứng cuối cùng của từng chủ, để cá mới nở rơi xuống từ đúng chỗ đó. */
  private readonly lastEggAt = new Map<string, { x: number; y: number; at: number; key: string }>();
  private readonly deaths = new Set<string>();
  private readonly failed = new Set<string>();
  private bubbles: { img: Phaser.GameObjects.Image; speed: number; wobble: number }[] = [];
  private weeds: { rope: Phaser.GameObjects.Rope; phase: number; amp: number }[] = [];
  private rays: Phaser.GameObjects.Image[] = [];
  private waiting!: Phaser.GameObjects.Text;
  private first = true;
  private envLayer!: EnvLayer;
  private surface!: Phaser.GameObjects.Image;
  private mood = "";
  private talkers = new Set<string>();
  private lastSeq = -1;
  private offFx: (() => void) | null = null;

  constructor() {
    super("tank");
  }

  private playSfx: (name: "thunder" | "plop" | "meow" | "swipe") => void = () => undefined;

  init(data: { client: EngineClient; font: string; sound?: (name: "thunder" | "plop" | "meow" | "swipe") => void }) {
    this.client = data.client;
    this.font = data.font;
    if (data.sound) this.playSfx = data.sound;
  }

  preload() {
    for (const key of FISH_TEXTURES) this.load.image(key, `/assets/fish/${key}.png`);
  }

  create() {
    this.makeTextures();
    this.envLayer = new EnvLayer(
      this,
      () => [...this.fish.values()].filter((f) => !f.hidden).map((f) => ({ id: f.view.id, x: f.x, y: f.y, size: f.size, stage: f.view.stage })),
      (id, text) => {
        const f = this.fish.get(id);
        if (f && !f.hidden) this.showBubble(f, text, "happy", 1800);
      },
      (x, y, str, color, size) => this.floatText(x, y, str, color, size),
      () => this.rays,
      this.font,
      (name) => this.playSfx(name),
    );
    this.envLayer.makeTextures();
    this.add.image(0, 0, "bg").setOrigin(0).setDepth(0);
    for (let i = 0; i < 5; i++) {
      const ray = this.add.image(rand(80, 1000), SURFACE_Y - 20, "ray").setOrigin(0.5, 0).setDepth(1).setAlpha(0.12).setBlendMode(Phaser.BlendModes.ADD);
      ray.setRotation(rand(-0.25, 0.1)).setScale(rand(0.8, 1.6), rand(0.9, 1.3));
      this.rays.push(ray);
      this.tweens.add({ targets: ray, alpha: { from: 0.04, to: 0.16 }, duration: rand(3000, 6000), yoyo: true, repeat: -1, ease: "Sine.inOut", delay: rand(0, 3000) });
    }
    this.makeSeaweed();
    for (let i = 0; i < 26; i++) this.spawnBubble(true);
    this.surface = this.add.image(0, SURFACE_Y - 40, "surface").setOrigin(0).setDepth(2);
    this.envLayer.create();
    this.waiting = this.text(CANVAS_W / 2, 715, "", 26, "#ffffff").setDepth(950);

    this.offFx = this.client.onFx((fx) => {
      // Scene đã bị hủy (đóng tab Admin, HMR, game.destroy) mà socket còn gửi hiệu ứng: bỏ qua.
      if (!this.sys?.isActive()) return;
      this.onFx(fx);
    });
    this.events.once("shutdown", () => this.offFx?.());
    this.events.once("destroy", () => this.offFx?.());
  }

  // ---------- textures vẽ bằng canvas ----------

  private canvas(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d")!);
    this.textures.addCanvas(key, c);
  }

  private makeTextures() {
    this.canvas("bg", CANVAS_W, CANVAS_H, (g) => {
      // Không khí phía trên mặt nước
      g.fillStyle = "#d9f4f7";
      g.fillRect(0, 0, CANVAS_W, SURFACE_Y);
      const water = g.createLinearGradient(0, SURFACE_Y, 0, SAND_Y + 80);
      water.addColorStop(0, "#9fe3ea");
      water.addColorStop(0.35, "#5cc6d0");
      water.addColorStop(1, "#1f8c9c");
      g.fillStyle = water;
      g.fillRect(0, SURFACE_Y, CANVAS_W, CANVAS_H - SURFACE_Y);
      // Cát
      const sand = g.createLinearGradient(0, SAND_Y, 0, CANVAS_H);
      sand.addColorStop(0, "#f4e3c1");
      sand.addColorStop(0.4, "#e8cf9e");
      sand.addColorStop(1, "#c9a670");
      g.fillStyle = sand;
      g.beginPath();
      g.moveTo(0, SAND_Y + 40);
      for (let x = 0; x <= CANVAS_W; x += 60) g.quadraticCurveTo(x + 30, SAND_Y + 10 + Math.sin(x / 140) * 26, x + 60, SAND_Y + 30 + Math.cos(x / 170) * 20);
      g.lineTo(CANVAS_W, CANVAS_H);
      g.lineTo(0, CANVAS_H);
      g.fill();
      // Sỏi màu
      const pebbles = ["#ff8fab", "#f6b93b", "#7fd4c8", "#ffffff", "#b9a1e6", "#ff7f50"];
      for (let i = 0; i < 140; i++) {
        const x = Math.random() * CANVAS_W;
        const y = SAND_Y + 60 + Math.random() * (CANVAS_H - SAND_Y - 60);
        const r = 5 + Math.random() * 10;
        g.fillStyle = pebbles[i % pebbles.length];
        g.globalAlpha = 0.85;
        g.beginPath();
        g.ellipse(x, y, r * 1.3, r, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#ffffff";
        g.globalAlpha = 0.45;
        g.beginPath();
        g.ellipse(x - r * 0.4, y - r * 0.4, r * 0.4, r * 0.25, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      // Đá lớn
      for (const [x, y, w, h, c] of [[110, SAND_Y + 70, 120, 80, "#8aa3a8"], [960, SAND_Y + 60, 150, 100, "#7d969c"], [540, SAND_Y + 120, 90, 55, "#9ab0b4"]] as const) {
        const rock = g.createRadialGradient(x - w * 0.3, y - h * 0.4, 5, x, y, w);
        rock.addColorStop(0, "#d5e3e5");
        rock.addColorStop(0.5, c);
        rock.addColorStop(1, "#4f676d");
        g.fillStyle = rock;
        g.beginPath();
        g.ellipse(x, y, w, h, 0, Math.PI, 0);
        g.ellipse(x, y, w, h * 0.3, 0, 0, Math.PI);
        g.fill();
      }
      // Kính bể: viền sáng hai bên
      const edge = g.createLinearGradient(0, 0, 40, 0);
      edge.addColorStop(0, "rgba(255,255,255,0.35)");
      edge.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = edge;
      g.fillRect(0, SURFACE_Y, 40, CANVAS_H);
      g.save();
      g.translate(CANVAS_W, 0);
      g.scale(-1, 1);
      g.fillRect(0, SURFACE_Y, 40, CANVAS_H);
      g.restore();
    });

    this.canvas("surface", CANVAS_W, 90, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 90);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.45, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.6, "rgba(190,240,245,0.6)");
      grad.addColorStop(1, "rgba(160,230,236,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 40);
      for (let x = 0; x <= CANVAS_W; x += 40) g.quadraticCurveTo(x + 20, 30 + (x % 80 ? 10 : -6), x + 40, 40);
      g.lineTo(CANVAS_W, 90);
      g.lineTo(0, 90);
      g.fill();
    });

    this.canvas("ray", 220, 1300, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 1300);
      grad.addColorStop(0, "rgba(255,255,240,1)");
      grad.addColorStop(1, "rgba(255,255,240,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(80, 0);
      g.lineTo(140, 0);
      g.lineTo(220, 1300);
      g.lineTo(0, 1300);
      g.fill();
    });

    this.canvas("bubble", 64, 64, (g) => {
      const grad = g.createRadialGradient(26, 24, 2, 32, 32, 30);
      grad.addColorStop(0, "rgba(255,255,255,0.15)");
      grad.addColorStop(0.8, "rgba(255,255,255,0.25)");
      grad.addColorStop(1, "rgba(255,255,255,0.85)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(32, 32, 29, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.95)";
      g.beginPath();
      g.ellipse(22, 20, 8, 5, -0.6, 0, Math.PI * 2);
      g.fill();
    });

    this.canvas("glow", 128, 128, (g) => {
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,250,200,0.6)");
      grad.addColorStop(1, "rgba(255,250,200,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    });

    this.canvas("shieldBubble", 160, 160, (g) => {
      const grad = g.createRadialGradient(80, 80, 30, 80, 80, 78);
      grad.addColorStop(0, "rgba(120,220,255,0.05)");
      grad.addColorStop(0.75, "rgba(120,220,255,0.25)");
      grad.addColorStop(0.95, "rgba(170,240,255,0.95)");
      grad.addColorStop(1, "rgba(170,240,255,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(80, 80, 78, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.lineWidth = 6;
      g.lineCap = "round";
      g.beginPath();
      g.arc(80, 80, 60, Math.PI * 1.1, Math.PI * 1.45);
      g.stroke();
    });

    this.canvas("pellet", 24, 24, (g) => {
      const grad = g.createRadialGradient(9, 8, 1, 12, 12, 11);
      grad.addColorStop(0, "#ffe2a8");
      grad.addColorStop(0.6, "#e8913a");
      grad.addColorStop(1, "#a85a1c");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(12, 12, 10, 0, Math.PI * 2);
      g.fill();
    });

    this.canvas("weed", 300, 70, (g) => {
      // Ngang: Rope sẽ dựng đứng; gốc ở bên trái.
      const grad = g.createLinearGradient(0, 0, 300, 0);
      grad.addColorStop(0, "#2f7d3a");
      grad.addColorStop(1, "#7fd06a");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 22);
      for (let x = 0; x <= 300; x += 30) g.quadraticCurveTo(x + 15, 6 + (x / 300) * 18, x + 30, 18 + (x / 300) * 12);
      g.lineTo(300, 35);
      for (let x = 300; x >= 0; x -= 30) g.quadraticCurveTo(x - 15, 64 - (x / 300) * 18, x - 30, 52 - (x / 300) * 12);
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(220,255,200,0.5)";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, 35);
      g.lineTo(300, 35);
      g.stroke();
    });
  }

  private makeSeaweed() {
    const spots = [40, 90, 230, 300, 470, 700, 760, 900, 1010, 1050];
    for (const [i, x] of spots.entries()) {
      const height = rand(220, 420);
      const points = Array.from({ length: 10 }, (_, k) => new Phaser.Math.Vector2(0, 0));
      const rope = this.add.rope(x, SAND_Y + 60 + (i % 3) * 30, "weed", undefined, points, true).setDepth(i % 2 ? 3 : 980);
      rope.setScale(height / 300, 1);
      rope.setRotation(-Math.PI / 2);
      if (i % 2 === 0) rope.setAlpha(0.95);
      this.weeds.push({ rope, phase: rand(0, 6), amp: rand(10, 22) });
    }
  }

  private spawnBubble(anywhere = false) {
    const img = this.add.image(rand(30, CANVAS_W - 30), anywhere ? rand(SURFACE_Y + 40, SAND_Y) : SAND_Y + rand(0, 60), "bubble").setDepth(5);
    img.setScale(rand(0.15, 0.45)).setAlpha(rand(0.5, 0.9));
    this.bubbles.push({ img, speed: rand(40, 110), wobble: rand(0, 6) });
  }

  private text(x: number, y: number, str: string, size: number, color: string, stroke = "#0b4a55") {
    return this.add
      .text(x, y, str, { fontFamily: this.font, fontSize: `${size}px`, fontStyle: "800", color, stroke, strokeThickness: Math.max(4, size / 4.5), align: "center" })
      .setOrigin(0.5);
  }

  // ---------- đồng bộ snapshot ----------

  private sync(snap: Snapshot) {
    const now = this.time.now;
    // Gỡ trứng trước, để cá vừa nở biết trứng của mình nằm ở đâu.
    const owners = new Set(snap.eggs.map((e) => e.ownerId));
    for (const [owner, e] of this.eggs) if (!owners.has(owner)) this.removeEgg(owner, e, snap);

    const ids = new Set(snap.fish.map((f) => f.id));
    for (const [id, s] of this.fish) if (!ids.has(id)) this.removeFish(id, s);
    for (const view of snap.fish) {
      const s = this.fish.get(view.id);
      if (s) this.updateFish(s, view);
      else this.addFish(view, now);
    }

    // Mỗi trứng giữ nguyên ô của nó cho tới khi nở/vỡ; trứng mới lấy ô trống đầu tiên.
    for (const view of snap.eggs) {
      const e = this.eggs.get(view.ownerId);
      if (e) {
        e.view = view;
        continue;
      }
      const used = new Set([...this.eggs.values()].map((x) => x.slot));
      const slot = EGG_SLOTS.findIndex((_, i) => !used.has(i));
      if (slot >= 0) this.addEgg(view, slot);
    }
    const shown = this.eggs.size;
    this.envLayer.sync(snap.env, snap.challenge);
    // Mèo tới hoặc bão nổi: cá đổi hướng ngay, không đợi tới điểm bơi cũ.
    const mood = `${snap.challenge?.kind ?? ""}:${snap.env.weather === "storm" ? "storm" : ""}`;
    if (mood !== this.mood) {
      this.mood = mood;
      for (const f of this.fish.values()) this.pickTarget(f);
    }
    const hiddenEggs = Math.max(0, snap.eggs.length - shown) + snap.waiting;
    // Bảng thử thách nằm đúng chỗ dòng này, nên ẩn đi khi có thử thách.
    this.waiting.setText(hiddenEggs && !snap.challenge ? `+${hiddenEggs} người đang chờ thả trứng` : "");
    this.first = false;
  }

  // ---------- cá ----------

  private texFor(view: FishView) {
    return SPECIES[view.species].textures[view.stage];
  }

  private colorFor(view: FishView) {
    return this.texFor(view) === "fish-fry-base" ? SPECIES[view.species].fryTint : view.variant;
  }

  private addFish(view: FishView, now: number) {
    const egg = this.lastEggAt.get(view.ownerId);
    const fromEgg = !this.first && egg && now - egg.at < 6000;
    const size = STAGES[view.stage].size;
    const x = fromEgg ? egg.x : rand(120, CANVAS_W - 120);
    const y = fromEgg ? rand(900, 1300) : this.pickY(view.stage);
    const points = Array.from({ length: ROPE_POINTS }, (_, i) => new Phaser.Math.Vector2(-TEX_PX / 2 + (i * TEX_PX) / (ROPE_POINTS - 1), 0));
    const key = this.texFor(view);
    const rope = this.add.rope(0, 0, key, undefined, points, true);
    rope.setColors(this.colorFor(view));
    const root = this.add.container(x, y, [rope]).setDepth(100 + view.stage * 10);
    const name = this.text(0, 0, `Lv${view.stage} ${short(view.name)}`, 22, TIER_COLORS[view.tier]);
    const crown = this.add.text(0, -34, "👑", { fontFamily: EMOJI, fontSize: "34px" }).setOrigin(0.5).setVisible(false);
    const bars = this.add.graphics();
    const label = this.add.container(x, y, [bars, name, crown]).setDepth(1000);
    const s: FishSprite = {
      view, root, rope, texKey: key, label, name, crown, bars,
      x, y, vx: 0, vy: 0, tx: x, ty: y, facing: Math.random() < 0.5 ? 1 : -1, turn: 1,
      phase: rand(0, 6), size, pop: 1, hidden: false, chaseUntil: 0, warnUntil: 0,
      bubble: null, bubbleMood: null, bubbleUntil: 0, nextBubbleAt: this.time.now + rand(500, 3000),
      shieldImg: null, haloImg: null, nextSpark: 0,
    };
    this.pickTarget(s);
    this.fish.set(view.id, s);
    this.updateFish(s, view);
    if (fromEgg) this.dropEgg(s, egg);
    else if (!this.first) {
      root.setAlpha(0);
      this.tweens.add({ targets: root, alpha: 1, duration: 600 });
    }
  }

  /** Trứng vừa đầy rơi từ mặt nước xuống rồi nở. */
  private dropEgg(s: FishSprite, egg: { x: number; y: number; key: string }) {
    s.hidden = true;
    s.root.setVisible(false);
    s.label.setVisible(false);
    const img = this.add.image(egg.x, egg.y, egg.key).setDisplaySize(EGG_SIZE, EGG_SIZE).setDepth(900);
    this.tweens.add({
      targets: img,
      x: s.x,
      y: s.y,
      angle: 200,
      duration: 1300,
      ease: "Quad.in",
      onComplete: () => {
        this.burst(s.x, s.y, 0xfff6c0, 1.6);
        for (let i = 0; i < 6; i++) {
          const shard = this.add.image(s.x, s.y, egg.key).setDisplaySize(26, 26).setDepth(900);
          this.tweens.add({ targets: shard, x: s.x + rand(-90, 90), y: s.y + rand(-70, 40), alpha: 0, angle: rand(-200, 200), duration: 700, onComplete: () => shard.destroy() });
        }
        img.destroy();
        s.hidden = false;
        s.root.setVisible(true).setScale(0.2);
        s.label.setVisible(true);
        this.tweens.add({ targets: s.root, scale: 1, duration: 500, ease: "Back.out" });
      },
    });
  }

  private updateFish(s: FishSprite, view: FishView) {
    const prev = s.view;
    s.view = view;
    const key = this.texFor(view);
    if (key !== s.texKey) {
      s.texKey = key;
      s.rope.setTexture(key);
    }
    // Kiệt sức: nhợt màu, có dấu 😵 trước tên.
    s.rope.setColors(view.status === "exhausted" ? 0xd6e4e6 : this.colorFor(view));
    s.rope.setAlpha(view.status === "exhausted" ? 0.75 : 1);
    // "Lv12 Tên": cấp đứng trước tên, tên + cấp tô màu theo bậc cá (thường xám, hiếm xanh, rồng cam).
    s.name.setText(`${view.status === "exhausted" ? "😵 " : ""}Lv${view.stage} ${short(view.name)}${view.badges ? ` ${view.badges}` : ""}${view.killBite ? " 🗡️" : view.canBite ? " 🦷" : ""}`);
    s.name.setColor(TIER_COLORS[view.tier]);
    if (prev.stage !== view.stage) s.root.setDepth(100 + view.stage * 10);
    if (view.status === "alive" && prev.status === "exhausted") this.pickTarget(s);
  }

  private removeFish(id: string, s: FishSprite) {
    this.fish.delete(id);
    s.label.destroy();
    s.bubble?.destroy();
    if (s.shieldImg) this.popShield(s.shieldImg);
    s.haloImg?.destroy();
    if (this.deaths.delete(id)) {
      // Hồn cá: lật bụng, nhạt dần và nổi lên mặt nước.
      const soul = this.add.image(s.x, s.y, "bubble").setScale(0.2).setDepth(960).setAlpha(0.9);
      const tag = this.text(s.x, s.y - 40, `🫧 ${short(s.view.name)}`, 22, "#e8fbff").setDepth(961);
      this.tweens.add({ targets: [soul, tag], y: `-=${s.y - SURFACE_Y}`, alpha: 0, duration: 3500, ease: "Sine.in", onComplete: () => (soul.destroy(), tag.destroy()) });
      this.tweens.add({ targets: soul, scale: 0.9, duration: 3500 });
      this.tweens.add({ targets: s.root, alpha: 0, y: s.y - 120, duration: 1800, onComplete: () => s.root.destroy() });
    } else {
      this.tweens.add({ targets: s.root, alpha: 0, duration: 500, onComplete: () => s.root.destroy() });
    }
  }

  private pickY(stage: number) {
    return stage <= 4 ? rand(950, SWIM_BOTTOM - 20) : rand(SWIM_TOP + 80, SWIM_BOTTOM - 40);
  }

  private pickTarget(s: FishSprite) {
    const flee = this.envLayer?.fleeTarget(s.view.stage);
    s.ty = flee?.y ?? this.pickY(s.view.stage);
    // Cột menu quà nằm bên phải (y 760–1180): ở dải đó cá không bơi vào sau cột.
    const behindMenu = s.ty > 700 && s.ty < 1240;
    s.tx = Math.min(flee?.x ?? rand(90, CANVAS_W - 90), behindMenu ? CANVAS_W - 300 : CANVAS_W - 90);
  }

  private stepFish(s: FishSprite, dt: number, crowd: number) {
    const sec = dt / 1000;
    const view = s.view;
    const exhausted = view.status === "exhausted";
    const targetSize = STAGES[view.stage].size;
    s.size += (targetSize - s.size) * Math.min(1, sec * 2.5);
    s.pop += (1 - s.pop) * Math.min(1, sec * 4);

    if (exhausted) {
      // Kiệt sức: trôi chậm lên trên, lật nghiêng.
      s.vx *= 0.95;
      s.vy = -18;
      // Nổi lên nhưng dừng dưới hàng trứng.
      s.y = Math.max(SWIM_TOP + 140, s.y + s.vy * sec);
    } else {
      const speed = (55 + (Math.min(view.stage, FORM_STAGE) / FORM_STAGE) * 63) * (view.hunger < 30 ? 0.55 : 1) * (s.chaseUntil > this.time.now ? 2.4 : 1);
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 20 && s.chaseUntil < this.time.now) this.pickTarget(s);
      const steer = Math.min(1, sec * 1.6);
      s.vx += ((dx / (dist || 1)) * speed - s.vx) * steer;
      s.vy += ((dy / (dist || 1)) * speed * 0.6 - s.vy) * steer;
      s.x = Phaser.Math.Clamp(s.x + s.vx * sec, 50, CANVAS_W - 50);
      s.y = Phaser.Math.Clamp(s.y + s.vy * sec, SWIM_TOP, SWIM_BOTTOM);
      // Cột menu quà (bên phải, y 740–1200) như một vách kính: cá không bơi ra sau nó.
      const wall = CANVAS_W - 250 - s.size * 0.4;
      if (s.y > 700 && s.y < 1240 && s.x > wall) {
        s.x = Math.max(wall, s.x - 400 * sec);
        if (s.tx > wall) s.tx = wall - 40;
      }
      if (Math.abs(s.vx) > 12) s.facing = s.vx > 0 ? 1 : -1;
    }
    s.turn += (s.facing - s.turn) * Math.min(1, sec * 7);

    // Thân uốn lượn: đuôi (bên trái ảnh) quẫy mạnh, đầu gần như đứng yên.
    const swim = exhausted ? 0.25 : 0.6 + Math.min(1, Math.hypot(s.vx, s.vy) / 120);
    s.phase += sec * (exhausted ? 2 : 6 + swim * 3);
    const pts = s.rope.points as Phaser.Types.Math.Vector2Like[];
    for (let i = 0; i < ROPE_POINTS; i++) {
      const u = i / (ROPE_POINTS - 1);
      pts[i].y = Math.sin(s.phase - u * 3.2) * 16 * swim * Math.pow(1 - u, 1.6);
    }
    s.rope.setDirty();

    const scale = (s.size / FISH_SPAN) * s.pop;
    s.rope.setScale(scale, scale);
    s.root.setPosition(s.x, s.y);
    s.root.setScale(s.turn, exhausted ? -1 : 1);
    const tilt = exhausted ? 0.35 : Phaser.Math.Clamp(s.vy / 160, -0.35, 0.35) * Math.sign(s.turn || 1);
    s.root.setRotation(tilt);

    // Nhãn: luôn thẳng, nằm trên đầu cá.
    const recent = this.time.now - this.localTime(view.activeAt) < 10_000;
    const vip = view.tier !== "common" || view.crowned;
    // Đông cá thì chỉ giữ chi tiết cho cá vừa được chủ tương tác, cá đói, cá quà và cá chúa.
    const showName = crowd <= 35 || view.stage >= NAME_STAGE || vip || recent;
    const showBars = recent || view.hunger < 40 || view.status === "exhausted" || (crowd <= 12 && view.stage >= SMALL_STAGE);
    // Mỗi loài cao khác nhau (cá vàng tròn, cá neon thon): nhãn đặt sát mép trên của loài đó.
    const top = s.y - s.size * SPECIES[view.species].labelTop * s.pop - 6;
    s.label.setPosition(s.x, top);
    s.label.setVisible(!s.hidden && showName);
    s.name.setY(showBars ? -24 : -10);
    s.crown.setVisible(view.crowned).setY(showBars ? -58 : -44);
    s.bars.clear();
    if (showBars) this.drawBars(s.bars, view, s.warnUntil > this.time.now);

    this.stepAura(s);

    // Bong bóng lời thoại nằm trên tên (và trên vương miện nếu có).
    const labelTop = showName ? (view.crowned ? (showBars ? -78 : -64) : showBars ? -42 : -28) : 0;
    this.stepBubble(s, top + labelTop - 16);
  }

  /** Hiệu ứng quà trên cá: khiên, hào quang bất tử, đốm sáng thuốc lớn nhanh. */
  private stepAura(s: FishSprite) {
    const v = s.view;
    const now = this.time.now;
    const show = !s.hidden;
    if (v.shield && !s.shieldImg) {
      s.shieldImg = this.add.image(s.x, s.y, "shieldBubble").setBlendMode(Phaser.BlendModes.SCREEN).setScale(0.1);
      this.tweens.add({ targets: s.shieldImg, alpha: { from: 0, to: 0.9 }, duration: 300 });
    } else if (!v.shield && s.shieldImg) {
      this.popShield(s.shieldImg);
      s.shieldImg = null;
    }
    if (s.shieldImg) {
      const k = ((s.size * 1.25) / 160) * (1 + Math.sin(now / 300) * 0.04);
      s.shieldImg.setPosition(s.x, s.y).setScale(k).setDepth(s.root.depth + 1).setVisible(show);
    }
    if (v.immortal && !s.haloImg) s.haloImg = this.add.image(s.x, s.y, "glow").setTint(0xffd54a).setBlendMode(Phaser.BlendModes.ADD);
    else if (!v.immortal && s.haloImg) (s.haloImg.destroy(), (s.haloImg = null));
    if (s.haloImg) {
      s.haloImg.setPosition(s.x, s.y).setScale((s.size * 1.9) / 128).setAlpha(0.45 + Math.sin(now / 250) * 0.15).setDepth(s.root.depth - 1).setVisible(show);
    }
    if (v.boost && show && now >= s.nextSpark) {
      s.nextSpark = now + 170;
      const p = this.add.image(s.x + rand(-s.size * 0.4, s.size * 0.4), s.y + rand(-s.size * 0.2, s.size * 0.2), "glow").setTint(0x7dff9a).setBlendMode(Phaser.BlendModes.ADD).setScale(rand(0.08, 0.16)).setDepth(s.root.depth + 1);
      this.tweens.add({ targets: p, y: p.y - rand(40, 80), alpha: 0, duration: 800, onComplete: () => p.destroy() });
    }
  }

  private popShield(img: Phaser.GameObjects.Image) {
    this.tweens.add({ targets: img, scale: img.scale * 1.4, alpha: 0, duration: 350, onComplete: () => img.destroy() });
  }

  /** Cá đói "nói" theo từng đợt: hiện ~3,5s rồi nghỉ, để bể đông không ngập chữ. */
  private stepBubble(s: FishSprite, bottomY: number) {
    const now = this.time.now;
    const view = s.view;
    const exhausted = view.status === "exhausted";
    const hungry = exhausted || view.hunger < HUNGRY_AT;
    if (s.bubble && (now > s.bubbleUntil || (s.bubbleMood !== "happy" && !hungry))) {
      this.hideBubble(s);
      s.nextBubbleAt = now + (exhausted || view.hunger < CRITICAL_AT ? rand(1500, 3000) : rand(3000, 6000));
    }
    if (!s.bubble && hungry && !s.hidden && now >= s.nextBubbleAt && this.talkers.has(view.id)) {
      const critical = exhausted || view.hunger < CRITICAL_AT;
      const lines = exhausted ? EXHAUSTED_LINES : critical ? CRITICAL_LINES : HUNGRY_LINES;
      this.showBubble(s, pick(lines).replace("{name}", short(view.name)), critical ? "critical" : "hungry", 3500);
    }
    if (s.bubble) {
      const half = s.bubble.width / 2;
      s.bubble.setPosition(Phaser.Math.Clamp(s.x, half + 12, CANVAS_W - half - 12), Math.max(SWIM_TOP - 40, bottomY));
      s.bubble.setVisible(!s.hidden);
    }
  }

  private showBubble(s: FishSprite, str: string, mood: BubbleMood, ms: number) {
    this.hideBubble(s, true);
    const style = BUBBLE_STYLE[mood];
    const text = this.add
      .text(0, 0, str, { fontFamily: `${this.font}, ${EMOJI}`, fontSize: "24px", fontStyle: "800", color: style.text })
      .setOrigin(0.5, 1);
    const w = text.width + 28;
    const h = text.height + 12;
    text.setY(-14);
    const g = this.add.graphics();
    g.fillStyle(0x0b4a55, 0.18).fillRoundedRect(-w / 2 + 2, -h - 8, w, h, 16);
    g.fillStyle(style.fill, 1).lineStyle(3, style.line, 1);
    g.fillRoundedRect(-w / 2, -h - 10, w, h, 16).strokeRoundedRect(-w / 2, -h - 10, w, h, 16);
    // Đuôi bong bóng chỉ xuống con cá.
    g.fillTriangle(-9, -12, 9, -12, 0, 2).lineBetween(-9, -10, 0, 2).lineBetween(9, -10, 0, 2);
    g.fillStyle(style.fill, 1).fillRect(-8, -14, 16, 5);
    const bubble = this.add.container(s.x, s.y, [g, text]).setDepth(1010);
    bubble.setSize(w, h + 12);
    bubble.setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: bubble, scale: 1, alpha: 1, duration: 260, ease: "Back.out" });
    if (mood === "critical") this.tweens.add({ targets: text, angle: { from: -3, to: 3 }, duration: 120, yoyo: true, repeat: 5 });
    s.bubble = bubble;
    s.bubbleMood = mood;
    s.bubbleUntil = this.time.now + ms;
  }

  private hideBubble(s: FishSprite, instant = false) {
    const b = s.bubble;
    if (!b) return;
    s.bubble = null;
    s.bubbleMood = null;
    if (instant) b.destroy();
    else this.tweens.add({ targets: b, alpha: 0, scale: 0.6, duration: 220, onComplete: () => b.destroy() });
  }

  /** Đẩy nhẹ các cá đang chồng lên nhau để tên không dính chùm. */
  private separate(dt: number) {
    const list = [...this.fish.values()].filter((f) => !f.hidden);
    const k = Math.min(1, dt / 1000) * 60;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const min = (a.size + b.size) * 0.45 + 30;
        const dx = b.x - a.x;
        const dy = (b.y - a.y) * 1.6;
        const d = Math.hypot(dx, dy);
        if (d >= min || d === 0) continue;
        const push = ((min - d) / min) * k;
        a.vx -= (dx / d) * push;
        a.vy -= (dy / d) * push * 0.6;
        b.vx += (dx / d) * push;
        b.vy += (dy / d) * push * 0.6;
      }
    }
  }

  private drawBars(g: Phaser.GameObjects.Graphics, view: FishView, warn: boolean) {
    const w = 64;
    const h = 6;
    const x = -w / 2;
    g.fillStyle(0x0b4a55, 0.7).fillRoundedRect(x - 3, -13, w + 6, h * 2 + 9, 5);
    const hungerColor = view.hunger > 50 ? 0xffb347 : view.hunger > 15 ? 0xff7a3d : warn && Math.floor(this.time.now / 250) % 2 ? 0xffffff : 0xff3b3b;
    g.fillStyle(0x0b2f36, 1).fillRoundedRect(x, -10, w, h, 3);
    g.fillStyle(hungerColor, 1).fillRoundedRect(x, -10, Math.max(4, (w * view.hunger) / 100), h, 3);
    g.fillStyle(0x0b2f36, 1).fillRoundedRect(x, -1, w, h, 3);
    g.fillStyle(view.stage >= STAGES.length - 1 ? 0xffd54a : 0x6ad66a, 1).fillRoundedRect(x, -1, Math.max(4, (w * view.growth) / 100), h, 3);
  }

  /** Thời điểm server → đồng hồ scene. */
  private localTime(serverMs: number) {
    return this.time.now - (Date.now() + this.client.clockOffset - serverMs);
  }

  // ---------- trứng ----------

  private addEgg(view: EggView, slot: number) {
    const [x, y] = EGG_SLOTS[slot];
    const key = SPECIES[view.species].textures[0];
    const img = this.add.image(0, 0, key).setDisplaySize(EGG_SIZE, EGG_SIZE);
    const name = this.text(0, -62, short(view.name), 22, TIER_COLORS[view.tier]);
    const bar = this.add.graphics();
    const pct = this.text(0, 57, "0%", 17, "#ffffff", "#7a1035");
    const timer = this.text(66, -26, "", 18, "#e8fbff");
    const root = this.add.container(x, y, [img, bar, name, pct, timer]).setDepth(950);
    root.setScale(0.2);
    this.tweens.add({ targets: root, scale: 1, duration: 450, ease: "Back.out" });
    this.tweens.add({ targets: img, y: { from: -5, to: 5 }, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.inOut", delay: rand(0, 800) });
    this.eggs.set(view.ownerId, { view, root, img, name, bar, pct, timer, slot, shown: 0 });
  }

  private stepEgg(e: EggSprite, dt: number) {
    e.shown += (e.view.pct - e.shown) * Math.min(1, (dt / 1000) * 8);
    const w = 160;
    e.bar.clear();
    e.bar.fillStyle(0x0b4a55, 0.8).fillRoundedRect(-w / 2 - 4, 44, w + 8, 26, 13);
    e.bar.fillStyle(0xffffff, 0.22).fillRoundedRect(-w / 2, 48, w, 18, 9);
    e.bar.fillStyle(0xff5c8a, 1).fillRoundedRect(-w / 2, 48, Math.max(18, (w * e.shown) / 100), 18, 9);
    e.pct.setText(`❤️ ${Math.round(e.shown)}%`);
    const left = Math.max(0, Math.ceil((e.view.expiresAt - (Date.now() + this.client.clockOffset)) / 1000));
    e.timer.setText(left <= 30 ? `${left}s` : "");
    e.timer.setColor(left <= 10 ? "#ff8a8a" : "#e8fbff");
    // Rung nhẹ khi gần đầy.
    e.img.setAngle(e.shown > 75 ? Math.sin(this.time.now / 40) * 6 : 0);
  }

  private removeEgg(owner: string, e: EggSprite, snap: Snapshot) {
    this.eggs.delete(owner);
    const hatched = snap.fish.some((f) => f.ownerId === owner) || !this.failed.has(owner);
    this.failed.delete(owner);
    if (hatched) {
      this.lastEggAt.set(owner, { x: e.root.x, y: e.root.y, at: this.time.now, key: e.img.texture.key });
      this.burst(e.root.x, e.root.y, 0xffd6e5, 1.2);
      e.root.destroy();
    } else {
      // Trứng vỡ: mờ dần và chìm.
      this.tweens.add({ targets: e.root, alpha: 0, y: e.root.y + 80, angle: 30, duration: 900, onComplete: () => e.root.destroy() });
    }
  }

  // ---------- hiệu ứng ----------

  private burst(x: number, y: number, tint: number, scale = 1) {
    const glow = this.add.image(x, y, "glow").setDepth(970).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(0.3 * scale);
    this.tweens.add({ targets: glow, scale: 2.4 * scale, alpha: 0, duration: 700, ease: "Quad.out", onComplete: () => glow.destroy() });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dot = this.add.image(x, y, "glow").setDepth(971).setTint(tint).setScale(0.18).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: dot, x: x + Math.cos(a) * 110 * scale, y: y + Math.sin(a) * 110 * scale, alpha: 0, duration: 650, onComplete: () => dot.destroy() });
    }
  }

  private floatText(x: number, y: number, str: string, color: string, size = 30) {
    const t = this.text(x, y, str, size, color).setDepth(990);
    this.tweens.add({ targets: t, y: y - 90, alpha: { from: 1, to: 0 }, duration: 1400, ease: "Sine.out", onComplete: () => t.destroy() });
  }

  private onFx(fx: Fx) {
    this.envLayer.onFx(fx, (id) => {
      const f = this.fish.get(id);
      return f && !f.hidden ? { id, x: f.x, y: f.y, size: f.size, stage: f.view.stage } : null;
    });
    if (fx.kind === "death") this.deaths.add(fx.fishId);
    else if (fx.kind === "eggfail") this.failed.add(fx.ownerId);
    else if (fx.kind === "feed") {
      const s = this.fish.get(fx.fishId);
      if (!s || s.hidden) return;
      s.chaseUntil = this.time.now + 1200;
      // Vừa được ăn thì cảm ơn chủ.
      this.time.delayedCall(1000, () => this.fish.get(fx.fishId) === s && this.showBubble(s, pick(HAPPY_LINES), "happy", 1800));
      s.tx = s.x + rand(-40, 40);
      s.ty = Math.max(SWIM_TOP, s.y - 80);
      for (let i = 0; i < 3; i++) {
        const sx = s.x + rand(-30, 30);
        const p = this.add.image(sx, SURFACE_Y + 10, "pellet").setDepth(940);
        // Viên thức ăn bám theo con cá đang bơi lên đớp.
        this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 900 + i * 120,
          ease: "Quad.in",
          onUpdate: (tw) => {
            const v = tw.getValue() ?? 0;
            p.setPosition(sx + (s.x - sx) * v, SURFACE_Y + 10 + (s.y - SURFACE_Y - 10) * v);
          },
          onComplete: () => p.destroy(),
        });
      }
      this.time.delayedCall(1000, () => this.floatText(s.x, s.y - s.size * 0.5 - 40, `+${fx.amount}% 🍤`, "#ffe08a", 26));
    } else if (fx.kind === "levelup") {
      const s = this.fish.get(fx.fishId);
      if (!s) return;
      s.pop = 1.45;
      this.burst(s.x, s.y, 0xc8ffb0, 1 + fx.stage * 0.15);
      this.floatText(s.x, s.y - s.size * 0.6 - 50, "LỚN RỒI!", "#b8ff8a", 34);
    } else if (fx.kind === "crown") {
      const s = this.fish.get(fx.fishId);
      if (s) this.burst(s.x, s.y, 0xffd54a, 2);
    } else if (fx.kind === "warn") {
      const s = this.fish.get(fx.fishId);
      if (s) s.warnUntil = this.time.now + 6000;
    } else if (fx.kind === "hatch" && fx.tier !== "common") {
      this.cameras.main.flash(300, 255, 240, 180);
    } else if (fx.kind === "gift") {
      const s = fx.fishId ? this.fish.get(fx.fishId) : null;
      const r = REWARDS[fx.reward];
      if (s && !s.hidden) {
        this.burst(s.x, s.y, 0xffe08a, 1.2);
        this.floatText(s.x, s.y - s.size * 0.5 - 50, `${r.icon} ${r.name}${fx.count > 1 ? ` ×${fx.count}` : ""}`, "#ffe08a", 30);
      }
    } else if (fx.kind === "bite") {
      const a = this.fish.get(fx.attackerId);
      const v = this.fish.get(fx.victimId);
      const vx = v?.x ?? a?.x ?? CANVAS_W / 2;
      const vy = v?.y ?? a?.y ?? 1000;
      if (a) {
        // Cá tấn công lao tới.
        a.chaseUntil = this.time.now + 900;
        a.tx = vx;
        a.ty = vy;
      }
      this.time.delayedCall(450, () => {
        if (fx.missed) {
          this.burst(vx, vy, 0xffffff, 0.8);
          this.floatText(vx, vy - 70, "Hụt! 💨", "#e8fbff", 32);
        } else if (fx.blocked) {
          this.burst(vx, vy, 0x8fe8ff, 1.5);
          this.floatText(vx, vy - 80, "🛡️ Chặn!", "#bff4ff", 34);
        } else {
          this.burst(vx, vy, 0xff6b6b, 1.6);
          this.floatText(vx, vy - 60, "Ực! 🦈", "#ffb4b4", 36);
          this.cameras.main.shake(220, 0.006);
        }
      });
    } else if (fx.kind === "transform") {
      const s = this.fish.get(fx.fishId);
      if (s) this.burst(s.x, s.y, 0xffd54a, 2.4);
      this.cameras.main.flash(400, 255, 230, 150);
    } else if (fx.kind === "revive") {
      this.time.delayedCall(200, () => {
        const s = this.fish.get(fx.fishId);
        if (!s) return;
        this.burst(s.x, s.y, 0xffb8d9, 2);
        this.floatText(s.x, s.y - s.size * 0.5 - 50, "💖 Hồi sinh!", "#ffd1e6", 34);
      });
    } else if (fx.kind === "foodRain") {
      // Thức ăn rơi khắp bể, mỗi con cá bơi lên đớp.
      for (let i = 0; i < 46; i++) {
        const p = this.add.image(rand(40, CANVAS_W - 40), SURFACE_Y + rand(-20, 20), "pellet").setDepth(940).setScale(rand(0.9, 1.4));
        this.tweens.add({ targets: p, y: rand(700, SWIM_BOTTOM), alpha: { from: 1, to: 0 }, duration: rand(1400, 2600), delay: rand(0, 900), ease: "Sine.in", onComplete: () => p.destroy() });
      }
      for (const s of this.fish.values()) {
        s.chaseUntil = this.time.now + 1500;
        s.ty = Math.max(SWIM_TOP + 40, s.y - 120);
        this.time.delayedCall(rand(900, 1600), () => this.fish.get(s.view.id) === s && this.showBubble(s, pick(HAPPY_LINES), "happy", 1600));
      }
    }
  }

  // ---------- vòng lặp ----------

  update(_time: number, dt: number) {
    const snap = this.client.snapshot;
    if (snap && snap.seq !== this.lastSeq) {
      this.lastSeq = snap.seq;
      this.sync(snap);
    }
    const crowd = this.fish.size;
    // Chỉ những con đói nhất được "nói", tránh ngập chữ khi cả bể cùng đói.
    this.talkers = new Set(
      [...this.fish.values()]
        .filter((f) => !f.hidden && (f.view.status === "exhausted" || f.view.hunger < HUNGRY_AT))
        .sort((a, b) => a.view.hunger - b.view.hunger)
        .slice(0, MAX_BUBBLES)
        .map((f) => f.view.id),
    );
    this.separate(dt);
    for (const s of this.fish.values()) this.stepFish(s, dt, crowd);
    for (const e of this.eggs.values()) this.stepEgg(e, dt);

    const sec = dt / 1000;
    this.envLayer.update(dt, this.time.now);
    this.surface.setY(SURFACE_Y - 40 + this.envLayer.surfaceY);
    for (const b of this.bubbles) {
      b.wobble += sec * 2;
      b.img.y -= b.speed * sec;
      b.img.x += Math.sin(b.wobble) * 0.4;
      if (b.img.y < SURFACE_Y + 10) {
        b.img.setPosition(rand(30, CANVAS_W - 30), SAND_Y + rand(0, 60));
        b.img.setScale(rand(0.15, 0.45));
      }
    }
    for (const w of this.weeds) {
      w.phase += sec * (1.3 + (this.envLayer.sway - 1) * 0.8);
      const pts = w.rope.points as Phaser.Types.Math.Vector2Like[];
      for (let i = 0; i < pts.length; i++) {
        const u = i / (pts.length - 1);
        pts[i].x = u * 300;
        pts[i].y = Math.sin(w.phase + u * 2.5) * w.amp * this.envLayer.sway * u * u;
      }
      w.rope.setDirty();
    }
  }
}

export function createTankGame(parent: HTMLElement, client: EngineClient, font: string, sound?: (name: "thunder" | "plop" | "meow" | "swipe") => void) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: "#5cc6d0",
    banner: false,
    fps: { target: 60 },
    render: { antialias: true, roundPixels: false },
    scene: [],
  });
  game.scene.add("tank", TankScene, true, { client, font, sound });
  return game;
}
