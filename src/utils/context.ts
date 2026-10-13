import { generate } from "../core/generator.js";
import type { GenerateResult } from "../core/types.js";
import type { ServerConfig } from "../types/config.js";
import type { DesignData } from "../services/moonvy-api.js";
import { extractDesignTokens } from "./design-tokens.js";
import * as zh from "../prompts/zh-CN.js";
import * as en from "../prompts/en-US.js";
export function createContext(
  design: DesignData,
  config: ServerConfig,
  pageId?: string,
): GenerateResult {
  const pages = design.genome.pages!;
  if (!pageId && pages.length > 1)
    throw new Error(
      `设计稿包含多个画板，请通过 pageId 选择：${JSON.stringify(pages.map((p) => ({ id: p.id, name: p.name })))}`,
    );
  const page =
    pages.find((p) => p.id === pageId) || (!pageId ? pages[0] : undefined);
  if (!page?.id) throw new Error("指定画板不存在或缺少 ID。");
  const result = generate(design.genome, {
    pageId: page.id,
    styleFormat: config.tailwindcss ? "tailwind" : "css",
    tailwindVersion: config.twVersion,
    unitScale: config.unitScale,
  });
  if (result.diagnostics.some((d) => d.severity === "error"))
    throw new Error("设计超过转换器支持的图层数量或深度，未输出不完整页面。");
  let html = result.html,
    css = result.css;
  if (config.skipSlices)
    for (const asset of result.assets) {
      const remote = asset.url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      html = html.split(`src="${asset.path}"`).join(`src="${remote}"`);
      css = css.split(`url("${asset.path}")`).join(`url("${asset.url}")`);
    }
  result.html = html;
  result.css = css;
  // 只传正文结构，不把完整 HTML 文档和开发预览壳交给下游项目。
  const markup = html.match(/<body>\n([\s\S]*)\n<\/body>/)?.[1] || html;
  const zhCN = config.promptLang === "zh-CN";
  const p = zhCN ? zh : en;
  const warnings = result.diagnostics.filter((d) => d.severity === "warning");
  const shellQuote = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
  const commands = config.skipSlices
    ? []
    : result.assets.map(
        (a) =>
          `mkdir -p ${shellQuote(a.path.slice(0, a.path.lastIndexOf("/")))} && curl --fail --location -o ${shellQuote(a.path)} ${shellQuote(a.url)}`,
      );
  result.context =
    [
      `# ${design.name}\n${zhCN ? "画板" : "Viewport"}: ${result.viewport.width} × ${result.viewport.height}; unitScale=${config.unitScale}`,
      `## HTML${config.tailwindcss ? ` + Tailwind CSS ${config.twVersion}` : ""}\n\n\`\`\`html\n${markup}\n\`\`\``,
      ...(css.trim()
        ? [
            `## ${config.tailwindcss ? (zhCN ? "补充 CSS（必须加载）" : "Fallback CSS (required)") : "CSS"}\n\n\`\`\`css\n${css}\n\`\`\``,
          ]
        : []),
      ...(commands.length
        ? [
            `## ${zhCN ? "图片下载映射" : "Asset download mappings"} (${commands.length})\n\n\`\`\`sh\n${commands.join("\n")}\n\`\`\`\n${zhCN ? "以上为 POSIX shell 命令；Windows 使用等价下载命令。素材路径可按项目规范重命名，需同步所有引用。" : "Commands target POSIX shells; use equivalent downloads on Windows. Update all references if renaming assets."}`,
          ]
        : []),
      `## Design Tokens\n\n\`\`\`json\n${JSON.stringify(extractDesignTokens(design.genome, page.id), null, 2)}\n\`\`\``,
      ...(warnings.length
        ? [
            `## ${zhCN ? "转换诊断" : "Conversion diagnostics"}\n\n${warnings.map((w) => `- ${w.code}: ${w.message}`).join("\n")}`,
          ]
        : []),
      `## ${zhCN ? "实现指引" : "Implementation guide"}\n\n${p.guide(design.name)}`,
    ].join("\n\n") + "\n";
  return result;
}
