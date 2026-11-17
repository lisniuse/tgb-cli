import { load, type CheerioAPI } from "cheerio";
import { BASE_URL, REPLY_SORTS, type ReplySort } from "../constants.ts";
import { hasCookie } from "../config.ts";
import { http, LoginRequiredError } from "../http.ts";
import type { Reply, Topic } from "../types.ts";
import {
  absoluteUrl,
  cleanText,
  extractImages,
  extractNewTopicId,
  extractTopicIdFromPage,
  formatTime,
  htmlToText,
  isNumericId,
  parseCount,
} from "../utils/text.ts";

export interface FetchTopicOptions {
  page?: number;
  sort?: ReplySort;
  authorOnly?: boolean;
}

function parseReplies($: CheerioAPI, authorId: string): Reply[] {
  const replies: Reply[] = [];

  $(".comment-data").each((_, element) => {
    const block = $(element);
    const textNode = block.find(".comment-data-text").first();
    if (textNode.length === 0) return;

    const replyId =
      textNode.attr("id")?.match(/reply(\d+)/)?.[1] ||
      block.find('a[onclick*="AddUseful"]').attr("data-reply-id") ||
      "";
    const userAnchor = block.find("a.user-name").first();
    const author = cleanText(userAnchor.text()) || "匿名";
    const uid = userAnchor.attr("data-user-id") || block.attr("class")?.match(/user_(\d+)/)?.[1] || "";
    const isAuthor = block.find("span").toArray().some((node) => cleanText($(node).text()) === "楼主");
    const time = cleanText(block.find(".pcyclspan").first().text());
    const floor = cleanText(block.find(".comment-data-button > span.left").first().text());
    const likeAnchor = block.find('a[onclick*="AddUseful"]').first();
    const likeCount = Number.parseInt(likeAnchor.attr("data-useful-num") || "0", 10) || 0;
    const contentHtml = textNode.html() || "";
    const content = htmlToText(contentHtml);

    replies.push({
      replyId,
      author,
      authorId: uid,
      isAuthor: isAuthor || (Boolean(authorId) && uid === authorId),
      time,
      floor: floor.replace(/\s*·\s*淘股吧\s*$/, "").trim(),
      likeCount,
      content,
      contentHtml,
      images: extractImages($, `.comment-data-text#${textNode.attr("id") || "__none__"}`),
    });
  });

  return replies;
}

function parseTotalPages($: CheerioAPI): number {
  const text = $.root().text();
  const match = text.match(/共\s*(\d+)\s*\/\s*(\d+)\s*页/);
  if (match) return Number.parseInt(match[2], 10) || 1;
  return 1;
}

export function parseTopicPage(html: string, url: string, page = 1, sort: ReplySort = "earliest"): Topic {
  const $ = load(html);
  const title = cleanText($("#stockTitle").first().text()) || cleanText($("title").text()).split("_")[0] || "(无标题)";

  const authorAnchor = $(".article-data .data-userid a[data-user-id]").first();
  const author = cleanText(authorAnchor.text()) || "未知";
  const authorId = authorAnchor.attr("data-user-id") || "";
  const authorAvatar = absoluteUrl(authorAnchor.find("img").attr("src") || authorAnchor.find("img").attr("data-original"));

  const articleDataText = cleanText($(".article-data").text());
  const publishedAt = articleDataText.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/)?.[1] || "";
  const viewCount = parseCount(articleDataText.match(/浏览\s*([\d.]+万?)/)?.[1]);
  const metaReplyCount = parseCount(articleDataText.match(/评论\s*([\d.]+万?)/)?.[1]);

  const topicId = extractTopicIdFromPage($) || "";
  const usefulAnchor = topicId
    ? $(`a[data-topic-id="${topicId}"][onclick*="AddUseful"]`).first()
    : $('a[onclick*="AddUseful"][data-topic-id]').first();
  const likeCount =
    Number.parseInt(usefulAnchor.attr("data-useful-num") || "0", 10) ||
    Number.parseInt(cleanText(topicId ? $(`.zan_${topicId}`).first().text() : ""), 10) ||
    0;
  const topicType =
    $('a[onclick*="addMyCol"]').first().attr("data-topic-type") ||
    $("#gioMsg").attr("type") ||
    undefined;

  const contentNode = $("#first").first().length > 0 ? $("#first").first() : $(".article-text").first();
  const contentHtml = contentNode.html() || "";
  const content = htmlToText(contentHtml);
  const images = extractImages($, "#first");

  const replies = parseReplies($, authorId);
  const newTopicId = url.match(/\/a\/([A-Za-z0-9]+)/)?.[1] || "";

  return {
    topicId,
    newTopicId,
    url: `${BASE_URL}/a/${newTopicId}`,
    title,
    author,
    authorId,
    authorAvatar,
    publishedAt,
    viewCount,
    replyCount: metaReplyCount || replies.length,
    likeCount,
    topicType,
    content,
    contentHtml,
    images,
    replies,
    page,
    totalPages: parseTotalPages($),
    sort,
  };
}

function extractPageFromInput(input: string): number | undefined {
  const match = input.match(/\/a\/[A-Za-z0-9]+-(\d+)/) || input.match(/^[A-Za-z0-9]+-(\d+)(?:[?#].*)?$/);
  if (!match) return undefined;
  const page = Number.parseInt(match[1], 10);
  return Number.isFinite(page) && page > 0 ? page : undefined;
}

function buildTopicUrl(newTopicId: string, page: number, sort: ReplySort): string {
  const type = REPLY_SORTS[sort];
  if (page <= 1) return `${BASE_URL}/a/${newTopicId}?type=${type}`;
  return `${BASE_URL}/a/${newTopicId}-${page}?type=${type}`;
}

export async function fetchTopic(input: string, options: FetchTopicOptions = {}): Promise<Topic> {
  const newTopicId = extractNewTopicId(input);
  if (!newTopicId) throw new Error("无法识别帖子 ID");
  if (isNumericId(newTopicId)) {
    throw new Error(
      "帖子 ID 需要新版帖子编号（/a/ 后面的字母数字串）或完整帖子链接。\n" +
        "可以在 tgb home、tgb forum、tgb search 的结果中获得。",
    );
  }

  const page = options.page && options.page > 0 ? options.page : extractPageFromInput(input) || 1;
  const sort = options.sort || "earliest";

  if (options.authorOnly) {
    const first = await fetchTopic(input, { page: 1, sort: "earliest" });
    if (!first.topicId || !first.authorId) throw new Error("无法获取楼主信息，暂时不能只看楼主");

    const filterAuthor = (topic: Topic): Topic => {
      topic.replies = topic.replies.filter((reply) => reply.authorId === first.authorId || reply.isAuthor);
      return topic;
    };

    if (!hasCookie()) {
      const topic = page <= 1 ? first : await fetchTopic(input, { page, sort });
      filterAuthor(topic);
      topic.notice = `未登录，已按当前第 ${topic.page} 页过滤楼主跟帖；登录后可翻页查看全部楼主跟帖`;
      return topic;
    }

    try {
      const url = `${BASE_URL}/topic/lookUserTopic?topicID=${first.topicId}&lookUserID=${first.authorId}&pageNo=${page}`;
      const html = await http.getText(url, { referer: first.url });
      const topic = parseTopicPage(html, first.url, page, sort);
      topic.topicId = first.topicId;
      topic.authorId = first.authorId;
      topic.author = first.author;
      topic.title = first.title;
      topic.content = first.content;
      topic.contentHtml = first.contentHtml;
      topic.images = first.images;
      topic.publishedAt = first.publishedAt;
      topic.viewCount = first.viewCount;
      topic.replyCount = first.replyCount;
      topic.likeCount = first.likeCount;
      filterAuthor(topic);
      topic.url = first.url;
      if (page > 1) topic.totalPages = Math.max(topic.totalPages, page);
      return topic;
    } catch (error) {
      if (!(error instanceof LoginRequiredError)) throw error;
      const topic = page <= 1 ? first : await fetchTopic(input, { page, sort });
      filterAuthor(topic);
      topic.notice = "只看楼主接口需要登录，当前按本页跟帖过滤";
      return topic;
    }
  }

  const url = buildTopicUrl(newTopicId, page, sort);
  const html = await http.getText(url, { referer: `${BASE_URL}/a/${newTopicId}` });
  return parseTopicPage(html, url, page, sort);
}

/** 抓取所有页的跟帖（带页数上限，避免一次拉太多） */
export async function fetchTopicPaged(
  input: string,
  options: FetchTopicOptions & { maxPages?: number } = {},
): Promise<Topic> {
  const first = await fetchTopic(input, { ...options, page: 1 });
  const maxPages = Math.min(options.maxPages || first.totalPages || 1, 50);
  if (maxPages <= 1) return first;

  for (let page = 2; page <= maxPages; page++) {
    await http.throttle();
    const next = await fetchTopic(input, { ...options, page });
    first.replies.push(...next.replies);
  }
  first.replyCount = Math.max(first.replyCount, first.replies.length);
  return first;
}

/** 获取帖子基础信息（发帖/回帖等写操作需要） */
export async function resolveTopic(input: string): Promise<{
  topicId: string;
  newTopicId: string;
  title: string;
  url: string;
}> {
  const newTopicId = extractNewTopicId(input);
  if (!newTopicId || isNumericId(newTopicId)) {
    throw new Error("请提供新版帖子编号或帖子链接（例如 https://www.tgb.cn/a/2wNtunuTqDJ）");
  }
  const html = await http.getText(`${BASE_URL}/a/${newTopicId}`, { referer: `${BASE_URL}/a/${newTopicId}` });
  const $ = load(html);
  const topicId = extractTopicIdFromPage($) || "";
  const title = cleanText($("#stockTitle").first().text()) || cleanText($("title").text()).split("_")[0] || "";
  if (!topicId) throw new Error("无法解析帖子 ID，帖子可能已删除或需要登录");
  return { topicId, newTopicId, title, url: `${BASE_URL}/a/${newTopicId}` };
}

export function formatTopicTime(value: string): string {
  return formatTime(value);
}
