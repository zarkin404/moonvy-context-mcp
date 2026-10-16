import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, realpath } from "node:fs/promises";
import { join, resolve, dirname, basename, relative } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import type { GenerateResult } from "../core/types.js";
import type { ServerConfig } from "../types/config.js";

export function getDesignOutputKey(
  config: ServerConfig,
  designId: string,
  pageId: string,
): string {
  return JSON.stringify([
    designId,
    pageId,
    config.tailwindcss,
    config.twVersion,
    config.skipSlices,
    config.unitScale,
    config.promptLang,
    config.previewFallback,
  ]);
}

export function getDesignOutputDir(
  outDir: string,
  key: string,
  title: string,
): string {
  // 保留可读的页面标题，清理跨平台文件名禁用字符，并限制 Unicode 长度。
  const cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f.]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const name =
    Array.from(cleaned).slice(0, 60).join("").replace(/-+$/g, "") || "设计稿";
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 8);
  return resolve(outDir, `${name}-${hash}`);
}

export async function writeDesignFiles(
  outDir: string,
  key: string,
  title: string,
  result: GenerateResult,
  preview?: { bytes: Buffer; mimeType: string },
  downloadAsset?: (
    url: string,
    limit: number,
  ) => Promise<{ bytes: Buffer; mimeType: string }>,
) {
  // 隔离不同画板与配置产物，避免一次 CSS 导出覆盖另一次 Tailwind 结果。
  const dir = getDesignOutputDir(outDir, key, title);
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
  if (downloadAsset) {
    for (const asset of result.assets) {
      let bytes: Buffer;
      if (asset.url.startsWith("file:")) {
        // Genome 可能携带任意 file URI，只允许复制本服务生成的预览裁切图。
        const root = await realpath(dir);
        const source = await realpath(fileURLToPath(asset.url));
        if (
          relative(root, source) !== join("assets", basename(source)) ||
          !/^preview-crop-[a-f0-9]{16}\.png$/.test(basename(source))
        )
          throw new Error("只能缓存本服务生成的预览裁切素材。");
        bytes = await readFile(source);
      } else {
        const downloaded = await downloadAsset(asset.url, 20 * 1024 * 1024);
        if (!downloaded.mimeType.startsWith("image/"))
          throw new Error("参考图片不是受支持的图片格式。");
        bytes = downloaded.bytes;
      }
      const target = join(dir, asset.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
  }
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
