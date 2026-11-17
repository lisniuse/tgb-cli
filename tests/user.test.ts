import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseUserTopicList } from "../src/api/user.ts";

describe("用户博客帖子解析", () => {
  const html = readFileSync(join(import.meta.dir, "fixtures", "user.html"), "utf8");
  const topics = parseUserTopicList(html);

  test("解析标题、浏览、回复和日期", () => {
    expect(topics).toHaveLength(2);
    expect(topics[0]).toEqual({
      newTopicId: "2wUserA",
      title: "用户帖子A",
      viewCount: 339,
      replyCount: 2,
      postedAt: "2026-11-16",
      url: "https://www.tgb.cn/a/2wUserA",
    });
    expect(topics[1].newTopicId).toBe("2wUserB");
    expect(topics[1].viewCount).toBe(518);
  });
});
