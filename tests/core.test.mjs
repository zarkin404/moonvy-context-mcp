import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../dist/core/generator.js";
import { createContext } from "../dist/utils/context.js";
import { config, genome, url } from "./fixtures.mjs";

test("CSS 保留画板、文本和切图，切图子树不重复渲染", () => {
  const r = generate(genome, { styleFormat: "css" });
  assert.deepEqual(r.viewport, { width: 390, height: 844 });
  assert.equal(r.assets.length, 1);
  assert.match(r.html, /Hello &lt;Moonvy&gt;/);
  assert.ok(!r.html.includes("切图中的文字"));
  assert.ok(!r.html.includes("隐藏文字"));
  assert.match(r.css, /width: 390px/);
  assert.ok(!r.html.includes("data-moonvy-layer-id"));
});
test("文字分段支持样式、换行与安全链接", () => {
  const r = generate(
    {
      pages: [
        {
          id: "p",
          rect: { x: 0, y: 0, w: 100, h: 100 },
          children: [
            {
              id: "text",
              rect: { x: 0, y: 0, w: 90, h: 20 },
              textbox: {
                text: "ABC\nD",
                segments: [
                  {
                    start: 0,
                    end: 3,
                    fontSize: 16,
                    hyperlink: { url: "javascript:alert(1)" },
                  },
                  { start: 3, end: 5, fontSize: 20 },
                ],
              },
            },
          ],
        },
      ],
    },
    { styleFormat: "css" },
  );
  assert.ok(!r.html.includes("javascript:"));
  assert.match(r.css, /font-size: 20px/);
  assert.match(r.css, /pre-wrap/);
});
test("Tailwind 保留无法转换的 CSS，严格模式拒绝静默丢失", () => {
  const data = {
    pages: [
      {
        id: "p",
        rect: { x: 0, y: 0, w: 100, h: 100 },
        children: [
          {
            id: "image",
            rect: { x: 0, y: 0, w: 20, h: 20 },
            fills: [{ type: "image", imageId: "img" }],
          },
        ],
      },
    ],
    images: { img: { url: "https://fs.moonvy.com/test.png", type: "png" } },
  };
  const r = generate(data, { styleFormat: "tailwind" });
  assert.match(r.html, /w-\[100px\]/);
  assert.match(r.css, /background-image/);
  assert.ok(r.diagnostics.some((d) => d.code === "tailwind-css-fallback"));
  assert.throws(
    () => generate(data, { styleFormat: "tailwind", strictTailwind: true }),
    /Unconvertible/,
  );
  assert.match(r.html, /href="style\.css"/);
  assert.ok(!r.context.includes("<script"));
});
test("单位缩放在 CSS 与 Tailwind 中保持一致，不缩放百分比", () => {
  const css = generate(genome, { styleFormat: "css", unitScale: 2 });
  assert.match(css.css, /width: 780px/);
  assert.match(css.css, /width: 100%/);
  const tw = generate(genome, { styleFormat: "tailwind", unitScale: 2 });
  assert.match(tw.html, /w-\[780px\]/);
  assert.throws(() => generate(genome, { unitScale: 0 }), /unitScale/);
});
test("上下文支持中文、英文、Tokens、远程素材模式", () => {
  const design = { id: "file", name: "测试设计", genome };
  const c = createContext(design, config);
  assert.match(c.context, /实现指引/);
  assert.match(c.context, /curl --fail/);
  assert.match(c.context, /Design Tokens/);
  const remote = createContext(design, {
    ...config,
    skipSlices: true,
    promptLang: "en-US",
  });
  assert.ok(!remote.context.includes("curl --fail"));
  assert.match(remote.html, /src="https:\/\/fs.moonvy.com/);
  assert.match(remote.context, /Implementation guide/);
});
test("多画板要求明确选择，不默默返回首个画板", () => {
  const multi = {
    ...genome,
    pages: [
      ...genome.pages,
      { id: "other", rect: { x: 0, y: 0, w: 100, h: 100 } },
    ],
  };
  assert.throws(
    () => createContext({ id: "f", name: "x", genome: multi }, config),
    /pageId/,
  );
  assert.equal(
    createContext({ id: "f", name: "x", genome: multi }, config, "other")
      .viewport.width,
    100,
  );
  assert.throws(
    () => generate(genome, { pageId: "missing" }),
    /Page not found/,
  );
});

test("隐藏填充、共享样式与 padding 数组正确转换", () => {
  const sample = {
    styles: {
      fillStyles: [
        {
          id: "linked",
          data: [{ type: "color", color: { r: 1, g: 2, b: 3 } }],
        },
      ],
    },
    pages: [
      {
        id: "p",
        isFrame: true,
        rect: { x: 0, y: 0, w: 100, h: 100 },
        fills: [
          { type: "color", visible: false, color: { r: 255, g: 255, b: 255 } },
        ],
        autoLayout: {
          isAutoLayoutContainer: true,
          direction: "HORIZONTAL",
          padding: [1, 2, 3, 4],
          isBorderBox: true,
        },
        children: [
          {
            id: "c",
            rect: { x: 0, y: 0, w: 10, h: 10 },
            autoLayout: { position: "AUTO" },
            fillLink: "linked",
          },
        ],
      },
    ],
  };
  const r = generate(sample, { styleFormat: "css" });
  assert.match(r.css, /padding: 1px 2px 3px 4px/);
  assert.match(r.css, /box-sizing: border-box/);
  assert.match(r.css, /rgb\(1 2 3\)/);
  assert.ok(!r.css.includes("rgb(255 255 255)"));
  assert.equal(sample.pages[0].children[0].fills, undefined);
});
test("已旋转的切图不再次旋转，零高度线条可见", () => {
  const sample = structuredClone(genome);
  sample.pages[0].children[1].transform = { rotate: -90 };
  sample.pages[0].children.push({
    id: "line",
    subType: "line",
    rect: { x: 0, y: 100, w: 80, h: 0 },
    strokes: [
      { w: 0.5, fills: [{ type: "color", color: { r: 1, g: 2, b: 3 } }] },
    ],
  });
  const r = generate(sample, { styleFormat: "css" });
  assert.ok(!r.css.includes("rotate(-90"));
  assert.match(r.css, /height: 0.5px/);
});

test("Tailwind 字体族使用类型提示，避免误编译为字重", () => {
  const r = generate(genome, { styleFormat: "tailwind" });
  assert.match(r.html, /font-\[family-name:Arial\]/);
});

test("文字容器继承源排版，避免宿主默认字体撑高行盒", () => {
  const r = generate(genome, { styleFormat: "css" });
  assert.match(
    r.css,
    /__text-content \{[^}]*font-family: Arial;[^}]*font-size: 16px;/s,
  );
});

test("独立 Tailwind HTML 按版本加载 CDN，CSS 模式与项目上下文不引入脚本", () => {
  const css = generate(genome, { styleFormat: "css" });
  assert.ok(!css.html.includes("<script"));
  assert.match(
    generate(genome).html,
    /<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/,
  );
  for (const tailwindVersion of [3, 4])
    for (const styleFormat of ["tailwind", "hybrid"]) {
      const result = generate(genome, { styleFormat, tailwindVersion });
      const cdn =
        tailwindVersion === 4
          ? "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"
          : "https://cdn.tailwindcss.com";
      const script = `<script src="${cdn}"></script>`;
      assert.ok(result.html.includes(script));
      assert.ok(result.html.indexOf(script) < result.html.indexOf("</head>"));
      assert.equal((result.html.match(/<script /g) || []).length, 1);
      assert.ok(!result.context.includes("<script"));
      const context = createContext(
        { id: "f", name: "x", genome },
        {
          ...config,
          tailwindcss: true,
          twVersion: tailwindVersion,
        },
      );
      assert.ok(context.html.includes(script));
      assert.ok(!context.context.includes("<script"));
    }
});
