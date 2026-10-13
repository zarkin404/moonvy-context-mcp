import type { CSSMap, Fill, Layer, Rect, TextSegment } from "./types.js";
import { colorToCSS, px, number, layoutIsFlex, visible } from "./util.js";
const pxIf = (v: unknown) => px(number(v));
export function gradientCSS(f: Fill): string | undefined {
  const g = f.gradient;
  if (!g || !Array.isArray(g.stops) || g.stops.length === 0) return;
  const stops = g.stops
    .map(
      (s: any) =>
        `${colorToCSS(s.color, f.opacity ?? 1) ?? "transparent"} ${Math.round(number(s.position) * 10000) / 100}%`,
    )
    .join(", ");
  if (g.type === "linear") {
    const dx = number(g.to?.x) - number(g.from?.x),
      dy = number(g.to?.y) - number(g.from?.y);
    // CSS 0 度朝上、90 度朝右，图像坐标的 y 轴朝下。
    const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    return `linear-gradient(${Number(deg.toFixed(3))}deg, ${stops})`;
  }
  if (g.type === "radial") return `radial-gradient(circle at center, ${stops})`;
  if (g.type === "angular") return `conic-gradient(${stops})`;
  return;
}
export function baseStyles(
  layer: Layer,
  rect: Rect,
  isRoot: boolean,
  isFlexItem: boolean,
  styleRoot: boolean,
): CSSMap {
  const css: CSSMap = {
    position: isRoot || isFlexItem ? "relative" : "absolute",
    width: px(rect.w),
    height: px(rect.h),
    "box-sizing": "border-box",
  };
  if (!isRoot && !isFlexItem) {
    css.left = px(rect.x);
    css.top = px(rect.y);
  }
  if (isRoot) {
    css.overflow = "hidden";
    css["box-sizing"] = "border-box";
  }
  const a = layer.autoLayout;
  if (layoutIsFlex(layer) && a) {
    css.display = "flex";
    css["flex-direction"] = a.direction === "VERTICAL" ? "column" : "row";
    if (a.mainAxisGap !== undefined) css.gap = pxIf(a.mainAxisGap);
    const main: { [k: string]: string } = {
      MIN: "flex-start",
      CENTER: "center",
      MAX: "flex-end",
      SPACE_BETWEEN: "space-between",
    };
    const cross: { [k: string]: string } = {
      MIN: "flex-start",
      CENTER: "center",
      MAX: "flex-end",
      BASELINE: "baseline",
    };
    if (main[a.mainAxisAlignItems ?? ""])
      css["justify-content"] = main[a.mainAxisAlignItems ?? ""];
    if (cross[a.crossAxisAlignItems ?? ""])
      css["align-items"] = cross[a.crossAxisAlignItems ?? ""];
    if (a.wrap === "WRAP") css["flex-wrap"] = "wrap";
    if (a.isBorderBox) css["box-sizing"] = "border-box";
    if (Array.isArray(a.padding)) css.padding = a.padding.map(pxIf).join(" ");
    else if (typeof a.padding === "number") css.padding = px(a.padding);
    else if (
      ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].some(
        (k) => a[k] !== undefined,
      )
    )
      css.padding = `${pxIf(a.paddingTop)} ${pxIf(a.paddingRight)} ${pxIf(a.paddingBottom)} ${pxIf(a.paddingLeft)}`;
  }
  if (isFlexItem) {
    css["flex-shrink"] = "0";
    if (number(a?.grow) > 0) css["flex-grow"] = String(number(a?.grow));
  }
  if (layer.blend?.isClip) css.overflow = "hidden";
  if (typeof layer.blend?.opacity === "number" && layer.blend.opacity !== 1)
    css.opacity = String(layer.blend.opacity);
  if (layer.borderRadius !== undefined) {
    const r = layer.borderRadius;
    if (typeof r === "number") css["border-radius"] = px(r);
    else if (Array.isArray(r) && r.length === 4)
      css["border-radius"] = r.map(px).join(" ");
  }
  // 仅在没有归一化矩阵时处理简单变换；复杂仿射变换仍需额外验证。
  if (!layer.absoluteLayer?.transform && layer.transform) {
    const t = layer.transform;
    const pieces: string[] = [];
    if (typeof t.rotate === "number") pieces.push(`rotate(${t.rotate}deg)`);
    if (Array.isArray(t.scale))
      pieces.push(`scale(${number(t.scale[0], 1)}, ${number(t.scale[1], 1)})`);
    if (Array.isArray(t.skew))
      pieces.push(`skew(${number(t.skew[0])}deg, ${number(t.skew[1])}deg)`);
    if (t.flipH) pieces.push("scaleX(-1)");
    if (t.flipV) pieces.push("scaleY(-1)");
    if (pieces.length) css.transform = pieces.join(" ");
  }
  const fills = (layer.fills ?? []).filter(visible);
  const bg: string[] = [];
  for (const f of fills) {
    if (f.type === "color") {
      const c = colorToCSS(f.color, f.opacity ?? 1);
      if (c) bg.push(c);
    } else if (f.type === "gradient") {
      const g = gradientCSS(f);
      if (g) bg.push(g);
    }
  }
  if (bg.length) css.background = bg.reverse().join(", ");
  const strokes = (layer.strokes ?? []).filter(visible);
  const stroke = strokes[strokes.length - 1];
  if (stroke) {
    const f = stroke.fills?.find((f: Fill) => f.type === "color" && visible(f));
    const color = colorToCSS(f?.color, f?.opacity ?? 1);
    if (color) {
      const w = number(stroke.w ?? stroke.weight ?? stroke.width ?? 1);
      if (layer.subType === "line") {
        const rotated =
          Math.abs(Math.abs(number(layer.transform?.rotate)) - 90) < 0.01;
        css.width = px(rotated ? w : rect.w);
        css.height = px(rotated ? rect.w : w);
        css.background = color;
        delete css.transform;
      } else {
        css.border = `${px(w)} solid ${color}`;
        css["box-sizing"] = "border-box";
      }
    }
  }
  const shadows: string[] = [];
  for (const e of (layer.effects ?? []).filter(visible)) {
    if (e.type === "shadow") {
      const c = colorToCSS(e.color, e.opacity ?? 1) ?? "rgba(0,0,0,0.15)";
      const off = e.offset ?? {};
      shadows.push(
        `${e.inner ? "inset " : ""}${px(number(off.x ?? e.x))} ${px(number(off.y ?? e.y))} ${px(number(e.blur ?? e.radius))} ${px(number(e.spread))} ${c}`,
      );
    } else if (e.type === "filterBlur")
      css.filter = `blur(${px(number(e.radius ?? e.blur))})`;
    else if (e.type === "filterBackdropBlur")
      css["backdrop-filter"] = `blur(${px(number(e.radius ?? e.blur))})`;
  }
  if (shadows.length) css["box-shadow"] = shadows.join(", ");
  return css;
}
export function textContainerStyles(l: Layer): CSSMap {
  const t = l.textbox;
  const align = t?.align ?? "left",
    v = t?.alignVertical ?? "top";
  const css: CSSMap = {
    width: "100%",
    height: "100%",
    "min-width": "0",
    display: "flex",
    "flex-direction": "column",
    "justify-content":
      v === "center" ? "center" : v === "bottom" ? "flex-end" : "flex-start",
    "white-space": "pre-wrap",
  };
  if (align === "center" || align === "right" || align === "justify")
    css["text-align"] = align;
  return css;
}
export function segmentStyles(seg: TextSegment, layer: Layer): CSSMap {
  const css: CSSMap = {};
  const name = seg.fontName?.family;
  if (name)
    css["font-family"] = /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(name)
      ? name
      : JSON.stringify(name);
  if (seg.fontSize && seg.fontSize > 0) css["font-size"] = px(seg.fontSize);
  if (seg.fontWeight) css["font-weight"] = String(seg.fontWeight);
  else if (seg.fontName?.style) {
    const m: { [k: string]: string } = {
      light: "300",
      medium: "500",
      regular: "400",
      semibold: "600",
      bold: "700",
      black: "900",
    };
    const v = m[seg.fontName.style.toLowerCase()];
    if (v) css["font-weight"] = v;
  }
  if (seg.fontName?.style?.toLowerCase().includes("italic"))
    css["font-style"] = "italic";
  const col = (seg.fills ?? layer.textbox?.fills ?? layer.fills ?? [])
    .filter(visible)
    .find((f) => f.type === "color");
  const color = colorToCSS(col?.color, col?.opacity ?? 1);
  if (color) css.color = color;
  if (seg.lineHeight) {
    css["line-height"] =
      seg.lineHeight.unit === "per"
        ? px((number(seg.lineHeight.value) * number(seg.fontSize, 14)) / 100)
        : px(number(seg.lineHeight.value));
  }
  if (seg.letterSpacing) {
    css["letter-spacing"] =
      seg.letterSpacing.unit === "per"
        ? px((number(seg.fontSize, 14) * seg.letterSpacing.value) / 100)
        : px(seg.letterSpacing.value);
  }
  if (seg.textDecoration && seg.textDecoration !== "none")
    css["text-decoration-line"] = seg.textDecoration;
  if (seg.textCase === "upper") css["text-transform"] = "uppercase";
  if (seg.textCase === "lower") css["text-transform"] = "lowercase";
  return css;
}
