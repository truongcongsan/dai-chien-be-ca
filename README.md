# Bể Cá Hạnh Phúc

Mini game nuôi cá trên TikTok LIVE (Stage 1080 × 1920). Dự án riêng, tách khỏi *Tiệm Ăn Hạnh Phúc*.

## Chạy

```bash
pnpm install
pnpm dev
```

- Admin: http://127.0.0.1:3320 — kết nối TikTok LIVE theo username, hoặc chạy Demo (mặc định), nút thử nghiệm, chỉnh luật chơi.
- Stage cho OBS: http://127.0.0.1:3320/?view=stage (Browser Source 1080 × 1920).
- Dữ liệu cá lưu ở `data/tank.json` (10 giây/lần và khi tắt). Tắt kết nối LIVE thì bể đóng băng.
- `pnpm test` — test luật chơi; `pnpm typecheck`.

### Windows (khi live thật)

Bấm đúp **`start-windows.cmd`** (hoặc `corepack pnpm start:win`). Engine và web mở ở hai cửa sổ PowerShell riêng ("Bể Cá engine", "Bể Cá web"); tắt bằng cách đóng hai cửa sổ đó.

- Không dùng `pnpm dev` khi live trên Windows: `concurrently` gom log của engine qua pipe, pipe nghẽn thì engine đứng im và mất kết nối TikTok.
- Máy chưa cài `pnpm` thì gõ `corepack pnpm …` thay cho `pnpm …`.
- TikTok LIVE Studio không nhận link localhost: dùng `http://beca-7f000001.nip.io:3320/?view=stage` (DNS công khai trỏ về 127.0.0.1, cần internet).
- Kết nối TikTok cần key Eulerstream trong `.env`: `TIKTOK_SIGN_API_KEY=...` (file `.env` không commit). Gói thường đủ để kết nối; tải danh sách quà của phòng cần gói Business nên mặc định tắt (`TIKTOK_EXTENDED_GIFTS=1` để bật).

## Đã có (MVP lõi)
Comment `cá` / thả tim → trứng có thanh %, đủ 60 tim thì nở; **thả tim để cá lớn**: 3 tim = 1 điểm, một cấp 100–150 điểm (≈ 300–450 tim), 10 tim = +1% no; `ăn` vẫn cho ăn (+5% no, +5 điểm, cooldown 20s); đói −5%/phút, kiệt sức 30s rồi chết; 15 cấp lớn (Lv1 Cá bột → Lv15 Cá chúa, ảnh đổi theo 4 giai đoạn); vương miện + Top 3; hàng chờ giữ tim; cá bơi uốn thân, rong, bong bóng, tia nắng; thông báo nở/lên cấp/đói/chết.

Cá đói "nói" bằng bong bóng chữ. Thời tiết tự đổi: mưa (comment `đớp` để cá ăn côn trùng), cầu vồng (×1,5 tăng trưởng), bão (đói ×2, sống sót nhận ⚡), đêm (đói ×0,5, sứa phát sáng). Thử thách cả phòng: nước bẩn (comment `dọn`), mèo thò tay (thả tim đuổi mèo).

Quà tặng TikTok → phần thưởng (thức ăn ngon, nở ngay, khiên, thuốc lớn, răng nanh, mưa thức ăn, hồi sinh, trứng rồng), menu quà xoay vòng bên phải Stage, bảng quà sửa được trong Admin. Tấn công: `cắn @tên` khi có răng nanh (cá phải hơn ≥2 cấp, cá mới nở được bảo vệ 5 phút, khiên chặn 1 cú), không ra lệnh thì 30 giây sau tự cắn.

Âm thanh: nhạc nền tự tổng hợp (ngày / đêm / bão / thử thách), tiếng hiệu ứng, tiếng mưa; nhạc tự nhỏ khi MC nói. MC đọc thông báo, cảm ơn quà, gộp câu khi nhiều cá nở/chết/đói cùng lúc, nhắc cách chơi khi bể yên ắng.

**Giọng MC:** dùng VieNeu-TTS nếu có (token app desktop hoặc `TTS_API_KEY`, `TTS_API_URL`); không có thì dùng giọng tiếng Việt của hệ điều hành: **Linh** trên macOS (lệnh `say`), **Microsoft An** trên Windows (WinRT qua `server/win-tts.ps1`; cài ở Settings › Time & language › Speech nếu chưa có); không có thì chỉ hiện phụ đề. `TTS_SYSTEM=0` (hoặc `TTS_MAC=0`) để không dùng giọng hệ điều hành, `TTS_DISABLED=1` để tắt hẳn. File giọng lưu ở `data/voice/`. Chỉ trang Stage phát tiếng (preview trong Admin luôn tắt tiếng).

**Loài cá:** 4 loài thường nở ngẫu nhiên (cá vàng tròn, cá bảy màu, cá nóc tròn, cá neon); 3 loài hiếm từ quà **Trứng hiếm** (mặc định Sunglasses ~199 xu: cá betta đuôi lụa, cá thần tiên, cá ngựa; đã có cá thì đổi loài, giữ cấp); cá rồng ánh kim từ Trứng rồng.

**Chưa có:** loài sử thi (cá koi, cá đĩa, cá đuối) và trứng sử thi.

## Ảnh

- Kế hoạch: `docs/plan-be-ca-hanh-phuc.md`
- Spec ảnh: `asset-specs/` (bắt đầu từ `style-guide.md`)
- Ảnh cá được **vẽ bằng SVG** (không dùng AI): nguồn ở `assets/src/fish/`, PNG 1024×1024 nền trong suốt ở `assets/raw/fish/`. Vẽ lại (cần Chromium headless của Playwright, hoặc Chrome/Edge cài sẵn trên Windows; thêm `--export` để cập nhật ảnh trong game):

```bash
node scripts/draw-fish.mjs
```

- Bảng duyệt: `docs/review/fish-species-sheet.png` (đủ các loài), `docs/review/fish-sample-sheet.png`, `docs/review/fish-sample-growth.png`.
- Muốn thay bằng ảnh AI sau này: lưu đè PNG cùng tên vào `assets/raw/fish/` (hoặc dùng `scripts/gen-assets.sh fish-sample` nếu có Codex).
