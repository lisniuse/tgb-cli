import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import pc from "picocolors";
import { configPath, loadConfig, saveConfig, updateConfig, maskCookie, type TgbConfig } from "../config.ts";
import { http } from "../http.ts";
import { getLoginStatus, loginWithCookie, logout } from "../api/auth.ts";
import { favoriteTopic, followUser, likeTopic, postTopic, replyTopic, unfavoriteTopic } from "../api/actions.ts";
import { fetchTopic, fetchTopicPaged } from "../api/topic.ts";
import { topicToHtml, topicToMarkdown } from "../utils/render.ts";
import { cleanText } from "../utils/text.ts";
import { inlineImages } from "../utils/images.ts";
import { heading, info, kvBlock, ok, printJson, warn } from "../utils/output.ts";

async function readContent(content: string | undefined, file: string | undefined): Promise<string> {
  if (file) {
    const text = await readFile(resolve(file), "utf8");
    return text;
  }
  if (content && content !== "-") return content;
  // 从标准输入读取
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function promptHidden(promptText: string): Promise<string> {
  process.stdout.write(promptText);
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8").trim();
  }

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let value = "";
  return new Promise((resolvePromise, reject) => {
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          reject(new Error("已取消"));
          return;
        }
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolvePromise(value.trim());
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (value.length > 0) value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };
    stdin.on("data", onData);
  });
}

function normalizeCookie(input: string): string {
  return input
    .trim()
    .replace(/^cookie\s*:\s*/i, "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

export function registerWriteCommands(program: Command): void {
  program
    .command("login")
    .description("配置登录 Cookie")
    .option("--cookie <cookie>", "直接传入浏览器 Cookie 请求头")
    .option("--cookie-file <file>", "从文件读取 Cookie")
    .option("--no-open", "不自动打开浏览器")
    .action(async (options) => {
      let cookie = "";
      if (options.cookie) cookie = String(options.cookie);
      else if (options.cookieFile) cookie = readFileSync(resolve(String(options.cookieFile)), "utf8");
      else {
        info("请先在浏览器登录 https://www.tgb.cn/ ，然后从开发者工具复制 Cookie 请求头。");
        info(pc.dim("Chrome/Edge：F12 → Network → 任意 tgb.cn 请求 → Request Headers → Cookie"));
        if (options.open !== false) {
          try {
            const { spawn } = await import("node:child_process");
            const command =
              process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
            const args = process.platform === "win32" ? ["/c", "start", "", "https://www.tgb.cn/"] : ["https://www.tgb.cn/"];
            spawn(command, args, { detached: true, stdio: "ignore" }).unref();
          } catch {
            // 打不开浏览器时忽略
          }
        }
        cookie = await promptHidden("粘贴 Cookie: ");
      }
      const normalized = normalizeCookie(cookie);
      if (!normalized) throw new Error("Cookie 为空");

      const previous = loadConfig();
      try {
        const status = await loginWithCookie(normalized);
        if (status.loggedIn) {
          ok(`登录成功：${status.userName || "未知用户"} (${status.userId || "-"})`);
        } else {
          saveConfig(previous);
          warn("登录校验未通过，已保留原配置。请确认 Cookie 完整且未过期。");
        }
        info(pc.dim(`配置已保存到 ${configPath()}`));
      } catch (error) {
        saveConfig(previous);
        throw error;
      }
    });

  program
    .command("logout")
    .description("清除本地登录 Cookie")
    .action(() => {
      logout();
      ok("已退出登录，Cookie 已清除");
    });

  program
    .command("whoami")
    .description("显示当前登录用户")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const status = await getLoginStatus();
      if (options.json) return printJson(status);
      if (!status.loggedIn) {
        warn("未登录。执行 tgb login 配置 Cookie。");
        return;
      }
      ok(`已登录：${status.userName || "未知"} (${status.userId || "-"})`);
    });

  const config = program.command("config").description("查看或修改本地配置");

  config
    .command("show", { isDefault: true })
    .description("显示配置")
    .option("--json", "输出 JSON")
    .action((options) => {
      const cfg = loadConfig();
      if (options.json) {
        return printJson({ ...cfg, cookie: cfg.cookie ? maskCookie(cfg.cookie) : undefined });
      }
      heading("tgb-cli 配置");
      kvBlock([
        ["配置文件", configPath()],
        ["登录 Cookie", maskCookie(cfg.cookie)],
        ["账号", cfg.userName ? `${cfg.userName} (${cfg.userId || "-"})` : undefined],
        ["User-Agent", cfg.userAgent],
        ["代理", cfg.proxy],
        ["超时(ms)", cfg.timeoutMs],
        ["请求间隔(ms)", cfg.delayMs],
      ]);
    });

  config
    .command("path")
    .description("显示配置文件路径")
    .action(() => info(configPath()));

  config
    .command("set <key> <value>")
    .description("设置配置项：cookie|userAgent|proxy|timeoutMs|delayMs")
    .action((key: string, value: string) => {
      const allowed = ["cookie", "userAgent", "proxy", "timeoutMs", "delayMs"];
      if (!allowed.includes(key)) throw new Error(`不支持的配置项: ${key}`);
      const patch: Partial<TgbConfig> = {};
      if (key === "timeoutMs" || key === "delayMs") {
        const num = Number.parseInt(value, 10);
        if (Number.isNaN(num) || num < 0) throw new Error(`${key} 必须是数字`);
        patch[key] = num;
      } else if (key === "cookie") {
        patch.cookie = normalizeCookie(value);
      } else {
        patch[key as "userAgent" | "proxy"] = value;
      }
      updateConfig(patch);
      ok(`已设置 ${key}`);
    });

  config
    .command("unset <key>")
    .description("清除配置项")
    .action((key: string) => {
      const cfg = loadConfig();
      if (!(key in cfg)) {
        warn(`配置项不存在: ${key}`);
        return;
      }
      delete (cfg as Record<string, unknown>)[key];
      saveConfig(cfg);
      ok(`已清除 ${key}`);
    });

  program
    .command("reply <idOrUrl> [content]")
    .description("回复帖子（需登录；内容可用 --file 或管道传入）")
    .option("-f, --file <file>", "从文件读取回复内容")
    .option("--dry-run", "只打印将要提交的内容，不实际发送")
    .action(async (idOrUrl: string, content: string | undefined, options) => {
      const text = await readContent(content, options.file);
      if (options.dryRun) {
        const { resolveTopic } = await import("../api/topic.ts");
        const target = await resolveTopic(idOrUrl);
        return printJson({ target, body: text });
      }
      const result = await replyTopic(idOrUrl, text);
      ok(result.message);
    });

  program
    .command("post <title> [content]")
    .description("发表主帖（需登录；内容可用 --file 或管道传入）")
    .option("-f, --file <file>", "从文件读取正文")
    .option("-t, --type <type>", "类型：1研股 2复盘 3实盘 4方法论 5其他", "5")
    .option("--catalog <id>", "版块 ID（默认使用发帖页默认版块）")
    .option("--dry-run", "只校验参数不发送")
    .action(async (title: string, content: string | undefined, options) => {
      const text = await readContent(content, options.file);
      if (options.dryRun) {
        return printJson({
          title,
          content: text,
          type: Number(options.type),
          catalogId: options.catalog ? Number(options.catalog) : undefined,
        });
      }
      const result = await postTopic({
        title,
        content: text,
        type: Number.parseInt(options.type, 10) || 5,
        catalogId: options.catalog ? Number.parseInt(options.catalog, 10) : 5,
      });
      ok(result.message);
    });

  program
    .command("like <idOrUrl>")
    .description("给帖子或跟帖点赞（需登录）")
    .option("-r, --reply <replyId>", "跟帖 ID（不填则给主帖点赞）")
    .option("-p, --page <n>", "跟帖所在页", "1")
    .option("--dry-run", "只显示将要点赞的目标，不实际提交")
    .action(async (idOrUrl: string, options) => {
      const page = Number.parseInt(options.page, 10) || 1;
      if (options.dryRun) {
        const { fetchTopic } = await import("../api/topic.ts");
        const topic = await fetchTopic(idOrUrl, { page });
        const reply = options.reply ? topic.replies.find((item) => item.replyId === String(options.reply)) : undefined;
        return printJson({
          topicId: topic.topicId,
          newTopicId: topic.newTopicId,
          replyId: reply?.replyId,
          page,
          currentLikes: reply?.likeCount ?? topic.likeCount,
        });
      }
      const result = await likeTopic(idOrUrl, options.reply ? String(options.reply) : undefined, page);
      ok(result.message);
    });

  program
    .command("favorite <idOrUrl>")
    .description("收藏帖子（需登录）")
    .option("--dry-run", "只解析帖子，不实际提交")
    .action(async (idOrUrl: string, options) => {
      if (options.dryRun) {
        const { resolveTopic } = await import("../api/topic.ts");
        return printJson(await resolveTopic(idOrUrl));
      }
      const result = await favoriteTopic(idOrUrl);
      ok(result.message);
    });

  program
    .command("unfavorite <idOrUrl>")
    .description("取消收藏帖子（需登录）")
    .option("--dry-run", "只解析帖子，不实际提交")
    .action(async (idOrUrl: string, options) => {
      if (options.dryRun) {
        const { resolveTopic } = await import("../api/topic.ts");
        return printJson(await resolveTopic(idOrUrl));
      }
      const result = await unfavoriteTopic(idOrUrl);
      ok(result.message);
    });

  program
    .command("follow <idOrName>")
    .description("关注用户（需登录）")
    .option("--dry-run", "只解析用户，不实际提交")
    .action(async (idOrName: string, options) => {
      if (options.dryRun) {
        const { resolveUserId } = await import("../api/user.ts");
        return printJson(await resolveUserId(idOrName));
      }
      const result = await followUser(idOrName);
      ok(result.message);
    });

  program
    .command("export <idOrUrl...>")
    .description("导出帖子为 Markdown / HTML / JSON")
    .option("-o, --out <dir>", "输出目录", "tgb-export")
    .option("-f, --format <format>", "格式：md|html|json", "md")
    .option("--all", "导出全部跟帖")
    .option("--max-pages <n>", "全部跟帖最大页数", "20")
    .option("--inline-images", "HTML 中内嵌图片（base64）")
    .action(async (ids: string[], options) => {
      const outDir = resolve(String(options.out));
      mkdirSync(outDir, { recursive: true });
      const results: string[] = [];

      for (const [index, id] of ids.entries()) {
        if (index > 0) await http.throttle();
        const topic = options.all
          ? await fetchTopicPaged(id, { maxPages: Number.parseInt(options.maxPages, 10) || 20 })
          : await fetchTopic(id);
        const baseName = `${topic.newTopicId}_${sanitizeFilename(topic.title)}`;
        const format = String(options.format).toLowerCase();
        let file: string;
        if (format === "json") {
          file = join(outDir, `${baseName}.json`);
          writeFileSync(file, JSON.stringify(topic, null, 2), "utf8");
        } else if (format === "html") {
          file = join(outDir, `${baseName}.html`);
          let html = topicToHtml(topic);
          if (options.inlineImages) {
            html = await inlineImages(html, [...new Set([...topic.images, ...topic.replies.flatMap((reply) => reply.images)])]);
          }
          writeFileSync(file, html, "utf8");
        } else {
          file = join(outDir, `${baseName}.md`);
          writeFileSync(file, topicToMarkdown(topic, { includeImages: true }), "utf8");
        }
        results.push(file);
        ok(`已导出：${file}`);
      }
      if (results.length > 1) info(pc.dim(`共导出 ${results.length} 个文件到 ${outDir}`));
    });
}

function sanitizeFilename(value: string): string {
  return cleanText(value)
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 50)
    .trim() || "untitled";
}

