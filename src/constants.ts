export const BASE_URL = "https://www.tgb.cn";
export const HQ_URL = "https://hq.tgb.cn";
export const SSO_URL = "https://sso.tgb.cn";

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export const IMAGE_BASE = "https://image.tgb.cn/img/";

/** 首页推荐流 */
export const FEED_TABS = {
  recommend: "综合推荐",
  research: "研股",
  replies: "淘县神评",
  featured: "网友精选",
  today: "今日推荐",
  yuanzi: "淘县院子",
} as const;

export type FeedTab = keyof typeof FEED_TABS;

export const BOARDS = {
  bbs: "淘股论坛",
  jinghua: "炒股精华",
  life: "生活吧",
} as const;

export type Board = keyof typeof BOARDS;

/** 跟帖排序：Z=最早，X=最新 */
export const REPLY_SORTS = {
  earliest: "Z",
  latest: "X",
} as const;

export type ReplySort = keyof typeof REPLY_SORTS;
