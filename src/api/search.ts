import { BASE_URL } from "../constants.ts";
import { http } from "../http.ts";
import type {
  ApiEnvelope,
  SearchResult,
  SearchStockResult,
  SearchTopicResult,
  SearchUserResult,
} from "../types.ts";
import { cleanText, imageUrl } from "../utils/text.ts";

interface RawTopic {
  topicID?: string | number;
  newTopicID?: string;
  subject?: string;
  subInfo?: string;
  body?: string;
  userName?: string;
  userID?: string | number;
  totalReplyNum?: number;
  totalViewNum?: number;
  usefulNum?: number;
  postDate?: number;
}

interface RawTopicDto {
  perPageNum?: number;
  totalNum?: number;
  totalPageNum?: number;
  pageNo?: number;
  topicAttr?: RawTopic[];
}

interface RawUser {
  userID?: string | number;
  userName?: string;
  portrait?: string;
  fansNum?: number;
  totalFansNum?: number;
  totalTopic?: number;
  totalThemeNum?: number;
  description?: string;
  persIntr?: string;
}

interface RawUserDto {
  totalNum?: number;
  totalPageNum?: number;
  pageNo?: number;
  list?: RawUser[];
}

interface RawStock {
  stockName?: string;
  fullCode?: string;
  code?: string;
  market?: string;
  stockType?: string;
}

interface RawStockDto {
  stockRegexAttr?: RawStock[];
}

export interface SearchTopicsOptions {
  page?: number;
  sort?: "latest" | "hot";
  /** 6=半年内，年份如 2025，空=全部 */
  date?: string;
}

export async function searchTopics(keyword: string, options: SearchTopicsOptions = {}): Promise<SearchResult<SearchTopicResult>> {
  const page = options.page || 1;
  const type = options.sort === "hot" ? 2 : 3;
  const date = options.date ?? "6";
  const params = new URLSearchParams({
    pageNo: String(page),
    searchDate: date,
    subject: keyword,
    type: String(type),
  });
  const response = await http.requestJson<ApiEnvelope<RawTopicDto>>(
    `/search/getSearchTopicResult?${params.toString()}`,
    { referer: `${BASE_URL}/search/search?searchContent=${encodeURIComponent(keyword)}&type=0` },
  );

  const items = (response.dto?.topicAttr || [])
    .map((item): SearchTopicResult | undefined => {
      const newTopicId = item.newTopicID || "";
      if (!newTopicId) return undefined;
      return {
        topicId: String(item.topicID ?? ""),
        newTopicId,
        title: cleanText(item.subject) || "(无标题)",
        author: cleanText(item.userName) || "未知",
        authorId: String(item.userID ?? ""),
        summary: cleanText(item.subInfo || item.body),
        replyCount: item.totalReplyNum || 0,
        viewCount: item.totalViewNum || 0,
        likeCount: item.usefulNum || 0,
        time: String(item.postDate ?? ""),
        url: `${BASE_URL}/a/${newTopicId}`,
      };
    })
    .filter((item): item is SearchTopicResult => Boolean(item));

  return {
    keyword,
    type: "topic",
    page,
    total: response.dto?.totalNum || 0,
    totalPages: response.dto?.totalPageNum || 1,
    items,
  };
}

export async function searchUsers(keyword: string, page = 1): Promise<SearchResult<SearchUserResult>> {
  const params = new URLSearchParams({ searchUser: keyword, pageNo: String(page) });
  const response = await http.requestJson<ApiEnvelope<RawUserDto>>(
    `/search/getSearchUserResult?${params.toString()}`,
    { referer: `${BASE_URL}/search/search?searchContent=${encodeURIComponent(keyword)}&type=1` },
  );

  const items = (response.dto?.list || []).map(
    (item): SearchUserResult => ({
      userId: String(item.userID ?? ""),
      userName: cleanText(item.userName) || "未知",
      portrait: imageUrl(item.portrait),
      fansCount: item.fansNum ?? item.totalFansNum ?? 0,
      topicCount: item.totalThemeNum ?? item.totalTopic ?? 0,
      signature: item.description || item.persIntr || undefined,
      url: `${BASE_URL}/blog/${item.userID}`,
    }),
  );

  return {
    keyword,
    type: "user",
    page,
    total: response.dto?.totalNum || 0,
    totalPages: response.dto?.totalPageNum || 1,
    items,
  };
}

export async function searchStocks(keyword: string, page = 1): Promise<SearchResult<SearchStockResult>> {
  const params = new URLSearchParams({ searchStock: keyword, pageNo: String(page) });
  const response = await http.requestJson<ApiEnvelope<RawStockDto>>(
    `/search/getSearchStockResult?${params.toString()}`,
    { referer: `${BASE_URL}/search/search?searchContent=${encodeURIComponent(keyword)}&type=2` },
  );

  const items = (response.dto?.stockRegexAttr || [])
    .filter((item) => item.fullCode)
    .map(
      (item): SearchStockResult => ({
        code: item.code || item.fullCode?.slice(2) || "",
        fullCode: item.fullCode || "",
        name: cleanText(item.stockName) || "",
        url: `${BASE_URL}/quotes/${item.fullCode}`,
      }),
    );

  return { keyword, type: "stock", page, total: items.length, totalPages: 1, items };
}

export async function getHotStocks(): Promise<Array<{ name: string; code: string; hot: number }>> {
  const response = await http.requestJson<ApiEnvelope<Array<{ keyName?: string; tradeCode?: string; dayHot?: number; weekHot?: number }>>>(
    "/search/getHotBarRank",
    { referer: `${BASE_URL}/search/search` },
  );
  return (response.dto || [])
    .filter((item) => item.keyName && item.tradeCode)
    .map((item) => ({
      name: item.keyName || "",
      code: item.tradeCode || "",
      hot: item.dayHot ?? item.weekHot ?? 0,
    }));
}

export async function getHotUsers(): Promise<Array<{ name: string; userId: string; hot: number; fans: number }>> {
  const response = await http.requestJson<
    ApiEnvelope<Array<{ keyName?: string; keywordID?: number; dayHot?: number; fansnum?: number; weekHot?: number }>>
  >("/search/getHotUserRank", { referer: `${BASE_URL}/search/search` });
  return (response.dto || [])
    .filter((item) => item.keyName)
    .map((item) => ({
      name: item.keyName || "",
      userId: String(item.keywordID ?? ""),
      hot: item.dayHot ?? item.weekHot ?? 0,
      fans: item.fansnum ?? 0,
    }));
}
