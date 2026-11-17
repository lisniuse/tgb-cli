# tgb-cli

淘股吧（[tgb.cn](https://www.tgb.cn/)）命令行工具。使用 **TypeScript + Bun** 编写，所有数据都通过 HTTP 接口直接获取，不依赖浏览器自动化。

- 浏览首页推荐、论坛、精华、生活吧
- 查看帖子正文、跟帖、只看楼主、分页/全部抓取
- 搜索帖子 / 用户 / 股票
- 股票行情、热门股票榜、热门用户榜
- 用户资料、最新主帖、关注列表、收藏列表、消息通知
- 登录后发帖、回帖、点赞、收藏、关注
- 导出帖子为 Markdown / HTML / JSON
- 批量抓取首页/论坛并生成日报（Markdown / HTML / JSON）

登录配置保存在 `~/.tgb-cli/config.json`（Windows 为 `C:\Users\<你>\.tgb-cli\config.json`）。

## 安装

需要 [Bun](https://bun.sh/)：

```bash
bun install
bun run src/index.ts --help      # 直接用 Bun 运行
```

编译成单文件可执行程序：

```bash
bun run build                    # 输出 dist/tgb(.exe)
```

把 `dist/tgb`（Windows 为 `dist\tgb.exe`）复制到 PATH 中的目录即可全局使用，例如：

```bash
# Windows (Git Bash)
cp dist/tgb.exe ~/.local/bin/

# macOS / Linux
cp dist/tgb /usr/local/bin/
```

之后直接运行 `tgb --help`。

也可以直接下载 GitHub Releases 中的预编译版本：

| 平台 | 文件 |
| --- | --- |
| Windows x64 | `tgb-windows-x64.exe` |
| Linux x64 | `tgb-linux-x64` |
| Linux ARM64 | `tgb-linux-arm64` |
| macOS Apple Silicon | `tgb-darwin-arm64` |
| macOS Intel | `tgb-darwin-x64` |

macOS / Linux 下载后需要 `chmod +x` 并放到 PATH 中。

查看**所有命令、子命令和全部参数**：

```bash
tgb help-all
# 或
tgb commands
tgb docs
```

只想看某个命令：

```bash
tgb topic --help
tgb config --help
```

## 登录

部分功能（搜索、消息、收藏、关注、发帖、回帖、点赞、股吧讨论）需要登录。

1. 浏览器打开 <https://www.tgb.cn/> 并登录。
2. 按 F12 → Network → 任意 tgb.cn 请求 → Request Headers → 复制 `Cookie` 的值。
3. 运行：

```bash
tgb login
```

按提示粘贴 Cookie（输入会隐藏），工具会校验登录状态并保存到 `~/.tgb-cli/config.json`。

也可以直接传入：

```bash
tgb login --cookie "acw_tc=...; JSESSIONID=..."
tgb login --cookie-file ./cookie.txt
```

查看/清除登录状态：

```bash
tgb me
tgb whoami
tgb logout
```

### 哪些功能需要登录

| 功能 | 命令 | 需要登录 |
| --- | --- | --- |
| 首页推荐、论坛、帖子正文、行情、热门榜、题材榜/题材详情、实盘比赛列表/风云选手、用户资料、导出 | `home` `forum` `topic` `stock` `hot` `themes` `theme` `contests` `players` `user` `export` | 否 |
| 搜索帖子/用户/股票 | `search` | 是 |
| 股吧讨论 | `stock --posts` | 是 |
| 实盘比赛详情、选手参赛记录 | `contest` `holdings` | 是 |
| 消息、关注列表、关注动态、收藏 | `messages` `following` `feed` `favorites` | 是 |
| 用户最新跟帖、主帖翻页 | `user --replies`、`user -p 2` | 是 |
| 只看楼主完整版 | `topic --author-only` | 是（未登录时只能过滤当前页） |
| 发帖、回帖、点赞、收藏、关注 | `post` `reply` `like` `favorite` `unfavorite` `follow` | 是 |

无需登录时如果误用了需要登录的命令，工具会提示执行 `tgb login`。各命令的 `--help` 描述里也标注了“需登录”。

## 常用命令

```bash
# 首页推荐流（recommend / research / replies / featured / today / yuanzi）
tgb home
tgb home -t research -p 2

# 论坛（bbs / jinghua / life）
tgb forum
tgb forum -b jinghua -p 2
tgb forum -s post              # 按发帖时间排序（淘股论坛）

# 帖子
tgb topic 2wNtunuTqDJ
tgb topic https://www.tgb.cn/a/2wNtunuTqDJ -p 2 --sort latest
tgb topic 2wNtunuTqDJ --author-only
tgb topic 2wNtunuTqDJ --all --max-pages 10
tgb topic 2wNtunuTqDJ --json

# 搜索（需要登录）
tgb search 复盘
tgb search 复盘 --sort hot --date 2025
tgb search 炒股养家 -t user
tgb search 九阳 -t stock

# 行情与股吧
tgb stock 九阳
tgb stock sz002242 --posts

# 热门榜 / 题材 / 比赛
tgb hot
tgb hot -t users
tgb themes
tgb theme 光刻机
tgb contests                  # 进行中比赛
tgb contests -s signup        # 报名中
tgb contests -s ended         # 已结束
tgb contests -s all           # 全部
tgb contests --posts          # 实盘圈讨论
tgb contest 2nPcAoCrpCL       # 比赛详情 + 本场风云选手
tgb players                   # 七日热门选手
tgb players -t today          # 今日之星
tgb holdings 6673164          # 选手参赛记录

# 用户
tgb user 1857106
tgb user 原里一阳指 --posts
tgb user 1857106 --replies

# 账号相关（需要登录）
tgb messages
tgb messages -t DZ
tgb following
tgb feed
tgb favorites
```

## 发帖 / 回帖 / 互动

```bash
# 回复帖子
tgb reply 2wNtunuTqDJ "看好后市"
tgb reply 2wNtunuTqDJ --file reply.txt
echo "看好后市" | tgb reply 2wNtunuTqDJ

# 发表主帖（type：1研股 2复盘 3实盘 4方法论 5其他）
tgb post "11.18 复盘计划" "正文内容" -t 2
tgb post "标题" --file article.md

# 点赞 / 收藏 / 关注
tgb like 2wNtunuTqDJ
tgb like 2wNtunuTqDJ --reply 104991040
tgb favorite 2wNtunuTqDJ
tgb unfavorite 2wNtunuTqDJ
tgb follow 1857106
```

写操作默认会直接提交。可以先用 `--dry-run` 检查参数：

```bash
tgb post "标题" "正文" --dry-run
tgb reply 2wNtunuTqDJ "内容" --dry-run
```

## 导出

```bash
tgb export 2wNtunuTqDJ -o ./out                 # Markdown
tgb export 2wNtunuTqDJ -o ./out -f html --inline-images
tgb export 2wNtunuTqDJ -o ./out -f json --all
```

HTML 导出会把正文和跟帖整理成可离线阅读的单文件；`--inline-images` 会把图片以 base64 内嵌（单张上限 8MB）。

## 批量日报

对应旧版 Python 项目的“抓取列表 + 抓正文 + 生成 JSON/HTML/Markdown”流程：

```bash
# 首页综合推荐前 10 篇，生成 md/html/json
tgb digest -n 10 -o ./digest

# 论坛版块（可配合 --author-only 只保留楼主跟帖）
tgb digest -s forum -b bbs -n 10 -o ./digest

# 抓取当前列表页的全部帖子，合并成一个 HTML
tgb digest -s forum -b jinghua --all -f html -o ./jinghua-html

# 抓全部跟帖，HTML 内嵌图片
tgb digest -s forum -n 5 --all-replies --inline-images -o ./digest
```

每次都生成 `digest_YYYYMMDD_HHMMSS.md/html/json`。日报只负责抓取和整理，不含旧版的 LLM 分析、飞书推送、定时调度和部署功能。

## 配置

```bash
tgb config              # 查看配置（Cookie 会脱敏）
tgb config path         # 配置文件路径
tgb config set proxy http://127.0.0.1:7890
tgb config set timeoutMs 30000
tgb config set delayMs 500
tgb config unset proxy
```

配置项：

| 键 | 说明 |
| --- | --- |
| `cookie` | 登录 Cookie |
| `userAgent` | 自定义 User-Agent |
| `proxy` | HTTP 代理 |
| `timeoutMs` | 请求超时，默认 20000 |
| `delayMs` | 批量抓取请求间隔，默认 0 |
| `userName` / `userId` | 登录后缓存，仅用于展示 |

环境变量 `TGB_CLI_HOME` 可改变配置目录，`TGB_COOKIE` 可临时覆盖 Cookie。

## 输出

- 默认输出为适合终端阅读的表格/正文。
- 所有读取类命令都支持 `--json`，方便脚本和 AI Agent 使用。
- 出现登录错误时，会提示执行 `tgb login`。

## 说明

- 本项目仅做 HTTP 接口访问，不模拟浏览器操作，不修改页面。
- Cookie 会明文保存在 `~/.tgb-cli/config.json`，请勿把该文件提交到 Git 或分享给他人。
- 请求频率请保持克制，批量抓取建议设置 `delayMs`。
- 数据和内容版权归淘股吧及原作者所有，仅供个人学习研究使用。
