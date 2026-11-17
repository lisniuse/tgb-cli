import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface TgbConfig {
  /** 浏览器 Cookie 请求头（含登录态） */
  cookie?: string;
  /** 自定义 User-Agent，默认 Chrome */
  userAgent?: string;
  /** 代理，例如 http://127.0.0.1:7890 */
  proxy?: string;
  /** 请求超时（毫秒） */
  timeoutMs?: number;
  /** 批量抓取时请求间隔（毫秒） */
  delayMs?: number;
  /** 登录用户名缓存，仅用于展示 */
  userName?: string;
  userId?: string;
}

export const CONFIG_DIR = process.env.TGB_CLI_HOME
  ? process.env.TGB_CLI_HOME
  : join(homedir(), ".tgb-cli");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

let cached: TgbConfig | undefined;

export function loadConfig(): TgbConfig {
  if (cached) return cached;
  try {
    if (existsSync(CONFIG_FILE)) {
      cached = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as TgbConfig;
    } else {
      cached = {};
    }
  } catch {
    cached = {};
  }
  return cached;
}

export function saveConfig(config: TgbConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // Windows 下 chmod 语义有限，忽略
  }
  cached = config;
}

export function updateConfig(patch: Partial<TgbConfig>): TgbConfig {
  const next = { ...loadConfig(), ...patch };
  saveConfig(next);
  return next;
}

export function getCookie(): string | undefined {
  return process.env.TGB_COOKIE?.trim() || loadConfig().cookie?.trim() || undefined;
}

export function hasCookie(): boolean {
  return Boolean(getCookie());
}

export function configPath(): string {
  return CONFIG_FILE;
}

export function maskCookie(cookie: string | undefined): string {
  if (!cookie) return "(未设置)";
  const parts = cookie.split(";").map((s) => s.trim()).filter(Boolean);
  const names = parts.map((p) => p.split("=")[0]).filter(Boolean);
  return `${names.length} 个字段 (${names.slice(0, 6).join(", ")}${names.length > 6 ? ", ..." : ""})`;
}
