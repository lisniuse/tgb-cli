import { load } from "cheerio";
import { BASE_URL } from "../constants.ts";
import { http } from "../http.ts";
import type { ApiEnvelope, FriendUser, UserProfile, UserTopic } from "../types.ts";
import { cleanText, imageUrl, isNumericId } from "../utils/text.ts";
import { searchUsers } from "./search.ts";

interface RawBlogerInfo {
  userID?: number | string;
  userName?: string;
  pr?: string;
  pe?: string;
  friendNum?: number;
  fansNum?: number;
  province?: string | null;
  ipAddress?: string;
  cr?: number;
  vipAuth?: number;
  isFollow?: number;
}

export async function resolveUserId(input: string): Promise<{ userId: string; userName?: string }> {
  const fromUrl = input.match(/\/blog\/(\d+)/)?.[1];
  const value = fromUrl || input.trim();
  if (isNumericId(value)) return { userId: value };
  const result = await searchUsers(value, 1);
  if (result.items.length === 0) throw new Error(`没有找到用户: ${input}`);
  return { userId: result.items[0].userId, userName: result.items[0].userName };
}

export async function getUserProfile(input: string): Promise<UserProfile> {
  const { userId } = await resolveUserId(input);
  const response = await http.requestJson<ApiEnvelope<RawBlogerInfo>>(`/user/getBlogerInfo?userID=${userId}`, {
    referer: `${BASE_URL}/blog/${userId}`,
  });
  const data = response.dto;
  if (!data) throw new Error(`没有找到用户: ${input}`);
  return {
    userId: String(data.userID ?? userId),
    userName: data.userName || "未知",
    portrait: imageUrl(data.pr),
    signature: data.pe ? cleanText(data.pe) : undefined,
    region: data.ipAddress || data.province || undefined,
    fansCount: data.fansNum || 0,
    followingCount: data.friendNum || 0,
    registeredAt: data.cr ? new Date(data.cr).toISOString() : undefined,
    url: `${BASE_URL}/blog/${userId}`,
    vip: Boolean(data.vipAuth),
  };
}

export function parseUserTopicList(html: string): UserTopic[] {
  const $ = load(html);
  const topics: UserTopic[] = [];
  const seen = new Set<string>();

  $(".article_tittle, .article-item, .topic_Item, li").each((_, element) => {
    const block = $(element);
    const anchor = block.find('a[href^="/a/"]').first();
    const href = anchor.attr("href") || "";
    const newTopicId = href.match(/\/a\/([A-Za-z0-9]+)/)?.[1];
    if (!newTopicId || seen.has(newTopicId)) return;
    const title = cleanText(anchor.attr("title") || anchor.text());
    if (!title) return;
    seen.add(newTopicId);
    const countText = cleanText(block.find(".tittle_llhf").text());
    const [viewText, replyText] = countText.split("/").map((part) => part.trim());
    topics.push({
      newTopicId,
      title,
      viewCount: Number.parseInt(viewText || "0", 10) || 0,
      replyCount: Number.parseInt(replyText || "0", 10) || 0,
      postedAt: cleanText(block.find(".tittle_fbshijian").text()) || cleanText(block.find(".Item_time").text()),
      url: `${BASE_URL}/a/${newTopicId}`,
    });
  });

  return topics;
}

export async function getUserPosts(input: string, page = 1): Promise<UserTopic[]> {
  const { userId } = await resolveUserId(input);
  if (page <= 1) {
    const html = await http.getText(`${BASE_URL}/blog/${userId}`, { referer: `${BASE_URL}/blog/${userId}` });
    return parseUserTopicList(html).slice(0, 30);
  }
  const html = await http.getText(`${BASE_URL}/user/blog/moreTopic?userID=${userId}&pageNo=${page}`, {
    referer: `${BASE_URL}/blog/${userId}`,
  });
  return parseUserTopicList(html);
}

export async function getUserReplies(input: string, page = 1): Promise<UserTopic[]> {
  const { userId } = await resolveUserId(input);
  const html = await http.getText(`${BASE_URL}/user/blog/moreReplyMod?userID=${userId}&pageNo=${page}`, {
    referer: `${BASE_URL}/blog/${userId}`,
  });
  const $ = load(html);
  const topics: UserTopic[] = [];
  const seen = new Set<string>();
  $('a[href^="/a/"]').each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr("href") || "";
    const newTopicId = href.match(/\/a\/([A-Za-z0-9]+)/)?.[1];
    if (!newTopicId || seen.has(newTopicId)) return;
    const title = cleanText(anchor.attr("title") || anchor.text());
    if (!title) return;
    seen.add(newTopicId);
    topics.push({
      newTopicId,
      title,
      viewCount: 0,
      replyCount: 0,
      postedAt: "",
      url: `${BASE_URL}/a/${newTopicId}`,
    });
  });
  return topics;
}

interface RawFriendRoot {
  root?: { list?: Array<{ userName?: string; userID?: number | string; url?: string; usefulnum?: number; bestbbsnums?: number }> };
}

export async function getFollowingUsers(): Promise<FriendUser[]> {
  const response = await http.requestJson<ApiEnvelope<RawFriendRoot>>("/user/getMoreFriend", {
    referer: `${BASE_URL}/user/getMoreListAction`,
  });
  return (response.dto?.root?.list || []).map((item) => ({
    userId: String(item.userID ?? ""),
    userName: item.userName || "未知",
    portrait: imageUrl(item.url),
    likeCount: item.usefulnum,
    bestCount: item.bestbbsnums,
  }));
}

export interface FollowFeedItem {
  author: string;
  authorId: string;
  action: string;
  title: string;
  summary: string;
  newTopicId?: string;
  time: string;
  url?: string;
}

export async function getFollowFeed(page = 1): Promise<FollowFeedItem[]> {
  const params = new URLSearchParams({ perPageNum: "20", actionID: String((page - 1) * 20), type: "A" });
  const response = await http.requestJson<
    ApiEnvelope<{ record?: Array<Record<string, unknown>> }>
  >(`/super/spefocus/friendActions?${params.toString()}`, {
    referer: `${BASE_URL}/user/getMoreListAction`,
  });
  const actionLabels: Record<string, string> = { R: "回帖", T: "发帖", DZ: "点赞", Z: "转发", F: "关注" };
  return (response.dto?.record || []).map((item) => {
    const newTopicId = item.newTopicID ? String(item.newTopicID) : undefined;
    const rawAction = String(item.actionName || item.actionType || "");
    return {
      author: cleanText(String(item.userName || "未知")),
      authorId: String(item.userID || ""),
      action: actionLabels[rawAction] || cleanText(rawAction) || "动态",
      title: cleanText(String(item.objectName || item.topicSubject || "")),
      summary: cleanText(String(item.body || "")),
      newTopicId,
      time: String(item.postDate || item.actionDate || ""),
      url: newTopicId ? `${BASE_URL}/a/${newTopicId}` : undefined,
    };
  });
}

export async function getFavorites(page = 1): Promise<UserTopic[]> {
  const url = page <= 1
    ? `${BASE_URL}/collect/getFavoriteTopics`
    : `${BASE_URL}/collect/getFavoriteTopics?pageNo=${page}`;
  const html = await http.getText(url, { referer: `${BASE_URL}/collect/getFavoriteTopics` });
  const $ = load(html);
  const topics: UserTopic[] = [];
  const seen = new Set<string>();

  $('form[name="main"] tr, tr.font4, tr.font6').each((_, element) => {
    const row = $(element);
    const anchor = row.find('a[href^="/a/"]').first();
    const href = anchor.attr("href") || "";
    const newTopicId = href.match(/\/a\/([A-Za-z0-9]+)/)?.[1];
    if (!newTopicId || seen.has(newTopicId)) return;
    const title = cleanText(anchor.attr("title") || anchor.text());
    if (!title) return;
    seen.add(newTopicId);

    const authorAnchor = row.find('a[href^="/blog/"]').first();
    const cells = row.find("td");
    const latestAt = cleanText(cells.eq(2).text());
    const postedAt = cleanText(cells.eq(3).text());
    const viewText = cleanText(row.find('a[href^="/a/"]').first().parent().find("span").last().text());
    const viewCount = Number.parseInt(viewText.replace(/\D/g, ""), 10) || 0;

    topics.push({
      newTopicId,
      title,
      author: cleanText(authorAnchor.text()) || undefined,
      viewCount,
      replyCount: 0,
      postedAt: postedAt || latestAt,
      latestAt: latestAt || undefined,
      url: `${BASE_URL}/a/${newTopicId}`,
    });
  });

  if (topics.length > 0) return topics;
  return parseUserTopicList(html);
}
