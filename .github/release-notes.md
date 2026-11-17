## tgb-cli

淘股吧（[tgb.cn](https://www.tgb.cn/)）命令行工具。使用 **TypeScript + Bun** 编写，所有数据通过 HTTP 接口直接获取，不依赖浏览器自动化。

### 下载

| 平台 | 文件 |
| --- | --- |
| Windows x64 | `tgb-windows-x64.exe` |
| Linux x64 | `tgb-linux-x64` |
| Linux ARM64 | `tgb-linux-arm64` |
| macOS Apple Silicon | `tgb-darwin-arm64` |
| macOS Intel | `tgb-darwin-x64` |

macOS / Linux 下载后：

```bash
chmod +x tgb-<平台>
sudo mv tgb-<平台> /usr/local/bin/tgb
```

Windows 把 `tgb-windows-x64.exe` 改名为 `tgb.exe`，放到 PATH 中的目录即可。未签名程序如遇 SmartScreen 提示，选择“仍要运行”。

macOS 未签名程序如被 Gatekeeper 拦截：

```bash
xattr -d com.apple.quarantine ./tgb-darwin-arm64
```

### 首次使用

```bash
tgb login          # 按提示粘贴浏览器 Cookie
tgb whoami
tgb home
```

配置文件保存在 `~/.tgb-cli/config.json`。

### 功能

- 首页 6 个频道：综合推荐、研股、淘县神评、网友精选、今日推荐、淘县院子
- 论坛：淘股论坛、炒股精华、生活吧
- 帖子正文、跟帖分页、全部跟帖、只看楼主
- 搜索帖子 / 用户 / 股票（需登录）
- 股票行情、股吧讨论、热门股票/用户榜
- 题材淘金榜与题材详情
- 实盘比赛列表、比赛详情、风云选手、选手参赛记录、实盘圈讨论
- 用户资料、主帖、跟帖、消息、关注、关注动态、收藏
- 发帖、回帖、点赞、收藏、取消收藏、关注
- 导出 Markdown / HTML / JSON，批量日报 `digest`
- `help-all` 查看全部命令，`tips` 查看冷门用法

### 常用命令

```bash
tgb home
tgb forum -b jinghua
tgb topic <帖子ID或链接> --author-only
tgb search 复盘 --sort hot
tgb stock 九阳 --posts
tgb themes
tgb contests
tgb digest -s forum -b jinghua --all -f html -o ./out
tgb export <帖子ID> --all -f html --inline-images -o ./out
```

### 说明

- 部分功能需要登录：`search`、`messages`、`favorites`、`contest`、`holdings`、写操作等。运行命令时会给出明确提示。
- 写操作支持 `--dry-run` 预检查。
- 本项目仅做 HTTP 接口访问，请合理控制请求频率。
- 数据和内容版权归淘股吧及原作者所有，仅供个人学习研究使用。
