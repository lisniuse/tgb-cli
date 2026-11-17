import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractPageFromInput, parseTopicPage } from "../src/api/topic.ts";

const html = readFileSync(join(import.meta.dir, "fixtures", "topic.html"), "utf8");

describe("帖子详情解析", () => {
  const topic = parseTopicPage(html, "https://www.tgb.cn/a/2wTest123", 1, "earliest");

  test("解析标题、作者和 ID", () => {
    expect(topic.title).toBe("测试帖子标题");
    expect(topic.author).toBe("测试作者");
    expect(topic.authorId).toBe("123");
    expect(topic.topicId).toBe("8923115");
    expect(topic.newTopicId).toBe("2wTest123");
    expect(topic.url).toBe("https://www.tgb.cn/a/2wTest123");
  });

  test("解析时间、浏览、评论和赞", () => {
    expect(topic.publishedAt).toBe("2026-11-17 15:09");
    expect(topic.viewCount).toBe(12_000);
    expect(topic.replyCount).toBe(7);
    expect(topic.likeCount).toBe(4);
    expect(topic.topicType).toBe("5");
  });

  test("解析正文、换行和图片", () => {
    expect(topic.content).toContain("第一行\n第二行");
    expect(topic.images).toEqual(["https://image.tgb.cn/img/pic.jpg_760w.png"]);
    expect(topic.contentHtml).toContain("pic.jpg");
  });

  test("解析跟帖、楼主标识、楼层和赞数", () => {
    expect(topic.replies).toHaveLength(2);
    const [authorReply, guestReply] = topic.replies;

    expect(authorReply.replyId).toBe("104991040");
    expect(authorReply.author).toBe("测试作者");
    expect(authorReply.authorId).toBe("123");
    expect(authorReply.isAuthor).toBe(true);
    expect(authorReply.floor).toBe("沙发");
    expect(authorReply.likeCount).toBe(2);
    expect(authorReply.content).toBe("楼主回复");

    expect(guestReply.replyId).toBe("104991041");
    expect(guestReply.isAuthor).toBe(false);
    expect(guestReply.floor).toBe("板凳");
    expect(guestReply.likeCount).toBe(0);
  });

  test("解析分页", () => {
    expect(topic.totalPages).toBe(3);
    expect(topic.page).toBe(1);
  });
});

describe("链接页码识别", () => {
  test("从带 -2 的链接和短 ID 中提取页码", () => {
    expect(extractPageFromInput("https://www.tgb.cn/a/2wNbQz95bKT-2?type=Z")).toBe(2);
    expect(extractPageFromInput("2wNbQz95bKT-3")).toBe(3);
    expect(extractPageFromInput("2wNbQz95bKT")).toBeUndefined();
  });
});
