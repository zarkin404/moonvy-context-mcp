import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { GenerateResult } from "../core/types.js";
export async function writeDesignFiles(
  outDir: string,
  key: string,
  result: GenerateResult,
  preview?: { bytes: Buffer; mimeType: string },
) {
  // 隔离不同画板与配置产物，避免一次 CSS 导出覆盖另一次 Tailwind 结果。
  const dir = join(
    outDir,
    createHash("sha256").update(key).digest("hex").slice(0, 20),
  );
  await mkdir(dir, { recursive: true });
  const files: Array<{
    name: string;
    mimeType: string;
    path: string;
    uri: string;
  }> = [];
  const save = async (
    name: string,
    value: string | Buffer,
    mimeType: string,
  ) => {
    const path = join(dir, name);
    await writeFile(path, value);
    files.push({ name, mimeType, path, uri: pathToFileURL(path).href });
  };
  await save("context.md", result.context, "text/markdown");
  await save("index.html", result.html, "text/html");
  await save("style.css", result.css, "text/css");
  await save(
    "assets.json",
    JSON.stringify(result.assets, null, 2),
    "application/json",
  );
  await save(
    "diagnostics.json",
    JSON.stringify(result.diagnostics, null, 2),
    "application/json",
  );
  if (preview) {
    const ext = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    }[preview.mimeType];
    if (!ext) throw new Error("设计预览格式不受支持。");
    await save(`preview.${ext}`, preview.bytes, preview.mimeType);
  }
  return { dir, files };
}
