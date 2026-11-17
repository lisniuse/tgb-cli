import { BASE_URL, DEFAULT_USER_AGENT, SSO_URL } from "./constants.ts";
import { getCookie, loadConfig } from "./config.ts";

export class TgbError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = "TgbError";
  }
}

export class LoginRequiredError extends TgbError {
  constructor(message = "需要登录后才能访问该内容") {
    super(message);
    this.name = "LoginRequiredError";
  }
}

export class ApiError extends TgbError {
  constructor(message: string, readonly code?: number | string) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  referer?: string;
  timeoutMs?: number;
  retries?: number;
  /** 不抛登录异常，返回原始响应 */
  allowAnonymous?: boolean;
  headers?: Record<string, string>;
}

interface FetchResult {
  status: number;
  ok: boolean;
  url: string;
  headers: Headers;
  text: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbsolute(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export class TgbHttp {
  private lastRequestAt = 0;

  constructor() {}

  private headers(extra?: Record<string, string>, referer?: string): Record<string, string> {
    const cfg = loadConfig();
    const headers: Record<string, string> = {
      "User-Agent": cfg.userAgent || process.env.TGB_USER_AGENT || DEFAULT_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
      Referer: referer || `${BASE_URL}/`,
      ...(extra || {}),
    };
    const cookie = getCookie();
    if (cookie) headers.Cookie = cookie;
    return headers;
  }

  /** 批量抓取时按配置的间隔限速 */
  async throttle(): Promise<void> {
    const delay = loadConfig().delayMs ?? 0;
    if (delay <= 0) return;
    const wait = this.lastRequestAt + delay - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
  }

  private async rawFetch(url: string, init: RequestInit, opts: RequestOptions): Promise<FetchResult> {
    const cfg = loadConfig();
    const timeout = opts.timeoutMs ?? cfg.timeoutMs ?? 20_000;
    const proxy = cfg.proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    const doFetch = async (target: string): Promise<Response> => {
      const requestInit: RequestInit & { proxy?: string } = {
        ...init,
        signal: AbortSignal.timeout(timeout),
        redirect: "manual",
      };
      if (proxy && !target.includes("aliyuncs.com")) requestInit.proxy = proxy;
      return fetch(target, requestInit);
    };

    const maxRetries = opts.retries ?? 2;
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let current = url;
        for (let hop = 0; hop < 6; hop++) {
          const response = await doFetch(current);
          const location = response.headers.get("location");
          if (response.status >= 300 && response.status < 400 && location) {
            const next = new URL(location, current).toString();
            if (next.includes(SSO_URL)) {
              if (opts.allowAnonymous) {
                return { status: response.status, ok: false, url: next, headers: response.headers, text: "" };
              }
              throw new LoginRequiredError("登录已失效或未登录，请执行 tgb login 重新配置 Cookie");
            }
            current = next;
            continue;
          }
          const text = await response.text();
          return {
            status: response.status,
            ok: response.ok,
            url: current,
            headers: response.headers,
            text,
          };
        }
        throw new TgbError("重定向次数过多");
      } catch (error) {
        if (error instanceof LoginRequiredError) throw error;
        lastError = error;
        if (attempt < maxRetries) {
          await sleep(400 * (attempt + 1));
          continue;
        }
      }
    }
    throw new TgbError(
      `请求失败: ${url} - ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  async getText(pathOrUrl: string, opts: RequestOptions = {}): Promise<string> {
    const url = isAbsolute(pathOrUrl) ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
    const res = await this.rawFetch(url, { method: "GET", headers: this.headers(opts.headers, opts.referer) }, opts);
    if (!res.ok) {
      if (res.status === 404) throw new TgbError(`页面不存在: ${url}`);
      throw new TgbError(`请求失败 HTTP ${res.status}: ${url}`);
    }
    return res.text;
  }

  async requestJson<T = unknown>(pathOrUrl: string, opts: RequestOptions = {}): Promise<T> {
    const url = isAbsolute(pathOrUrl) ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
    const res = await this.rawFetch(
      url,
      {
        method: "GET",
        headers: this.headers({ Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest" }, opts.referer),
      },
      opts,
    );
    if (!res.ok) throw new TgbError(`请求失败 HTTP ${res.status}: ${url}`);
    let json: unknown;
    try {
      json = JSON.parse(res.text);
    } catch {
      throw new TgbError(`接口返回的不是 JSON: ${url}`);
    }
    this.assertApiOk(json, url);
    return json as T;
  }

  async postForm(
    pathOrUrl: string,
    form: Record<string, string>,
    opts: RequestOptions = {},
  ): Promise<{ status: number; location?: string; text: string; finalUrl: string }> {
    const url = isAbsolute(pathOrUrl) ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) body.set(key, value);
    const res = await this.rawFetch(
      url,
      {
        method: "POST",
        headers: this.headers(
          {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
          },
          opts.referer,
        ),
        body: body.toString(),
      },
      opts,
    );
    return { status: res.status, location: res.headers.get("location") || undefined, text: res.text, finalUrl: res.url };
  }

  async jsonp<T = unknown>(pathOrUrl: string, opts: RequestOptions = {}): Promise<T> {
    const text = await this.getText(pathOrUrl, opts);
    const start = text.indexOf("(");
    const end = text.lastIndexOf(")");
    if (start < 0 || end <= start) throw new TgbError("JSONP 解析失败");
    let json: unknown;
    try {
      json = JSON.parse(text.slice(start + 1, end));
    } catch {
      throw new TgbError("JSONP 内容不是合法 JSON");
    }
    this.assertApiOk(json, pathOrUrl);
    return json as T;
  }

  private assertApiOk(json: unknown, source: string): void {
    if (!json || typeof json !== "object") return;
    const obj = json as Record<string, unknown>;
    if (obj.status === false) {
      const message = String(obj.errorMessage || "接口返回失败");
      const code = obj.errorCode as number | string | undefined;
      if (String(code) === "5001" || /未登录|没有登陆|登录/.test(message)) {
        throw new LoginRequiredError(message);
      }
      throw new ApiError(`${message} (${source})`, code);
    }
  }
}

export const http = new TgbHttp();
