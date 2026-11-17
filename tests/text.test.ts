import { describe, expect, test } from "bun:test";
import {
  absoluteUrl,
  cleanText,
  decodeEntities,
  extractNewTopicId,
  formatNumber,
  formatRelativeTime,
  htmlToText,
  imageUrl,
  parseCount,
} from "../src/utils/text.ts";

describe("文本工具", () => {
  test("cleanText 解码 HTML 实体并清理空白", () => {
    expect(cleanText("A&nbsp;B &amp; C&#39;D")).toBe("A B & C'D");
    expect(cleanText("第一行\r\n\r\n\r\n第二行")).toBe("第一行\n\n第二行");
  });

  test("decodeEntities 支持命名和数字实体", () => {
    expect(decodeEntities("&ldquo;你好&rdquo;&hellip;")).toBe("“你好”…");
    expect(decodeEntities("&#20320;&#22909;")).toBe("你好");
    expect(decodeEntities("&#x4f60;&#x597d;")).toBe("你好");
  });

  test("htmlToText 保留换行并用占位符替换图片", () => {
    const text = htmlToText("<div>第一行<br>第二行<img src='https://x/a.png'></div>");
    expect(text).toContain("第一行\n第二行");
    expect(text).toContain("[图片]");
  });

  test("extractNewTopicId 支持链接、短 ID 和分页后缀", () => {
    expect(extractNewTopicId("https://www.tgb.cn/a/2wNtunuTqDJ-2?type=Z")).toBe("2wNtunuTqDJ");
    expect(extractNewTopicId("2wNtunuTqDJ")).toBe("2wNtunuTqDJ");
    expect(extractNewTopicId("2wNtunuTqDJ-3")).toBe("2wNtunuTqDJ");
  });

  test("URL 补全", () => {
    expect(absoluteUrl("//image.tgb.cn/a.png")).toBe("https://image.tgb.cn/a.png");
    expect(absoluteUrl("/a/2wTest")).toBe("https://www.tgb.cn/a/2wTest");
    expect(imageUrl("img/2026/a.png")).toBe("https://image.tgb.cn/img/img/2026/a.png");
  });

  test("数字和时间格式化", () => {
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(12_345)).toBe("1.23万");
    expect(formatNumber(123_456_789)).toBe("1.23亿");
    expect(parseCount("浏览 1.2万")).toBe(12_000);
    expect(parseCount("1.5亿")).toBe(150_000_000);
  });

  test("formatRelativeTime 支持毫秒时间戳", () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 30_000)).toBe("刚刚");
    expect(formatRelativeTime(now - 2 * 60_000)).toBe("2 分钟前");
    expect(formatRelativeTime(now - 3 * 60 * 60_000)).toBe("3 小时前");
  });
});
