"use client";

import { useEffect, useState } from "react";
import { EngineClient, useEngine } from "@/client/engine-client";
import { CANVAS_H, CANVAS_W } from "@/client/stage-size";
import { COMMON_SPECIES, DEFAULT_RULES, RARE_SPECIES, REWARDS, SPECIES, STAGES, WEATHER_INFO, type GiftMapping, type RewardKey, type Rules } from "@/shared/config";
import type { AdminState } from "@/shared/protocol";
import { StageFrame } from "../stage/stage-view";

const RULE_LABELS: Record<keyof Rules, string> = {
  likesToHatch: "Like để nở trứng",
  eggTimeoutMs: "Hạn trứng (ms)",
  eggRetryCooldownMs: "Chờ thử lại (ms)",
  maxCharging: "Trứng cùng lúc",
  maxFish: "Số cá tối đa",
  hungerPerMin: "Đói mất mỗi phút (%)",
  feedHunger: "Cho ăn +đói (%)",
  feedGrowth: "Cho ăn +tăng trưởng",
  feedCooldownMs: "Cooldown cho ăn (ms)",
  likesPerGrowth: "Like / 1% tăng trưởng",
  likeGrowthCapPerMin: "Trần tăng trưởng từ like / phút",
  exhaustedMs: "Kiệt sức trước khi chết (ms)",
  warnHunger: "Cảnh báo đói dưới (%)",
  crownCooldownMs: "Cooldown đổi vua (ms)",
  autoEvents: "Tự chạy thời tiết & thử thách (1/0)",
  nightMode: "Đêm: 0 tắt · 1 giờ thật · 2 luân phiên · 3 luôn đêm",
  dayMinutes: "Ngày kéo dài (phút)",
  nightMinutes: "Đêm kéo dài (phút)",
  weatherEveryMin: "Phút giữa hai đợt thời tiết",
  stormChance: "Tỷ lệ bão (%)",
  rainMs: "Mưa kéo dài (ms)",
  rainbowMs: "Cầu vồng kéo dài (ms)",
  stormMs: "Bão kéo dài (ms)",
  stormWarnMs: "Báo trước bão (ms)",
  dropHunger: "Côn trùng: +đói (%)",
  dropGrowth: "Côn trùng: +tăng trưởng",
  dirtPerFishPerMin: "Bẩn mỗi cá / phút (%)",
  dirtyAt: "Nước đục từ (%)",
  cleanWindowMs: "Thời gian dọn bể (ms)",
  cleanPerFish: "Lượt “dọn” cần / mỗi cá",
  cleanMaxPerUser: "Lượt “dọn” tối đa / người",
  rewardGrowth: "Thưởng tăng trưởng khi thắng",
  predatorEveryMin: "Mèo tới mỗi (phút)",
  predatorWindowMs: "Thời gian đuổi mèo (ms)",
  predatorLikesPerFish: "Tim đuổi mèo / mỗi cá",
  predatorMinLikes: "Tim đuổi mèo tối thiểu",
  predatorVictims: "Số cá nhỏ bị khều khi thua",
  giftFallback: "Quà chưa gán quy đổi theo giá (1/0)",
  attackEnabled: "Bật răng nanh / cắn (1/0)",
  biteStageGap: "Cắn được khi hơn ít nhất (cấp)",
  newbieImmuneMs: "Cá mới nở miễn cắn (ms)",
  biteCooldownMs: "Một cá bị cắn tối đa 1 lần / (ms)",
  biteGrowth: "Cắn thành công +tăng trưởng",
  biteAutoMs: "Tự cắn sau (ms) nếu không ra lệnh",
  eggDiscountPct: "Bị cắn chết: giảm tim lần sau (%)",
  shieldMs: "Khiên hiệu lực (ms)",
  potionMs: "Thuốc lớn nhanh hiệu lực (ms)",
  immortalMs: "Bất tử (ms)",
  reviveWindowMs: "Hồi sinh được trong (ms) sau khi chết",
};

const ENGINE_NAMES = { vieneu: "VieNeu-TTS", macos: "Giọng macOS", windows: "Giọng Windows", none: "Không có" } as const;

/** Âm thanh & MC: trạng thái giọng đọc, bật/tắt, âm lượng, đọc thử. */
function AudioPanel({ admin, run }: { admin: AdminState; run: (cmd: string, args?: Record<string, unknown>) => Promise<void> }) {
  const [text, setText] = useState("");
  const a = admin.audio;
  const v = admin.voice;
  const slider = (key: "bgm" | "sfx" | "voiceVol" | "duck", label: string) => (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={a[key]} onChange={(e) => run("setAudio", { [key]: Number(e.target.value) })} />
      <em>{Math.round(a[key] * 100)}%</em>
    </label>
  );
  return (
    <div className="audio-panel">
      <p className={`pill state-${v.state === "error" ? "error" : v.engine === "none" ? "idle" : "connected"}`}>
        🎙️ {ENGINE_NAMES[v.engine]}
        {v.state === "generating" && ` · đang tạo giọng (${v.pending} chờ)`}
        {v.lastMs !== null && ` · ${(v.lastMs / 1000).toFixed(1)}s/câu`}
        {v.message && <small> — {v.message}</small>}
      </p>
      <div className="row">
        <label>
          <input type="checkbox" checked={a.mc} onChange={(e) => run("setAudio", { mc: e.target.checked })} /> MC đọc
        </label>
        <label>
          <input type="checkbox" checked={a.music} onChange={(e) => run("setAudio", { music: e.target.checked })} /> Nhạc nền
        </label>
        <label>
          <input type="checkbox" checked={a.subtitles} onChange={(e) => run("setAudio", { subtitles: e.target.checked })} /> Phụ đề
        </label>
      </div>
      {v.voices.length > 0 && (
        <label>
          Giọng
          <select value={v.voices.includes(a.voice) ? a.voice : v.voices[0]} onChange={(e) => run("setAudio", { voice: e.target.value })}>
            {v.voices.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      {slider("bgm", "Nhạc nền")}
      {slider("sfx", "Hiệu ứng")}
      {slider("voiceVol", "Giọng MC")}
      {slider("duck", "Nhạc khi MC nói")}
      <label>
        MC nhắc cách chơi mỗi (giây, 0 = tắt)
        <input type="number" className="narrow" value={a.ambientSec} onChange={(e) => run("setAudio", { ambientSec: Number(e.target.value) })} />
      </label>
      <div className="row">
        <input placeholder="Câu cho MC đọc thử…" value={text} onChange={(e) => setText(e.target.value)} />
        <button onClick={() => run("testVoice", { text })}>▶ Đọc thử</button>
      </div>
      {admin.narration.length > 0 && (
        <ul className="log">
          {admin.narration.slice(0, 6).map((n, i) => (
            <li key={i}>🎙️ {n.text}</li>
          ))}
        </ul>
      )}
      <p className="hint">Chỉ trang Stage (OBS) phát tiếng; bản preview ở đây luôn tắt tiếng.</p>
    </div>
  );
}

/** Bảng quà → phần thưởng. Sửa tại chỗ, bấm Lưu mới gửi lên engine. */
function GiftEditor({ gifts, unmapped, run }: { gifts: GiftMapping[]; unmapped: { giftId: number | null; giftName: string; diamonds: number | null; count: number }[]; run: (cmd: string, args?: Record<string, unknown>) => Promise<void> }) {
  const [rows, setRows] = useState<GiftMapping[] | null>(null);
  const list = rows ?? gifts;
  const edit = (i: number, patch: Partial<GiftMapping>) => setRows(list.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const save = async () => {
    await run("setGifts", { gifts: list });
    setRows(null);
  };
  return (
    <div className="gift-editor">
      <table>
        <thead>
          <tr>
            <th>Bật</th>
            <th>Tên quà TikTok</th>
            <th>ID</th>
            <th>Giá</th>
            <th>Phần thưởng</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((g, i) => (
            <tr key={i}>
              <td>
                <input type="checkbox" checked={g.enabled} onChange={(e) => edit(i, { enabled: e.target.checked })} />
              </td>
              <td>
                <input value={g.giftName} onChange={(e) => edit(i, { giftName: e.target.value })} />
              </td>
              <td>
                <input className="narrow" value={g.giftId ?? ""} placeholder="—" onChange={(e) => edit(i, { giftId: e.target.value === "" ? null : Number(e.target.value) })} />
              </td>
              <td>
                <input className="narrow" type="number" value={g.coins} onChange={(e) => edit(i, { coins: Number(e.target.value) })} />
              </td>
              <td>
                <select value={g.reward} onChange={(e) => edit(i, { reward: e.target.value as RewardKey })}>
                  {(Object.keys(REWARDS) as RewardKey[]).map((k) => (
                    <option key={k} value={k}>
                      {REWARDS[k].icon} {REWARDS[k].name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="actions">
                <button title="Tặng thử (người đã có cá)" onClick={() => run("testGift", { giftName: g.giftName })} disabled={!!rows}>
                  🎁
                </button>
                <button title="Tặng thử (người mới, chưa có cá)" onClick={() => run("testGift", { giftName: g.giftName, newViewer: true })} disabled={!!rows}>
                  🆕
                </button>
                <button title="Xóa dòng" onClick={() => setRows(list.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button onClick={() => setRows([...list, { giftId: null, giftName: "", coins: 1, reward: "food", enabled: true }])}>+ Thêm quà</button>
        {rows && (
          <>
            <button className="primary" onClick={save}>
              Lưu bảng quà
            </button>
            <button onClick={() => setRows(null)}>Hủy</button>
          </>
        )}
        <button onClick={() => confirm("Trả bảng quà về mặc định?") && run("resetGifts")}>Về mặc định</button>
      </div>
      {unmapped.length > 0 && (
        <>
          <p className="hint">Quà chưa gán (đang quy đổi theo giá nếu bật):</p>
          <ul className="unmapped">
            {unmapped.map((u) => (
              <li key={`${u.giftId}-${u.giftName}`}>
                {u.giftName || "?"} {u.giftId !== null && <code>#{u.giftId}</code>} · 🪙{u.diamonds ?? "?"} · ×{u.count}
                <button onClick={() => setRows([...list, { giftId: u.giftId, giftName: u.giftName, coins: u.diamonds ?? 1, reward: "food", enabled: true }])}>Gán</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="hint">Tên, ID và giá quà TikTok khác nhau theo khu vực — hãy đối chiếu với danh sách quà thật của phòng.</p>
    </div>
  );
}

/** `/`: bảng điều khiển của streamer — kết nối, demo, luật chơi, danh sách cá, preview Stage. */
export function AdminApp() {
  const [client] = useState(() => new EngineClient(true));
  useEngine(client);
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    client.start();
    return () => client.stop();
  }, [client]);

  const admin = client.admin;
  const run = async (cmd: string, args?: Record<string, unknown>) => {
    const r = await client.command(cmd, args);
    setMsg(r.ok ? "" : (r.error ?? "Lỗi"));
  };

  const previewScale = 0.42;
  return (
    <div className="admin">
      <section className="admin-col">
        <h2>Kết nối</h2>
        <p className={`pill state-${admin?.connector.state ?? "idle"}`}>
          {admin ? `${admin.connector.kind === "tiktok" ? `@${admin.connector.username}` : admin.connector.kind} · ${admin.connector.message}` : "Đang kết nối engine…"}
        </p>
        <div className="row">
          <input placeholder="username TikTok" value={username} onChange={(e) => setUsername(e.target.value)} />
          <button onClick={() => run("connectTikTok", { username })}>Kết nối LIVE</button>
        </div>
        <div className="row">
          <button onClick={() => run("useDemo")}>Dùng Demo</button>
          <button onClick={() => run("disconnect")}>Ngắt (đóng băng bể)</button>
        </div>

        {admin?.connector.kind === "demo" && (
          <>
            <h2>Demo</h2>
            <div className="row">
              <button onClick={() => run("demoRunning", { running: !admin.demo.running })}>{admin.demo.running ? "⏸ Dừng giả lập" : "▶ Chạy giả lập"}</button>
              <label>
                Tốc độ {admin.demo.rate.toFixed(1)}/s
                <input type="range" min={0.5} max={15} step={0.5} value={admin.demo.rate} onChange={(e) => run("demoRate", { rate: Number(e.target.value) })} />
              </label>
            </div>
            <div className="row">
              <button onClick={() => run("demoJoin", { count: 10 })}>+10 người thả cá</button>
              <button onClick={() => run("demoFeedAll")}>Cả bể cho ăn</button>
            </div>
          </>
        )}
        <h2>Thời tiết & thử thách</h2>
        {admin && (
          <p className="pill">
            {WEATHER_INFO[admin.env.weather].icon} {WEATHER_INFO[admin.env.weather].name}
            {admin.env.night ? " · 🌙 đêm" : " · ngày"} · 💧 bẩn {admin.env.dirt}%
            {admin.env.challenge && ` · đang có ${admin.env.challenge === "clean" ? "dọn bể" : "mèo"}`}
          </p>
        )}
        <div className="row">
          <button onClick={() => run("setWeather", { kind: "sun" })}>☀️ Nắng</button>
          <button onClick={() => run("setWeather", { kind: "rain" })}>🌧️ Mưa</button>
          <button onClick={() => run("setWeather", { kind: "rainbow" })}>🌈 Cầu vồng</button>
          <button onClick={() => run("setWeather", { kind: "stormWarn" })}>⛈️ Bão</button>
        </div>
        <div className="row">
          <button onClick={() => run("setNight", { mode: admin?.env.night ? 0 : 3 })}>{admin?.env.night ? "🌅 Bật ngày" : "🌙 Bật đêm"}</button>
          <button onClick={() => run("setNight", { mode: 2 })}>Luân phiên ngày/đêm</button>
          <button onClick={() => run("setNight", { mode: 1 })}>Đêm theo giờ thật</button>
        </div>
        <div className="row">
          <button onClick={() => run("startPredator")}>🐱 Mèo tới</button>
          <button onClick={() => run("setDirt", { value: 85 })}>Nước bẩn 85%</button>
          <button onClick={() => run("startCleanup")}>🧽 Thử thách dọn bể</button>
          <button onClick={() => run("setDirt", { value: 0 })}>Làm sạch</button>
        </div>

        <h2>Âm thanh & MC</h2>
        {admin && <AudioPanel admin={admin} run={run} />}

        <h2>Quà tặng</h2>
        {admin && <GiftEditor gifts={admin.gifts} unmapped={admin.unmapped} run={run} />}

        <h2>Thử nghiệm</h2>
        <div className="row">
          <button onClick={() => run("spawn", {})}>Nở cá thường ngẫu nhiên</button>
          {COMMON_SPECIES.map((id) => (
            <button key={id} onClick={() => run("spawn", { species: id })}>
              Nở {SPECIES[id].name.toLowerCase()}
            </button>
          ))}
          {RARE_SPECIES.map((id) => (
            <button key={id} onClick={() => run("spawn", { species: id })}>
              💎 Nở {SPECIES[id].name.toLowerCase()}
            </button>
          ))}
          <button onClick={() => run("spawn", { species: "dragonfish" })}>Nở cá rồng</button>
          <button onClick={() => run("spawn", { species: "dragonfish", stage: 7 })}>Cá rồng chúa</button>
        </div>
        <div className="row">
          <button onClick={() => run("starveAll", { to: 12 })}>Cả bể đói còn 12%</button>
          <button className="danger" onClick={() => confirm("Xóa toàn bộ cá?") && run("clearTank")}>
            Xóa bể
          </button>
        </div>
        {msg && <p className="error">{msg}</p>}

        <h2>Luật chơi</h2>
        {admin && (
          <div className="rules">
            {(Object.keys(RULE_LABELS) as (keyof Rules)[]).map((key) => (
              <label key={key}>
                <span>{RULE_LABELS[key]}</span>
                <input
                  type="number"
                  defaultValue={admin.rules[key]}
                  key={`${key}-${admin.rules[key]}`}
                  onBlur={(e) => Number(e.target.value) !== admin.rules[key] && run("setRules", { [key]: Number(e.target.value) })}
                />
                {admin.rules[key] !== DEFAULT_RULES[key] && <em>mặc định {DEFAULT_RULES[key]}</em>}
              </label>
            ))}
            <button onClick={() => run("resetRules")}>Về mặc định</button>
          </div>
        )}
      </section>

      <section className="admin-stage">
        <a href="/?view=stage" target="_blank" rel="noreferrer">
          Mở Stage cho OBS ↗
        </a>
        <div style={{ width: CANVAS_W * previewScale, height: CANVAS_H * previewScale }}>
          <StageFrame client={client} scale={previewScale} muted />
        </div>
      </section>

      <section className="admin-col">
        <h2>
          Cá trong bể ({admin?.fish.length ?? 0}) · nở {admin?.totals.hatched ?? 0} · chết {admin?.totals.died ?? 0}
        </h2>
        <table className="fish-table">
          <tbody>
            {admin?.fish.slice(0, 60).map((f) => (
              <tr key={f.id} className={f.status === "exhausted" ? "is-dying" : ""}>
                <td>{f.name}</td>
                <td>{SPECIES[f.species].name}</td>
                <td>
                  {STAGES[f.stage].name} {f.growth}%
                </td>
                <td>🍤 {f.hunger}%</td>
                <td className="actions">
                  <button title="Cho ăn đầy" onClick={() => run("feedFish", { id: f.id })}>
                    🍤
                  </button>
                  <button title="Lên cấp" onClick={() => run("growFish", { id: f.id })}>
                    ⬆
                  </button>
                  <button title="Xóa" onClick={() => run("killFish", { id: f.id })}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Nhật ký</h2>
        <ul className="log">
          {admin?.log.slice(0, 60).map((l, i) => (
            <li key={`${l.at}-${i}`} className={`log-${l.kind}`}>
              <time>{new Date(l.at).toLocaleTimeString("vi-VN")}</time> {l.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
