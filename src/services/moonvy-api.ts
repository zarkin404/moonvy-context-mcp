import { gunzipSync, inflateSync } from "node:zlib";
import type { Genome } from "../core/types.js";
import type { ServerConfig } from "../types/config.js";
import { parseMoonvyUrl } from "../utils/url-parser.js";
export interface DesignData {
  id: string;
  name: string;
  genome: Genome;
  previewUrl?: string;
  metadata: Record<string, any>;
}
const maxBytes = 50 * 1024 * 1024;
export function resourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const u = new URL(value);
    if (
      u.protocol === "https:" &&
      (u.hostname === "moonvy.com" || u.hostname.endsWith(".moonvy.com"))
    )
      return u.href;
  } catch {}
}
export async function readBytes(
  response: Response,
  limit = maxBytes,
): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("响应文件超过大小限制。");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (!response.body) throw new Error("上游响应为空。");
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) throw new Error("响应文件超过大小限制。");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export function decodeGenome(buffer: Buffer): Genome {
  for (const decode of [
    () => buffer,
    () => gunzipSync(buffer, { maxOutputLength: maxBytes }),
    () => inflateSync(buffer, { maxOutputLength: maxBytes }),
  ]) {
    try {
      const value = JSON.parse(
        decode()
          .toString("utf8")
          .replace(/^\uFEFF/, ""),
      );
      if (Array.isArray(value.pages) && value.pages.length) return value;
    } catch {}
  }
  throw new Error("Genome 不是可读取的设计 JSON，或缺少画板。");
}
export class MoonvyClient {
  constructor(
    private config: Pick<ServerConfig, "authorization" | "httpTimeout">,
    private request: typeof fetch = fetch,
  ) {}
  async download(
    url: string,
    limit = maxBytes,
  ): Promise<{ bytes: Buffer; mimeType: string }> {
    const safe = resourceUrl(url);
    if (!safe) throw new Error("资源地址不是受支持的月维 HTTPS 地址。");
    // CDN 请求不携带登录凭据，也不将凭据转发给重定向地址。
    const r = await this.request(safe, {
      signal: AbortSignal.timeout(this.config.httpTimeout),
      redirect: "error",
    });
    if (!r.ok) throw new Error(`月维资源下载失败（HTTP ${r.status}）。`);
    return {
      bytes: await readBytes(r, limit),
      mimeType: (r.headers.get("content-type") || "").split(";")[0]!,
    };
  }
  async getDesign(url: string): Promise<DesignData> {
    const ids = parseMoonvyUrl(url);
    const r = await this.request("https://api.moonvy.com/anynode/get", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: this.config.authorization,
      },
      body: JSON.stringify({
        projectId: ids.projectId,
        id: ids.fileId,
        lv: "full",
      }),
      signal: AbortSignal.timeout(this.config.httpTimeout),
      redirect: "error",
    });
    if (!r.ok)
      throw new Error(
        `月维设计读取失败（HTTP ${r.status}），请检查登录凭据和项目权限。`,
      );
    const body = JSON.parse((await readBytes(r)).toString("utf8"));
    const node = body.data ?? body.result ?? body;
    if (node.id !== ids.fileId)
      throw new Error(
        "月维没有返回目标设计稿，请检查链接、登录凭据和项目权限。",
      );
    const genomeUrl = resourceUrl(node.files?.genome?.url);
    if (!genomeUrl) throw new Error("设计稿没有可读取的 Genome 文件。");
    const genome = decodeGenome((await this.download(genomeUrl)).bytes);
    // 完整节点中的资源映射补充旧 Genome 中仅有 hash 的资源。
    for (const [id, value] of Object.entries(node.meta?.assets || {})) {
      const assetUrl = resourceUrl(
        typeof value === "string" ? value : (value as any)?.url,
      );
      if (assetUrl) {
        genome.images ??= {};
        genome.images[id] = {
          ...genome.images[id],
          url: genome.images[id]?.url || assetUrl,
        };
      }
    }
    return {
      id: ids.fileId,
      name: String(node.name || ids.fileId),
      genome,
      previewUrl:
        resourceUrl(node.preview?.large) || resourceUrl(node.preview?.normal),
      metadata: node,
    };
  }
}
