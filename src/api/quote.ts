import { BASE_URL, HQ_URL } from "../constants.ts";
import { http } from "../http.ts";
import type { ApiEnvelope, StockQuote } from "../types.ts";
import { cleanText, formatNumber } from "../utils/text.ts";
import { searchStocks } from "./search.ts";

export interface StockPost {
  newTopicId: string;
  title: string;
  author: string;
  authorId: string;
  summary: string;
  replyCount: number;
  viewCount: number;
  likeCount: number;
  time: string;
  url: string;
}

interface RawQuote {
  name?: string;
  code?: string;
  fullCode?: string;
  price?: number;
  pxChange?: number;
  pxChangeRate?: number;
  openPrice?: number;
  closePrice?: number;
  highPrice?: number;
  lowPrice?: number;
  zhangting?: number;
  dieting?: number;
  volumn?: number;
  volumnPrice?: number;
  turnoverRate?: number;
  peRatio?: number;
  totalValue?: number;
  circulationValue?: number;
  lastDate?: string;
  lastTime?: string;
  status?: string;
  linkingBoard?: string;
  isStop?: string;
}

interface RawStockPost {
  newTopicID?: string;
  topicID?: string | number;
  subject?: string;
  userName?: string;
  userID?: string | number;
  content?: string;
  body?: string;
  replyNum?: number;
  totalReplyNum?: number;
  viewNum?: number;
  totalViewNum?: number;
  usefulNum?: number;
  postDate?: number;
  actionDate?: string | number;
  [key: string]: unknown;
}

interface RawStockPostDto {
  size?: number;
  record?: RawStockPost[];
  actionDate?: number;
}

export function normalizeStockCode(input: string): string | undefined {
  const value = input.trim().toLowerCase();
  if (/^(sh|sz|bj)\d{6}$/.test(value)) return value;
  if (/^\d{6}$/.test(value)) {
    if (value.startsWith("6")) return `sh${value}`;
    if (value.startsWith("0") || value.startsWith("3")) return `sz${value}`;
    if (value.startsWith("4") || value.startsWith("8")) return `bj${value}`;
    return undefined;
  }
  return undefined;
}

export async function resolveStock(input: string): Promise<{ fullCode: string; name: string }> {
  const code = normalizeStockCode(input);
  if (code) {
    const quote = await getQuote(code);
    return { fullCode: code, name: quote.name };
  }
  const result = await searchStocks(input, 1);
  if (result.items.length === 0) throw new Error(`没有找到股票: ${input}`);
  return { fullCode: result.items[0].fullCode, name: result.items[0].name };
}

export async function getQuote(fullCode: string): Promise<StockQuote> {
  const response = await http.requestJson<ApiEnvelope<RawQuote>>(`${HQ_URL}/tgb/${fullCode}`, {
    referer: `${BASE_URL}/quotes/${fullCode}`,
  });
  const data = response.dto;
  if (!data) throw new Error(`没有获取到行情: ${fullCode}`);
  return {
    code: data.code || fullCode.slice(2),
    fullCode: data.fullCode || fullCode,
    name: data.name || "",
    price: data.price ?? 0,
    change: data.pxChange ?? 0,
    changeRate: data.pxChangeRate ?? 0,
    open: data.openPrice ?? 0,
    close: data.closePrice ?? 0,
    high: data.highPrice ?? 0,
    low: data.lowPrice ?? 0,
    limitUp: data.zhangting ?? 0,
    limitDown: data.dieting ?? 0,
    volume: data.volumn ?? 0,
    amount: data.volumnPrice ?? 0,
    turnoverRate: data.turnoverRate ?? 0,
    peRatio: data.peRatio,
    totalValue: data.totalValue,
    circulationValue: data.circulationValue,
    time: `${data.lastDate || ""} ${data.lastTime || ""}`.trim(),
    status: data.status || (data.isStop === "Y" ? "停牌" : undefined),
    linkingBoard: data.linkingBoard,
  };
}

function parseStockPost(raw: RawStockPost): StockPost | undefined {
  const newTopicId = raw.newTopicID || "";
  if (!newTopicId) return undefined;
  return {
    newTopicId,
    title: cleanText(raw.subject) || "(无标题)",
    author: cleanText(raw.userName) || "未知",
    authorId: String(raw.userID ?? ""),
    summary: cleanText(raw.content || raw.body),
    replyCount: raw.replyNum ?? raw.totalReplyNum ?? 0,
    viewCount: raw.viewNum ?? raw.totalViewNum ?? 0,
    likeCount: raw.usefulNum ?? 0,
    time: String(raw.postDate || raw.actionDate || ""),
    url: `${BASE_URL}/a/${newTopicId}`,
  };
}

export async function getStockPosts(fullCode: string, count = 20, pageLimit = 1): Promise<StockPost[]> {
  let actionDate = 0;
  const posts: StockPost[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < pageLimit; page++) {
    const params = new URLSearchParams({
      stockCode: fullCode,
      actionDate: String(actionDate),
      perPageNum: String(count),
      isOpen: "false",
    });
    const response = await http.requestJson<ApiEnvelope<RawStockPostDto>>(
      `/quotes/getStockUpToDate?${params.toString()}`,
      { referer: `${BASE_URL}/quotes/${fullCode}` },
    );
    const record = response.dto?.record || [];
    if (record.length === 0) break;
    for (const item of record) {
      const parsed = parseStockPost(item);
      if (parsed && !seen.has(parsed.newTopicId)) {
        seen.add(parsed.newTopicId);
        posts.push(parsed);
      }
    }
    const last = record[record.length - 1];
    const lastDate = last.actionDate;
    const next = typeof lastDate === "number" ? lastDate : Date.parse(String(lastDate ?? ""));
    if (!next || Number.isNaN(next) || next === actionDate) break;
    actionDate = next;
    await http.throttle();
  }
  return posts;
}

export function stockSummaryLines(quote: StockQuote): Array<[string, string | undefined]> {
  const changePercent = `${quote.changeRate > 0 ? "+" : ""}${quote.changeRate.toFixed(2)}%`;
  const change = `${quote.change > 0 ? "+" : ""}${quote.change.toFixed(2)}`;
  return [
    ["名称", `${quote.name} (${quote.fullCode})`],
    ["现价", `${quote.price.toFixed(2)}  ${change}  ${changePercent}`],
    ["今开/昨收", `${quote.open.toFixed(2)} / ${quote.close.toFixed(2)}`],
    ["最高/最低", `${quote.high.toFixed(2)} / ${quote.low.toFixed(2)}`],
    ["涨停/跌停", `${quote.limitUp.toFixed(2)} / ${quote.limitDown.toFixed(2)}`],
    ["成交量/额", `${formatNumber(quote.volume)} / ${formatNumber(quote.amount)}`],
    ["换手率", `${quote.turnoverRate.toFixed(2)}%`],
    ["市盈率", quote.peRatio !== undefined ? quote.peRatio.toFixed(2) : undefined],
    ["总市值/流通", `${quote.totalValue?.toFixed(2) ?? "-"}亿 / ${quote.circulationValue?.toFixed(2) ?? "-"}亿`],
    ["连板", quote.linkingBoard],
    ["状态", quote.status],
    ["更新时间", quote.time],
  ];
}
