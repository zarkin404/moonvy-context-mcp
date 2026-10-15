import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServerConfig } from "../types/config.js";
import { MoonvyClient } from "../services/moonvy-api.js";
import { addPreviewFallback } from "../utils/preview-fallback.js";
import { createContext } from "../utils/context.js";
import { writeDesignFiles } from "../utils/file-delivery.js";
import * as zh from "../prompts/zh-CN.js";
import * as en from "../prompts/en-US.js";
export function registerGetDesignContext(
  server: McpServer,
  config: ServerConfig,
  client = new MoonvyClient(config),
) {
  const p = config.promptLang === "zh-CN" ? zh : en;
  server.registerTool(
    "get_design_context",
    {
      description: p.TOOL_DESCRIPTION,
      inputSchema: {
        url: z.string().describe(p.URL_INPUT_DESCRIPTION),
        pageId: z
          .string()
          .optional()
          .describe("Genome 画板 ID；仅多画板设计需要指定。"),
      },
    },
    async ({ url, pageId }): Promise<CallToolResult> => {
      // 缺少凭据不阻断 MCP 握手，通过工具结果向 Agent 说明配置方法。
      if (!config.authorization)
        return {
          isError: true,
          content: [{ type: "text", text: p.CREDENTIALS_MISSING }],
        };
      try {
        const design = await client.getDesign(url);
        const selected =
          design.genome.pages!.find((p) => p.id === pageId) ||
          (!pageId && design.genome.pages!.length === 1
            ? design.genome.pages![0]
            : undefined);
        // 先确定画板，不能以文件总览代替多画板中的某一页。
        if (!selected?.id) {
          createContext(design, config, pageId);
          throw new Error("请指定有效画板。");
        }
        const pageSnapshot =
          selected.snapshot && design.genome.images?.[selected.snapshot]?.url;
        const previewUrl =
          design.genome.pages!.length > 1
            ? pageSnapshot
            : design.previewUrl || pageSnapshot;
        const preview = previewUrl
          ? await client.download(previewUrl, 20 * 1024 * 1024)
          : undefined;
        if (
          preview &&
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            preview.mimeType,
          )
        )
          throw new Error("月维预览不是受支持的图片格式。");
        const fallback =
          config.previewFallback && preview
            ? await addPreviewFallback(
                design.genome,
                selected.id,
                preview,
                config.outDir,
              )
            : undefined;
        const result = createContext(
          fallback ? { ...design, genome: fallback.genome } : design,
          config,
          pageId,
        );
        if (fallback?.diagnostics.length) {
          result.diagnostics.push(...fallback.diagnostics);
          result.context +=
            "\n## " +
            (config.promptLang === "zh-CN"
              ? "预览裁切回退"
              : "Preview crop fallbacks") +
            "\n\n" +
            fallback.diagnostics.map((d) => "- " + d.message).join("\n") +
            "\n";
        }
        if (config.mode === "files") {
          const key = JSON.stringify([
            design.id,
            selected.id,
            config.tailwindcss,
            config.twVersion,
            config.skipSlices,
            config.unitScale,
            config.promptLang,
            config.previewFallback,
          ]);
          const delivered = await writeDesignFiles(
            config.outDir,
            key,
            result,
            preview,
          );
          return {
            content: delivered.files
              .filter(
                (f) => f.name === "context.md" || f.name.startsWith("preview."),
              )
              .map((f) => ({
                type: "resource_link",
                uri: f.uri,
                name: f.name,
                mimeType: f.mimeType,
              })),
          };
        }
        return {
          content: [
            { type: "text", text: result.context },
            ...(preview
              ? [
                  {
                    type: "image" as const,
                    data: preview.bytes.toString("base64"),
                    mimeType: preview.mimeType,
                  },
                ]
              : []),
          ],
        };
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "月维设计读取失败。";
        // 不回显请求对象或原始上游错误响应，额外清除可能含在错误中的认证头。
        const safe = text
          .split(config.authorization)
          .join("[REDACTED]")
          .split(config.authorization.replace(/^Bearer\s+/i, ""))
          .join("[REDACTED]");
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                safe +
                (config.promptLang === "zh-CN"
                  ? "\n请报告此错误，勿猜测缺失的设计信息。"
                  : "\nReport this error; do not guess missing design information."),
            },
          ],
        };
      }
    },
  );
}
