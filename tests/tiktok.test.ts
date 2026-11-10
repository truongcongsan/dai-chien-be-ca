import { describe, expect, it } from "vitest";
import { commentOf, likesOf, toGiftEvent, userOf, viewersOf } from "../server/adapters/tiktok";

/** Dạng sự kiện của tiktok-live-connector 2.x (dữ liệu gốc của TikTok), rút gọn từ phòng LIVE thật. */
const v2User = { id: "7236340028309505029", nickname: "Đăng khoa", displayId: "khoal234" };

describe("TikTok adapter đọc được cả hai dạng dữ liệu", () => {
  it("người xem: 2.x (user.id / displayId) và 1.x (userId / uniqueId)", () => {
    expect(userOf({ user: v2User, userId: "0" })).toEqual({ userId: "7236340028309505029", uniqueId: "khoal234", name: "Đăng khoa" });
    expect(userOf({ userId: "42", uniqueId: "abc", nickname: "A" })).toEqual({ userId: "42", uniqueId: "abc", name: "A" });
    expect(userOf({ userId: "0" })).toBeNull();
  });

  it("comment, tim, người xem", () => {
    expect(commentOf({ content: "cá" })).toBe("cá");
    expect(commentOf({ comment: "ăn" })).toBe("ăn");
    expect(commentOf({})).toBeNull();
    expect(likesOf({ count: 15 })).toBe(15);
    expect(likesOf({ likeCount: 3 })).toBe(3);
    expect(viewersOf({ total: "6" })).toBe(6);
    expect(viewersOf({ viewerCount: 9 })).toBe(9);
  });

  it("quà 2.x: chỉ lấy lần cuối của chuỗi combo, đủ ID/tên/giá", () => {
    const base = { common: { msgId: "m1" }, user: v2User, giftId: 5655, groupId: "g1", giftDetails: { giftName: "Rose", giftType: 1, diamondCount: 1 } };
    expect(toGiftEvent({ ...base, repeatCount: 2, repeatEnd: false })).toBeNull();
    expect(toGiftEvent({ ...base, repeatCount: 5, repeatEnd: true })).toMatchObject({
      type: "gift",
      giftId: 5655,
      giftName: "Rose",
      diamonds: 1,
      count: 5,
      user: { userId: "7236340028309505029", name: "Đăng khoa" },
    });
  });
});
