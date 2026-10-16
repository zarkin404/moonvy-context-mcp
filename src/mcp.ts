import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile, realpath } from "node:fs/promises";
import { relative, isAbsolute, basename, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { packageInfo } from "./package-info.js";
import type { ServerConfig } from "./types/config.js";
import { registerGetDesignContext } from "./tools/get-design-context.js";
import { MoonvyClient } from "./services/moonvy-api.js";
import * as zh from "./prompts/zh-CN.js";
import * as en from "./prompts/en-US.js";
export function createMcpServer(
  config: ServerConfig,
  client = new MoonvyClient(config),
): McpServer {
  const p = config.promptLang === "zh-CN" ? zh : en;
  const server = new McpServer(
    { name: packageInfo.name, version: packageInfo.version },
    { instructions: config.authorization ? undefined : p.CREDENTIALS_MISSING },
  );
  registerGetDesignContext(server, config, client);
  server.registerResource(
    "design-output",
    new ResourceTemplate("file:///{+path}", { list: undefined }),
    {},
    async (uri) => {
      const root = await realpath(config.outDir),
        path = await realpath(fileURLToPath(uri)),
        rel = relative(root, path);
      const segments = rel.split(sep);
      const cachedAsset =
        segments.length === 3 &&
        /^.+-[a-f0-9]{8}$/.test(segments[0]) &&
        segments[1] === "assets" &&
        /\.(png|jpg|webp|gif|svg|avif|bmp|ico)$/.test(basename(path));
      if (
        rel === ".." ||
        rel.startsWith(`..${sep}`) ||
        isAbsolute(rel) ||
        !(
          cachedAsset ||
          /^(context\.md|index\.html|style\.css|assets\.json|diagnostics\.json|preview\.(png|jpg|webp|gif)|preview-crop-[a-f0-9]+\.png)$/.test(
            basename(path),
          )
        )
      )
        throw new Error("只能读取本服务输出目录中的设计产物。");
      const bytes = await readFile(path);
      const mimeTypes: Record<string, string> = {
        ".md": "text/markdown",
        ".html": "text/html",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".avif": "image/avif",
        ".bmp": "image/bmp",
        ".ico": "image/x-icon",
      };
      const mimeType = mimeTypes[extname(path)];
      return {
        contents: [
          mimeType.startsWith("image/")
            ? { uri: uri.href, mimeType, blob: bytes.toString("base64") }
            : { uri: uri.href, mimeType, text: bytes.toString("utf8") },
        ],
      };
    },
  );
  return server;
}
