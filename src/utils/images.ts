import { loadConfig } from "../config.ts";

/** 把 HTML 中引用的远程图片替换成 base64 data URI，便于离线阅读 */
export async function inlineImages(html: string, images: string[], limit = 40): Promise<string> {
  let result = html;
  for (const url of [...new Set(images)].slice(0, limit)) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": loadConfig().userAgent || "Mozilla/5.0",
          Referer: "https://www.tgb.cn/",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) continue;
      const type = response.headers.get("content-type") || "image/jpeg";
      if (!type.startsWith("image/")) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > 8 * 1024 * 1024) continue;
      const dataUri = `data:${type};base64,${buffer.toString("base64")}`;
      result = result.split(url).join(dataUri);
    } catch {
      // 单张图片失败不影响导出
    }
  }
  return result;
}
