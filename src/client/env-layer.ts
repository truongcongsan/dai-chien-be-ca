"use client";

import * as Phaser from "phaser";
import { SMALL_STAGE } from "@/shared/config";
import type { ChallengeView, EnvView, Fx } from "@/shared/protocol";
import { CANVAS_H, CANVAS_W, SAND_Y, SURFACE_Y } from "./stage-size";

/**
 * Lớp môi trường của bể: mưa, cầu vồng, bão, đêm, nước đục, côn trùng rơi theo mưa và tay mèo.
 * Chỉ vẽ theo snapshot; luật chơi (đói nhanh/chậm, thưởng phạt) nằm hết ở server.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, t);

/** Độ sâu: trên cá (100–170), dưới trứng (950) và nhãn tên (1000). */
const D = {
  rainbow: 4,
  dirt: 930,
  debris: 931,
  algae: 932,
  tint: 934,
  night: 935,
  nightGlow: 937,
  drops: 960,
  paw: 965,
  rain: 970,
  ripple: 971,
  bolt: 975,
} as const;

export interface FishPos {
  id: string;
  x: number;
  y: number;
  size: number;
  stage: number;
}

interface Drop {
  view: EnvView["drops"][number];
  root: Phaser.GameObjects.Container;
  bug: Phaser.GameObjects.Image;
}

interface Rain {
  img: Phaser.GameObjects.Image;
  speed: number;
  /** Độ sâu dưới mặt nước mà giọt mưa tan hết. */
  sink: number;
  wasAbove: boolean;
}

export class EnvLayer {
  private env: EnvView | null = null;
  private challenge: ChallengeView | null = null;
  private night = 0;
  private dirt = 0;
  private storm = 0;
  private rainAmount = 0;
  private rainbowA = 0;
  private nightRect!: Phaser.GameObjects.Rectangle;
  private tintRect!: Phaser.GameObjects.Rectangle;
  private dirtRect!: Phaser.GameObjects.Rectangle;
  private algae: Phaser.GameObjects.Image[] = [];
  private debris: { img: Phaser.GameObjects.Image; vx: number; vy: number; phase: number }[] = [];
  private jellies: { img: Phaser.GameObjects.Image; phase: number; vx: number }[] = [];
  private fireflies: { img: Phaser.GameObjects.Image; phase: number; bx: number; by: number }[] = [];
  private moon!: Phaser.GameObjects.Image;
  private rainbow!: Phaser.GameObjects.Image;
  private rain: Rain[] = [];
  private drops = new Map<string, Drop>();
  private eaten = new Set<string>();
  private paw: Phaser.GameObjects.Image | null = null;
  private pawX = CANVAS_W / 2;
  private pawLeaving = false;
  private nextBolt = 0;
  surfaceY = 0;
  /** Hệ số lắc rong/mặt nước theo thời tiết. */
  sway = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fishAt: () => FishPos[],
    private readonly say: (fishId: string, text: string) => void,
    private readonly floatText: (x: number, y: number, str: string, color: string, size?: number) => void,
    private readonly rays: () => Phaser.GameObjects.Image[],
    private readonly font: string,
    private readonly sound: (name: "thunder" | "plop" | "meow" | "swipe") => void = () => undefined,
  ) {}

  // ---------- textures ----------

  private canvas(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d")!);
    this.scene.textures.addCanvas(key, c);
  }

  makeTextures() {
    this.canvas("raindrop", 6, 60, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 60);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, "rgba(235,250,255,0.9)");
      g.fillStyle = grad;
      g.fillRect(1, 0, 4, 60);
    });
    this.canvas("ripple", 120, 40, (g) => {
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(60, 20, 56, 16, 0, 0, Math.PI * 2);
      g.stroke();
    });
    // Bọ rùa: côn trùng rơi theo mưa.
    this.canvas("bug", 64, 56, (g) => {
      g.strokeStyle = "#2a160c";
      g.lineWidth = 3;
      for (const [x1, y1, x2, y2] of [[20, 30, 8, 38], [22, 38, 10, 48], [42, 30, 56, 38], [40, 38, 54, 48], [30, 42, 26, 54], [34, 42, 38, 54]])
        (g.beginPath(), g.moveTo(x1, y1), g.lineTo(x2, y2), g.stroke());
      g.fillStyle = "#2a160c";
      g.beginPath();
      g.arc(32, 14, 10, 0, Math.PI * 2);
      g.fill();
      const shell = g.createRadialGradient(26, 24, 3, 32, 32, 22);
      shell.addColorStop(0, "#ff8a7a");
      shell.addColorStop(0.6, "#e8402f");
      shell.addColorStop(1, "#a82418");
      g.fillStyle = shell;
      g.beginPath();
      g.ellipse(32, 32, 21, 18, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#5a1208";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(32, 15);
      g.lineTo(32, 50);
      g.stroke();
      g.fillStyle = "#2a160c";
      for (const [x, y] of [[23, 26], [41, 26], [24, 39], [40, 39], [32, 46]]) (g.beginPath(), g.arc(x, y, 3.6, 0, Math.PI * 2), g.fill());
      g.fillStyle = "rgba(255,255,255,0.8)";
      g.beginPath();
      g.ellipse(24, 22, 5, 3, -0.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      for (const x of [28, 36]) (g.beginPath(), g.arc(x, 12, 2.4, 0, Math.PI * 2), g.fill());
    });
    this.canvas("jelly", 100, 150, (g) => {
      g.strokeStyle = "rgba(255,180,240,0.75)";
      g.lineWidth = 4;
      for (let i = 0; i < 5; i++) {
        const x = 22 + i * 14;
        g.beginPath();
        g.moveTo(x, 55);
        g.bezierCurveTo(x - 10, 85, x + 10, 110, x - 4, 145);
        g.stroke();
      }
      const bell = g.createRadialGradient(50, 30, 4, 50, 40, 50);
      bell.addColorStop(0, "rgba(255,240,255,1)");
      bell.addColorStop(0.5, "rgba(230,150,255,0.85)");
      bell.addColorStop(1, "rgba(160,90,255,0.2)");
      g.fillStyle = bell;
      g.beginPath();
      g.ellipse(50, 50, 44, 40, 0, Math.PI, 0);
      g.quadraticCurveTo(50, 66, 6, 50);
      g.fill();
      g.fillStyle = "#3a1b4a";
      for (const x of [38, 62]) (g.beginPath(), g.arc(x, 38, 4, 0, Math.PI * 2), g.fill());
    });
    this.canvas("moon", 260, 120, (g) => {
      const grad = g.createRadialGradient(130, 60, 4, 130, 60, 120);
      grad.addColorStop(0, "rgba(255,252,220,0.95)");
      grad.addColorStop(0.3, "rgba(255,248,200,0.45)");
      grad.addColorStop(1, "rgba(255,248,200,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(130, 60, 128, 58, 0, 0, Math.PI * 2);
      g.fill();
    });
    this.canvas("rainbow", 1080, 560, (g) => {
      g.filter = "blur(5px)";
      const colors = ["#ff6b6b", "#ffa94d", "#ffe066", "#69db7c", "#4dabf7", "#9775fa"];
      colors.forEach((c, i) => {
        g.strokeStyle = c;
        g.globalAlpha = 0.55;
        g.lineWidth = 26;
        g.beginPath();
        g.arc(540, 620, 520 - i * 26, Math.PI, 0);
        g.stroke();
      });
    });
    this.canvas("debris", 16, 12, (g) => {
      g.fillStyle = "#6b5a2e";
      g.beginPath();
      g.ellipse(8, 6, 7, 4, 0.4, 0, Math.PI * 2);
      g.fill();
    });
    this.canvas("algae", 90, 1400, (g) => {
      const grad = g.createLinearGradient(0, 0, 90, 0);
      grad.addColorStop(0, "rgba(70,110,40,0.85)");
      grad.addColorStop(1, "rgba(70,110,40,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 90, 1400);
      g.fillStyle = "rgba(90,130,50,0.7)";
      for (let i = 0; i < 40; i++) (g.beginPath(), g.ellipse(rand(0, 40), rand(0, 1400), rand(8, 22), rand(12, 40), 0, 0, Math.PI * 2), g.fill());
    });
    // Tay mèo mướp: cánh tay sọc thò từ trên xuống, bàn chân có đệm hồng và móng.
    // Cao 1500px: tay đủ dài để thò từ trên mặt nước xuống tận đàn cá.
    this.canvas("paw", 260, 1500, (g) => {
      const arm = g.createLinearGradient(50, 0, 210, 0);
      arm.addColorStop(0, "#d9822b");
      arm.addColorStop(0.45, "#f6a849");
      arm.addColorStop(1, "#c46f1f");
      g.fillStyle = arm;
      g.beginPath();
      g.roundRect(55, -40, 150, 1360, 70);
      g.fill();
      g.fillStyle = "rgba(150,75,15,0.55)";
      for (let y = 40; y < 1260; y += 90) {
        g.beginPath();
        g.moveTo(55, y);
        g.quadraticCurveTo(130, y + 30, 205, y - 6);
        g.lineTo(205, y + 22);
        g.quadraticCurveTo(130, y + 54, 55, y + 26);
        g.fill();
      }
      g.translate(0, 500);
      const paw = g.createRadialGradient(110, 820, 10, 130, 850, 130);
      paw.addColorStop(0, "#ffd8a8");
      paw.addColorStop(0.6, "#f6a849");
      paw.addColorStop(1, "#c46f1f");
      g.fillStyle = paw;
      g.beginPath();
      g.ellipse(130, 860, 118, 92, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffffff";
      for (const x of [62, 104, 156, 198]) {
        g.beginPath();
        g.moveTo(x - 9, 930);
        g.quadraticCurveTo(x, 990, x + 9, 932);
        g.fill();
      }
      g.fillStyle = "#ff9fb8";
      g.beginPath();
      g.ellipse(130, 880, 40, 30, 0, 0, Math.PI * 2);
      g.fill();
      for (const [x, y] of [[72, 836], [108, 812], [152, 812], [188, 836]]) (g.beginPath(), g.ellipse(x, y, 17, 20, 0, 0, Math.PI * 2), g.fill());
    });
  }

  // ---------- dựng ----------

  create() {
    const s = this.scene;
    const waterH = CANVAS_H - SURFACE_Y;
    this.rainbow = s.add.image(CANVAS_W / 2, SURFACE_Y - 120, "rainbow").setOrigin(0.5, 0).setDepth(D.rainbow).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.dirtRect = s.add.rectangle(0, SURFACE_Y, CANVAS_W, waterH, 0x5f6e2c).setOrigin(0).setDepth(D.dirt).setAlpha(0);
    for (let i = 0; i < 46; i++) {
      const img = s.add.image(rand(20, CANVAS_W - 20), rand(SURFACE_Y + 40, SAND_Y), "debris").setDepth(D.debris).setAlpha(0).setScale(rand(0.6, 1.4)).setRotation(rand(0, 6));
      this.debris.push({ img, vx: rand(-8, 8), vy: rand(-4, 6), phase: rand(0, 6) });
    }
    this.algae.push(s.add.image(0, SURFACE_Y + 20, "algae").setOrigin(0).setDepth(D.algae).setAlpha(0));
    this.algae.push(s.add.image(CANVAS_W, SURFACE_Y + 20, "algae").setOrigin(0).setFlipX(true).setDepth(D.algae).setAlpha(0).setX(CANVAS_W - 90));
    this.tintRect = s.add.rectangle(0, 0, CANVAS_W, CANVAS_H, 0x223040).setOrigin(0).setDepth(D.tint).setAlpha(0);
    this.nightRect = s.add.rectangle(0, 0, CANVAS_W, CANVAS_H, 0x061238).setOrigin(0).setDepth(D.night).setAlpha(0);
    this.moon = s.add.image(760, SURFACE_Y + 10, "moon").setDepth(D.nightGlow).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < 3; i++) {
      const img = s.add.image(rand(150, 930), rand(800, 1350), "jelly").setDepth(D.nightGlow).setAlpha(0).setScale(rand(0.6, 0.9)).setBlendMode(Phaser.BlendModes.ADD);
      this.jellies.push({ img, phase: rand(0, 6), vx: rand(-12, 12) });
    }
    for (let i = 0; i < 14; i++) {
      const bx = rand(40, CANVAS_W - 40);
      const by = rand(SURFACE_Y - 40, SURFACE_Y + 260);
      const img = s.add.image(bx, by, "glow").setDepth(D.nightGlow).setAlpha(0).setScale(0.12).setTint(0xfff3a0).setBlendMode(Phaser.BlendModes.ADD);
      this.fireflies.push({ img, phase: rand(0, 6), bx, by });
    }
    for (let i = 0; i < 90; i++) {
      const img = s.add.image(rand(0, CANVAS_W), rand(-200, SURFACE_Y), "raindrop").setDepth(D.rain).setAlpha(0);
      this.rain.push({ img, speed: rand(1300, 1800), sink: rand(120, 520), wasAbove: true });
    }
  }

  // ---------- cập nhật ----------

  sync(env: EnvView, challenge: ChallengeView | null) {
    this.env = env;
    const was = this.challenge;
    this.challenge = challenge;
    if (challenge?.kind === "predator" && was?.kind !== "predator") this.showPaw(challenge.x);
    // Mèo đi mà không có fx (ví dụ Admin dọn bể): rút tay về.
    if (!challenge && was?.kind === "predator" && this.paw && !this.pawLeaving) this.retractPaw(false);

    const ids = new Set(env.drops.map((d) => d.id));
    for (const [id, d] of this.drops) if (!ids.has(id) && !this.eaten.has(id)) this.removeDrop(id, d, true);
    for (const view of env.drops) if (!this.drops.has(view.id)) this.addDrop(view);
  }

  /** Cá nhỏ chạy trốn mèo; bão thì cá rúc xuống đáy. */
  fleeTarget(stage: number): { x?: number; y?: number } | null {
    if (this.challenge?.kind === "predator" && this.paw) {
      const away = this.pawX < CANVAS_W / 2 ? rand(CANVAS_W * 0.6, CANVAS_W - 80) : rand(80, CANVAS_W * 0.4);
      return { x: away, y: stage <= SMALL_STAGE ? rand(1250, 1480) : undefined };
    }
    if (this.env?.weather === "storm") return { y: rand(1150, 1480) };
    return null;
  }

  update(dt: number, now: number) {
    const env = this.env;
    if (!env) return;
    const sec = dt / 1000;
    const k = sec * 1.2;
    this.night = lerp(this.night, env.night ? 1 : 0, k * 0.5);
    this.dirt = lerp(this.dirt, env.dirt / 100, k);
    const stormy = env.weather === "storm" ? 1 : env.weather === "stormWarn" ? 0.5 : 0;
    this.storm = lerp(this.storm, stormy, k);
    const raining = env.weather === "rain" ? 1 : env.weather === "storm" ? 1.6 : 0;
    this.rainAmount = lerp(this.rainAmount, raining, k);
    this.rainbowA = lerp(this.rainbowA, env.weather === "rainbow" ? 1 : 0, k * 0.6);
    this.sway = 1 + this.storm * 1.8 + (env.weather === "rain" ? 0.3 : 0);

    this.nightRect.setAlpha(this.night * 0.5);
    this.tintRect.setAlpha(this.storm * 0.35 + Math.min(1, this.rainAmount) * 0.12);
    for (const r of this.rays()) r.setVisible(this.night < 0.6 && this.storm < 0.6);

    // Nước đục: phủ màu rêu, rác lơ lửng, rêu bám kính.
    this.dirtRect.setAlpha(Math.max(0, this.dirt - 0.15) * 0.45);
    for (const a of this.algae) a.setAlpha(Math.max(0, this.dirt - 0.3) * 1.2);
    const showDebris = Math.round(this.debris.length * this.dirt);
    this.debris.forEach((d, i) => {
      d.phase += sec;
      d.img.x += (d.vx + Math.sin(d.phase) * 6) * sec;
      d.img.y += d.vy * sec;
      if (d.img.x < 10 || d.img.x > CANVAS_W - 10) d.vx *= -1;
      if (d.img.y < SURFACE_Y + 30 || d.img.y > SAND_Y) d.vy *= -1;
      d.img.setAlpha(i < showDebris ? 0.75 : 0);
    });

    // Đêm: trăng phản chiếu, sứa và đom đóm phát sáng.
    this.moon.setAlpha(this.night * 0.9);
    for (const j of this.jellies) {
      j.phase += sec;
      j.img.x += j.vx * sec;
      j.img.y += Math.sin(j.phase * 1.4) * 14 * sec;
      if (j.img.x < 60 || j.img.x > CANVAS_W - 60) j.vx *= -1;
      j.img.setScale(j.img.scaleX, j.img.scaleX * (1 + Math.sin(j.phase * 2.8) * 0.06));
      j.img.setAlpha(this.night * 0.8);
    }
    for (const f of this.fireflies) {
      f.phase += sec * 1.5;
      f.img.setPosition(f.bx + Math.sin(f.phase) * 30, f.by + Math.cos(f.phase * 0.8) * 18);
      f.img.setAlpha(this.night * (0.5 + Math.sin(f.phase * 3) * 0.5));
    }

    this.rainbow.setAlpha(this.rainbowA * 0.75);

    // Mưa: giọt rơi, chạm mặt nước tạo gợn, tan dần dưới nước.
    const active = Math.round(this.rain.length * Math.min(1, this.rainAmount / 1.6) * (env.weather === "storm" ? 1 : 0.6) + (env.weather === "rain" ? 20 : 0));
    const slant = env.weather === "storm" ? 0.28 : 0.08;
    this.rain.forEach((r, i) => {
      const on = i < active && this.rainAmount > 0.05;
      if (!on) {
        r.img.setAlpha(0);
        return;
      }
      r.img.setRotation(-slant);
      r.img.x += r.speed * slant * sec;
      r.img.y += r.speed * sec * (r.img.y > SURFACE_Y ? 0.35 : 1);
      const below = r.img.y - SURFACE_Y;
      if (r.wasAbove && below > 0) {
        r.wasAbove = false;
        if (Math.random() < 0.6) this.ripple(r.img.x);
      }
      r.img.setAlpha(below > 0 ? Math.max(0, 0.55 * (1 - below / r.sink)) : 0.85);
      if (below > r.sink || r.img.x > CANVAS_W + 40) {
        r.img.setPosition(rand(-120, CANVAS_W), rand(-260, -20));
        r.wasAbove = true;
      }
    });

    // Bão: sấm chớp.
    if (env.weather === "storm" && now > this.nextBolt) {
      this.nextBolt = now + rand(2500, 6000);
      this.bolt();
    }
    this.surfaceY = Math.sin(now / 260) * 4 * this.sway;

    for (const d of this.drops.values()) {
      d.bug.setY(Math.sin(now / 300 + d.root.x) * 5);
      d.bug.setAngle(Math.sin(now / 420 + d.root.x) * 12);
    }
    this.stepPaw(sec);
  }

  private ripple(x: number) {
    const r = this.scene.add.image(x, SURFACE_Y + 6, "ripple").setDepth(D.ripple).setScale(0.15, 0.15).setAlpha(0.8);
    this.scene.tweens.add({ targets: r, scaleX: rand(0.5, 0.8), scaleY: rand(0.4, 0.6), alpha: 0, duration: 650, ease: "Quad.out", onComplete: () => r.destroy() });
  }

  private bolt() {
    const s = this.scene;
    const g = s.add.graphics().setDepth(D.bolt);
    let x = rand(150, CANVAS_W - 150);
    let y = 0;
    const pts: [number, number][] = [[x, y]];
    while (y < SURFACE_Y + rand(40, 220)) {
      x += rand(-50, 50);
      y += rand(40, 80);
      pts.push([x, y]);
    }
    for (const [w, c, a] of [[22, 0xbfe4ff, 0.35], [7, 0xffffff, 1]] as const) {
      g.lineStyle(w, c, a);
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
      g.strokePath();
    }
    s.cameras.main.flash(140, 210, 230, 255);
    this.sound("thunder");
    s.tweens.add({ targets: g, alpha: 0, duration: 380, delay: 90, onComplete: () => g.destroy() });
  }

  // ---------- côn trùng rơi theo mưa ----------

  private addDrop(view: EnvView["drops"][number]) {
    const s = this.scene;
    const x = view.x * CANVAS_W;
    const bug = s.add.image(0, 0, "bug").setScale(0.9);
    const tag = s.add
      .text(0, -48, "“đớp”!", { fontFamily: this.font, fontSize: "26px", fontStyle: "800", color: "#1d5b2a", backgroundColor: "#eaffea", padding: { x: 10, y: 0 } })
      .setOrigin(0.5);
    const root = s.add.container(x, -60, [bug, tag]).setDepth(D.drops);
    s.tweens.add({ targets: root, y: SURFACE_Y + 14, duration: 900, ease: "Bounce.out", onComplete: () => this.ripple(x) });
    s.tweens.add({ targets: tag, scale: { from: 1, to: 1.12 }, duration: 500, yoyo: true, repeat: -1 });
    this.drops.set(view.id, { view, root, bug });
  }

  private removeDrop(id: string, d: Drop, sink: boolean) {
    this.drops.delete(id);
    if (!sink) return d.root.destroy();
    this.scene.tweens.add({ targets: d.root, y: d.root.y + 120, alpha: 0, duration: 900, onComplete: () => d.root.destroy() });
  }

  // ---------- tay mèo ----------

  private showPaw(x01: number) {
    this.paw?.destroy();
    this.pawLeaving = false;
    this.pawX = x01 * CANVAS_W;
    this.paw = this.scene.add.image(this.pawX, -40, "paw").setOrigin(0.5, 1).setDepth(D.paw).setScale(0.62);
    this.scene.tweens.add({ targets: this.paw, y: 1060, duration: 1400, ease: "Back.out" });
    this.sound("meow");
    this.ripple(this.pawX);
    this.ripple(this.pawX + 30);
  }

  /** Tay mèo lượn theo đám cá nhỏ, lắc lư dọa. */
  private stepPaw(sec: number) {
    const paw = this.paw;
    if (!paw || this.pawLeaving) return;
    const small = this.fishAt().filter((f) => f.stage <= SMALL_STAGE);
    const target = small.length ? small.reduce((a, f) => a + f.x, 0) / small.length : CANVAS_W / 2;
    this.pawX = lerp(this.pawX, Phaser.Math.Clamp(target, 140, CANVAS_W - 140), sec * 0.6);
    paw.x = this.pawX + Math.sin(this.scene.time.now / 380) * 40;
    paw.setAngle(Math.sin(this.scene.time.now / 520) * 7);
    if (Math.random() < sec * 1.5) this.ripple(paw.x + rand(-40, 40));
  }

  private retractPaw(angry: boolean) {
    const paw = this.paw;
    if (!paw) return;
    this.pawLeaving = true;
    if (angry) {
      this.floatText(paw.x, SURFACE_Y + 160, "😾 Méo!", "#ffe08a", 40);
      this.sound("meow");
    }
    this.scene.tweens.add({
      targets: paw,
      y: -80,
      duration: angry ? 450 : 800,
      ease: "Quad.in",
      onComplete: () => {
        paw.destroy();
        if (this.paw === paw) this.paw = null;
      },
    });
  }

  // ---------- fx ----------

  onFx(fx: Fx, fishById: (id: string) => FishPos | null) {
    if (fx.kind === "dropEaten") {
      this.eaten.add(fx.dropId);
      const d = this.drops.get(fx.dropId);
      const fish = fishById(fx.fishId);
      if (!d) return;
      this.drops.delete(fx.dropId);
      if (!fish) return d.root.destroy();
      // Con bọ bay về phía cá rồi biến mất.
      this.scene.tweens.add({
        targets: d.root,
        x: fish.x,
        y: fish.y,
        scale: 0.4,
        duration: 600,
        ease: "Quad.in",
        onComplete: () => {
          d.root.destroy();
          this.say(fx.fishId, "Măm côn trùng 😋");
        },
      });
    } else if (fx.kind === "predatorWin") {
      this.retractPaw(true);
    } else if (fx.kind === "predatorLose") {
      const paw = this.paw;
      if (!paw) return;
      this.pawLeaving = true;
      const victims = fx.victims.map(fishById).filter((f): f is FishPos => !!f);
      const sweepTo = paw.x < CANVAS_W / 2 ? CANVAS_W - 160 : 160;
      this.scene.tweens.add({ targets: paw, y: 1300, duration: 350, ease: "Quad.in" });
      this.scene.time.delayedCall(350, () => this.sound("swipe"));
      this.scene.tweens.add({
        targets: paw,
        x: sweepTo,
        angle: paw.x < CANVAS_W / 2 ? -25 : 25,
        duration: 700,
        delay: 350,
        ease: "Sine.inOut",
        onComplete: () => this.retractPaw(false),
      });
      victims.forEach((v, i) =>
        this.scene.time.delayedCall(500 + i * 120, () => {
          this.floatText(v.x, v.y - v.size * 0.5 - 30, "-30% 😿", "#ffb4b4", 30);
          this.say(v.id, "Huhu bị khều 😭");
        }),
      );
    } else if (fx.kind === "cleaned") {
      // Bể sạch: lấp lánh khắp mặt nước.
      for (let i = 0; i < 18; i++) {
        const g = this.scene.add.image(rand(60, CANVAS_W - 60), rand(SURFACE_Y + 80, SAND_Y - 40), "glow").setDepth(D.bolt).setScale(0.2).setTint(0xe6fffa).setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({ targets: g, scale: 1.1, alpha: 0, duration: 900, delay: i * 50, onComplete: () => g.destroy() });
      }
    }
  }
}
