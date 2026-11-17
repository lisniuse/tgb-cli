import { load } from "cheerio";
import { BASE_URL, BOARDS, type Board } from "../constants.ts";
import { http } from "../http.ts";
import type { ForumResult, ForumThread } from "../types.ts";
import { cleanText } from "../utils/text.ts";

function buildUrl(board: Board, page: number, sort: "reply" | "post"): string {
  if (board === "bbs") return `${BASE_URL}/bbs/${page}/${sort === "post" ? 1 : 0}`;
  if (board === "jinghua") return `${BASE_URL}/jinghua/?pageNo=${page}`;
  return `${BASE_URL}/shenghuoba/F-${page}`;
}

export function parseThreads(html: string): ForumThread[] {
  const $ = load(html);
  const threads: ForumThread[] = [];

  $(".Nbbs-tiezi-lists").each((_, element) => {
    const block = $(element);
    const titleAnchor = block.find("a.overhide.mw300").first();
    const href = titleAnchor.attr("href") || "";
    const newTopicId = href.match(/\/a\/([A-Za-z0-9]+)/)?.[1];
    if (!newTopicId) return;

    const title = cleanText(titleAnchor.attr("title") || titleAnchor.text());
    const authorAnchor = block.find(".middle-list-user a").first();
    const talk = cleanText(block.find(".middle-list-talk").text());
    const [replyText, viewText] = talk.split("/").map((part) => part.trim());
    const lastReplyAt = cleanText(block.find(".middle-list-reply").text());
    const postedAt = cleanText(block.find(".middle-list-post").text());

    threads.push({
      newTopicId,
      title: title.replace(/^\[精\]\s*/, ""),
      author: cleanText(authorAnchor.text()) || "未知",
      authorId: authorAnchor.attr("data-user-id") || "",
      replyCount: Number.parseInt(replyText || "0", 10) || 0,
      viewCount: Number.parseInt(viewText || "0", 10) || 0,
      lastReplyAt,
      postedAt,
      url: `${BASE_URL}/a/${newTopicId}`,
    });
  });

  // 生活吧版式
  if (threads.length === 0) {
    $(".lifeContent-topicList-item").each((_, element) => {
      const block = $(element);
      const anchor = block.find("a.lifeContent-topicList-title").first();
      const href = anchor.attr("href") || "";
      const newTopicId = href.match(/\/a\/([A-Za-z0-9]+)/)?.[1];
      if (!newTopicId) return;
      const authorAnchor = block.find("a.lifeContent-topicList-user").first();
      const nums = block
        .find(".lifeContent-topicList-num")
        .toArray()
        .map((node) => Number.parseInt(cleanText($(node).text()).replace(/\D/g, ""), 10) || 0);
      const latest = cleanText(block.find(".lifeContent-topicList-time.right").text());
      const posted = cleanText(block.find(".lifeContent-topicList-time.left").text());
      threads.push({
        newTopicId,
        title: cleanText(anchor.attr("title") || anchor.text()).replace(/^\[精\]\s*/, ""),
        author: cleanText(authorAnchor.text()) || "未知",
        authorId: authorAnchor.attr("href")?.match(/\/blog\/(\d+)/)?.[1] || "",
        replyCount: nums[1] ?? 0,
        viewCount: nums[0] ?? 0,
        lastReplyAt: latest.replace(/^最新回复\s*/, ""),
        postedAt: posted.replace(/^发布于\s*/, ""),
        url: `${BASE_URL}/a/${newTopicId}`,
      });
    });
  }

  // 其他版式兜底解析带 title 的帖子链接
  if (threads.length === 0) {
    const seen = new Set<string>();
    $('a[href^="/a/"]').each((_, element) => {
      const anchor = $(element);
      const href = anchor.attr("href") || "";
      const newTopicId = href.match(/\/a\/([A-Za-z0-9]+)/)?.[1];
      if (!newTopicId || seen.has(newTopicId)) return;
      const title = cleanText(anchor.attr("title") || anchor.text());
      if (!title || title.length < 2) return;
      seen.add(newTopicId);
      threads.push({
        newTopicId,
        title,
        author: "未知",
        authorId: "",
        replyCount: 0,
        viewCount: 0,
        lastReplyAt: "",
        postedAt: "",
        url: `${BASE_URL}/a/${newTopicId}`,
      });
    });
  }

  return threads;
}

export function parseTotalPages(html: string): number {
  const $ = load(html);
  const text = $.root().text();
  const match = text.match(/共\s*(\d+)\s*\/\s*(\d+)\s*页/);
  if (match) return Number.parseInt(match[2], 10) || 1;
  return 1;
}

export async function getForum(
  board: Board,
  page = 1,
  sort: "reply" | "post" = "reply",
): Promise<ForumResult> {
  const url = buildUrl(board, page, sort);
  const html = await http.getText(url, { referer: `${BASE_URL}/bbs/` });
  const threads = parseThreads(html);
  return {
    board,
    boardLabel: BOARDS[board],
    page,
    totalPages: parseTotalPages(html),
    threads,
  };
}

export function isBoard(value: string): value is Board {
  return value in BOARDS;
}
