import type { CSSMap, Diagnostic, RenderNode, StyleFormat } from "./types.js";
import { cssBlock } from "./util.js";
const passthrough: Record<string, string> = {
  "display:flex": "flex",
  "display:block": "block",
  "display:inline-block": "inline-block",
  "display:grid": "grid",
  "display:none": "hidden",
  "position:absolute": "absolute",
  "position:relative": "relative",
  "position:fixed": "fixed",
  "flex-direction:row": "flex-row",
  "flex-direction:column": "flex-col",
  "justify-content:center": "justify-center",
  "justify-content:flex-start": "justify-start",
  "justify-content:flex-end": "justify-end",
  "justify-content:space-between": "justify-between",
  "align-items:center": "items-center",
  "align-items:flex-start": "items-start",
  "align-items:flex-end": "items-end",
  "flex-wrap:wrap": "flex-wrap",
  "flex-shrink:0": "shrink-0",
  "flex-grow:1": "grow",
  "overflow:hidden": "overflow-hidden",
  "overflow:scroll": "overflow-scroll",
  "overflow:auto": "overflow-auto",
  "white-space:nowrap": "whitespace-nowrap",
  "white-space:pre-wrap": "whitespace-pre-wrap",
  "text-align:center": "text-center",
  "text-align:left": "text-left",
  "text-align:right": "text-right",
  "text-align:justify": "text-justify",
  "font-weight:400": "font-normal",
  "font-weight:500": "font-medium",
  "font-weight:600": "font-semibold",
  "font-weight:700": "font-bold",
  "pointer-events:none": "pointer-events-none",
  "object-fit:fill": "object-fill",
};
const simple: Record<string, string> = {
  width: "w",
  height: "h",
  left: "left",
  right: "right",
  top: "top",
  bottom: "bottom",
  gap: "gap",
  padding: "p",
  "padding-top": "pt",
  "padding-bottom": "pb",
  "padding-left": "pl",
  "padding-right": "pr",
  margin: "m",
  "margin-top": "mt",
  "margin-bottom": "mb",
  "margin-left": "ml",
  "margin-right": "mr",
  "min-width": "min-w",
  "max-width": "max-w",
  "min-height": "min-h",
  "max-height": "max-h",
  "border-radius": "rounded",
  "font-size": "text",
  "line-height": "leading",
  "letter-spacing": "tracking",
  opacity: "opacity",
  "z-index": "z",
  "flex-grow": "grow",
  "flex-shrink": "shrink",
};
function arbitraryValue(v: string): string {
  return v
    .trim()
    .replace(/\s+/g, "_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/["']/g, "");
}
function token(property: string, value: string): string | undefined {
  const exact = passthrough[`${property}:${value}`];
  if (exact) return exact;
  if (value === "0px" || value === "0") {
    if (property === "border-radius") return "rounded-none";
    if (simple[property]) return `${simple[property]}-0`;
    if (property === "background") return "bg-transparent";
  }
  if (property === "color") return `text-[${arbitraryValue(value)}]`;
  if (property === "background-color") return `bg-[${arbitraryValue(value)}]`;
  if (property === "background" && /^rgba?\(/.test(value))
    return `bg-[${arbitraryValue(value)}]`;
  if (property === "background" && /^(#|transparent)/.test(value))
    return `bg-[${arbitraryValue(value)}]`;
  if (property === "font-family")
    return `font-[family-name:${arbitraryValue(value)}]`;
  if (property === "font-weight") return `font-[${arbitraryValue(value)}]`;
  if (property === "object-fit" && value === "cover") return "object-cover";
  if (property === "object-fit" && value === "contain") return "object-contain";
  if (property === "overflow" && value === "visible") return "overflow-visible";
  const p = simple[property];
  if (p) return `${p}-[${arbitraryValue(value)}]`;
  // v3/v4 均支持任意属性；不安全的类名分隔符和资源 URL 留在补充 CSS 中。
  if (!/[\n\r<>]/.test(value) && !/["']/.test(value) && !/url\(/i.test(value)) {
    return `[${property}:${arbitraryValue(value)}]`;
  }
  return;
}
export function applyStyleFormat(
  root: RenderNode,
  fmt: StyleFormat,
  diagnostics: Diagnostic[],
  strictTailwind = false,
): string {
  const rules: string[] = [];
  const visited = new Set<RenderNode>();
  const visit = (n: RenderNode) => {
    if (visited.has(n)) return;
    visited.add(n);
    const classId = n.generatedClass;
    if (fmt === "css") {
      if (classId) {
        n.classes.push(classId);
        if (Object.keys(n.styles).length)
          rules.push(cssBlock("." + classId, n.styles));
      }
    } else {
      const remainder: CSSMap = {};
      for (const [property, value] of Object.entries(n.styles)) {
        const mapped = token(property, value);
        if (mapped) n.classes.push(mapped);
        else remainder[property] = value;
      }
      if (Object.keys(remainder).length) {
        if (strictTailwind && fmt === "tailwind")
          throw Error(
            `Unconvertible Tailwind declarations: ${n.layerId ?? ""}: ${Object.keys(remainder).join(", ")}`,
          );
        if (classId) {
          n.classes.push(classId);
          rules.push(cssBlock("." + classId, remainder));
        }
        diagnostics.push({
          code: "tailwind-css-fallback",
          severity: "warning",
          message: `Preserved ${Object.keys(remainder).length} CSS declaration(s) in fallback.css`,
          layerId: n.layerId,
        });
      }
    }
    n.classes = [...new Set(n.classes.filter(Boolean))];
    for (const c of n.children) visit(c);
  };
  visit(root);
  return rules.filter(Boolean).join("\n\n") + "\n";
}
