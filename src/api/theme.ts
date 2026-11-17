import { load } from "cheerio";
import { BASE_URL } from "../constants.ts";
import { http } from "../http.ts";
import type { ApiEnvelope } from "../types.ts";
import { cleanText } from "../utils/text.ts";

interface RawThemeMsg {
  materialRate?: number;
  popularValue?: number;
  humanDragon?: { fullCode?: string; stockName?: string; label?: string };
  middleTroops?: { fullCode?: string; stockName?: string; label?: string };
  dayDragon?: { fullCode?: string; stockName?: string; label?: string };
}

interface RawTheme {
  materialSeq?: number;
  materialName?: string;
  limitUpStocks?: number;
  upNum?: number;
  downNum?: number;
  sort?: number;
  hotFlag?: string;
  listMsg?: RawThemeMsg[];
}

export interface ThemeItem {
  seq: number;
  name: string;
  rate: number;
  limitUp: number;
  up: number;
  down: number;
  hot: number;
  leader?: string;
  leaderCode?: string;
  leaderLabel?: string;
  dayDragon?: string;
  middleTroops?: string;
  url: string;
}

export interface ThemeStock {
  code: string;
  name: string;
  reason: string;
  price: string;
  change: string;
  marketValue: string;
  turnover: string;
  url: string;
}

export interface ThemeDetail {
  seq: number;
  name: string;
  change: string;
  upDown: string;
  limitUp: string;
  volumeRatio: string;
  updatedAt: string;
  stocks: ThemeStock[];
  url: string;
}

export async function getThemeDetail(seq: number | string): Promise<ThemeDetail> {
  const url = `${BASE_URL}/ticai/detail/${seq}`;
  const html = await http.getText(`/ticai/detail/${seq}`, { referer: `${BASE_URL}/ticai/ranking` });
  const $ = load(html);
  const summary = new Map<string, string>();
  $(".detail-summary dl").each((_, element) => {
    const dl = $(element);
    const label = cleanText(dl.find("dt").text());
    const value = cleanText(dl.find("dd").text());
    if (label) summary.set(label, value);
  });

  const stocks: ThemeStock[] = [];
  $(".stock-row").each((_, element) => {
    const row = $(element);
    if (row.hasClass("stock-head")) return;
    const anchor = row.find("a.ticai-stock-link").first();
    const code = anchor.attr("data-stock-id") || "";
    if (!code) return;
    const spans = row.children("span").toArray().map((node) => cleanText($(node).text()));
    stocks.push({
      code,
      name: cleanText(anchor.attr("data-stock-name") || anchor.find("strong").text()) || "(未知)",
      reason: cleanText(row.find("p").first().text()),
      price: spans[0] || "",
      change: spans[1] || "",
      marketValue: spans[2] || "",
      turnover: spans[3] || "",
      url: `${BASE_URL}/quotes/${code}`,
    });
  });

  return {
    seq: Number(seq),
    name: cleanText($(".detail-summary h1").first().text()) || "(未命名题材)",
    change: summary.get("题材涨跌幅") || "",
    upDown: summary.get("涨/跌家数") || "",
    limitUp: summary.get("涨停数") || "",
    volumeRatio: summary.get("实时量比") || "",
    updatedAt: cleanText($("#stockUpdateTime").first().text()),
    stocks,
    url,
  };
}

export async function getThemes(): Promise<ThemeItem[]> {
  const response = await http.requestJson<ApiEnvelope<{ list?: RawTheme[] }>>(
    `/ticai/getTiCaiList?_=${Date.now()}`,
    { referer: `${BASE_URL}/ticai/ranking` },
  );
  return (response.dto?.list || []).map((item) => {
    const msg = item.listMsg?.[0];
    const leader = msg?.dayDragon || msg?.humanDragon;
    return {
      seq: item.materialSeq || 0,
      name: cleanText(item.materialName) || "(未命名)",
      rate: msg?.materialRate ?? 0,
      limitUp: item.limitUpStocks ?? 0,
      up: item.upNum ?? 0,
      down: item.downNum ?? 0,
      hot: msg?.popularValue ?? 0,
      leader: leader?.stockName ? cleanText(leader.stockName) : undefined,
      leaderCode: leader?.fullCode,
      leaderLabel: leader?.label ? cleanText(leader.label) : undefined,
      dayDragon: msg?.dayDragon?.stockName ? cleanText(msg.dayDragon.stockName) : undefined,
      middleTroops: msg?.middleTroops?.stockName ? cleanText(msg.middleTroops.stockName) : undefined,
      url: `${BASE_URL}/ticai/detail/${item.materialSeq}`,
    };
  });
}
