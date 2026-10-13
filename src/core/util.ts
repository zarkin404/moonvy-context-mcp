import type { Color, Layer, Rect } from "./types.js";
export function fnv1a36(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 0x1000193);
  return (h >>> 0).toString(36);
}
export function escapeHTML(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
export function px(n: number): string {
  return (Number.isInteger(n) ? n : Number(n.toFixed(3))) + "px";
}
export function number(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
export function colorToCSS(color?: Color, opacity = 1): string | undefined {
  if (!color) return;
  const r = Math.round(clamp(color.r, 0, 255)),
    g = Math.round(clamp(color.g, 0, 255)),
    b = Math.round(clamp(color.b, 0, 255)),
    a = clamp((color.alpha ?? 1) * opacity, 0, 1);
  return a === 1
    ? `rgb(${r} ${g} ${b})`
    : `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(4))})`;
}
const aliases: [RegExp, string][] = [
  [/导航|顶栏|页眉/i, "nav"],
  [/底栏|页脚|底部/i, "footer"],
  [/副标题/i, "subtitle"],
  [/标题/i, "title"],
  [/描述|简介|说明/i, "desc"],
  [/按钮|按键/i, "btn"],
  [/头像/i, "avatar"],
  [/图标/i, "icon"],
  [/图片|插画|照片|大图/i, "img"],
  [/背景|底图/i, "bg"],
  [/搜索/i, "search"],
  [/输入框|表单/i, "input"],
  [/标签|选项卡/i, "tab"],
  [/卡片/i, "card"],
  [/列表/i, "list"],
  [/条目|项目/i, "item"],
  [/弹窗|对话框/i, "dialog"],
  [/文字|文本/i, "text"],
  [/价格/i, "price"],
  [/数量/i, "count"],
];
export function layerClass(l: Layer, path: string, used: Set<string>): string {
  const id = String(l.id || ""),
    name = String(l.name || "").trim(),
    generic =
      /^(Rectangle|Frame|Group|Vector|Slice|Ellipse|Component|Polygon|Line|Text|Star)\s*\d*$/i;
  let alias = "";
  if (id && !/^\d+:\d+$/.test(id) && !/^[0-9a-f-]{16,}$/i.test(id))
    alias = id
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  if (!alias && name && !generic.test(name)) {
    for (const [re, val] of aliases)
      if (re.test(name)) {
        alias = val;
        break;
      }
    if (!alias)
      alias = name
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
        .slice(0, 32);
  }
  if (!alias)
    alias = l.textbox
      ? "text"
      : l.slices || l.fills?.some((x) => x.type === "image")
        ? "img"
        : l.autoLayout?.isAutoLayoutContainer
          ? "box"
          : l.subType === "vector"
            ? "vector"
            : "item";
  let base = `pgn-node-${alias}-${fnv1a36(id || path)}`,
    nameOut = base,
    count = 2;
  while (used.has(nameOut)) nameOut = `${base}-${count++}`;
  used.add(nameOut);
  return nameOut;
}
export function visible(l: Layer): boolean {
  return (
    l.visible !== false &&
    l.editState?.hide !== true &&
    l.blend?.visible !== false
  );
}
export function layoutIsFlex(l: Layer): boolean {
  const a = l.autoLayout;
  return (
    !!a?.isAutoLayoutContainer &&
    (a.direction === "HORIZONTAL" || a.direction === "VERTICAL") &&
    (l.children ?? [])
      .filter(visible)
      .every((c) => c.autoLayout?.position === "AUTO")
  );
}
export function resolveRect(
  l: Layer,
  parent: Layer | undefined,
  isRoot: boolean,
): Rect {
  const r = l.absoluteLayer?.rect ?? l.rect ?? { x: 0, y: 0, w: 0, h: 0 };
  if (isRoot) return { x: 0, y: 0, w: number(r.w), h: number(r.h) };
  if (l.absoluteLayer?.rect) {
    const p = parent?.absoluteLayer?.rect;
    return {
      x: number(r.x) - number(p?.x),
      y: number(r.y) - number(p?.y),
      w: number(r.w),
      h: number(r.h),
    };
  }
  // 普通分组中的坐标仍相对最近的画板，转为局部 CSS 坐标时需减去分组原点。
  if (parent && !parent.isFrame && parent.rect) {
    return {
      x: number(r.x) - number(parent.rect.x),
      y: number(r.y) - number(parent.rect.y),
      w: number(r.w),
      h: number(r.h),
    };
  }
  return { x: number(r.x), y: number(r.y), w: number(r.w), h: number(r.h) };
}
export function cssBlock(
  selector: string,
  styles: Record<string, string>,
): string {
  const s = Object.entries(styles)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return s ? `${selector} {\n${s}\n}` : "";
}
export function kebab(v: string): string {
  return v.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
