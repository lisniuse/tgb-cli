import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseThreads, parseTotalPages } from "../src/api/forum.ts";

function fixture(name: string): string {
  return readFileSync(join(import.meta.dir, "fixtures", name), "utf8");
}

describe("论坛列表解析", () => {
  const html = fixture("forum.html");
  const threads = parseThreads(html);

  test("解析淘股论坛帖子", () => {
    expect(threads).toHaveLength(2);
    expect(threads[0]).toMatchObject({
      newTopicId: "2wThreadA",
      title: "第一篇帖子",
      author: "作者A",
      authorId: "9",
      replyCount: 12,
      viewCount: 3456,
      lastReplyAt: "11-17 21:00",
      postedAt: "11-17 20:00",
      url: "https://www.tgb.cn/a/2wThreadA",
    });
  });

  test("解析总页数", () => {
    expect(parseTotalPages(html)).toBe(99);
  });
});

describe("生活吧列表解析", () => {
  test("解析生活吧帖子作者和浏览/回复", () => {
    const threads = parseThreads(fixture("life.html"));
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      newTopicId: "1LifeA",
      title: "生活吧帖子A",
      author: "龙虎哥",
      authorId: "8946200",
      viewCount: 51,
      replyCount: 0,
      lastReplyAt: "26-11-15 14:53",
      postedAt: "26-11-15 14:53",
    });
  });
});
