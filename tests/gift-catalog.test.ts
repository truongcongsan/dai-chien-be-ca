import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GiftCatalog } from "../server/gift-catalog";
import { DEFAULT_GIFTS } from "../src/shared/config";

describe("danh sách quà TikTok", () => {
  const catalog = new GiftCatalog(mkdtempSync(join(tmpdir(), "be-ca-gifts-")));
  catalog.gifts = [
    { id: 5655, name: "Rose", coins: 1, image: "https://example.invalid/rose.webp" },
    { id: 5660, name: "Hand Heart", coins: 100, image: null },
  ];

  it("tìm theo ID trước, rồi theo tên không phân biệt hoa thường", () => {
    expect(catalog.find(5655, "")?.name).toBe("Rose");
    expect(catalog.find(null, "hand heart")?.id).toBe(5660);
    expect(catalog.find(999, "ROSE")?.id).toBe(5655);
    expect(catalog.find(null, "Hand Hearts")).toBeUndefined();
  });

  it("chỉ phục vụ file ảnh có tên hợp lệ", () => {
    expect(catalog.imagePath("../tank.json")).toBeNull();
    expect(catalog.imagePath(`${"a".repeat(40)}.webp`)).not.toBeNull();
  });

  it("bảng quà mặc định có đủ ID quà TikTok", () => {
    for (const g of DEFAULT_GIFTS) expect(g.giftId).not.toBeNull();
    expect(DEFAULT_GIFTS.some((g) => g.giftName === "Hand Heart" && g.giftId === 5660)).toBe(true);
  });
});
