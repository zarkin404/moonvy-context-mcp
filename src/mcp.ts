import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile, realpath } from "node:fs/promises";
import { relative, isAbsolute, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { packageInfo } from "./package-info.js";
import type { ServerConfig } from "./types/config.js";
import { registerGetDesignContext } from "./tools/get-design-context.js";
import { MoonvyClient } from "./services/moonvy-api.js";
export function createMcpServer(
  config: ServerConfig,
  client = new MoonvyClient(config),
): McpServer {
  const server = new McpServer({
    name: packageInfo.name,
    version: packageInfo.version,
  });
  registerGetDesignContext(server, config, client);
  server.registerResource(
    "design-output",
    new ResourceTemplate("file:///{+path}", { list: undefined }),
    {},
    async (uri) => {
      const root = await realpath(config.outDir),
        path = await realpath(fileURLToPath(uri)),
        rel = relative(root, path);
      if (
        rel === ".." ||
        rel.startsWith("../") ||
        isAbsolute(rel) ||
        !/^(context\.md|index\.html|style\.css|assets\.json|diagnostics\.json|preview\.(png|jpg|webp|gif)|preview-crop-[a-f0-9]+\.png)$/.test(
          basename(path),
        )
      )
        throw new Error("只能读取本服务输出目录中的设计产物。");
      const bytes = await readFile(path),
        mimeType = path.endsWith(".md")
          ? "text/markdown"
          : path.endsWith(".html")
            ? "text/html"
            : path.endsWith(".css")
              ? "text/css"
              : path.endsWith(".json")
                ? "application/json"
                : path.endsWith(".png")
                  ? "image/png"
                  : path.endsWith(".jpg")
                    ? "image/jpeg"
                    : path.endsWith(".webp")
                      ? "image/webp"
                      : "image/gif";
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
