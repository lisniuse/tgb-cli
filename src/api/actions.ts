import { load } from "cheerio";
import { BASE_URL } from "../constants.ts";
import { http } from "../http.ts";
import { cleanText, formatNumber } from "../utils/text.ts";
import { fetchTopic, resolveTopic } from "./topic.ts";
import { resolveUserId } from "./user.ts";

export async function likeTopic(input: string, replyId?: string, page = 1): Promise<{ message: string }> {
  const topic = await fetchTopic(input, { page });
  if (!topic.topicId) throw new Error("无法解析帖子 ID");

  let rid = topic.topicId;
  let flag = "T";
  let current = topic.likeCount;
  if (replyId) {
    const reply = topic.replies.find((item) => item.replyId === replyId);
    if (!reply) throw new Error(`当前页没有找到跟帖 ${replyId}，可以指定 --page`);
    rid = reply.replyId;
    flag = "R";
    current = reply.likeCount;
  }

  const params = new URLSearchParams({
    rid,
    num: String(current),
    flag,
    topicID: topic.topicId,
    pageNum: String(topic.page || 1),
  });
  const response = await http.requestJson<{ status: boolean; dto: { root?: { value?: string } } }>(
    `/topic/addUseful?${params.toString()}`,
    { referer: topic.url },
  );
  const value = response.dto?.root?.value;
  if (value === "999999") throw new Error("投票速度太快，请 30 秒后再试");
  if (value === "999998") throw new Error("不能给自己的帖子点赞");
  if (value === "0") throw new Error("已经点过赞了");
  if (value === "error") throw new Error("点赞失败");
  return { message: `点赞成功，当前赞数 ${value}` };
}

export async function favoriteTopic(input: string): Promise<{ message: string }> {
  const topic = await resolveTopic(input);
  const response = await http.requestJson<{ status: boolean; dto: { root?: { value?: string; check?: string } } }>(
    `/topic/addFavorite?rid=${topic.topicId}`,
    { referer: topic.url },
  );
  const root = response.dto?.root;
  if (!root) throw new Error("收藏失败");
  if (root.value === "0") throw new Error("已经收藏过了");
  if (root.check === "1") throw new Error("内容审核中，暂时无法收藏");
  if (root.value === "error") throw new Error("收藏失败");
  return { message: `收藏成功，当前收藏数 ${root.value ?? "-"}` };
}

export async function unfavoriteTopic(input: string): Promise<{ message: string }> {
  const topic = await resolveTopic(input);
  const result = await http.postForm(
    "/collect/removeCollection",
    { topicIDList: topic.topicId },
    { referer: `${BASE_URL}/collect/getFavoriteTopics` },
  );
  if (result.status >= 400) throw new Error(`取消收藏失败 HTTP ${result.status}`);
  if (/错误|失败|登录/.test(result.text) && !result.location) {
    const message = cleanText(load(result.text)("body").text()).slice(0, 200);
    throw new Error(`取消收藏失败: ${message || "未知错误"}`);
  }
  return { message: `已取消收藏：${topic.title}` };
}

export async function followUser(input: string): Promise<{ message: string }> {
  const { userId, userName } = await resolveUserId(input);
  const params = new URLSearchParams({ userName: userName || input });
  const response = await http.requestJson<{ status: boolean; dto?: { type?: string } }>(
    `/user/addGoodFriend?${params.toString()}`,
    { referer: `${BASE_URL}/blog/${userId}` },
  );
  const type = response.dto?.type;
  if (type === "3") throw new Error("已经关注过了");
  if (type === "4") throw new Error("对方在你的黑名单中，无法关注");
  if (type === "5") throw new Error("不能关注自己");
  if (type === "error") throw new Error("关注失败");
  return { message: type ? `操作完成 (type=${type})` : "关注成功" };
}

/** 编辑器提交的是 HTML；纯文本内容把换行转成 <br>，避免服务端折叠换行 */
function toEditorHtml(text: string): string {
  if (/<(?:br|p|div|img|a)\b/i.test(text)) return text;
  return text.replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
}

export async function replyTopic(input: string, content: string): Promise<{ message: string }> {
  const target = await resolveTopic(input);
  const text = content.trim();
  if (!text) throw new Error("回复内容不能为空");
  if (text.length > 20_000) throw new Error("回复内容不能超过 2 万字");

  const form: Record<string, string> = {
    firstFlag: "Y",
    subject: target.title,
    topicID: target.topicId,
    newTopicIDValue: target.newTopicId,
    quoteID: "",
    quoteContent: "",
    quoteTime: "",
    quoteUserID: "",
    quoteUserName: "",
    talkSeq: "",
    jumpFlag: "N",
    foucsIndex: "",
    draftSeq: "",
    htopenflag: "",
    hongbaoFlag: "N",
    hbNum: "",
    hbPoint: "",
    condition: "",
    blessing: "",
    body: toEditorHtml(text),
  };

  const result = await http.postForm("/topic/addNewReply", form, { referer: target.url });
  if (result.status >= 400) {
    throw new Error(`回帖失败 HTTP ${result.status}`);
  }
  if (/错误|失败|登录/.test(result.text) && !result.location) {
    const message = cleanText(load(result.text)("body").text()).slice(0, 200);
    throw new Error(`回帖失败: ${message || "未知错误"}`);
  }
  return { message: `回帖成功：${result.location || target.url}` };
}

export interface PostTopicOptions {
  title: string;
  content: string;
  /** 1=研股，2=复盘，3=实盘，4=方法论，5=其他 */
  type?: number;
  catalogId?: number;
}

export async function postTopic(options: PostTopicOptions): Promise<{ message: string }> {
  const title = options.title.trim();
  const content = options.content.trim();
  if (!title) throw new Error("标题不能为空");
  if (!content) throw new Error("正文不能为空");
  if (title.length > 40) throw new Error("标题不能超过 40 字");

  // 先打开发帖页，复用服务端下发的隐藏字段，避免遗漏校验参数
  const pageHtml = await http.getText(`${BASE_URL}/topic/newTopic`, { referer: `${BASE_URL}/` });
  const $ = load(pageHtml);
  const form: Record<string, string> = {};
  $("#newTopicAction input[name]").each((_, element) => {
    const node = $(element);
    const name = node.attr("name");
    if (!name) return;
    form[name] = node.attr("value") || "";
  });
  form.subject = title;
  form.body = toEditorHtml(content);
  form.firstFlag = "Y";
  form.type = String(options.type ?? 5);
  form.catalogID = String(options.catalogId ?? (form.catalogID || 5));
  if (!form.blockID) form.blockID = "1";
  form.hongbaoFlag = "N";

  const result = await http.postForm("/topic/addTopic", form, { referer: `${BASE_URL}/topic/newTopic` });
  if (result.status >= 400) throw new Error(`发帖失败 HTTP ${result.status}`);
  if (/错误|失败|登录|禁止/.test(result.text) && !result.location) {
    const message = cleanText(load(result.text)("body").text()).slice(0, 300);
    throw new Error(`发帖失败: ${message || "未知错误"}`);
  }
  return { message: `发帖成功：${result.location || "请到个人主页查看"}` };
}

export function formatCount(value: number): string {
  return formatNumber(value);
}
