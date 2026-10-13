import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../dist/core/generator.js";
import { normalizeGenome } from "../dist/core/normalize.js";
import { createContext } from "../dist/utils/context.js";
import { extractDesignTokens } from "../dist/utils/design-tokens.js";
import { config } from "./fixtures.mjs";
const rect = { x: 0, y: 0, w: 100, h: 100 };
const sample = (children) => ({
  pages: [{ id: "page", rect, isFrame: true, children }],
});
test("画板与缩放参数拒绝不完整尺寸及未知格式", () => {
  assert.throws(() => generate({}, {}), /Page not found/);
  assert.throws(() => generate({ pages: [] }), /Page not found/);
  assert.throws(
    () => generate(sample([]), { styleFormat: "bad" }),
    /Unsupported/,
  );
  for (const size of [
    undefined,
    { ...rect, w: NaN },
    { ...rect, h: NaN },
    { ...rect, w: 0 },
    { ...rect, h: 0 },
  ])
    assert.throws(() => generate({ pages: [{ rect: size }] }), /dimensions/);
  for (const unitScale of [NaN, -1])
    assert.throws(() => generate(sample([]), { unitScale }), /unitScale/);
  const r = generate({ pages: [{ absoluteLayer: { rect } }] });
  assert.match(r.context, /Untitled/);
  assert.equal(r.assets.length, 0);
  assert.match(
    generate({
      pages: [{ id: "named-by-id", rect, snapshot: "image" }],
      images: { image: { url: "https://fs.moonvy.com/a.png" } },
    }).context,
    /named-by-id/,
  );
  assert.equal(
    generate({ pages: [{ rect, snapshot: "image" }] }).previewUrl,
    undefined,
  );
});
test("空文本、无分段文本、间隙、重叠及安全超链接正确输出", () => {
  const r = generate(
    sample([
      { id: "empty", rect, textbox: {} },
      { id: "plain", rect, textbox: { text: 'A & <B> "C"' } },
      {
        id: "seg",
        rect,
        textbox: {
          text: "abcdefghij",
          segments: [
            {
              start: 2,
              end: 4,
              hyperlink: { url: "https://example.com/a?x=1&y=2" },
            },
            { start: 2, end: 3 },
            { start: 6, end: 8, hyperlink: { url: "http://example.com/" } },
            { start: 8, end: 9, hyperlink: { url: "broken" } },
            { start: 1, end: 0 },
            {},
          ],
        },
      },
    ]),
    { styleFormat: "css", includeLayerMarker: true },
  );
  assert.match(r.html, /data-moonvy-layer-id="seg"/);
  assert.match(r.html, /A &amp; &lt;B&gt; &quot;C&quot;/);
  assert.match(r.html, />ab<\/span>/);
  assert.match(r.html, />ef<\/span>/);
  assert.match(r.html, />j<\/span>/);
  assert.match(r.html, /href="https:\/\/example.com\/a\?x=1&amp;y=2"/);
  assert.match(r.html, /noopener noreferrer/);
  assert.ok(!r.html.includes('href="broken"'));
});
test("素材尺寸模式、缺失资源、重复图层和固定布局产生明确诊断", () => {
  const data = sample([
    {
      id: "duplicate",
      rect,
      type: "layer",
      fills: [{ type: "color", color: { r: 1, g: 2, b: 3 } }],
    },
    {
      id: "duplicate",
      rect,
      subType: "vector",
      slices: { base: { id: "missing" } },
    },
    { id: "unresolved", rect, fills: [{ type: "image" }] },
    ...["FIT", "TILE", undefined].map((scaleMode, i) => ({
      id: `image-${i}`,
      rect,
      fills: [
        {
          type: "image",
          imageId: "asset",
          scaleMode,
          imageTransform: i === 0 ? [[1, 0]] : undefined,
          rotation: i === 1 ? 90 : undefined,
        },
      ],
    })),
    {
      id: "fixed",
      rect,
      autoLayout: { isAutoLayoutContainer: true, direction: "HORIZONTAL" },
      children: [{ rect }],
    },
    { rect, visible: false },
    { id: "empty-container", rect, children: [] },
  ]);
  data.images = { asset: { url: "https://fs.moonvy.com/a.png" } };
  const r = generate(data, { styleFormat: "css" });
  for (const code of [
    "duplicate-id",
    "shape-geometry-missing",
    "asset-fallback-missing",
    "image-fill-reference-missing",
    "image-transform-approx",
    "autolayout-fixed-output",
  ])
    assert.ok(
      r.diagnostics.some((d) => d.code === code),
      code,
    );
  for (const size of ["contain", "auto", "cover"])
    assert.match(r.css, new RegExp(`background-size: ${size}`));
  assert.match(r.css, /background-repeat: repeat/);
  const ctx = createContext(
    { id: "file", name: "图片", genome: data },
    { ...config, tailwindcss: true, promptLang: "en-US", skipSlices: true },
  );
  assert.match(ctx.css, /https:\/\/fs.moonvy.com\/a.png/);
  assert.match(ctx.context, /Conversion diagnostics/);
  assert.match(ctx.context, /Fallback CSS \(required\)/);
  assert.match(
    createContext({ id: "f", name: "x", genome: data }, config).context,
    /转换诊断/,
  );
  const chinese = createContext(
    { id: "f", name: "x", genome: data },
    { ...config, tailwindcss: true },
  );
  assert.match(chinese.context, /## 补充 CSS（必须加载）/);
  assert.ok(!chinese.context.includes("<body>"));
  assert.ok(!chinese.context.includes("<!doctype html>"));
});
test("无背景和不支持的 Tailwind 声明保留补充 CSS，空布局没有下载命令", () => {
  const result = createContext(
    { id: "f", name: "x", genome: sample([]) },
    { ...config, tailwindcss: true },
  );
  assert.ok(!result.context.includes("curl --fail"));
  assert.ok(!result.context.includes("## 补充 CSS"));
  assert.throws(
    () =>
      createContext(
        { id: "f", name: "x", genome: sample([]) },
        config,
        "missing",
      ),
    /不存在/,
  );
});
test("图层深度和数量限制拒绝不完整页面，共享样式不修改输入", () => {
  assert.throws(() => generate(sample([null])), TypeError);
  let child = { id: "leaf", rect, fillLink: "fill" };
  for (let i = 0; i < 131; i++)
    child = { id: `depth-${i}`, rect, children: [child] };
  const deep = sample([child]);
  assert.ok(generate(deep).diagnostics.some((d) => d.code === "layer-limit"));
  assert.throws(
    () => createContext({ id: "f", name: "x", genome: deep }, config),
    /图层数量或深度/,
  );
  const wide = sample(Array.from({ length: 10001 }, () => ({ rect })));
  assert.ok(generate(wide).diagnostics.some((d) => d.code === "layer-limit"));
  assert.deepEqual(normalizeGenome({}), {});
  const original = sample([
    {
      rect,
      fillLink: "missing",
      effectLink: "shadow",
      strokes: [{ fillLink: "fill" }],
    },
  ]);
  original.styles = {
    nonArray: {},
    fills: [{ id: "fill", data: [] }, {}],
    effects: [{ id: "shadow", data: [{ type: "shadow" }] }],
  };
  const normalized = normalizeGenome(original);
  assert.equal(normalized.pages[0].children[0].effects[0].type, "shadow");
  assert.deepEqual(normalized.pages[0].children[0].strokes[0].fills, []);
  assert.equal(original.pages[0].children[0].effects, undefined);
});
test("Design Tokens 去重排序并保留行高单位、字体权重和布局间距", () => {
  const g = sample([
    {
      rect,
      fills: [
        { type: "color", color: { r: 3, g: 2, b: 1 }, opacity: 0.5 },
        { type: "color" },
        { type: "color", visible: false },
      ],
      borderRadius: [4, 2, 4],
      autoLayout: { mainAxisGap: 8 },
      textbox: {
        segments: [
          {
            fontName: { family: "Arial", style: "Bold" },
            fontSize: 20,
            fontWeight: 700,
            lineHeight: { value: 120, unit: "per" },
            fills: [
              { type: "color", color: { r: 1, g: 2, b: 3 } },
              { type: "color" },
            ],
          },
          {
            fontName: { style: "Regular" },
            fontSize: 10,
            lineHeight: { value: 12 },
          },
        ],
      },
    },
    { visible: false },
    { rect, borderRadius: 1 },
  ]);
  const tokens = extractDesignTokens(g, "page");
  assert.deepEqual(tokens.fontSizes, [10, 20]);
  assert.deepEqual(tokens.fontFamilies, ["Arial"]);
  assert.deepEqual(tokens.fontWeights, ["700", "Regular"]);
  assert.deepEqual(tokens.borderRadii, [1, 2, 4]);
  assert.deepEqual(tokens.autoLayoutGaps, [8]);
  assert.deepEqual(tokens.lineHeights, [
    { value: 120, unit: "per" },
    { value: 12, unit: "px" },
  ]);
  assert.ok(tokens.colors.includes("rgba(3, 2, 1, 0.5)"));
  assert.deepEqual(extractDesignTokens({}, "missing").colors, []);
});

test("SVG 切图保留烘焙样式，不完整形状不伪造填充", () => {
  const data = sample([
    {
      id: "slice",
      rect,
      slices: { svg: { id: "svg" } },
      blend: { opacity: 0.5 },
    },
    { id: "bare", type: "layer", rect, children: [] },
  ]);
  data.images = { svg: { url: "https://fs.moonvy.com/a.svg" } };
  const r = generate(data, { styleFormat: "css" });
  assert.equal(r.assets[0].type, "svg");
  assert.match(r.html, /assets\/svg.svg/);
  assert.ok(!r.css.includes("opacity: 0.5"));
  assert.ok(!r.diagnostics.some((d) => d.layerId === "bare"));
});
