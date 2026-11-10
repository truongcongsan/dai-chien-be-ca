import { describe, expect, it } from "vitest";
import { DEFAULT_AUDIO } from "../src/shared/config";
import type { Fx } from "../src/shared/protocol";
import { Narrator, speakable } from "../server/narrator";

function mc(extra: Partial<typeof DEFAULT_AUDIO> = {}) {
  const said: { text: string; subtitle: boolean }[] = [];
  const n = new Narrator(null, () => ({ ...DEFAULT_AUDIO, ambientSec: 0, ...extra }), (fx) => {
    if (fx.kind === "narrate") said.push({ text: fx.text, subtitle: fx.subtitle });
  });
  return { n, said };
}

const ann = (text: string, tone: "info" | "gold" | "sad" = "info", mcTag?: "hatch" | "death" | "warn" | "skip"): Fx => ({ kind: "announce", text, tone, mc: mcTag });

describe("làm sạch câu cho MC đọc", () => {
  it("bỏ emoji, đổi comment/%/×/@ thành chữ", () => {
    expect(speakable('🌧️ Trời mưa! Côn trùng rơi xuống — comment “đớp” để cá mình ăn trước!')).toBe("Trời mưa! Côn trùng rơi xuống, bình luận đớp để cá mình ăn trước!");
    expect(speakable("🌈 Cầu vồng! Cho ăn lúc này được ×1,5 tăng trưởng")).toBe("Cầu vồng! Cho ăn lúc này được gấp rưỡi tăng trưởng");
    expect(speakable("✨ 3 bé cá được +5% tăng trưởng")).toBe("3 bé cá được cộng 5 phần trăm tăng trưởng");
    expect(speakable('🦷 Comment "cắn @tên"')).toBe("bình luận cắn a còng tên");
    expect(speakable("Mai_tt")).toBe("Mai, tt");
  });
});

describe("MC", () => {
  it("đọc thông báo thường; câu đánh dấu skip thì bỏ", () => {
    const { n, said } = mc();
    n.consume([ann("👑 Mai là vua bể mới!", "gold"), ann("🪲 Lan đớp được côn trùng!", "info", "skip")], 0);
    expect(said.map((s) => s.text)).toEqual(["Mai là vua bể mới!"]);
    expect(said[0].subtitle).toBe(false); // đã có banner trên màn hình
  });

  it("nhiều cá nở cùng lúc thì gộp thành một câu, có phụ đề", () => {
    const { n, said } = mc();
    n.consume(
      ["Mai", "Lan", "Tú", "Hùng", "Vy"].map((name) => ann(`🐣 Chào mừng bé cá vàng tròn của ${name}!`, "info", "hatch")),
      0,
    );
    expect(said).toHaveLength(0);
    n.tick(6000);
    expect(said).toEqual([{ text: "Chào mừng bé cá của Mai, Lan và 3 bạn nữa!", subtitle: true }]);
  });

  it("gộp cảnh báo đói và cá chết", () => {
    const { n, said } = mc();
    n.consume([ann('😵 Cá của Mai sắp đói lả, comment "ăn" đi!', "sad", "warn"), ann('😵 Cá của Lan sắp đói lả, comment "ăn" đi!', "sad", "warn")], 0);
    n.tick(5000);
    expect(said[0].text).toBe("Cá của Mai và Lan đang đói lả, bình luận ăn ngay nhé!");
    n.consume([ann("🫧 Cá của Tú đã về trời…", "sad", "death")], 10_000);
    n.tick(16_000);
    expect(said[1].text).toBe("Ôi, cá của Tú đã về trời mất rồi.");
  });

  it("câu thường cách nhau ít nhất 2,5 giây; câu quan trọng luôn qua", () => {
    const { n, said } = mc();
    n.say("một", 2);
    n.say("hai", 2);
    n.say("quà to", 4);
    expect(said.map((s) => s.text)).toEqual(["một", "quà to"]);
  });

  it("quà tặng: mở đầu bằng lời cảm ơn, đọc gọn", () => {
    const { n, said } = mc();
    n.consume([ann("🎁 Mai tặng Rose ×3: 🍤 +15% đói · +10% lớn", "gold")], 0);
    expect(said[0].text).toBe("Cảm ơn Mai đã tặng Rose 3 lần! Cộng 15 phần trăm đói, cộng 10 phần trăm lớn");
  });

  it("tắt MC thì im", () => {
    const { n, said } = mc({ mc: false });
    n.consume([ann("👑 Mai là vua bể mới!", "gold")], 0);
    expect(said).toHaveLength(0);
  });

  it("bể yên ắng thì nhắc cách chơi", () => {
    const { n, said } = mc({ ambientSec: 30 });
    n.tick(Date.now() + 60_000);
    expect(said[0].text).toContain("Bình luận cá");
  });
});
