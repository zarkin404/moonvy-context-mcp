import type { Genome, Layer } from "../core/types.js";
import { colorToCSS, visible } from "../core/util.js";
export function extractDesignTokens(
  genome: Genome,
  pageId: string,
): Record<string, unknown> {
  const colors = new Set<string>(),
    fonts = new Set<string>(),
    sizes = new Set<number>(),
    weights = new Set<string>(),
    radii = new Set<number>(),
    gaps = new Set<number>();
  const lineHeights = new Map<string, { value: number; unit: string }>();
  let count = 0;
  function visit(layer: Layer, depth: number) {
    if (!visible(layer) || depth > 128 || ++count > 10000) return;
    for (const fill of layer.fills || [])
      if (visible(fill) && fill.type === "color") {
        const c = colorToCSS(fill.color, fill.opacity ?? 1);
        if (c) colors.add(c);
      }
    for (const segment of layer.textbox?.segments || []) {
      if (segment.fontName?.family) fonts.add(segment.fontName.family);
      if (segment.fontSize) sizes.add(segment.fontSize);
      if (segment.fontWeight || segment.fontName?.style)
        weights.add(String(segment.fontWeight || segment.fontName?.style));
      if (segment.lineHeight) {
        const v = {
          value: segment.lineHeight.value,
          unit: segment.lineHeight.unit || "px",
        };
        lineHeights.set(JSON.stringify(v), v);
      }
      for (const fill of segment.fills || []) {
        const c = colorToCSS(fill.color, fill.opacity ?? 1);
        if (c && visible(fill)) colors.add(c);
      }
    }
    for (const r of Array.isArray(layer.borderRadius)
      ? layer.borderRadius
      : [layer.borderRadius])
      if (typeof r === "number") radii.add(r);
    if (typeof layer.autoLayout?.mainAxisGap === "number")
      gaps.add(layer.autoLayout.mainAxisGap);
    for (const child of layer.children || []) visit(child, depth + 1);
  }
  const page = genome.pages?.find((p) => p.id === pageId);
  if (page) visit(page, 0);
  const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);
  return {
    sourceUnit: "px",
    colors: [...colors].sort(),
    fontFamilies: [...fonts].sort(),
    fontSizes: sorted(sizes),
    fontWeights: [...weights].sort(),
    lineHeights: [...lineHeights.values()],
    borderRadii: sorted(radii),
    autoLayoutGaps: sorted(gaps),
  };
}
