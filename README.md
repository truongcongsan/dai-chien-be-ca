# Đại Chiến Bể Cá

Mini game nuôi cá và đại chiến trên TikTok LIVE (Stage 1080 × 1920; tên cũ: Bể Cá Hạnh Phúc). Dự án riêng, tách khỏi *Tiệm Ăn Hạnh Phúc*.

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
Comment `cá` / thả tim → trứng có thanh %, đủ 60 tim thì nở; **thả tim để cá lớn**: 3 tim = 1 điểm; Lv1→10 rất nhanh (30–195 tim một cấp, ≈ 680 tim cả chặng), Lv10→15 tăng dần, từ Lv15 ≈ 720+ tim một cấp, 10 tim = +1% no; `ăn` vẫn cho ăn (+5% no, +5 điểm, cooldown 20s); đói −5%/phút, kiệt sức 30s rồi chết; 100 cấp (Lv1–15 đổi hình qua 4 giai đoạn, Lv15–100 giữ hình, to vọt ở Lv20/30/50/100); nhãn “LvX Tên” tô màu theo bậc cá (thường xám, hiếm xanh, rồng cam); cá hiếm lớn ×1.5, cá rồng ×1.8; Top 3; hàng chờ giữ tim; cá bơi uốn thân, rong, bong bóng, tia nắng; thông báo nở/lên cấp/đói/chết.

Cá đói "nói" bằng bong bóng chữ. Thời tiết tự đổi: mưa (comment `đớp` để cá ăn côn trùng), cầu vồng (×1,5 tăng trưởng), bão (đói ×2, sống sót nhận ⚡), đêm (đói ×0,5, sứa phát sáng). Thử thách cả phòng: nước bẩn (comment `dọn`), mèo thò tay (thả tim đuổi mèo).

Quà tặng TikTok → phần thưởng: Rose thức ăn ngon · Finger Heart nở ngay · Doughnut khiên · Capybara trứng hiếm (30 xu) · Little Crown trứng rồng (99) · Hand Heart Tăng 10lv · Confetti Cắn chết · Mishka Bear hồi sinh (100) · Corgi Tăng 35lv (299) · Galaxy Hủy diệt (1000: diệt cả bể, người tặng vô địch ngay); mưa thức ăn còn trong danh sách phần thưởng để Admin gán, menu quà xoay vòng bên phải Stage dùng **ảnh quà TikTok thật** (engine tự lấy danh sách quà của phòng khi kết nối, điền ID/giá/ảnh, lưu ảnh ở `data/gift-img/`; Admin có nút “Tải ảnh quà từ TikTok”), bảng quà sửa được trong Admin. Cắn nhau: ai có cá cũng comment `cắn @tên` được: phải hơn ít nhất 1 cấp, mỗi cá 1 lần/1 phút 30 giây, 30% cắn trượt; trúng thì cá kia −10 cấp (cấp ≤ 10 thì chết); bị cắn trúng hay hụt đều được khiên 5 phút; cá mới nở có khiên 5 phút; khiên Doughnut chặn 1 cú; cá đã cắn và hồi lượt hiện 🦷, cá giữ Cắn chết hiện 🗡️.

Cá chúa và vô địch: cá to nhất từ Lv15 đội vương miện; giữ ngôi liền 10 phút (có cá khác chiếm thì đếm lại) là **vô địch** 🏆 → sang màn mới: mọi người chơi về trứng, nhà vô địch được trứng cá rồng. Mèo: luôn 200 tim; thua thì mèo cào 3 cá to nhất (−5 cấp, có khiên thì mất khiên). Admin đặt được cấp bất kỳ cho từng cá.

Âm thanh: nhạc nền tự tổng hợp (ngày / đêm / bão / thử thách), tiếng hiệu ứng, tiếng mưa; nhạc tự nhỏ khi MC nói. MC đọc thông báo, cảm ơn quà, gộp câu khi nhiều cá nở/chết/đói cùng lúc, nhắc cách chơi khi bể yên ắng.

**Giọng MC:** dùng VieNeu-TTS nếu có (token app desktop hoặc `TTS_API_KEY`, `TTS_API_URL`); không có thì dùng giọng tiếng Việt của hệ điều hành: **Linh** trên macOS (lệnh `say`), **Microsoft An** trên Windows (WinRT qua `server/win-tts.ps1`; cài ở Settings › Time & language › Speech nếu chưa có); không có thì chỉ hiện phụ đề. `TTS_SYSTEM=0` (hoặc `TTS_MAC=0`) để không dùng giọng hệ điều hành, `TTS_DISABLED=1` để tắt hẳn. File giọng lưu ở `data/voice/`. Chỉ trang Stage phát tiếng (preview trong Admin luôn tắt tiếng).

**Loài cá:** 6 loài thường nở ngẫu nhiên (cá vàng tròn, cá bảy màu, cá nóc tròn, cá neon, cá hề, cá bướm vàng); 3 loài hiếm từ quà **Trứng hiếm** (mặc định Capybara 30 xu: cá betta đuôi lụa, cá thần tiên, cá ngựa; đã có cá thì đổi loài, giữ cấp); cá rồng ánh kim từ Trứng rồng.

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
