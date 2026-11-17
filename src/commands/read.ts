import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import pc from "picocolors";
import { BOARDS, FEED_TABS, type Board, type FeedTab } from "../constants.ts";
import { getFeed, isFeedTab } from "../api/home.ts";
import { getForum, isBoard, parseThreads } from "../api/forum.ts";
import { http } from "../http.ts";
import { fetchTopic, fetchTopicPaged } from "../api/topic.ts";
import { getHotStocks, getHotUsers, searchStocks, searchTopics, searchUsers } from "../api/search.ts";
import { getQuote, getStockPosts, resolveStock, stockSummaryLines } from "../api/quote.ts";
import { getThemeDetail, getThemes } from "../api/theme.ts";
import {
  CONTEST_STATUS_LABELS,
  getContestDetail,
  getContestHoldings,
  getContestPlayers,
  getContests,
  type ContestStatus,
} from "../api/contest.ts";
import {
  getFavorites,
  getFollowFeed,
  getFollowingUsers,
  getUserPosts,
  getUserProfile,
  getUserReplies,
  resolveUserId,
} from "../api/user.ts";
import { getLoginStatus } from "../api/auth.ts";
import { MESSAGE_TYPES, getMessages, type MessageType } from "../api/message.ts";
import type { Topic, UserTopic } from "../types.ts";
import { formatNumber, formatRelativeTime, formatTime, truncate } from "../utils/text.ts";
import { heading, info, kvBlock, printJson, printTable, warn } from "../utils/output.ts";
import { topicToHtml, topicToMarkdown } from "../utils/render.ts";

function printUserTopics(topics: UserTopic[], limit = 30): void {
  printTable(
    [
      { header: "#", align: "right", maxWidth: 3 },
      { header: "标题", maxWidth: 60 },
      { header: "浏览", align: "right" },
      { header: "回复", align: "right" },
      { header: "时间", maxWidth: 14 },
    ],
    topics.slice(0, limit).map((topic, index) => [
      String(index + 1),
      topic.title,
      formatNumber(topic.viewCount),
      String(topic.replyCount),
      topic.postedAt || "-",
    ]),
  );
}

export function printTopic(topic: Topic, limit = 20): void {
  heading(topic.title);
  info(
    pc.dim(
      `${topic.author} · ${topic.publishedAt || "-"} · 浏览 ${formatNumber(topic.viewCount)} · 评论 ${formatNumber(topic.replyCount)} · 赞 ${topic.likeCount}`,
    ),
  );
  info(pc.dim(topic.url));
  if (topic.notice) info(pc.yellow(`! ${topic.notice}`));
  console.log("");
  if (topic.content) info(topic.content);
  if (topic.images.length > 0) {
    console.log("");
    info(pc.dim(`图片 ${topic.images.length} 张：`));
    for (const image of topic.images) info(pc.dim(`  ${image}`));
  }

  console.log("");
  console.log(pc.bold(`跟帖 ${topic.replies.length} 条 · 第 ${topic.page}/${topic.totalPages} 页`));
  console.log("");
  const replies = topic.replies.slice(0, limit);
  for (const [index, reply] of replies.entries()) {
    const badge = reply.isAuthor ? pc.cyan(" [楼主]") : "";
    info(`${pc.dim(`${index + 1}.`)} ${pc.bold(reply.author)}${badge} ${pc.dim(`${reply.time} · 赞 ${reply.likeCount} ${reply.floor ? `· ${reply.floor}` : ""}`)}`);
    if (reply.content) info(reply.content.split("\n").map((line) => `   ${line}`).join("\n"));
    if (reply.images.length > 0) info(pc.dim(`   图片 ${reply.images.length} 张`));
    console.log("");
  }
  if (topic.replies.length > replies.length) {
    warn(`仅显示前 ${replies.length} 条，共 ${topic.replies.length} 条，可用 --limit 调整`);
  }
}

export function registerReadCommands(program: Command): void {
  program
    .command("home")
    .description("浏览首页推荐流")
    .option("-t, --tab <tab>", `频道：${Object.keys(FEED_TABS).join("|")}`, "recommend")
    .option("-p, --page <n>", "页码", "1")
    .option("-n, --limit <n>", "显示条数", "15")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const tab = String(options.tab);
      if (!isFeedTab(tab)) throw new Error(`未知频道: ${tab}，可选：${Object.keys(FEED_TABS).join(", ")}`);
      const result = await getFeed(tab as FeedTab, Number.parseInt(options.page, 10) || 1);
      if (options.json) return printJson(result);
      heading(`${result.tabLabel} · 第 ${result.page} 页${result.totalPages ? ` / ${result.totalPages}` : ""}`);
      console.log("");
      printTable(
        [
          { header: "#", align: "right", maxWidth: 3 },
          { header: "标题", maxWidth: 48 },
          { header: "作者", maxWidth: 14 },
          { header: "评论", align: "right" },
          { header: "浏览", align: "right" },
          { header: "赞", align: "right" },
          { header: "时间", maxWidth: 12 },
        ],
        result.items.slice(0, Number.parseInt(options.limit, 10) || 15).map((item, index) => [
          String(index + 1),
          `${item.kind === "reply" ? pc.dim("↳ ") : ""}${truncate(item.title, 48)}`,
          truncate(item.author, 14),
          String(item.replyCount),
          formatNumber(item.viewCount),
          String(item.likeCount),
          formatRelativeTime(item.timeRaw),
        ]),
      );
      console.log("");
      info(pc.dim(`查看帖子：tgb topic <帖子ID或链接>`));
    });

  program
    .command("forum")
    .description("浏览论坛版块")
    .option("-b, --board <board>", `版块：${Object.keys(BOARDS).join("|")}`, "bbs")
    .option("-p, --page <n>", "页码", "1")
    .option("-s, --sort <sort>", "排序：reply|post（仅淘股论坛）", "reply")
    .option("-n, --limit <n>", "显示条数", "30")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const board = String(options.board);
      if (!isBoard(board)) throw new Error(`未知版块: ${board}，可选：${Object.keys(BOARDS).join(", ")}`);
      const sort = options.sort === "post" ? "post" : "reply";
      const result = await getForum(board as Board, Number.parseInt(options.page, 10) || 1, sort);
      if (options.json) return printJson(result);
      heading(`${result.boardLabel} · 第 ${result.page} 页 / 共 ${result.totalPages} 页`);
      console.log("");
      printTable(
        [
          { header: "#", align: "right", maxWidth: 3 },
          { header: "标题", maxWidth: 52 },
          { header: "作者", maxWidth: 14 },
          { header: "评论/浏览", align: "right" },
          { header: "最后回复", maxWidth: 12 },
        ],
        result.threads.slice(0, Number.parseInt(options.limit, 10) || 30).map((thread, index) => [
          String(index + 1),
          truncate(thread.title, 52),
          truncate(thread.author, 14),
          `${thread.replyCount}/${formatNumber(thread.viewCount)}`,
          thread.lastReplyAt || thread.postedAt || "-",
        ]),
      );
      console.log("");
      const nextHint = result.page < result.totalPages ? `  下一页：tgb forum -b ${board} -p ${result.page + 1}` : "";
      info(pc.dim(`查看帖子：tgb topic <帖子ID>${nextHint}`));
    });

  program
    .command("topic <idOrUrl>")
    .description("查看帖子正文与跟帖（--author-only 完整模式需登录）")
    .option("-p, --page <n>", "跟帖页码（默认 1；链接里的 -2 也会自动识别）")
    .option("-s, --sort <sort>", "跟帖排序：earliest|latest", "earliest")
    .option("-n, --limit <n>", "显示跟帖条数", "20")
    .option("--all", "抓取全部跟帖（默认最多 20 页）")
    .option("--max-pages <n>", "全部抓取时的最大页数", "20")
    .option("--author-only", "只看楼主")
    .option("--json", "输出 JSON")
    .option("--markdown", "输出 Markdown")
    .option("--html <file>", "导出 HTML 文件")
    .option("--images", "Markdown 中包含图片")
    .action(async (idOrUrl: string, options) => {
      const sort = options.sort === "latest" ? "latest" : "earliest";
      const page = options.page ? Number.parseInt(options.page, 10) : undefined;
      const topic = options.all
        ? await fetchTopicPaged(idOrUrl, {
            sort,
            authorOnly: Boolean(options.authorOnly),
            maxPages: Number.parseInt(options.maxPages, 10) || 20,
          })
        : await fetchTopic(idOrUrl, { page, sort, authorOnly: Boolean(options.authorOnly) });

      if (options.json) return printJson(topic);
      if (options.html) {
        const file = resolve(String(options.html));
        writeFileSync(file, topicToHtml(topic), "utf8");
        info(`已导出 HTML: ${file}`);
      }
      if (options.markdown) {
        info(topicToMarkdown(topic, { includeImages: Boolean(options.images) }));
        return;
      }
      printTopic(topic, Number.parseInt(options.limit, 10) || 20);
      if (!options.all && topic.totalPages > topic.page) {
        info(pc.dim(`下一页：tgb topic ${topic.newTopicId} -p ${topic.page + 1}`));
      }
    });

  program
    .command("search <keyword>")
    .description("搜索帖子 / 用户 / 股票（需登录）")
    .option("-t, --type <type>", "类型：topic|user|stock", "topic")
    .option("-p, --page <n>", "页码", "1")
    .option("-s, --sort <sort>", "排序：latest|hot（仅帖子）", "latest")
    .option("-d, --date <date>", "时间范围：6=半年内，年份如 2025，all=全部", "6")
    .option("-n, --limit <n>", "显示条数", "20")
    .option("--json", "输出 JSON")
    .action(async (keyword: string, options) => {
      const page = Number.parseInt(options.page, 10) || 1;
      const limit = Number.parseInt(options.limit, 10) || 20;
      if (options.type === "user") {
        const result = await searchUsers(keyword, page);
        if (options.json) return printJson(result);
        heading(`用户搜索：${keyword} · 共 ${result.total} 个`);
        printTable(
          [
            { header: "#", align: "right", maxWidth: 3 },
            { header: "用户", maxWidth: 24 },
            { header: "ID", align: "right" },
            { header: "粉丝", align: "right" },
            { header: "简介", maxWidth: 36 },
          ],
          result.items.slice(0, limit).map((item, index) => [
            String(index + 1),
            item.userName,
            item.userId,
            formatNumber(item.fansCount),
            truncate(item.signature || "-", 36),
          ]),
        );
        return;
      }
      if (options.type === "stock") {
        const result = await searchStocks(keyword, page);
        if (options.json) return printJson(result);
        heading(`股票搜索：${keyword}`);
        printTable(
          [
            { header: "#", align: "right", maxWidth: 3 },
            { header: "代码" },
            { header: "名称" },
          ],
          result.items.slice(0, limit).map((item, index) => [String(index + 1), item.fullCode, item.name]),
        );
        return;
      }

      const date = options.date === "all" ? "" : String(options.date);
      const result = await searchTopics(keyword, {
        page,
        sort: options.sort === "hot" ? "hot" : "latest",
        date,
      });
      if (options.json) return printJson(result);
      heading(`帖子搜索：${keyword} · 共 ${formatNumber(result.total)} 条 · 第 ${result.page}/${result.totalPages} 页`);
      console.log("");
      printTable(
        [
          { header: "#", align: "right", maxWidth: 3 },
          { header: "标题", maxWidth: 50 },
          { header: "作者", maxWidth: 14 },
          { header: "评论", align: "right" },
          { header: "浏览", align: "right" },
          { header: "时间", maxWidth: 12 },
        ],
        result.items.slice(0, limit).map((item, index) => [
          String(index + 1),
          truncate(item.title, 50),
          truncate(item.author, 14),
          String(item.replyCount),
          formatNumber(item.viewCount),
          formatRelativeTime(item.time),
        ]),
      );
    });

  program
    .command("hot")
    .description("热门股票 / 用户榜")
    .option("-t, --type <type>", "类型：stocks|users", "stocks")
    .option("-n, --limit <n>", "显示条数", "20")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const limit = Number.parseInt(options.limit, 10) || 20;
      if (options.type === "users") {
        const users = await getHotUsers();
        if (options.json) return printJson(users);
        heading("热门用户榜");
        printTable(
          [
            { header: "#", align: "right", maxWidth: 3 },
            { header: "用户", maxWidth: 20 },
            { header: "ID", align: "right" },
            { header: "热度", align: "right" },
            { header: "粉丝", align: "right" },
          ],
          users.slice(0, limit).map((user, index) => [String(index + 1), user.name, user.userId, formatNumber(user.hot), formatNumber(user.fans)]),
        );
        return;
      }
      const stocks = await getHotStocks();
      if (options.json) return printJson(stocks);
      heading("热门股票榜");
      printTable(
        [
          { header: "#", align: "right", maxWidth: 3 },
          { header: "股票", maxWidth: 16 },
          { header: "代码" },
          { header: "热度", align: "right" },
        ],
        stocks.slice(0, limit).map((stock, index) => [String(index + 1), stock.name, stock.code, formatNumber(stock.hot)]),
      );
    });

  program
    .command("contests")
    .description("实盘比赛列表（--posts 查看实盘圈讨论）")
    .option("-s, --status <status>", "状态：ongoing|signup|ended|all", "ongoing")
    .option("--posts", "查看实盘圈讨论帖子（原行为）")
    .option("-n, --limit <n>", "显示条数", "30")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      if (options.posts) {
        const html = await http.getText("https://www.tgb.cn/spmatch/index/", { referer: "https://www.tgb.cn/" });
        const threads = parseThreads(html);
        if (options.json) return printJson(threads);
        heading(`实盘圈讨论 · ${threads.length} 条`);
        printTable(
          [
            { header: "#", align: "right", maxWidth: 3 },
            { header: "标题", maxWidth: 52 },
            { header: "作者", maxWidth: 14 },
            { header: "评论/浏览", align: "right" },
            { header: "最后回复", maxWidth: 12 },
          ],
          threads.slice(0, Number.parseInt(options.limit, 10) || 30).map((thread, index) => [
            String(index + 1),
            truncate(thread.title, 52),
            truncate(thread.author, 14),
            `${thread.replyCount}/${formatNumber(thread.viewCount)}`,
            thread.lastReplyAt || thread.postedAt || "-",
          ]),
        );
        return;
      }

      const status = String(options.status).toLowerCase();
      if (!["ongoing", "signup", "ended", "all"].includes(status)) {
        throw new Error("--status 只支持 ongoing、signup、ended、all");
      }
      const contests =
        status === "all"
          ? (
              await Promise.all([
                getContests("ongoing"),
                getContests("signup"),
                getContests("ended"),
              ])
            ).flat()
          : await getContests(status as ContestStatus);
      if (options.json) return printJson(contests);

      heading(`实盘比赛 · ${status === "all" ? "全部" : CONTEST_STATUS_LABELS[status as ContestStatus]} · ${contests.length} 场`);
      printTable(
        [
          { header: "#", align: "right", maxWidth: 3 },
          { header: "比赛名称", maxWidth: 26 },
          { header: "主办方", maxWidth: 14 },
          { header: "类型", maxWidth: 6 },
          { header: "总资产", align: "right" },
          { header: "选手", align: "right" },
          { header: "平均收益", align: "right" },
          { header: "进度", maxWidth: 12 },
          { header: "状态", maxWidth: 6 },
        ],
        contests.slice(0, Number.parseInt(options.limit, 10) || 30).map((contest, index) => [
          String(index + 1),
          truncate(contest.name, 26),
          truncate(contest.host, 14),
          contest.type,
          contest.totalMoney || "-",
          String(contest.players),
          contest.avgRate || "-",
          contest.progress || (contest.entryEnd ? `截止 ${contest.entryEnd}` : "-"),
          CONTEST_STATUS_LABELS[contest.status],
        ]),
      );
      console.log("");
      info(pc.dim("比赛详情：tgb contest <赛事ID>   选手持仓：tgb holdings <用户ID>"));
    });

  program
    .command("contest <tid>")
    .description("实盘比赛详情（概览、风云选手，需登录）")
    .option("--json", "输出 JSON")
    .action(async (tid: string, options) => {
      const detail = await getContestDetail(tid);
      if (options.json) return printJson(detail);
      heading(`${detail.name} · ${detail.type} · ${detail.url}`);
      console.log("");
      kvBlock([
        ["总资产", detail.totalMoney],
        ["参赛人数", detail.players],
        ["平均仓位", detail.position],
        ["累计平均收益", detail.avgRate],
        ["上证同涨", detail.indexRate],
        ["比赛时间", detail.timeRange],
        ["进度", detail.progress],
        ["本场风云值", detail.stormValue],
      ]);
      if (detail.stars.length > 0) {
        console.log("");
        heading(`本场风云选手 · ${detail.stars.length} 人`);
        printTable(
          [
            { header: "#", align: "right", maxWidth: 3 },
            { header: "选手", maxWidth: 18 },
            { header: "ID", align: "right" },
            { header: "总资产", align: "right" },
            { header: "总收益", align: "right" },
            { header: "风云值", align: "right" },
          ],
          detail.stars.map((star, index) => [
            String(index + 1),
            star.userName,
            star.userId,
            star.assets || "-",
            star.rate || "-",
            star.stormValue || "-",
          ]),
        );
      }
    });

  program
    .command("players")
    .description("实盘风云选手（七日热门 / 今日之星）")
    .option("-t, --type <type>", "类型：hot|today", "hot")
    .option("-n, --limit <n>", "显示条数", "10")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const period = options.type === "today" ? "today" : "hot";
      const players = await getContestPlayers(period);
      if (options.json) return printJson(players);
      heading(`实盘风云选手 · ${period === "today" ? "今日之星" : "七日热门"} · ${players.length} 人`);
      printTable(
        [
          { header: "#", align: "right", maxWidth: 3 },
          { header: "选手", maxWidth: 18 },
          { header: "ID", align: "right" },
          { header: "荣誉", maxWidth: 32 },
          { header: "风云值", align: "right" },
        ],
        players.slice(0, Number.parseInt(options.limit, 10) || 10).map((player, index) => [
          String(index + 1),
          player.userName,
          player.userId,
          truncate(player.honor || "-", 32),
          player.stormValue,
        ]),
      );
      console.log("");
      info(pc.dim("查看参赛记录：tgb holdings <用户ID>"));
    });

  program
    .command("holdings <userIdOrName>")
    .description("查看实盘选手的参赛记录（需登录；网站按钮名：查看持仓）")
    .option("-n, --limit <n>", "显示条数", "20")
    .option("--json", "输出 JSON")
    .action(async (userIdOrName: string, options) => {
      const { userId } = await resolveUserId(userIdOrName);
      const holdings = await getContestHoldings(userId);
      if (options.json) return printJson(holdings);
      heading(`参赛记录 · 用户 ${userId} · ${holdings.length} 场`);
      printTable(
        [
          { header: "#", align: "right", maxWidth: 3 },
          { header: "比赛", maxWidth: 30 },
          { header: "初始资金", align: "right" },
          { header: "收益", align: "right" },
          { header: "进度", align: "right" },
          { header: "状态", maxWidth: 6 },
        ],
        holdings.slice(0, Number.parseInt(options.limit, 10) || 20).map((item, index) => [
          String(index + 1),
          truncate(item.subject, 30),
          item.preMoney || "-",
          item.rate || "-",
          item.progress || "-",
          item.status,
        ]),
      );
    });

  program
    .command("themes")
    .description("题材淘金榜（板块热度、涨停数、龙头）")
    .option("-n, --limit <n>", "显示条数", "20")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const themes = await getThemes();
      if (options.json) return printJson(themes);
      heading("题材淘金榜");
      printTable(
        [
          { header: "#", align: "right", maxWidth: 3 },
          { header: "题材", maxWidth: 18 },
          { header: "涨幅", align: "right" },
          { header: "涨停", align: "right" },
          { header: "涨/跌", align: "right" },
          { header: "人气", align: "right" },
          { header: "龙头", maxWidth: 16 },
        ],
        themes.slice(0, Number.parseInt(options.limit, 10) || 20).map((theme, index) => [
          String(index + 1),
          theme.name,
          `${theme.rate > 0 ? "+" : ""}${theme.rate.toFixed(2)}%`,
          String(theme.limitUp),
          `${theme.up}/${theme.down}`,
          formatNumber(theme.hot),
          theme.leader || "-",
        ]),
      );
    });

  program
    .command("theme <seqOrName>")
    .description("题材详情与关联个股")
    .option("-n, --limit <n>", "显示个股条数", "30")
    .option("--json", "输出 JSON")
    .action(async (seqOrName: string, options) => {
      let seq = seqOrName.trim();
      if (!/^\d+$/.test(seq)) {
        const themes = await getThemes();
        const exact = themes.find((item) => item.name === seq);
        const partial = exact || themes.find((item) => item.name.includes(seq));
        if (!partial) throw new Error(`没有找到题材: ${seqOrName}`);
        seq = String(partial.seq);
      }
      const detail = await getThemeDetail(seq);
      if (options.json) return printJson(detail);
      heading(`${detail.name} · ${detail.url}`);
      console.log("");
      kvBlock([
        ["涨跌幅", detail.change],
        ["涨/跌家数", detail.upDown],
        ["涨停数", detail.limitUp],
        ["实时量比", detail.volumeRatio],
        ["行情更新", detail.updatedAt],
      ]);
      console.log("");
      heading(`关联个股 · ${detail.stocks.length} 只`);
      printTable(
        [
          { header: "#", align: "right", maxWidth: 3 },
          { header: "股票", maxWidth: 14 },
          { header: "代码" },
          { header: "现价", align: "right" },
          { header: "涨跌幅", align: "right" },
          { header: "换手", align: "right" },
          { header: "关联原因", maxWidth: 36 },
        ],
        detail.stocks.slice(0, Number.parseInt(options.limit, 10) || 30).map((stock, index) => [
          String(index + 1),
          stock.name,
          stock.code,
          stock.price,
          stock.change,
          stock.turnover,
          truncate(stock.reason, 36),
        ]),
      );
    });

  program
    .command("stock <codeOrName>")
    .description("股票行情与股吧讨论（--posts 需登录）")
    .option("--posts", "显示股吧讨论")
    .option("-p, --pages <n>", "讨论抓取页数", "1")
    .option("-n, --limit <n>", "讨论显示条数", "20")
    .option("--json", "输出 JSON")
    .action(async (codeOrName: string, options) => {
      const resolved = await resolveStock(codeOrName);
      const quote = await getQuote(resolved.fullCode);
      let posts: Awaited<ReturnType<typeof getStockPosts>> | undefined;
      if (options.posts) {
        posts = await getStockPosts(resolved.fullCode, 20, Number.parseInt(options.pages, 10) || 1);
      }
      if (options.json) return printJson({ quote, posts });

      heading(`${quote.name} ${quote.fullCode}`);
      console.log("");
      const lines = stockSummaryLines(quote).filter(([, value]) => value !== undefined && value !== "");
      kvBlock(lines as Array<[string, string]>);
      if (posts) {
        console.log("");
        heading(`股吧讨论 · ${posts.length} 条`);
        printTable(
          [
            { header: "#", align: "right", maxWidth: 3 },
            { header: "标题", maxWidth: 50 },
            { header: "作者", maxWidth: 14 },
            { header: "回复", align: "right" },
            { header: "时间", maxWidth: 12 },
          ],
          posts.slice(0, Number.parseInt(options.limit, 10) || 20).map((post, index) => [
            String(index + 1),
            truncate(post.title, 50),
            truncate(post.author, 14),
            String(post.replyCount),
            formatRelativeTime(post.time),
          ]),
        );
      }
    });

  program
    .command("user <idOrName>")
    .description("用户资料与帖子（--replies / 翻页需登录）")
    .option("--posts", "只看最新主帖")
    .option("--replies", "最新跟帖")
    .option("-p, --page <n>", "页码", "1")
    .option("-n, --limit <n>", "帖子显示条数", "20")
    .option("--json", "输出 JSON")
    .action(async (idOrName: string, options) => {
      const profile = await getUserProfile(idOrName);
      const page = Number.parseInt(options.page, 10) || 1;
      let topics: UserTopic[] | undefined;
      let mode = "posts";
      if (options.replies) {
        topics = await getUserReplies(profile.userId, page);
        mode = "replies";
      } else if (options.posts || !options.json) {
        topics = await getUserPosts(profile.userId, page);
      }
      if (options.json) return printJson({ profile, mode, topics });

      heading(`${profile.userName} · ${profile.url}`);
      console.log("");
      kvBlock([
        ["用户 ID", profile.userId],
        ["地区", profile.region],
        ["粉丝", formatNumber(profile.fansCount)],
        ["关注", formatNumber(profile.followingCount)],
        ["注册时间", profile.registeredAt ? formatTime(profile.registeredAt) : undefined],
        ["VIP", profile.vip ? "是" : undefined],
        ["简介", profile.signature ? truncate(profile.signature, 100) : undefined],
      ]);
      if (topics && topics.length > 0) {
        console.log("");
        heading(mode === "posts" ? "最新主帖" : "最新跟帖");
        printUserTopics(topics, Number.parseInt(options.limit, 10) || 20);
      }
    });

  program
    .command("me")
    .description("查看当前登录账号")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const status = await getLoginStatus();
      if (options.json) return printJson(status);
      if (!status.loggedIn) {
        warn("当前未登录或 Cookie 已失效，请执行 tgb login");
        return;
      }
      heading(`已登录：${status.userName || "未知"} (${status.userId || "-"})`);
    });

  program
    .command("messages")
    .description("查看消息通知（需登录）")
    .option("-t, --type <type>", `类型：${Object.keys(MESSAGE_TYPES).join("|")}`, "REPLY")
    .option("-p, --page <n>", "页码", "1")
    .option("-n, --limit <n>", "显示条数", "20")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const type = String(options.type).toUpperCase() as MessageType;
      if (!(type in MESSAGE_TYPES)) throw new Error(`未知消息类型: ${type}`);
      const result = await getMessages(type, Number.parseInt(options.page, 10) || 1);
      if (options.json) return printJson(result);
      heading(`${MESSAGE_TYPES[type]} · 第 ${result.page}/${result.totalPages} 页 · ${result.items.length} 条`);
      if (result.items.length === 0) {
        info(pc.dim("暂无消息"));
        return;
      }
      const rows = result.items.slice(0, Number.parseInt(options.limit, 10) || 20).map((item, index) => {
        const pick = (...keys: string[]) => {
          for (const key of keys) {
            const value = item[key];
            if (value !== undefined && value !== null && value !== "") return String(value);
          }
          return "";
        };
        return [
          String(index + 1),
          truncate(pick("userName", "fromUserName", "senderName"), 14) || "-",
          truncate(pick("subject", "topicSubject", "title"), 40) || "-",
          truncate(pick("content", "body", "replyContent", "msgContent"), 50) || "-",
          formatRelativeTime(pick("postDate", "createDate", "msgDate", "dateTime")),
        ];
      });
      printTable(
        [
          { header: "#", align: "right", maxWidth: 3 },
          { header: "来自", maxWidth: 14 },
          { header: "标题", maxWidth: 40 },
          { header: "内容", maxWidth: 50 },
          { header: "时间", maxWidth: 12 },
        ],
        rows,
      );
    });

  program
    .command("following")
    .description("查看关注列表（需登录）")
    .option("-n, --limit <n>", "显示条数", "50")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const users = await getFollowingUsers();
      if (options.json) return printJson(users);
      const limit = Number.parseInt(options.limit, 10) || 50;
      heading(`关注列表 · ${users.length} 人`);
      printTable(
        [
          { header: "#", align: "right", maxWidth: 3 },
          { header: "用户", maxWidth: 20 },
          { header: "ID", align: "right" },
          { header: "获赞", align: "right" },
          { header: "精华", align: "right" },
        ],
        users.slice(0, limit).map((user, index) => [
          String(index + 1),
          user.userName,
          user.userId,
          formatNumber(user.likeCount || 0),
          String(user.bestCount || 0),
        ]),
      );
    });

  program
    .command("feed")
    .description("关注动态（关注的人发帖/回帖，需登录）")
    .option("-p, --page <n>", "页码", "1")
    .option("-n, --limit <n>", "显示条数", "20")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const items = await getFollowFeed(Number.parseInt(options.page, 10) || 1);
      if (options.json) return printJson(items);
      heading(`关注动态 · ${items.length} 条`);
      printTable(
        [
          { header: "#", align: "right", maxWidth: 3 },
          { header: "用户", maxWidth: 14 },
          { header: "动态", maxWidth: 8 },
          { header: "标题", maxWidth: 44 },
          { header: "时间", maxWidth: 12 },
        ],
        items.slice(0, Number.parseInt(options.limit, 10) || 20).map((item, index) => [
          String(index + 1),
          truncate(item.author, 14),
          truncate(item.action, 8),
          truncate(item.title || item.summary, 44),
          formatRelativeTime(item.time),
        ]),
      );
    });

  program
    .command("favorites")
    .description("查看收藏帖子（需登录）")
    .option("-p, --page <n>", "页码", "1")
    .option("-n, --limit <n>", "显示条数", "30")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const topics = await getFavorites(Number.parseInt(options.page, 10) || 1);
      if (options.json) return printJson(topics);
      heading(`我的收藏 · ${topics.length} 条`);
      printTable(
        [
          { header: "#", align: "right", maxWidth: 3 },
          { header: "标题", maxWidth: 52 },
          { header: "作者", maxWidth: 14 },
          { header: "浏览", align: "right" },
          { header: "最新时间", maxWidth: 14 },
          { header: "发表日期", maxWidth: 10 },
        ],
        topics.slice(0, Number.parseInt(options.limit, 10) || 30).map((topic, index) => [
          String(index + 1),
          truncate(topic.title, 52),
          truncate(topic.author || "-", 14),
          formatNumber(topic.viewCount),
          topic.latestAt || "-",
          topic.postedAt || "-",
        ]),
      );
    });
}
