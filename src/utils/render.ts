import type { Topic } from "../types.ts";
import { formatNumber } from "./text.ts";

export function topicToMarkdown(topic: Topic, options: { includeImages?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(`# ${topic.title}`, "");
  lines.push(
    `${topic.author} · ${topic.publishedAt || "-"} · 浏览 ${formatNumber(topic.viewCount)} · 评论 ${formatNumber(topic.replyCount)} · 赞 ${topic.likeCount}`,
  );
  lines.push(`来源: ${topic.url}`, "");
  if (topic.content) lines.push(topic.content, "");

  if (options.includeImages && topic.images.length > 0) {
    for (const image of topic.images) lines.push(`![](${image})`);
    lines.push("");
  }
  if (topic.images.length > 0) {
    lines.push(`图片: ${topic.images.map((url) => url).join("\n")}`, "");
  }

  lines.push("---", "", `## 跟帖 (${topic.replies.length})`, "");
  for (const [index, reply] of topic.replies.entries()) {
    const badge = reply.isAuthor ? " · 楼主" : "";
    lines.push(`### ${index + 1}. ${reply.author}${badge} · ${reply.time} · 赞 ${reply.likeCount}`);
    if (reply.floor) lines.push(`> ${reply.floor}`);
    lines.push("", reply.content || "(空)", "");
    if (options.includeImages && reply.images.length > 0) {
      for (const image of reply.images) lines.push(`![](${image})`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 860px; margin: 0 auto; padding: 28px 18px 60px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; line-height: 1.75; background: #f5f5f5; color: #222; }
  .card, .reply { background: #fff; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.08); padding: 22px 26px; margin-bottom: 16px; }
  h1, h2 { font-size: 26px; line-height: 1.45; margin: 0 0 10px; border-left: 5px solid #d32f2f; padding-left: 14px; }
  h2 { font-size: 22px; border-left-color: #1a237e; margin-top: 34px; }
  .doc-meta { color: #777; font-size: 13px; margin-bottom: 18px; }
  .content img { max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 12px auto; }
  .reply header { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #666; border-bottom: 1px dashed #eee; padding-bottom: 8px; margin-bottom: 12px; }
  .reply .content { font-size: 15px; }
  .badge { background: #4793f1; color: #fff; border-radius: 4px; padding: 0 6px; font-size: 12px; }
  .meta { margin-left: auto; }
  a { color: #1565c0; }
  .source { margin-top: 10px; font-size: 13px; }
  .doc-title { text-align: center; border: 0; padding: 0; margin-bottom: 24px; }
  @media (prefers-color-scheme: dark) {
    body { background: #17181a; color: #ddd; }
    .card, .reply { background: #202225; box-shadow: none; }
    a { color: #7ab6ff; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function replyListHtml(topic: Topic): string {
  return topic.replies
    .map(
      (reply) => `
      <article class="reply">
        <header>
          <strong>${escapeHtml(reply.author)}</strong>
          ${reply.isAuthor ? '<span class="badge">楼主</span>' : ""}
          <time>${escapeHtml(reply.time)}</time>
          <span class="meta">${escapeHtml(reply.floor)} · 赞 ${reply.likeCount}</span>
        </header>
        <div class="content">${reply.contentHtml || escapeHtml(reply.content)}</div>
      </article>`,
    )
    .join("\n");
}

export function topicHtmlFragment(topic: Topic, level: 1 | 2 = 2): string {
  const heading = level === 1 ? "h1" : "h2";
  return `  <section class="card">
    <${heading}>${escapeHtml(topic.title)}</${heading}>
    <div class="doc-meta">${escapeHtml(topic.author)} · ${escapeHtml(topic.publishedAt)} · 浏览 ${topic.viewCount} · 评论 ${topic.replyCount} · 赞 ${topic.likeCount}</div>
    <div class="content">${topic.contentHtml}</div>
    <div class="source">来源：<a href="${topic.url}">${topic.url}</a></div>
  </section>
  <h2>跟帖（${topic.replies.length}）</h2>
  ${replyListHtml(topic) || '<p class="reply">暂无跟帖</p>'}`;
}

export function topicToHtml(topic: Topic): string {
  return htmlShell(topic.title, topicHtmlFragment(topic, 1));
}

export function topicsToHtml(topics: Topic[], title: string, meta?: string): string {
  const body = [
    `  <h1 class="doc-title">${escapeHtml(title)}</h1>`,
    meta ? `  <p class="doc-meta" style="text-align:center">${escapeHtml(meta)}</p>` : "",
    ...topics.map((topic) => topicHtmlFragment(topic, 2)),
  ].join("\n");
  return htmlShell(title, body);
}
