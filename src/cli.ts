import { Command } from "commander";
import { registerReadCommands } from "./commands/read.ts";
import { registerWriteCommands } from "./commands/write.ts";
import { registerDigestCommand } from "./commands/digest.ts";

export const VERSION = "1.0.0";

function printHelpTree(command: Command, isRoot = false): void {
  if (!isRoot) {
    console.log("");
    console.log("=".repeat(78));
    console.log(`命令: ${command.name()}`);
    console.log("=".repeat(78));
    console.log(command.helpInformation().trimEnd());
  }
  for (const child of command.commands) {
    if (child.name() === "help") continue;
    printHelpTree(child);
  }
}

export function createProgram(): Command {
  const program = new Command();
  program
    .name("tgb")
    .description(
      "淘股吧 (tgb.cn) 命令行工具\n\n" +
        "浏览首页推荐、论坛、帖子与跟帖，搜索帖子/用户/股票，查看行情，\n" +
        "以及登录后发帖、回帖、点赞、收藏、关注。",
    )
    .version(VERSION, "-v, --version", "显示版本")
    .showHelpAfterError()
    .addHelpText(
      "after",
      "\n登录说明:\n" +
        "  无需登录: home / forum / topic / stock 行情 / hot / themes / theme / contests / players / user 资料 / export\n" +
        "  需要登录: search / messages / following / feed / favorites / contest / holdings / stock --posts / user --replies / 所有写操作\n" +
        "  登录方法: tgb login（粘贴浏览器 Cookie）\n" +
        "\n示例:\n" +
        "  $ tgb home -t research             # 首页-研股\n" +
        "  $ tgb forum -p 2                   # 论坛第 2 页\n" +
        "  $ tgb topic 2wNtunuTqDJ            # 查看帖子\n" +
        "  $ tgb topic <url> --author-only    # 只看楼主\n" +
        "  $ tgb search 复盘 --sort hot       # 搜索帖子\n" +
        "  $ tgb stock 九阳 --posts           # 股票行情 + 股吧讨论\n" +
        "  $ tgb themes                       # 题材淘金榜\n" +
        "  $ tgb theme 光刻机                 # 题材详情与关联个股\n" +
        "  $ tgb contests                     # 实盘比赛列表\n" +
        "  $ tgb contest <赛事ID>             # 比赛详情\n" +
        "  $ tgb players -t today             # 实盘风云选手\n" +
        "  $ tgb login                        # 配置登录 Cookie\n" +
        "  $ tgb reply <id> '看好后市'        # 回帖\n" +
        "  $ tgb export <id> --all -o out     # 导出帖子\n" +
        "  $ tgb digest -n 10 -o out          # 批量抓取并生成日报\n",
    );

  registerReadCommands(program);
  registerWriteCommands(program);
  registerDigestCommand(program);

  program
    .command("help-all")
    .aliases(["commands", "docs"])
    .description("输出所有命令、子命令和参数的完整说明")
    .action(() => {
      console.log("tgb-cli 全部命令说明");
      console.log(`版本: ${VERSION}`);
      console.log("");
      for (const command of program.commands) {
        if (command.name() === "help") continue;
        printHelpTree(command);
      }
    });

  program
    .command("tips")
    .description("冷门用法与进阶技巧（管道、多账号、脚本组合等）")
    .action(() => {
      console.log(`tgb-cli 冷门用法 / 进阶技巧
========================================

登录与环境变量
- 从文件或剪贴板管道登录：
    cat cookie.txt | tgb login --no-open
    pbpaste | tgb login --no-open
- 临时覆盖 Cookie，不写配置：
    TGB_COOKIE='acw_tc=...; JSESSIONID=...' tgb whoami
- 多账号隔离（不同配置目录）：
    TGB_CLI_HOME=~/.tgb-cli-alt tgb login
    TGB_CLI_HOME=~/.tgb-cli-alt tgb favorites
- 代理：
    tgb config set proxy http://127.0.0.1:7890
    HTTPS_PROXY=http://127.0.0.1:7890 tgb home
- 自定义 UA：
    TGB_USER_AGENT='Mozilla/5.0 ...' tgb topic <id>
- 从文件读取 Cookie：
    tgb login --cookie-file ./cookie.txt

管道输入
- 管道发回复：
    echo '看好后市' | tgb reply <id>
    cat reply.md | tgb reply <id>
- 管道发主帖：
    cat article.md | tgb post '标题' -t 2
- 指定内容文件：
    tgb reply <id> --file reply.txt
    tgb post '标题' --file article.md

脚本组合
- 从列表 JSON 提取帖子 ID，再批量导出：
    tgb forum -b jinghua --json | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).threads.map(t=>t.newTopicId).join(' ')))"
    tgb export <id1> <id2> <id3> -o ./out --all
- 比赛列表转比赛详情：
    tgb contests --json   # 取 newTopicId
    tgb contest <newTopicId>
- 导出完整结构化数据（正文 HTML、跟帖、图片）：
    tgb export <id> -f json -o ./out
- 同时写 HTML 并打印 Markdown：
    tgb topic <id> --html out.html --markdown
- 注意：--json 优先级最高，和 --markdown/--html 同用时只输出 JSON。

容易踩的坑
- -n/--limit 只是终端显示条数，不改变接口每页数量（digest 除外）。
- 复制带 -2 的帖子链接会自动打开第 2 页；也可以用 -p 2。
- topic --author-only 未登录时只过滤当前页，登录后才走官方只看楼主接口。
- digest --all 忽略 -n；-s home 时 -b 无效，-s forum 时 -t 无效。
- digest --all-replies 可能很慢，用 --max-pages 限制。
- export --inline-images 只对 HTML 生效；Markdown 保留远程图片地址。
- contest、holdings、search、messages、favorites、following、feed 需要登录。
- user 用数字 ID 不需要登录，用用户名需要登录（要先走站内用户搜索）。
- config show --json 会脱敏 Cookie，可以安全贴给别人看。
- tgb help-all / commands / docs 可一次性查看全部命令和参数。
`);
    });

  return program;
}
