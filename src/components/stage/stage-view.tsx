"use client";

import { useEffect, useRef, useState } from "react";
import { StageAudio, type SfxName } from "@/client/audio";
import { EngineClient, engineBase, giftImageUrl, useEngine } from "@/client/engine-client";
import { CANVAS_H, CANVAS_W } from "@/client/stage-size";
import { REWARDS, SPECIES, STAGES, TIER_COLORS, WEATHER_INFO, stageLabel } from "@/shared/config";
import type { ChallengeView, Fx, Snapshot } from "@/shared/protocol";

/** `/?view=stage`: trang sạch cho OBS. Khung 1080×1920 được scale nguyên khối, không méo. */
export function StageView() {
  const [client] = useState(() => new EngineClient(false));
  const [scale, setScale] = useState(0);
  useEffect(() => {
    client.start();
    const fit = () => setScale(Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H));
    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      client.stop();
    };
  }, [client]);
  return <main className="stage-page">{scale > 0 && <StageFrame client={client} scale={scale} role="stage" />}</main>;
}

/** Sự kiện game → tiếng hiệu ứng. */
function sfxFor(fx: Fx): SfxName | null {
  switch (fx.kind) {
    case "hatch":
      return fx.tier === "common" ? "hatch" : "fanfare";
    case "feed":
    case "dropEaten":
      return "plop";
    case "levelup":
      return STAGES[fx.stage]?.announce ? "fanfare" : "levelup";
    case "death":
      return "death";
    case "crown":
      return "crown";
    case "champion":
      return "fanfare";
    case "gift":
      return ["legendaryEgg", "rareEgg", "revive", "foodRain", "megaPotion", "doom", "killBite"].includes(fx.reward) ? "fanfare" : "coin";
    case "bite":
      return fx.missed ? "plop" : fx.blocked ? "shield" : "chomp";
    case "transform":
      return "fanfare";
    case "revive":
      return "chime";
    case "cleaned":
      return "sparkle";
    case "warn":
      return "warn";
    case "eggfail":
      return "death";
    default:
      return null;
  }
}

/**
 * `role`: trang Stage thật hay bản preview trong Admin. Chỉ một nơi phát tiếng, theo cài đặt audio.output:
 * "stage" (OBS) thì Stage phát, preview im; "admin" (TikTok LIVE Studio) thì Admin phát, Stage im.
 */
export function StageFrame({ client, scale, role }: { client: EngineClient; scale: number; role: "stage" | "admin" }) {
  useEngine(client);
  const output = client.snapshot?.audio.output ?? "stage";
  const muted = role === "admin" ? output !== "admin" : output === "admin";
  const host = useRef<HTMLDivElement>(null);
  const audio = useRef<StageAudio | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const eggLikes = useRef(-1);
  const snap = client.snapshot;

  useEffect(() => {
    const a = new StageAudio(muted);
    audio.current = a;
    a.onSubtitle = setSubtitle;
    a.start();
    const check = setInterval(() => setBlocked(a.blocked), 1000);
    // Trình duyệt chỉ cho phát tiếng sau khi người dùng bấm vào trang: bấm bất kỳ đâu là bật.
    const unlock = () => a.resume();
    document.addEventListener("pointerdown", unlock);
    const off = client.onFx((fx) => {
      if (fx.kind === "narrate") return a.voice(fx.file ? `${engineBase().http}/voice/${fx.file}` : null, fx.text, fx.subtitle);
      const name = sfxFor(fx);
      if (name) a.sfx(name);
    });
    return () => {
      off();
      clearInterval(check);
      document.removeEventListener("pointerdown", unlock);
      a.stop();
    };
  }, [client, muted]);

  useEffect(() => {
    if (!snap) return;
    audio.current?.follow(snap);
    // Trứng được nạp thêm tim → tiếng "bloop" nhỏ cho người đang nhấp.
    const sum = snap.eggs.reduce((t, e) => t + e.pct, 0);
    if (eggLikes.current >= 0 && sum > eggLikes.current) audio.current?.sfx("bubble", 180);
    eggLikes.current = sum;
  }, [snap]);

  useEffect(() => {
    let disposed = false;
    let game: { destroy(remove: boolean): void } | null = null;
    void (async () => {
      const { createTankGame } = await import("@/client/tank-scene");
      const font = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif";
      await document.fonts.load(`800 30px ${font}`, "Bể Cá").catch(() => []);
      if (disposed || !host.current) return;
      game = createTankGame(host.current, client, font, (name) => audio.current?.sfx(name));
    })();
    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, [client]);

  return (
    <div className="stage-clip" style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }}>
      <div className="stage" style={{ transform: `scale(${scale})` }}>
        <div className="stage-canvas" ref={host} />
        {snap ? <StageHud client={client} snap={snap} /> : <div className="stage-loading">Đang kết nối bể cá…</div>}
        {client.link !== "open" && snap && <div className="stage-offline">Đang kết nối lại…</div>}
        {subtitle && (
          <div className="hud-subtitle">
            <span>🎙️</span> {subtitle}
          </div>
        )}
        {blocked && (
          <button className="stage-unmute" onClick={() => audio.current?.resume()}>
            🔊 Bấm để bật âm thanh
          </button>
        )}
      </div>
    </div>
  );
}

interface Banner {
  id: number;
  text: string;
  tone: "info" | "gold" | "sad";
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** ms → "m:ss" */
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const MENU_PAGE = 5;
const MENU_ROTATE_MS = 7000;

/** Menu quà → phần thưởng bên phải (plan 5.1): 5 món một lượt, tự xoay; món vừa được tặng sáng lên. */
function GiftMenu({ client, gifts }: { client: EngineClient; gifts: Snapshot["gifts"] }) {
  const [page, setPage] = useState(0);
  const [lit, setLit] = useState<string | null>(null);
  const pages = Math.max(1, Math.ceil(gifts.length / MENU_PAGE));
  useEffect(() => {
    const t = setInterval(() => setPage((p) => (p + 1) % pages), MENU_ROTATE_MS);
    return () => clearInterval(t);
  }, [pages]);
  useEffect(
    () =>
      client.onFx((fx) => {
        if (fx.kind !== "gift") return;
        const i = gifts.findIndex((g) => g.giftName === fx.giftName);
        if (i >= 0) setPage(Math.floor(i / MENU_PAGE));
        setLit(fx.giftName);
        setTimeout(() => setLit((cur) => (cur === fx.giftName ? null : cur)), 2500);
      }),
    [client, gifts],
  );
  if (!gifts.length) return null;
  const shown = gifts.slice((page % pages) * MENU_PAGE, (page % pages) * MENU_PAGE + MENU_PAGE);
  return (
    <aside className="hud-gifts">
      <h2>🎁 Tặng quà</h2>
      <ul key={page}>
        {shown.map((g) => (
          <li key={g.giftName} className={lit === g.giftName ? "is-lit" : ""}>
            <span className="gift-icon">
              {g.image ? (
                <>
                  <img src={giftImageUrl(g.image)} alt={g.giftName} />
                  <i className="gift-badge">{REWARDS[g.reward].icon}</i>
                </>
              ) : (
                REWARDS[g.reward].icon
              )}
            </span>
            <div>
              <b>{REWARDS[g.reward].name}</b>
              <small>
                {g.giftName} · 🪙{g.coins}
              </small>
            </div>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="gift-dots">
          {Array.from({ length: pages }, (_, i) => (
            <i key={i} className={i === page % pages ? "on" : ""} />
          ))}
        </div>
      )}
    </aside>
  );
}

/** Thử thách cả phòng: thanh tiến độ to, dễ đọc trên điện thoại. */
function ChallengePanel({ c, now }: { c: ChallengeView; now: number }) {
  const left = Math.max(0, Math.ceil((c.endsAt - now) / 1000));
  const done = c.kind === "clean" ? c.count : c.likes;
  const pct = Math.min(100, (done / c.needed) * 100);
  const info =
    c.kind === "clean"
      ? { icon: "🧽", title: "Bể bẩn quá!", hint: <>Cả phòng comment <b>“dọn”</b></> }
      : { icon: "🐱", title: "Mèo thò tay vào bể!", hint: <>Cả phòng thả tim ❤️ đuổi mèo</> };
  return (
    <div className={`hud-challenge kind-${c.kind}`}>
      <div className="hud-challenge-head">
        <span className="hud-challenge-icon">{info.icon}</span>
        <div>
          <strong>{info.title}</strong>
          <p>{info.hint}</p>
        </div>
        <em className={left <= 10 ? "is-urgent" : ""}>{left}s</em>
      </div>
      <div className="hud-challenge-bar">
        <i style={{ width: `${pct}%` }} />
        <span>
          {done}/{c.needed}
        </span>
      </div>
    </div>
  );
}

function StageHud({ client, snap }: { client: EngineClient; snap: Snapshot }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const nextId = useRef(1);

  useEffect(
    () =>
      client.onFx((fx: Fx) => {
        if (fx.kind !== "announce") return;
        const banner = { id: nextId.current++, text: fx.text, tone: fx.tone };
        // Tối đa 3 thông báo cùng lúc; cái cũ nhất nhường chỗ.
        setBanners((list) => [...list.slice(-2), banner]);
        setTimeout(() => setBanners((list) => list.filter((b) => b.id !== banner.id)), 4200);
      }),
    [client],
  );

  return (
    <>
      <header className="hud-header">
        <div className="hud-title">
          <span className="hud-logo">🐠</span>
          <div>
            <h1>Đại Chiến Bể Cá</h1>
            <p>
              Màn {snap.round} · 🐟 {snap.fish.length} con · 🥚 {snap.eggs.length + snap.waiting} trứng
              {!snap.live && <b className="hud-paused"> · ⏸ tạm dừng</b>}
            </p>
          </div>
        </div>
        <ol className="hud-top">
          {snap.top.map((t, i) => (
            <li key={`${t.name}-${i}`} className={SPECIES[t.species].tier !== "common" ? "is-rare" : ""}>
              <span>{t.crowned ? "👑" : MEDALS[i]}</span>
              <b style={{ color: TIER_COLORS[SPECIES[t.species].tier] }}>{t.name}</b>
              <em>{stageLabel(t.stage, t.crowned)}</em>
            </li>
          ))}
        </ol>
      </header>
      <div className="hud-env">
        <span>
          {snap.env.night && snap.env.weather === "sun" ? "✨ Trời quang" : `${WEATHER_INFO[snap.env.weather].icon} ${WEATHER_INFO[snap.env.weather].name}`}
          {snap.env.night ? " · 🌙 Đêm" : snap.env.phaseEndsAt ? " · Ngày" : ""}
          {snap.env.phaseEndsAt > 0 && ` ${clock(snap.env.phaseEndsAt - (Date.now() + client.clockOffset))}`}
        </span>
        <span className={snap.env.murky ? "is-murky" : ""}>
          💧 Nước sạch {100 - snap.env.dirt}%
        </span>
      </div>
      <div className="hud-crown">
        {snap.crown ? (
          <span className="is-king">
            👑 <b>{snap.crown.name}</b> giữ ngôi · vô địch sau {clock(snap.crown.holdEndsAt - (Date.now() + client.clockOffset))}
          </span>
        ) : (
          <span>👑 Cá to nhất từ Lv15 làm cá chúa · giữ 10 phút là vô địch</span>
        )}
        {snap.champion && (
          <span>
            🏆 Màn {snap.champion.round}: <b>{snap.champion.name}</b>
          </span>
        )}
      </div>
      {snap.challenge && <ChallengePanel c={snap.challenge} now={Date.now() + client.clockOffset} />}
      <GiftMenu client={client} gifts={snap.gifts} />
      <div className="hud-banners">
        {banners.map((b) => (
          <div key={b.id} className={`hud-banner tone-${b.tone}`}>
            {b.text}
          </div>
        ))}
      </div>
      <footer className="hud-guide">
        <span>
          Comment <b>“cá”</b> rồi thả tim ❤️ để nở trứng
        </span>
        <span>
          Thả tim ❤️ để cá <b>lớn</b> và no
        </span>
        <span className="hud-guide-bite">
          <b>“cắn @tên”</b> 🦷 đớp cá nhỏ hơn mình: trúng thì −10 cấp · 1 lần/1p30s · bị cắn được 🛡️ 5 phút
        </span>
      </footer>
    </>
  );
}
