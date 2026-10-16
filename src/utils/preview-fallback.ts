import { PNG } from "pngjs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import type { Genome, Layer, Diagnostic } from "../core/types.js";
import { normalizeGenome } from "../core/normalize.js";
import { visible } from "../core/util.js";

export async function addPreviewFallback(
  input: Genome,
  pageId: string | undefined,
  preview: { bytes: Buffer; mimeType: string },
  outDir: string,
): Promise<{ genome: Genome; diagnostics: Diagnostic[] }> {
  const genome = normalizeGenome(input),
    diagnostics: Diagnostic[] = [];
  const page =
    genome.pages?.find((p) => p.id === pageId) ||
    (!pageId ? genome.pages?.[0] : undefined);
  if (!page?.rect || preview.mimeType !== "image/png")
    return { genome, diagnostics };
  const image = PNG.sync.read(preview.bytes),
    scaleX = image.width / page.rect.w,
    scaleY = image.height / page.rect.h;
  // 仅在预览与所选画板的宽高比例一致时裁切；避免从多画板总览取错位置。
  if (Math.abs(scaleX - scaleY) > Math.max(scaleX, scaleY) * 0.02)
    return { genome, diagnostics };
  const missingImage = (n: Layer) =>
    (n.fills || []).some(
      (f) =>
        f.type === "image" &&
        f.visible !== false &&
        !f.imageId &&
        !f.imageHash &&
        !f.imageRef &&
        !f.image &&
        !f.url &&
        !f.id,
    );
  const hasSlice = (n: Layer) =>
    !![
      n.slices?.max,
      n.slices?.base,
      n.slices?.svg,
      n.snapshot ? { id: n.snapshot } : undefined,
    ].find((ref) => ref?.id && genome.images?.[ref.id]?.url);
  let count = 0;
  async function visit(
    n: Layer,
    parentFrame: { x: number; y: number },
    root = false,
    depth = 0,
  ) {
    if (!visible(n) || ++count > 10000 || depth > 128 || !n.rect) return;
    const bounds = {
      x: root ? 0 : parentFrame.x + n.rect.x,
      y: root ? 0 : parentFrame.y + n.rect.y,
      w: n.rect.w,
      h: n.rect.h,
    };
    if (!root && hasSlice(n)) return;
    const missingShape =
      n.type === "layer" &&
      !n.subType &&
      !n.children?.length &&
      !n.textbox &&
      !n.borderRadius &&
      (n.fills || []).some((f) => f.visible !== false);
    // 缺图的实例在自身边界裁切，保留其已烘焙的翻转；不改变上层业务容器。
    const unresolvedInstance =
      n.type === "instance" && n.children?.some(missingImage);
    if (!root && (missingImage(n) || missingShape || unresolvedInstance)) {
      const x = Math.max(0, Math.floor(bounds.x * scaleX)),
        y = Math.max(0, Math.floor(bounds.y * scaleY));
      const right = Math.min(
          image.width,
          Math.ceil((bounds.x + bounds.w) * scaleX),
        ),
        bottom = Math.min(
          image.height,
          Math.ceil((bounds.y + bounds.h) * scaleY),
        );
      if (
        bounds.x < 0 ||
        bounds.y < 0 ||
        right <= x ||
        bottom <= y ||
        bounds.x + bounds.w > page!.rect!.w ||
        bounds.y + bounds.h > page!.rect!.h
      )
        return;
      const cropped = new PNG({ width: right - x, height: bottom - y });
      for (let yy = y; yy < bottom; yy++)
        image.data.copy(
          cropped.data,
          (yy - y) * cropped.width * 4,
          (yy * image.width + x) * 4,
          (yy * image.width + right) * 4,
        );
      const bytes = PNG.sync.write(cropped),
        id =
          "preview-crop-" +
          createHash("sha256")
            .update(String(n.id))
            .update(bytes)
            .digest("hex")
            .slice(0, 16);
      const path = join(outDir, "assets", `${id}.png`);
      await mkdir(join(outDir, "assets"), { recursive: true });
      await writeFile(path, bytes);
      genome.images ??= {};
      genome.images[id] = { type: "png", url: pathToFileURL(path).href };
      n.slices = { max: { id, ratio: scaleX } };
      diagnostics.push({
        code: "preview-crop-fallback",
        severity: "warning",
        message: `图层「${n.name || n.id}」缺少原始素材或形状数据，使用设计预览局部裁切；含原背景，不是透明源素材。`,
        layerId: n.id,
      });
      return;
    }
    const frame = n.isFrame ? { x: bounds.x, y: bounds.y } : parentFrame;
    for (const child of n.children || [])
      await visit(child, frame, false, depth + 1);
  }
  await visit(page, { x: 0, y: 0 }, true);
  return { genome, diagnostics };
}
