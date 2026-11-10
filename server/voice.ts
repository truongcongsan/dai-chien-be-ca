import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { VoiceStatus } from "../src/shared/protocol";

const run = promisify(execFile);
const POLL_MS = 250;
const JOB_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;
const FAILURE_COOLDOWN_MS = 30_000;
const MAX_PENDING = 6;
const MAX_CACHED = 800;
const AUDIO_FILTER = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-2";
export const VOICE_FILE = /^[a-f0-9]{32}\.(mp3|wav|m4a)$/;

interface Job {
  text: string;
  voice: string;
  priority: number;
  expiresAt: number;
  stem: string;
}

/** Một bộ máy đọc: nhận câu, trả về file âm thanh trong cacheDir. */
interface Engine {
  name: VoiceStatus["engine"];
  listVoices(): Promise<string[]>;
  generate(job: Job, cacheDir: string): Promise<string>;
}

/**
 * VieNeu-TTS chạy local (cùng giao thức với game quán ăn). Ưu tiên dùng khi có token.
 */
class VieNeuEngine implements Engine {
  name = "vieneu" as const;
  private readonly rawDir: string;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    cacheDir: string,
  ) {
    this.rawDir = join(resolve(cacheDir), "raw");
    mkdirSync(this.rawDir, { recursive: true });
  }

  private request(path: string, init?: RequestInit) {
    return fetch(`${this.baseUrl}${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      ...init,
    });
  }

  async listVoices() {
    const response = await this.request("/v1/voices");
    if (!response.ok) throw new Error(`voices ${response.status}`);
    const body = (await response.json()) as { voices?: { name?: unknown }[] };
    return (body.voices ?? []).map((v) => v.name).filter((n): n is string => typeof n === "string");
  }

  async generate(job: Job, cacheDir: string) {
    const created = await this.request("/v1/tts", {
      method: "POST",
      body: JSON.stringify({ text: job.text, voice: job.voice, output_dir: this.rawDir, filename: `${randomUUID()}.wav` }),
    });
    if (!created.ok) throw new Error(`tts ${created.status}`);
    const { id } = (await created.json()) as { id?: unknown };
    if (typeof id !== "string") throw new Error("tts returned no job id");
    const deadline = Date.now() + JOB_TIMEOUT_MS;
    let result: { id?: string; path?: string } | null = null;
    while (Date.now() < deadline) {
      const response = await this.request(`/v1/jobs/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(`job ${response.status}`);
      const body = (await response.json()) as { status?: string; result?: { id?: string; path?: string } | null };
      if (body.status === "done" && body.result?.id) {
        result = body.result;
        break;
      }
      if (body.status === "failed" || body.status === "error") throw new Error("tts job failed");
      await new Promise((done) => setTimeout(done, POLL_MS));
    }
    if (!result?.id) throw new Error("tts job timed out");
    try {
      const audio = await this.request(`/v1/history/${encodeURIComponent(result.id)}/audio`);
      if (!audio.ok) throw new Error(`audio ${audio.status}`);
      const wavPath = join(this.rawDir, `${job.stem}.wav`);
      writeFileSync(wavPath, Buffer.from(await audio.arrayBuffer()));
      return await compress(wavPath, job.stem, cacheDir);
    } finally {
      if (result.path && dirname(resolve(result.path)) === this.rawDir) rmSync(result.path, { force: true });
    }
  }
}

/**
 * Giọng có sẵn của macOS (lệnh `say`, giọng "Linh" tiếng Việt). Dự phòng khi chưa cài VieNeu:
 * file vẫn phát qua trình duyệt nên OBS thu được tiếng.
 */
class MacSayEngine implements Engine {
  name = "macos" as const;
  private readonly rawDir: string;

  constructor(cacheDir: string) {
    this.rawDir = join(resolve(cacheDir), "raw");
    mkdirSync(this.rawDir, { recursive: true });
  }

  async listVoices() {
    const { stdout } = await run("say", ["-v", "?"]);
    // Dòng dạng "Linh                vi_VN  # …" hoặc (máy tiếng Việt) "Linh (Tiếng Việt (Việt Nam)) vi_VN  # …".
    const names = stdout
      .split("\n")
      .filter((line) => /\bvi[_-]VN\b/.test(line))
      .map((line) => line.split(/\s+\(|\s{2,}|\s+vi[_-]VN/)[0].trim())
      .filter(Boolean);
    return [...new Set(names)];
  }

  async generate(job: Job, cacheDir: string) {
    const wavPath = join(this.rawDir, `${job.stem}.wav`);
    // Tốc độ 190 từ/phút: vui tai, không quá nhanh.
    await run("say", ["-v", job.voice, "-r", "190", "-o", wavPath, "--data-format=LEI16@22050", job.text], { timeout: JOB_TIMEOUT_MS });
    return compress(wavPath, job.stem, cacheDir);
  }
}

/**
 * Giọng có sẵn của Windows qua WinRT (giọng "Microsoft An" tiếng Việt, cài trong Settings › Time & language › Speech).
 * Gọi `win-tts.ps1` bằng Windows PowerShell; câu thoại đi qua file UTF-8 để giữ dấu tiếng Việt.
 */
class WindowsSpeechEngine implements Engine {
  name = "windows" as const;
  private readonly rawDir: string;
  private readonly script = fileURLToPath(new URL("./win-tts.ps1", import.meta.url));

  constructor(cacheDir: string) {
    this.rawDir = join(resolve(cacheDir), "raw");
    mkdirSync(this.rawDir, { recursive: true });
  }

  private ps(args: string[]) {
    return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", this.script, ...args], {
      timeout: JOB_TIMEOUT_MS,
      windowsHide: true,
    });
  }

  async listVoices() {
    const { stdout } = await this.ps(["-List"]);
    return [...new Set(stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
  }

  async generate(job: Job, cacheDir: string) {
    const textPath = join(this.rawDir, `${job.stem}.txt`);
    const wavPath = join(this.rawDir, `${job.stem}.wav`);
    writeFileSync(textPath, job.text, "utf8");
    try {
      await this.ps(["-Voice", job.voice, "-TextFile", textPath, "-Out", wavPath]);
    } finally {
      rmSync(textPath, { force: true });
    }
    return compress(wavPath, job.stem, cacheDir);
  }
}

/** Nén WAV: ffmpeg → mp3 (có chuẩn hóa âm lượng); không có ffmpeg thì afconvert (macOS) → m4a; không nữa thì giữ WAV. */
async function compress(wavPath: string, stem: string, cacheDir: string) {
  const tmp = join(dirname(wavPath), stem);
  try {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", wavPath, "-af", AUDIO_FILTER, "-ac", "1", "-b:a", "64k", `${tmp}.mp3`]);
    renameSync(`${tmp}.mp3`, join(cacheDir, `${stem}.mp3`));
    return `${stem}.mp3`;
  } catch {
    try {
      await run("afconvert", ["-f", "m4af", "-d", "aac", "-b", "64000", wavPath, `${tmp}.m4a`]);
      renameSync(`${tmp}.m4a`, join(cacheDir, `${stem}.m4a`));
      return `${stem}.m4a`;
    } catch {
      renameSync(wavPath, join(cacheDir, `${stem}.wav`));
      return `${stem}.wav`;
    }
  } finally {
    rmSync(wavPath, { force: true });
  }
}

/**
 * Hàng đợi đọc của MC. Chạy tách khỏi vòng lặp game; lỗi chỉ làm mất tiếng, câu thoại vẫn hiện phụ đề.
 */
export class Voice {
  onReady: (file: string | null, text: string, priority: number) => void = () => undefined;
  voices: string[] = [];
  private readonly queue: Job[] = [];
  private working = false;
  private blockedUntil = 0;
  private state: VoiceStatus["state"] = "ready";
  private message = "";
  private lastMs: number | null = null;

  private constructor(
    private readonly engine: Engine,
    private readonly cacheDir: string,
  ) {
    mkdirSync(cacheDir, { recursive: true });
    this.prune();
  }

  /**
   * VieNeu nếu có token; không thì giọng hệ điều hành (macOS `say` / Windows "Microsoft An") nếu máy có giọng
   * tiếng Việt; không nữa thì null (chỉ phụ đề).
   */
  static async create(cacheDir: string, opts: { vieneuUrl: string; vieneuKey: string; allowSystem: boolean }) {
    if (opts.vieneuKey) {
      const v = new Voice(new VieNeuEngine(opts.vieneuUrl, opts.vieneuKey, cacheDir), cacheDir);
      await v.loadVoices();
      if (v.voices.length || !opts.allowSystem) return v;
    }
    const system = process.platform === "darwin" ? new MacSayEngine(cacheDir) : process.platform === "win32" ? new WindowsSpeechEngine(cacheDir) : null;
    if (opts.allowSystem && system) {
      const v = new Voice(system, cacheDir);
      await v.loadVoices();
      if (v.voices.length) return v;
    }
    return null;
  }

  status(): VoiceStatus {
    return { engine: this.engine.name, state: this.state, message: this.message, voices: this.voices, pending: this.queue.length, lastMs: this.lastMs };
  }

  async loadVoices() {
    try {
      this.voices = await this.engine.listVoices();
      this.healthy();
    } catch (error) {
      this.fail(error);
    }
  }

  private stemOf(voice: string, text: string) {
    return createHash("sha256").update(`${this.engine.name}\n${voice}\n${text}`).digest("hex").slice(0, 32);
  }

  private cached(stem: string) {
    for (const ext of ["mp3", "m4a", "wav"]) if (existsSync(join(this.cacheDir, `${stem}.${ext}`))) return `${stem}.${ext}`;
    return null;
  }

  audioPath(file: string) {
    return VOICE_FILE.test(file) ? join(this.cacheDir, file) : null;
  }

  say(text: string, voice: string, priority: number, ttlMs: number) {
    const stem = this.stemOf(voice, text);
    const hit = this.cached(stem);
    if (hit) return this.onReady(hit, text, priority);
    if (Date.now() < this.blockedUntil) return this.onReady(null, text, priority);
    this.queue.push({ text, voice, priority, expiresAt: Date.now() + ttlMs, stem });
    this.queue.sort((a, b) => b.priority - a.priority);
    // Quá tải thì bỏ câu kém quan trọng nhất, nhưng vẫn hiện phụ đề.
    while (this.queue.length > MAX_PENDING) {
      const dropped = this.queue.pop()!;
      this.onReady(null, dropped.text, dropped.priority);
    }
    void this.pump();
  }

  /** Tạo sẵn các câu lặp lại để lúc cần phát ngay. */
  prepare(texts: string[], voice: string) {
    for (const text of texts) {
      const stem = this.stemOf(voice, text);
      if (!this.cached(stem)) this.queue.push({ text, voice, priority: -1, expiresAt: Number.POSITIVE_INFINITY, stem });
    }
    void this.pump();
  }

  private async pump() {
    if (this.working) return;
    this.working = true;
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;
        if (Date.now() > job.expiresAt) continue;
        if (Date.now() < this.blockedUntil) {
          if (job.priority >= 0) this.onReady(null, job.text, job.priority);
          continue;
        }
        const started = Date.now();
        this.state = "generating";
        try {
          const file = await this.engine.generate(job, this.cacheDir);
          this.lastMs = Date.now() - started;
          this.healthy();
          if (job.priority >= 0) this.onReady(Date.now() <= job.expiresAt ? file : null, job.text, job.priority);
        } catch (error) {
          this.fail(error);
          if (job.priority >= 0) this.onReady(null, job.text, job.priority);
        }
      }
    } finally {
      this.working = false;
      this.state = this.state === "generating" ? "ready" : this.state;
    }
  }

  private healthy() {
    this.state = this.queue.length > 0 ? "generating" : "ready";
    this.message = "";
    this.blockedUntil = 0;
  }

  private fail(error: unknown) {
    this.state = "error";
    this.message = "Không tạo được giọng đọc. Game vẫn chạy, MC hiện phụ đề; sẽ tự thử lại.";
    this.blockedUntil = Date.now() + FAILURE_COOLDOWN_MS;
    console.error("[voice]", error instanceof Error ? error.message : error);
  }

  private prune() {
    const files = readdirSync(this.cacheDir)
      .filter((name) => VOICE_FILE.test(name))
      .map((name) => ({ name, at: statSync(join(this.cacheDir, name)).mtimeMs }))
      .sort((a, b) => b.at - a.at);
    for (const old of files.slice(MAX_CACHED)) rmSync(join(this.cacheDir, old.name), { force: true });
  }
}
