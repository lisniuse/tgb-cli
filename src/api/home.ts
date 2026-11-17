import { FEED_TABS, type FeedTab } from "../constants.ts";
import { http } from "../http.ts";
import type { ApiEnvelope, FeedItem, FeedResult } from "../types.ts";
import { cleanText, imageUrl } from "../utils/text.ts";

interface RawFeedItem {
  topicID?: string | number;
  newTopicID?: string;
  replyID?: string | number;
  subject?: string;
  subinfo?: string;
  content?: string;
  userName?: string;
  userID?: string | number;
  postDate?: number;
  dateTime?: number;
  replyNum?: number;
  totalReplyNum?: number;
  viewNum?: number;
  totalViewNum?: number;
  usefulnum?: number;
  usefulNum?: number;
  imgurl?: string[];
  images?: string;
  stockName?: string;
  stockCode?: string;
  tops?: RawFeedItem;
  newReplyID?: string;
}

interface RawFeedDto {
  list?: RawFeedItem[];
  totalPageNum?: number;
  pageNo?: number;
}

const ENDPOINTS: Record<FeedTab, { path: string; params?: Record<string, string | number> }> = {
  recommend: { path: "/newIndex/getZh", params: { pageNo: "page" } },
  research: { path: "/newIndex/getStockResearch", params: { pageNo: "page", type: 1, sxType: 1 } },
  replies: { path: "/newIndex/getReplySP", params: { pageNo: "page", type: "ALL" } },
  featured: { path: "/newIndex/getFriendsFeatured", params: { pageNo: "page", topID: 0 } },
  today: { path: "/newIndex/getNowRecommend", params: { pageNo: "page" } },
  yuanzi: { path: "/newIndex/getTxyz" },
};

function parseImages(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as string[];
    return parsed.map((item) => imageUrl(item)).filter((item): item is string => Boolean(item));
  } catch {
    return [];
  }
}

function parseItem(raw: RawFeedItem, tab: FeedTab): FeedItem | undefined {
  const topicId = String(raw.topicID ?? "");
  const newTopicId = raw.newTopicID || "";
  if (!topicId || !newTopicId) return undefined;

  const images = [
    ...(raw.imgurl || []).map((item) => imageUrl(item)).filter((item): item is string => Boolean(item)),
    ...parseImages(raw.images),
  ];

  const isReply = tab === "replies";
  return {
    kind: isReply ? "reply" : "topic",
    topicId,
    newTopicId,
    replyId: raw.replyID ? String(raw.replyID) : raw.newReplyID,
    title: cleanText(raw.subject || raw.tops?.subject) || "(无标题)",
    summary: cleanText(raw.content || raw.subinfo || raw.tops?.subinfo),
    author: cleanText(raw.userName) || "未知",
    authorId: String(raw.userID ?? ""),
    topicAuthor: raw.tops?.userName,
    replyCount: Math.max(raw.replyNum ?? 0, raw.totalReplyNum ?? 0, raw.tops?.replyNum ?? 0),
    viewCount: Math.max(raw.viewNum ?? 0, raw.totalViewNum ?? 0),
    likeCount: Math.max(raw.usefulNum ?? 0, raw.usefulnum ?? 0),
    timeRaw: raw.postDate ?? raw.dateTime ?? 0,
    time: String(raw.postDate ?? raw.dateTime ?? ""),
    images: [...new Set(images)],
    stockName: raw.stockName || undefined,
    stockCode: raw.stockCode || undefined,
  };
}

export async function getFeed(tab: FeedTab, page = 1): Promise<FeedResult> {
  const endpoint = ENDPOINTS[tab];
  if (!endpoint) throw new Error(`未知的首页频道: ${tab}`);
  const params = new URLSearchParams();
  if (endpoint.params) {
    for (const [key, value] of Object.entries(endpoint.params)) {
      params.set(key, value === "page" ? String(page) : String(value));
    }
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const response = await http.requestJson<ApiEnvelope<RawFeedDto>>(`${endpoint.path}${query}`, {
    referer: "https://www.tgb.cn/",
  });
  const items = (response.dto?.list || [])
    .map((item) => parseItem(item, tab))
    .filter((item): item is FeedItem => Boolean(item));

  return {
    tab,
    tabLabel: FEED_TABS[tab],
    page,
    totalPages: response.dto?.totalPageNum,
    items,
  };
}

export function isFeedTab(value: string): value is FeedTab {
  return value in FEED_TABS;
}
