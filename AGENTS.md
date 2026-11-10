# Bể Cá Hạnh Phúc — hướng dẫn cho agent

Mini game nuôi cá trong bể kính chạy trên TikTok LIVE, màn hình dọc 9:16. Tài liệu gốc: `docs/plan-be-ca-hanh-phuc.md`.
Claude Code viết toàn bộ code. Ảnh cá hiện được **vẽ bằng SVG** qua `scripts/draw-fish.mjs` (`pnpm art:draw`), không dùng công cụ AI.

## Chạy
- `pnpm dev`: engine ws://127.0.0.1:3321 + web http://127.0.0.1:3320 (`/` Admin, `/?view=stage` Stage cho OBS). Mặc định chạy Demo.
- `pnpm test`, `pnpm typecheck`; `node scripts/screenshot.mjs out.png [chờ-ms] [stage|admin]` để chụp Stage 1080×1920.

## Nếu sau này dùng AI sinh ảnh
- Đọc `asset-specs/style-guide.md` và spec được chỉ định trong `asset-specs/`.
- Sinh **từng ảnh riêng** bằng công cụ tạo ảnh của bạn (mỗi asset là một lần tạo ảnh, một vật thể/sinh vật duy nhất trong khung).
- Lưu ảnh PNG đúng đường dẫn output trong spec: `assets/raw/<category>/<assetId>.png`. Không ghi file ở chỗ khác, không sửa code.
- Nếu một ảnh đã tồn tại và không rỗng thì bỏ qua, sang ảnh tiếp theo.
- Không cần file meta. Không cần hỏi lại; làm hết danh sách trong spec rồi dừng.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
