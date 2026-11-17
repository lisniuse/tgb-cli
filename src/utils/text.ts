import { load, type CheerioAPI } from "cheerio";
import { BASE_URL, IMAGE_BASE } from "../constants.ts";

export function $(html: string): CheerioAPI {
  return load(html);
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  mdash: "—",
};

/** 接口返回的标题/正文常带 HTML 实体，统一解码 */
export function decodeEntities(value: string): string {
  return value
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function cleanText(value: string | undefined | null): string {
  return decodeEntities(value || "")
    .replace(/ /g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 把 HTML 转成可读纯文本，保留换行，图片显示为 [图片] */
export function htmlToText(html: string | undefined | null, imagePlaceholder = "[图片]"): string {
  if (!html) return "";
  const $doc = load(html, null, false);
  $doc("script,style,noscript").remove();
  $doc("img").each((_, el) => {
    const node = $doc(el);
    const alt = node.attr("alt")?.trim();
    node.replaceWith(alt ? `[图片:${alt}]` : imagePlaceholder);
  });
  $doc("br").replaceWith("\n");
  $doc("p,div,li,tr,h1,h2,h3,h4,blockquote,section").each((_, el) => {
    $doc(el).append("\n");
  });
  return cleanText($doc.root().text());
}

export function textOf($root: CheerioAPI, selector: string): string {
  return cleanText($root(selector).first().text());
}

export function attrOf($root: CheerioAPI, selector: string, attr: string): string | undefined {
  return $root(selector).first().attr(attr)?.trim() || undefined;
}

export function absoluteUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const value = url.trim();
  if (!value) return undefined;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${BASE_URL}${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  return `${BASE_URL}/${value.replace(/^\/+/, "")}`;
}

/** 图片流接口返回的 imgurl 可能是相对路径，也可能带 image.tgb.cn 前缀 */
export function imageUrl(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  const value = path.trim();
  if (!value) return undefined;
  if (value.startsWith("//")) return `https:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${BASE_URL}${value}`;
  return `${IMAGE_BASE}${value}`;
}

export function extractImages($root: CheerioAPI, selector: string): string[] {
  const images: string[] = [];
  $root(selector)
    .find("img")
    .each((_, el) => {
      const node = $root(el);
      const src = node.attr("data-original") || node.attr("src2") || node.attr("src") || node.attr("data-src");
      const url = absoluteUrl(src);
      if (!url) return;
      if (/\.gif($|\?)/i.test(url)) return;
      if (url.includes("css.tgb.cn/images")) return;
      if (!images.includes(url)) images.push(url);
    });
  return images;
}

export function extractNewTopicId(input: string): string {
  const value = input.trim();
  const fromUrl = value.match(/\/a\/([A-Za-z0-9]+)/);
  if (fromUrl) return fromUrl[1];
  const cleaned = value.replace(/^[#/]+/, "").replace(/-\d+$/, "").replace(/[?#].*$/, "");
  return cleaned;
}

export function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

export function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (Math.abs(value) >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
  return String(value);
}

export function formatTime(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === "") return "-";
  let date: Date;
  if (typeof value === "number") {
    date = new Date(value);
  } else if (/^\d+$/.test(value)) {
    date = new Date(Number(value));
  } else {
    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    date = new Date(normalized);
  }
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function formatRelativeTime(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === "") return "-";
  const raw = String(value);
  const ms = typeof value === "number" || /^\d{10,}$/.test(raw) ? Number(value) : Date.parse(raw.replace(" ", "T"));
  if (Number.isNaN(ms)) return String(value);
  const diff = Date.now() - ms;
  if (diff < 0) return formatTime(ms);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatTime(ms);
}

export function truncate(value: string, max: number): string {
  const single = value.replace(/\s+/g, " ").trim();
  if (single.length <= max) return single;
  return `${single.slice(0, Math.max(0, max - 1))}…`;
}

export function parseCount(text: string | undefined): number {
  if (!text) return 0;
  const match = text.replace(/,/g, "").match(/([\d.]+)\s*(万|亿)?/);
  if (!match) return 0;
  const num = Number(match[1]);
  if (Number.isNaN(num)) return 0;
  if (match[2] === "万") return Math.round(num * 10_000);
  if (match[2] === "亿") return Math.round(num * 100_000_000);
  return Math.round(num);
}

export function extractTopicIdFromPage($doc: CheerioAPI): string | undefined {
  const id = $doc("[data-topic-id]").first().attr("data-topic-id");
  if (id) return id;
  const gio = $doc("#gioMsg").attr("topicid") || $doc("#gioMsg").attr("data-topic-id");
  return gio || undefined;
}
