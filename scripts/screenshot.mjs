/**
 * Chụp Stage ở đúng 1080×1920 để kiểm tra hình (cần `pnpm dev` đang chạy).
 * Dùng: node scripts/screenshot.mjs <file.png> [chờ-ms] [stage|admin]
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

/** Dùng bản Chromium đã có trong cache nếu bản đúng phiên bản Playwright chưa được tải. */
function cachedChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  if (!existsSync(cache)) return undefined;
  const dir = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  const app = dir && join(cache, dir, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
  return app && existsSync(app) ? app : undefined;
}

const out = process.argv[2] ?? "stage.png";
const wait = Number(process.argv[3] ?? 6000);
const which = process.argv[4] ?? "stage";
const base = process.env.WEB_URL ?? "http://127.0.0.1:3320";
const mac = process.platform === "darwin";
// macOS: Chromium trong cache Playwright (ANGLE Metal). Nơi khác: Chrome cài sẵn của máy (đặt CHROME=… để chọn bản khác).
const browser = await chromium.launch(
  mac
    ? { executablePath: cachedChrome(), args: ["--use-angle=metal"] }
    : process.env.CHROME
      ? { executablePath: process.env.CHROME }
      : { channel: "chrome" },
);
const errors = [];
const page = await browser.newPage(which === "admin" ? { viewport: { width: 1600, height: 960 } } : { viewport: { width: 1080, height: 1920 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(which === "admin" ? base : `${base}/?view=stage`);
await page.waitForTimeout(wait);
await page.screenshot({ path: out });
console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no page errors");
await browser.close();
