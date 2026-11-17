import { BASE_URL } from "../constants.ts";
import { getCookie, loadConfig, updateConfig } from "../config.ts";
import { http } from "../http.ts";
import type { ApiEnvelope } from "../types.ts";

export interface LoginStatus {
  loggedIn: boolean;
  userName?: string;
  userId?: string;
  portrait?: string;
}

export async function getLoginStatus(): Promise<LoginStatus> {
  if (!getCookie()) return { loggedIn: false };
  try {
    const response = await http.jsonp<
      ApiEnvelope<{ userName?: string; userID?: string | number; portrait?: string }>
    >(`/user/getIsLogin?callback=cb&_=${Date.now()}`, { referer: BASE_URL, allowAnonymous: true });
    if (!response.status || !response.dto) return { loggedIn: false };
    const userId = response.dto.userID ? String(response.dto.userID) : undefined;
    let userName = response.dto.userName;
    // getIsLogin 会把中文用户名替换成 ?????，用博客信息接口补全
    if ((!userName || /^\?+$/.test(userName)) && userId) {
      try {
        const info = await http.requestJson<ApiEnvelope<{ userName?: string }>>(`/user/getBlogerInfo?userID=${userId}`);
        userName = info.dto?.userName || userName;
      } catch {
        // 补全失败不影响登录状态
      }
    }
    const cached = loadConfig();
    if (cached.userName !== userName || cached.userId !== userId) {
      updateConfig({ userName, userId });
    }
    return {
      loggedIn: true,
      userName,
      userId,
      portrait: response.dto.portrait,
    };
  } catch {
    return { loggedIn: false };
  }
}

export async function loginWithCookie(cookie: string): Promise<LoginStatus> {
  const trimmed = cookie.trim();
  if (!trimmed) throw new Error("Cookie 不能为空");
  updateConfig({ cookie: trimmed });
  const status = await getLoginStatus();
  if (status.loggedIn) {
    updateConfig({ userName: status.userName, userId: status.userId });
  }
  return status;
}

export function logout(): void {
  updateConfig({ cookie: undefined, userName: undefined, userId: undefined });
}
