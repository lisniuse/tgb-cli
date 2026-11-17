import { load } from "cheerio";
import { BASE_URL } from "../constants.ts";
import { http } from "../http.ts";
import type { ApiEnvelope } from "../types.ts";
import { cleanText, formatNumber, imageUrl } from "../utils/text.ts";

const BASE = `${BASE_URL}/spmatch`;

export type ContestStatus = "ongoing" | "signup" | "ended";

export const CONTEST_STATUS_LABELS: Record<ContestStatus, string> = {
  ongoing: "进行中",
  signup: "报名中",
  ended: "已结束",
};

const STATUS_API: Record<ContestStatus, string> = {
  ongoing: "2",
  signup: "1",
  ended: "3",
};

const TYPE_LABELS: Record<string, string> = {
  M: "月赛",
  Q: "季赛",
  H: "半年赛",
  Y: "年赛",
};

export interface Contest {
  seq: number;
  name: string;
  title: string;
  host: string;
  hostId: string;
  type: string;
  totalMoney?: string;
  players: number;
  avgRate?: string;
  progress?: string;
  startTime?: string;
  endTime?: string;
  entryEnd?: string;
  needMoney?: string;
  newTopicId: string;
  status: ContestStatus;
  url: string;
}

interface RawContest {
  seq?: number;
  userID?: string | number;
  userName?: string;
  subject?: string;
  simpleName?: string;
  spType?: string;
  allMoney?: number;
  allMoneyStr?: string;
  nowUserNum?: number;
  avgAllRate?: number;
  stormNumStr?: string;
  currentDif?: number;
  daysDif?: number;
  matchTimeStart?: number;
  matchTimeEnd?: number;
  entryTimeEnd?: number;
  needMoney?: number;
  newTopicID?: string;
}

function formatPercent(value: number | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const rate = value / 100;
  return `${rate > 0 ? "+" : ""}${rate.toFixed(2)}%`;
}

function formatDate(ms: number | undefined): string | undefined {
  if (!ms) return undefined;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function parseContest(raw: RawContest, status: ContestStatus): Contest {
  const progress =
    raw.currentDif !== undefined && raw.daysDif !== undefined ? `${raw.currentDif}/${raw.daysDif}天` : undefined;
  return {
    seq: raw.seq || 0,
    name: cleanText(raw.simpleName || raw.subject) || "(未命名)",
    title: cleanText(raw.subject) || "",
    host: cleanText(raw.userName) || "",
    hostId: String(raw.userID ?? ""),
    type: TYPE_LABELS[raw.spType || ""] || raw.spType || "",
    totalMoney: raw.allMoneyStr || (raw.allMoney ? formatNumber(raw.allMoney) : undefined),
    players: raw.nowUserNum || 0,
    avgRate: formatPercent(raw.avgAllRate),
    progress,
    startTime: formatDate(raw.matchTimeStart),
    endTime: formatDate(raw.matchTimeEnd),
    entryEnd: formatDate(raw.entryTimeEnd),
    needMoney: raw.needMoney ? formatNumber(raw.needMoney) : undefined,
    newTopicId: raw.newTopicID || "",
    status,
    url: raw.newTopicID ? `${BASE}/matchAll?tid=${raw.newTopicID}` : "",
  };
}

export async function getContests(status: ContestStatus): Promise<Contest[]> {
  const type = STATUS_API[status];
  const response = await http.requestJson<ApiEnvelope<{ list?: RawContest[] }>>(
    `/spmatch/index/getSpMatchInfoListIndex?type=${type}`,
    { referer: `${BASE}/index/` },
  );
  return (response.dto?.list || []).map((item) => parseContest(item, status));
}

export interface ContestStar {
  userId: string;
  userName: string;
  assets: string;
  rate: string;
  stormValue: string;
  url?: string;
}

export interface ContestDetail {
  tid: string;
  name: string;
  type: string;
  stormValue: string;
  totalMoney: string;
  players: string;
  position: string;
  avgRate: string;
  indexRate: string;
  timeRange: string;
  progress: string;
  stars: ContestStar[];
  url: string;
}

export async function getContestDetail(tid: string): Promise<ContestDetail> {
  const url = `${BASE}/matchAll?tid=${encodeURIComponent(tid)}`;
  const html = await http.getText(`/spmatch/matchAll?tid=${encodeURIComponent(tid)}`, {
    referer: `${BASE}/index/`,
  });
  const $ = load(html);
  const dataText = cleanText($(".sin-match-data").first().text());
  const pick = (label: string): string => {
    const match = dataText.match(new RegExp(`${label}[：:]\\s*([^\\s|]+(?:%|亿|万)?)`));
    return match?.[1]?.trim() || "";
  };

  const stars: ContestStar[] = [];
  $(".sin-match-storm-user-info").each((_, element) => {
    const block = $(element);
    const anchor = block.find("a").first();
    const href = anchor.attr("href") || "";
    const userId = href.match(/lookeUserID=(\d+)/)?.[1] || "";
    const userName = cleanText(block.find(".sin-match-storm-user-name").first().text()) || "未知";
    if (!userId) return;
    const parent = block.parent();
    const zc = cleanText(parent.find(".sin-match-storm-user-zc").first().text());
    const fy = cleanText(parent.find(".sin-match-storm-user-fy").first().text());
    const [assets = "", rate = ""] = zc.split("/").map((part) => part.trim());
    stars.push({
      userId,
      userName,
      assets,
      rate,
      stormValue: fy,
      url: `${BASE}/gains/readInfo?lookeUserID=${userId}`,
    });
  });

  return {
    tid,
    name: cleanText($(".sin-match-title-name").first().text()) || "(未命名比赛)",
    type: cleanText($(".sin-match-title-type").first().text()),
    stormValue: cleanText($(".sin-match-title-storm").first().text()),
    totalMoney: pick("总资产"),
    players: pick("参赛人数"),
    position: pick("平均仓位"),
    avgRate: pick("累计平均收益"),
    indexRate: pick("上证同涨"),
    timeRange: cleanText($(".sin-match-time-info").first().text()).replace(/^比赛时间[：:]?\s*/, ""),
    progress: cleanText($(".sin-match-deadline-word").first().text()),
    stars,
    url,
  };
}

export interface ContestPlayer {
  userId: string;
  userName: string;
  honor: string;
  stormValue: string;
  portrait?: string;
}

interface RawPlayer {
  userID?: string | number;
  userName?: string;
  userTitle?: string;
  totalStormNum?: number;
  stormNumStr?: string;
  strStormNum?: string;
  portrait?: string;
}

export async function getContestPlayers(period: "hot" | "today"): Promise<ContestPlayer[]> {
  const typeNum = period === "today" ? "1" : "7";
  const response = await http.requestJson<ApiEnvelope<Record<string, RawPlayer>>>(
    `/spmatch/index/getSpmatchStormUserList?typeNum=${typeNum}`,
    { referer: `${BASE}/index/` },
  );
  const dto = response.dto || {};
  return Object.values(dto)
    .filter((item) => item && item.userName)
    .map((item) => ({
      userId: String(item.userID ?? ""),
      userName: cleanText(item.userName) || "未知",
      honor: cleanText(item.userTitle),
      stormValue: item.stormNumStr || item.strStormNum || (item.totalStormNum ? formatNumber(item.totalStormNum) : "-"),
      portrait: imageUrl(item.portrait),
    }));
}

export interface ContestHolding {
  subject: string;
  preMoney?: string;
  rate?: string;
  progress?: string;
  status: string;
  newTopicId: string;
  url: string;
}

interface RawHolding {
  subject?: string;
  preMoneyStr?: string;
  preMoney?: number;
  totalRate?: number;
  currentDif?: number;
  daysDif?: number;
  matchFlag?: string;
  newTopicID?: string;
}

export async function getContestHoldings(userId: string): Promise<ContestHolding[]> {
  const response = await http.requestJson<ApiEnvelope<RawHolding[]>>(
    `/spmatch/index/getHoldings?userID=${encodeURIComponent(userId)}`,
    { referer: `${BASE}/index/` },
  );
  return (response.dto || []).map((item) => ({
    subject: cleanText(item.subject) || "(未命名比赛)",
    preMoney: item.preMoneyStr || (item.preMoney ? formatNumber(item.preMoney) : undefined),
    rate: formatPercent(item.totalRate),
    progress:
      item.currentDif !== undefined && item.daysDif !== undefined ? `${item.currentDif}/${item.daysDif}天` : undefined,
    status:
      item.matchFlag === "Y"
        ? "进行中"
        : item.matchFlag === "N"
          ? "报名中"
          : item.matchFlag === "T"
            ? "已退赛"
            : "-",
    newTopicId: item.newTopicID || "",
    url: item.newTopicID ? `${BASE}/matchAll?tid=${item.newTopicID}` : "",
  }));
}
