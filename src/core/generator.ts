import { normalizeGenome } from "./normalize.js";
import type {
  Asset,
  Diagnostic,
  GenerateOptions,
  GenerateResult,
  Genome,
  Layer,
  RenderNode,
  TextSegment,
  CSSMap,
} from "./types.js";
import { AssetRegistry } from "./assets.js";
import { applyStyleFormat } from "./tailwind.js";
import { baseStyles, segmentStyles, textContainerStyles } from "./styles.js";
import {
  escapeHTML,
  layerClass,
  layoutIsFlex,
  resolveRect,
  visible,
  px,
} from "./util.js";
function makeNode(
  tag: RenderNode["tag"],
  name?: string,
  layerId?: string,
): RenderNode {
  return {
    tag,
    classes: [],
    styles: {},
    attrs: {},
    children: [],
    generatedClass: name,
    layerId,
  };
}
const safeUrl = (v: string): string | undefined => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? v : undefined;
  } catch {
    return;
  }
};
function markup(node: RenderNode, depth = 0, markers = false): string {
  const ind = " ".repeat(depth * 2),
    attrs: Record<string, string> = { ...node.attrs };
  if (node.classes.length) attrs.class = node.classes.join(" ");
  if (markers && node.layerId) attrs["data-moonvy-layer-id"] = node.layerId;
  const as = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeHTML(v)}"`)
    .join("");
  if (node.tag === "img" || node.tag === "br")
    return `${ind}<${node.tag}${as} />`;
  if (node.children.length === 0)
    return `${ind}<${node.tag}${as}>${escapeHTML(node.text ?? "")}</${node.tag}>`;
  const children = node.children
    .map((n) => markup(n, depth + 1, markers))
    .join("\n");
  return `${ind}<${node.tag}${as}>\n${children}\n${ind}</${node.tag}>`;
}
function textChildren(layer: Layer, cls: string): RenderNode[] {
  const value = String(layer.textbox?.text ?? ""),
    segs = layer.textbox?.segments ?? [];
  const text = makeNode("div", cls + "__text", layer.id);
  text.styles = textContainerStyles(layer);
  const content = makeNode("span", cls + "__text-content");
  content.styles = {
    display: "block",
    width: "100%",
    "min-width": "0",
    "white-space": /[\r\n]/.test(value) ? "pre-wrap" : "nowrap",
  };
  // 文本容器使用源文字的基础排版，避免 HTML 和框架不同的继承字体撑高行盒。
  if (segs.length)
    Object.assign(content.styles, segmentStyles(segs[0]!, layer));
  text.children.push(content);
  if (!value) {
    return [text];
  }
  if (!segs.length) {
    content.text = value;
    return [text];
  }
  const normalized = segs
    .map((s, i) => ({
      segment: s,
      start: Math.max(
        0,
        Math.min(value.length, Math.trunc(Number(s.start ?? 0))),
      ),
      end: Math.max(0, Math.min(value.length, Math.trunc(Number(s.end ?? 0)))),
      index: i,
    }))
    .filter((x) => x.end > x.start)
    .sort((a, b) => a.start - b.start || a.index - b.index);
  let offset = 0;
  for (const s of normalized) {
    const start = Math.max(s.start, offset),
      end = Math.max(start, s.end);
    if (start > offset) {
      const plain = makeNode("span");
      plain.text = value.slice(offset, start);
      content.children.push(plain);
    }
    if (end <= start) continue;
    const el = makeNode("span", cls + `__text-${s.index}`);
    el.styles = segmentStyles(s.segment, layer);
    el.text = value.slice(start, end);
    const href = safeUrl(s.segment.hyperlink?.url ?? "");
    if (href) {
      const link = makeNode("a");
      link.attrs.href = href;
      link.attrs.target = "_blank";
      link.attrs.rel = "noopener noreferrer";
      link.children.push(el);
      content.children.push(link);
    } else content.children.push(el);
    offset = end;
  }
  if (offset < value.length) {
    const plain = makeNode("span");
    plain.text = value.slice(offset);
    content.children.push(plain);
  }
  return [text];
}
function semanticAssetNames(
  assets: Asset[],
  nodeMap: Record<string, string>,
): string[] {
  return assets.map((a) => `- \`${a.path}\` ← ${a.url}`);
}
function contextMarkdown(
  title: string,
  html: string,
  css: string,
  assets: Asset[],
  options: GenerateOptions,
  viewport: { width: number; height: number },
  hasFallback: boolean,
): string {
  const format = options.styleFormat ?? "tailwind";
  const parts = [
    `# Design: ${title}`,
    `Viewport: ${viewport.width} × ${viewport.height}`,
    `Style format: ${format}`,
    "",
    `## HTML${format !== "css" ? " + Tailwind" : ""}`,
    "```html",
    html,
    "```",
  ];
  if (css.trim())
    parts.push(
      "",
      "## " +
        (format === "css" ? "CSS" : "Fallback CSS (required; do not discard)"),
      "```css",
      css,
      "```",
    );
  parts.push("", `## Image download mappings (${assets.length} assets)`);
  parts.push(
    ...(assets.length
      ? semanticAssetNames(assets, {})
      : ["No external image assets required."]),
  );
  parts.push(
    "",
    "## Instructions for coding agent",
    "1. Inspect the target repository before modifying code: framework, Tailwind version, aliases, fonts, existing components and design tokens.",
    "2. Adapt the HTML into the target framework; the static reference is not a business-logic specification.",
    "3. Preserve precise sizes, typography, colors and visual hierarchy unless the target project explicitly requires responsive behavior.",
    "4. Use/download the listed image assets into the repository with safe, meaningful names; update all image references consistently.",
    "5. If fallback CSS is provided, load it: do not silently discard unsupported visual properties.",
    "6. Implement interactions only from explicit product requirements. Do not infer API endpoints, initial values or navigation.",
    "7. Compare the result against the supplied design screenshot when available; report unsupported features and deviations.",
    "8. Avoid adding design-layer IDs, meaningless pgn classes or runtime Tailwind CDN to production code.",
  );
  return parts.join("\n") + "\n";
}
export function generate(
  genome: Genome,
  options: GenerateOptions = {},
): GenerateResult {
  genome = normalizeGenome(genome);
  const diagnostics: Diagnostic[] = [],
    format = options.styleFormat ?? "tailwind";
  if (!["css", "tailwind", "hybrid"].includes(format))
    throw Error("Unsupported styleFormat");
  const page =
    genome.pages?.find((p) => p.id === options.pageId) ??
    (!options.pageId ? genome.pages?.[0] : undefined);
  if (!page) throw Error(`Page not found: ${options.pageId ?? "(first page)"}`);
  const rect = page.absoluteLayer?.rect ?? page.rect;
  if (
    !rect ||
    !Number.isFinite(rect.w) ||
    !Number.isFinite(rect.h) ||
    rect.w <= 0 ||
    rect.h <= 0
  )
    throw Error("Invalid page dimensions");
  const viewport = { width: rect.w, height: rect.h };
  const root = makeNode("div", "pgn-root");
  root.styles = {
    position: "relative",
    width: px(viewport.width),
    height: px(viewport.height),
    overflow: "hidden",
    "box-sizing": "border-box",
  };
  const used = new Set<string>(),
    ids = new Set<string>(),
    nodeMap: Record<string, string> = {};
  const registry = new AssetRegistry(genome, diagnostics);
  const stats = {
    visibleLayers: 0,
    renderedLayers: 0,
    slices: 0,
    textNodes: 0,
  };
  let visited = 0;
  function walk(
    l: Layer,
    path: string,
    parent: Layer | undefined,
    isRoot: boolean,
    flexItem: boolean,
    depth: number,
  ): RenderNode | undefined {
    if (depth > 128 || ++visited > 10000) {
      diagnostics.push({
        code: "layer-limit",
        severity: "error",
        message: "Layer count/depth limit reached",
        layerId: l.id,
      });
      return;
    }
    if (!isRoot && !visible(l)) return;
    stats.visibleLayers++;
    const cls = isRoot ? "pgn-root" : layerClass(l, path, used);
    if (l.id) {
      if (ids.has(l.id))
        diagnostics.push({
          code: "duplicate-id",
          severity: "warning",
          message: "Duplicate layer id",
          layerId: l.id,
        });
      ids.add(l.id);
      nodeMap[l.id] = cls;
    }
    const n = isRoot ? root : makeNode("div", cls, l.id);
    stats.renderedLayers++;
    n.styles = baseStyles(
      l,
      resolveRect(l, parent, isRoot),
      isRoot,
      flexItem,
      isRoot,
    );
    const hasSlice = !!(
      l.slices?.max?.id ||
      l.slices?.base?.id ||
      l.slices?.svg?.id
    );
    const hasMissingImage =
      (l.fills ?? []).some((f) => f.type === "image" && f.visible !== false) &&
      registry.imageFills(l).length === 0;
    const unknownShape =
      l.type === "layer" &&
      !l.subType &&
      !l.children?.length &&
      !l.textbox &&
      !l.borderRadius &&
      (l.fills ?? []).some((f) => f.visible !== false);
    const shouldSlice =
      !isRoot && (l.subType === "vector" || hasSlice || hasMissingImage);
    if (hasMissingImage)
      diagnostics.push({
        code: "image-fill-reference-missing",
        severity: "warning",
        message: "图像填充没有素材引用，需要原始素材或预览裁切回退。",
        layerId: l.id,
      });
    if (unknownShape && !hasSlice)
      diagnostics.push({
        code: "shape-geometry-missing",
        severity: "warning",
        message: "图层未携带形状路径，矩形近似需要对照原图。",
        layerId: l.id,
      });
    const slice = shouldSlice ? registry.slice(l) : undefined;
    if (slice) {
      stats.slices++;
      const img = makeNode("img", cls + "__slice");
      img.attrs = { src: slice.path, alt: "", "aria-hidden": "true" };
      img.styles = {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        "object-fit": "fill",
        "pointer-events": "none",
      };
      n.children.push(img);
      // 保留几何与裁剪，移除已烘焙到切图中的视觉样式。
      for (const prop of [
        "background",
        "border",
        "box-shadow",
        "filter",
        "backdrop-filter",
      ])
        delete n.styles[prop];
      if ("opacity" in n.styles) delete n.styles.opacity;
      // 导出切图已经包含源图层旋转，不能再在 CSS 中重复旋转。
      delete n.styles.transform;
      diagnostics.push({
        code: "asset-fallback-used",
        severity: "info",
        message: "Rendered exported slice in place of subtree",
        layerId: l.id,
      });
      return n;
    }
    if (shouldSlice)
      diagnostics.push({
        code: "asset-fallback-missing",
        severity: "warning",
        message: "Slice unavailable, falling back to layer geometry",
        layerId: l.id,
      });
    for (const { asset, fill } of registry.imageFills(l)) {
      const s =
        fill.scaleMode === "FIT"
          ? "contain"
          : fill.scaleMode === "TILE"
            ? "auto"
            : "cover";
      n.styles["background-image"] = `url("${asset.path}")`;
      n.styles["background-size"] = s;
      n.styles["background-position"] = "center";
      n.styles["background-repeat"] =
        fill.scaleMode === "TILE" ? "repeat" : "no-repeat";
      if (fill.imageTransform || fill.rotation)
        diagnostics.push({
          code: "image-transform-approx",
          severity: "warning",
          message: "Image crop transform/rotation requires further validation",
          layerId: l.id,
        });
    }
    if (l.textbox) {
      stats.textNodes++;
      n.children.push(...textChildren(l, cls));
    }
    const children = l.children ?? [],
      flex = layoutIsFlex(l);
    if (l.autoLayout?.isAutoLayoutContainer && !flex)
      diagnostics.push({
        code: "autolayout-fixed-output",
        severity: "info",
        message: "Some children were not AUTO: fixed positioning was used",
        layerId: l.id,
      });
    for (let i = 0; i < children.length; i++) {
      // 空子图层已在规范化阶段拒绝，不能在此静默丢弃设计信息。
      const child = children[i]!;
      const rendered = walk(child, `${path}-${i}`, l, false, flex, depth + 1);
      if (rendered) n.children.push(rendered);
    }
    return n;
  }
  walk(page, "0", undefined, true, false, 0);
  // 完成结构遍历后统一编码样式。
  const scale = options.unitScale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) throw Error("Invalid unitScale");
  function scaleStyles(n: RenderNode) {
    for (const [k, v] of Object.entries(n.styles))
      n.styles[k] = v.replace(/(-?(?:\d*\.)?\d+)px/g, (_, raw) =>
        px(Number(raw) * scale),
      );
    for (const c of n.children) scaleStyles(c);
  }
  if (scale !== 1) scaleStyles(root);
  const fallbackCSS = applyStyleFormat(
    root,
    format,
    diagnostics,
    options.strictTailwind ?? false,
  );
  const body = markup(root, 0, options.includeLayerMarker ?? false);
  const assets = registry.listing();
  const htmlDoc = [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8" />',
    "<style>html,body{margin:0;padding:0}</style>",
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    // CDN 只用于独立 HTML 预览，context.md 中的实现代码不包含预览壳。
    format !== "css"
      ? `<script src="${options.tailwindVersion === 4 ? "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4" : "https://cdn.tailwindcss.com"}"></script>`
      : "",
    format === "css" || fallbackCSS.trim()
      ? '<link rel="stylesheet" href="style.css" />'
      : "",
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n");
  const previewUrl = page.snapshot
    ? genome.images?.[page.snapshot]?.url
    : undefined;
  const context = contextMarkdown(
    page.name ?? page.id ?? "Untitled",
    body,
    fallbackCSS,
    assets,
    options,
    viewport,
    !!fallbackCSS.trim(),
  );
  return {
    html: htmlDoc,
    css: fallbackCSS,
    context,
    viewport,
    assets,
    previewUrl,
    diagnostics,
    nodeMap,
    stats,
    styleFormat: format,
  };
}
