import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import pc from "picocolors";
import { BOARDS, FEED_TABS, type Board, type FeedTab } from "../constants.ts";
import { getFeed, isFeedTab } from "../api/home.ts";
import { getForum, isBoard } from "../api/forum.ts";
import { fetchTopic, fetchTopicPaged } from "../api/topic.ts";
import { http } from "../http.ts";
import type { Topic } from "../types.ts";
import { inlineImages } from "../utils/images.ts";
import { heading, info, ok, warn } from "../utils/output.ts";
import { topicToMarkdown, topicsToHtml } from "../utils/render.ts";

interface DigestEntry {
  newTopicId: string;
  title: string;
  url: string;
}

function timestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function collectEntries(options: {
  source: string;
  tab: string;
  board: string;
  page: number;
  limit: number;
  all: boolean;
}): Promise<{ entries: DigestEntry[]; label: string }> {
  const limit = options.all ? Number.MAX_SAFE_INTEGER : options.limit;

  if (options.source === "forum") {
    const board = options.board;
    if (!isBoard(board)) throw new Error(`未知版块: ${board}，可选：${Object.keys(BOARDS).join(", ")}`);
    const result = await getForum(board as Board, options.page, "reply");
    const seen = new Set<string>();
    const entries: DigestEntry[] = [];
    for (const thread of result.threads) {
      if (seen.has(thread.newTopicId)) continue;
      seen.add(thread.newTopicId);
      entries.push({ newTopicId: thread.newTopicId, title: thread.title, url: thread.url });
      if (entries.length >= limit) break;
    }
    return { entries, label: `${result.boardLabel} 第 ${options.page} 页` };
  }

  const tab = options.tab;
  if (!isFeedTab(tab)) throw new Error(`未知频道: ${tab}，可选：${Object.keys(FEED_TABS).join(", ")}`);
  const result = await getFeed(tab as FeedTab, options.page);
  const seen = new Set<string>();
  const entries: DigestEntry[] = [];
  for (const item of result.items) {
    if (seen.has(item.newTopicId)) continue;
    seen.add(item.newTopicId);
    entries.push({
      newTopicId: item.newTopicId,
      title: item.title,
      url: `https://www.tgb.cn/a/${item.newTopicId}`,
    });
    if (entries.length >= limit) break;
  }
  return { entries, label: `${result.tabLabel} 第 ${options.page} 页` };
}

export function registerDigestCommand(program: Command): void {
  program
    .command("digest")
    .description("批量抓取首页/论坛帖子，生成日报（无需登录，除非帖子受限）")
    .option("-s, --source <source>", "来源：home|forum", "home")
    .option("-t, --tab <tab>", `首页频道：${Object.keys(FEED_TABS).join("|")}`, "recommend")
    .option("-b, --board <board>", `论坛版块：${Object.keys(BOARDS).join("|")}`, "bbs")
    .option("-p, --page <n>", "列表页码", "1")
    .option("-n, --limit <n>", "抓取帖子数（--all 时忽略）", "10")
    .option("--all", "抓取当前列表页的全部帖子（忽略 --limit）")
    .option("-o, --out <dir>", "输出目录", "tgb-digest")
    .option("-f, --format <format>", "输出格式：md|html|json|all（html 为单文件合并 HTML）", "all")
    .option("--all-replies", "抓取每帖全部跟帖")
    .option("--max-pages <n>", "每帖最大跟帖页数", "20")
    .option("--author-only", "只保留楼主跟帖")
    .option("--inline-images", "HTML 内嵌图片（base64）")
    .addHelpText(
      "after",
      "\n示例:\n" +
        "  $ tgb digest -s forum -b jinghua --all -f html -o ./jinghua-html\n" +
        "      把精华第一页的全部帖子合并成一个 HTML\n" +
        "  $ tgb digest -s forum -b bbs --all -f all -o ./daily\n" +
        "      论坛第一页全部帖子，同时生成 md/html/json\n" +
        "  $ tgb digest --source home --tab research -n 10 -f html -o ./out\n" +
        "      首页研股前 10 篇合并成一个 HTML\n",
    )
    .action(async (options) => {
      const source = String(options.source).toLowerCase();
      if (source !== "home" && source !== "forum") throw new Error("--source 只支持 home 或 forum");
      const format = String(options.format).toLowerCase();
      if (!["md", "html", "json", "all"].includes(format)) throw new Error("--format 只支持 md、html、json 或 all");

      const page = Number.parseInt(options.page, 10) || 1;
      const limit = Number.parseInt(options.limit, 10) || 10;
      const maxPages = Number.parseInt(options.maxPages, 10) || 20;
      const { entries, label } = await collectEntries({
        source,
        tab: String(options.tab),
        board: String(options.board),
        page,
        limit,
        all: Boolean(options.all),
      });

      heading(`日报抓取 · ${label} · 计划 ${entries.length} 篇`);
      const topics: Topic[] = [];
      const failures: Array<{ newTopicId: string; title: string; error: string }> = [];

      for (const [index, entry] of entries.entries()) {
        if (index > 0) await http.throttle();
        info(pc.dim(`[${index + 1}/${entries.length}] ${entry.title}`));
        try {
          const topic = options.allReplies
            ? await fetchTopicPaged(entry.newTopicId, { maxPages })
            : await fetchTopic(entry.newTopicId);
          if (options.authorOnly) {
            const authorReplies = topic.replies.filter((reply) => reply.isAuthor);
            topic.replies = authorReplies;
            topic.replyCount = authorReplies.length;
            topic.notice = "仅保留楼主跟帖";
          }
          topics.push(topic);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push({ newTopicId: entry.newTopicId, title: entry.title, error: message });
          warn(`跳过：${entry.title} - ${message}`);
        }
      }

      if (topics.length === 0) throw new Error("没有成功抓取到任何帖子");

      const outDir = resolve(String(options.out));
      mkdirSync(outDir, { recursive: true });
      const stamp = timestamp();
      const generatedAt = new Date().toISOString();
      const meta = `来源：${label} · 成功 ${topics.length}/${entries.length} 篇 · 生成时间：${new Date().toLocaleString("zh-CN")}`;
      const files: string[] = [];

      if (format === "md" || format === "all") {
        const markdown = [
          `# 淘股吧日报 ${stamp.slice(0, 8)}`,
          "",
          meta,
          "",
          ...topics.map((topic) => topicToMarkdown(topic, { includeImages: true })),
        ].join("\n\n---\n\n");
        const file = join(outDir, `digest_${stamp}.md`);
        writeFileSync(file, markdown, "utf8");
        files.push(file);
      }

      if (format === "html" || format === "all") {
        let html = topicsToHtml(topics, `淘股吧日报 ${stamp.slice(0, 8)}`, meta);
        if (options.inlineImages) {
          const images = topics.flatMap((topic) => [...topic.images, ...topic.replies.flatMap((reply) => reply.images)]);
          html = await inlineImages(html, images);
        }
        const file = join(outDir, `digest_${stamp}.html`);
        writeFileSync(file, html, "utf8");
        files.push(file);
      }

      if (format === "json" || format === "all") {
        const payload = {
          generatedAt,
          source,
          label,
          requested: entries.length,
          succeeded: topics.length,
          topics,
          failures,
        };
        const file = join(outDir, `digest_${stamp}.json`);
        writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
        files.push(file);
      }

      for (const file of files) ok(`已生成：${file}`);
      if (failures.length > 0) warn(`${failures.length} 篇抓取失败`);
    });
}
