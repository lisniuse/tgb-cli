export interface ApiEnvelope<T> {
  status: boolean;
  errorCode: number | string;
  errorMessage: string;
  dto: T;
  _t?: number;
}

export interface FeedItem {
  kind: "topic" | "reply";
  topicId: string;
  newTopicId: string;
  replyId?: string;
  title: string;
  summary: string;
  author: string;
  authorId: string;
  topicAuthor?: string;
  replyCount: number;
  viewCount: number;
  likeCount: number;
  time: string;
  timeRaw: number;
  images: string[];
  stockName?: string;
  stockCode?: string;
}

export interface FeedResult {
  tab: string;
  tabLabel: string;
  page: number;
  totalPages?: number;
  items: FeedItem[];
}

export interface ForumThread {
  newTopicId: string;
  title: string;
  author: string;
  authorId: string;
  replyCount: number;
  viewCount: number;
  lastReplyAt: string;
  postedAt: string;
  url: string;
  digest?: boolean;
}

export interface ForumResult {
  board: string;
  boardLabel: string;
  page: number;
  totalPages: number;
  threads: ForumThread[];
}

export interface ImageRef {
  url: string;
  alt?: string;
}

export interface Reply {
  replyId: string;
  author: string;
  authorId: string;
  isAuthor: boolean;
  time: string;
  floor: string;
  likeCount: number;
  content: string;
  contentHtml: string;
  images: string[];
  quote?: string;
}

export interface Topic {
  topicId: string;
  newTopicId: string;
  url: string;
  title: string;
  author: string;
  authorId: string;
  authorAvatar?: string;
  publishedAt: string;
  viewCount: number;
  replyCount: number;
  likeCount: number;
  favoriteCount?: number;
  topicType?: string;
  catalog?: string;
  content: string;
  contentHtml: string;
  images: string[];
  replies: Reply[];
  page: number;
  totalPages: number;
  sort: string;
  notice?: string;
}

export interface SearchTopicResult {
  topicId: string;
  newTopicId: string;
  title: string;
  author: string;
  authorId: string;
  summary: string;
  replyCount: number;
  viewCount: number;
  likeCount: number;
  time: string;
  url: string;
}

export interface SearchUserResult {
  userId: string;
  userName: string;
  portrait?: string;
  fansCount: number;
  topicCount: number;
  signature?: string;
  url: string;
}

export interface SearchStockResult {
  code: string;
  fullCode: string;
  name: string;
  url: string;
}

export interface SearchResult<T> {
  keyword: string;
  type: "topic" | "user" | "stock";
  page: number;
  total: number;
  totalPages: number;
  items: T[];
}

export interface StockQuote {
  code: string;
  fullCode: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  open: number;
  close: number;
  high: number;
  low: number;
  limitUp: number;
  limitDown: number;
  volume: number;
  amount: number;
  turnoverRate: number;
  peRatio?: number;
  totalValue?: number;
  circulationValue?: number;
  time: string;
  status?: string;
  linkingBoard?: string;
}

export interface UserProfile {
  userId: string;
  userName: string;
  portrait?: string;
  signature?: string;
  region?: string;
  fansCount: number;
  followingCount: number;
  registeredAt?: string;
  url: string;
  vip?: boolean;
}

export interface UserTopic {
  newTopicId: string;
  title: string;
  author?: string;
  viewCount: number;
  replyCount: number;
  postedAt: string;
  latestAt?: string;
  url: string;
}

export interface FriendUser {
  userId: string;
  userName: string;
  portrait?: string;
  likeCount?: number;
  bestCount?: number;
}

export interface MessageItem {
  raw: Record<string, unknown>;
}
