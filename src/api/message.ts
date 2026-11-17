import { BASE_URL } from "../constants.ts";
import { http } from "../http.ts";
import type { ApiEnvelope } from "../types.ts";

export type MessageType = "REPLY" | "TZ" | "DZ" | "WD" | "FS";

export const MESSAGE_TYPES: Record<MessageType, string> = {
  REPLY: "评论提醒",
  TZ: "回复提醒",
  DZ: "点赞提醒",
  WD: "@我的",
  FS: "粉丝信息",
};

/** 页面标签与接口 sType 的映射 */
const API_TYPES: Record<MessageType, string> = {
  REPLY: "REPLY",
  TZ: "QUOTE",
  DZ: "USEFUL",
  WD: "AT",
  FS: "FANS",
};

interface RawMessageDto {
  list?: Array<Record<string, unknown>>;
  pageNo?: number;
  pageNum?: number;
  userID?: number;
}

export interface MessagesResult {
  type: MessageType;
  page: number;
  totalPages: number;
  items: Array<Record<string, unknown>>;
}

export async function getMessages(type: MessageType = "REPLY", page = 1): Promise<MessagesResult> {
  const params = new URLSearchParams({ sType: API_TYPES[type], pageNo: String(page) });
  if (type === "FS") {
    params.set("seq", "0");
    params.set("type", "R");
  }
  const response = await http.requestJson<ApiEnvelope<RawMessageDto>>(
    `/user/center/message/getMsgNewList?${params.toString()}`,
    { referer: `${BASE_URL}/user/center/message/aboutMe?${type}` },
  );
  const dto = response.dto || {};
  return {
    type,
    page,
    totalPages: dto.pageNum || 1,
    items: dto.list || [],
  };
}
