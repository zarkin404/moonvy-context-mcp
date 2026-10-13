import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gradientCSS,
  baseStyles,
  segmentStyles,
  textContainerStyles,
} from "../dist/core/styles.js";
import {
  layerClass,
  resolveRect,
  layoutIsFlex,
  cssBlock,
  kebab,
  colorToCSS,
  px,
  number,
  visible,
} from "../dist/core/util.js";
import { AssetRegistry } from "../dist/core/assets.js";
import { applyStyleFormat } from "../dist/core/tailwind.js";
const rect = { x: 2, y: 3, w: 30, h: 40 };
const color = { r: 1, g: 2, b: 3 };
const colorFill = { type: "color", color };
test("颜色、尺寸、命名、可见性和坐标转换保持边界行为", () => {
  assert.equal(
    colorToCSS({ r: -3, g: 300, b: 3.4, alpha: 0.5 }, 0.5),
    "rgba(0, 255, 3, 0.25)",
  );
  assert.equal(colorToCSS(), undefined);
  assert.equal(px(1.23456), "1.235px");
  assert.equal(number("bad", 9), 9);
  assert.equal(kebab("fontSize"), "font-size");
  assert.equal(cssBlock(".empty", {}), "");
  for (const layer of [
    { visible: false },
    { editState: { hide: true } },
    { blend: { visible: false } },
  ])
    assert.equal(visible(layer), false);
  assert.deepEqual(resolveRect({}, undefined, false), {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  });
  assert.deepEqual(
    resolveRect(
      { absoluteLayer: { rect } },
      { absoluteLayer: { rect: { x: 1, y: 2 } } },
      false,
    ),
    { x: 1, y: 1, w: 30, h: 40 },
  );
  assert.deepEqual(
    resolveRect({ absoluteLayer: { rect } }, undefined, false),
    rect,
  );
  assert.deepEqual(
    resolveRect({ rect }, { rect: { x: 1, y: 1 }, isFrame: false }, false),
    { x: 1, y: 2, w: 30, h: 40 },
  );
  assert.deepEqual(resolveRect({ rect }, { isFrame: true }, false), rect);
  const used = new Set();
  for (const [layer, alias] of [
    [{ name: "导航" }, "nav"],
    [{ name: "ProductCard" }, "product-card"],
    [{ name: "未知中文" }, "item"],
    [{ name: "Rectangle 1", textbox: {} }, "text"],
    [{ slices: {} }, "img"],
    [{ fills: [{ type: "image" }] }, "img"],
    [{ autoLayout: { isAutoLayoutContainer: true } }, "box"],
    [{ subType: "vector" }, "vector"],
    [{ id: "1:2" }, "item"],
    [{ id: "0123456789abcdef" }, "item"],
    [{ id: "---" }, "item"],
  ])
    assert.match(
      layerClass(layer, "path", used),
      new RegExp(`pgn-node-${alias}-`),
    );
  const first = layerClass({ id: "same" }, "0", used);
  assert.equal(layerClass({ id: "same" }, "0", used), first + "-2");
  assert.equal(layerClass({ id: "same" }, "0", used), first + "-3");
  assert.equal(
    layoutIsFlex({
      autoLayout: { isAutoLayoutContainer: true, direction: "bad" },
    }),
    false,
  );
  assert.equal(
    layoutIsFlex({
      autoLayout: { isAutoLayoutContainer: true, direction: "VERTICAL" },
      children: [{ autoLayout: { position: "FIXED" } }],
    }),
    false,
  );
});
test("线性、径向、锥形渐变及不完整渐变处理", () => {
  const stops = [{ color, position: 0 }, { position: 1 }];
  assert.equal(gradientCSS({}), undefined);
  assert.equal(gradientCSS({ gradient: { stops: [] } }), undefined);
  assert.equal(
    gradientCSS({ gradient: { stops: {}, type: "linear" } }),
    undefined,
  );
  assert.equal(
    gradientCSS({
      gradient: {
        stops,
        type: "linear",
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
      },
    }),
    "linear-gradient(90deg, rgb(1 2 3) 0%, transparent 100%)",
  );
  assert.match(
    gradientCSS({ gradient: { stops, type: "linear" }, opacity: 0.5 }),
    /^linear-gradient/,
  );
  assert.match(
    gradientCSS({ gradient: { stops, type: "radial" } }),
    /^radial-gradient/,
  );
  assert.match(
    gradientCSS({ gradient: { stops, type: "angular" } }),
    /^conic-gradient/,
  );
  assert.equal(gradientCSS({ gradient: { stops, type: "bad" } }), undefined);
});
test("自动布局、尺寸、裁剪、圆角和仿射变换输出正确 CSS", () => {
  const layer = {
    autoLayout: {
      isAutoLayoutContainer: true,
      direction: "VERTICAL",
      mainAxisGap: 4,
      mainAxisAlignItems: "SPACE_BETWEEN",
      crossAxisAlignItems: "BASELINE",
      wrap: "WRAP",
      padding: 5,
    },
    blend: { isClip: true, opacity: 0.5 },
    borderRadius: [1, 2, 3, 4],
    transform: {
      rotate: 30,
      scale: [2, 3],
      skew: [4, 5],
      flipH: true,
      flipV: true,
    },
  };
  const styles = baseStyles(layer, rect, false, false, false);
  assert.equal(styles["flex-direction"], "column");
  assert.equal(styles["justify-content"], "space-between");
  assert.equal(styles["align-items"], "baseline");
  assert.equal(styles["flex-wrap"], "wrap");
  assert.equal(styles.padding, "5px");
  assert.equal(styles.opacity, "0.5");
  assert.equal(styles["border-radius"], "1px 2px 3px 4px");
  assert.equal(
    styles.transform,
    "rotate(30deg) scale(2, 3) skew(4deg, 5deg) scaleX(-1) scaleY(-1)",
  );
  const item = baseStyles(
    { autoLayout: { grow: 2 } },
    rect,
    false,
    true,
    false,
  );
  assert.equal(item["flex-grow"], "2");
  assert.equal(item.left, undefined);
  for (const padding of [undefined, 0, [1, 2, 3, 4]]) {
    const a = {
      isAutoLayoutContainer: true,
      direction: "HORIZONTAL",
      padding,
      paddingTop: padding === undefined ? 1 : undefined,
      mainAxisAlignItems: "bad",
      crossAxisAlignItems: "bad",
    };
    const result = baseStyles({ autoLayout: a }, rect, true, false, true);
    assert.equal(result["flex-direction"], "row");
    assert.equal(
      result.padding,
      padding === undefined
        ? "1px 0px 0px 0px"
        : Array.isArray(padding)
          ? "1px 2px 3px 4px"
          : "0px",
    );
  }
  assert.equal(
    baseStyles({ transform: {} }, rect, false, false, false).transform,
    undefined,
  );
  assert.equal(
    baseStyles(
      { transform: { scale: [], skew: [] } },
      rect,
      false,
      false,
      false,
    ).transform,
    "scale(1, 1) skew(0deg, 0deg)",
  );
  assert.equal(
    baseStyles(
      { absoluteLayer: { transform: {} }, transform: { rotate: 30 } },
      rect,
      false,
      false,
      false,
    ).transform,
    undefined,
  );
  assert.equal(
    baseStyles(
      { borderRadius: [1], blend: { opacity: 1 } },
      rect,
      false,
      false,
      false,
    )["border-radius"],
    undefined,
  );
});
test("填充、描边、横竖线、阴影和模糊按可见样式处理", () => {
  const s = baseStyles(
    {
      fills: [
        colorFill,
        { type: "color" },
        { type: "gradient" },
        {
          type: "gradient",
          gradient: { type: "radial", stops: [{ color, position: 0 }] },
        },
      ],
      strokes: [{ width: 2, fills: [colorFill] }],
      effects: [
        { type: "shadow", inner: true, x: 1, y: 2, radius: 3, spread: 4 },
        {
          type: "shadow",
          color,
          offset: { x: 5, y: 6 },
          blur: 7,
          opacity: 0.5,
        },
        { type: "filterBlur", blur: 8 },
        { type: "filterBackdropBlur", radius: 9 },
        { type: "bad" },
        { type: "shadow", visible: false },
      ],
    },
    rect,
    false,
    false,
    false,
  );
  assert.match(s.background, /^radial-gradient/);
  assert.equal(s.border, "2px solid rgb(1 2 3)");
  assert.match(s["box-shadow"], /^inset 1px 2px 3px 4px rgba\(0,0,0,0.15\)/);
  assert.equal(s.filter, "blur(8px)");
  assert.equal(s["backdrop-filter"], "blur(9px)");
  for (const rotate of [0, 90]) {
    const line = baseStyles(
      {
        subType: "line",
        transform: { rotate },
        strokes: [{ weight: 2, fills: [colorFill] }],
      },
      rect,
      false,
      false,
      false,
    );
    assert.equal(line.width, rotate === 90 ? "2px" : "30px");
    assert.equal(line.height, rotate === 90 ? "30px" : "2px");
    assert.equal(line.transform, undefined);
  }
  assert.equal(
    baseStyles({ strokes: [{}] }, rect, false, false, false).border,
    undefined,
  );
  assert.equal(
    baseStyles({ strokes: [{ fills: [colorFill] }] }, rect, false, false, false)
      .border,
    "1px solid rgb(1 2 3)",
  );
});
test("文本对齐、字体、字距、大小写、装饰和继承样式", () => {
  assert.equal(textContainerStyles({})["justify-content"], "flex-start");
  assert.equal(
    textContainerStyles({
      textbox: { align: "right", alignVertical: "bottom" },
    })["justify-content"],
    "flex-end",
  );
  assert.equal(
    textContainerStyles({
      textbox: { align: "justify", alignVertical: "center" },
    })["text-align"],
    "justify",
  );
  const s = segmentStyles(
    {
      fontName: { family: "Noto Sans", style: "Bold Italic" },
      fontSize: 20,
      fontWeight: 800,
      lineHeight: { unit: "per", value: 120 },
      letterSpacing: { unit: "per", value: 10 },
      textDecoration: "underline",
      textCase: "upper",
    },
    { textbox: { fills: [colorFill] } },
  );
  assert.equal(s["font-family"], '"Noto Sans"');
  assert.equal(s["font-weight"], "800");
  assert.equal(s["font-style"], "italic");
  assert.equal(s["line-height"], "24px");
  assert.equal(s["letter-spacing"], "2px");
  assert.equal(s["text-transform"], "uppercase");
  assert.equal(s["text-decoration-line"], "underline");
  assert.equal(s.color, "rgb(1 2 3)");
  assert.equal(
    segmentStyles(
      {
        lineHeight: { value: 20 },
        letterSpacing: { value: 2 },
        textCase: "lower",
        fontName: { style: "unknown" },
        textDecoration: "none",
      },
      {},
    ).color,
    undefined,
  );
  assert.equal(
    segmentStyles(
      {
        lineHeight: { unit: "per", value: 100 },
        letterSpacing: { unit: "per", value: 100 },
      },
      { fills: [colorFill] },
    )["line-height"],
    "14px",
  );
  assert.equal(
    segmentStyles({ fontName: { style: "Bold" } }, {})["font-weight"],
    "700",
  );
});
test("素材注册去重、扩展名、路径碰撞及多种图片引用", () => {
  const diagnostics = [];
  const registry = new AssetRegistry(
    {
      images: {
        a: { url: "https://fs.moonvy.com/a.jpeg" },
        b: { url: "https://fs.moonvy.com/a.jpeg" },
        bad: { url: "javascript:alert(1)" },
      },
    },
    diagnostics,
  );
  assert.equal(registry.add(undefined, "l"), undefined);
  assert.equal(registry.add("missing", "l"), undefined);
  assert.equal(registry.add("bad", "l"), undefined);
  assert.equal(registry.add("invalid", "l", undefined, "broken"), undefined);
  const a = registry.add("a", "l");
  assert.equal(a.type, "jpg");
  assert.equal(registry.add("a", "l"), a);
  assert.equal(registry.add("a", "other"), a);
  assert.equal(registry.add("b", "third"), a);
  assert.deepEqual(a.usedBy, ["l", "other", "third"]);
  for (const [id, hint, address] of [
    ["---", "!!!", "file:///a"],
    ["a/b", "bad", "http://moonvy.com/b"],
    ["a?b", ".svg", "https://moonvy.com/c"],
    ["none", undefined, "https://moonvy.com/no-extension"],
  ])
    assert.ok(
      registry
        .add(id, "l", hint, address)
        .path.endsWith(hint === ".svg" ? ".svg" : ".png"),
    );
  assert.equal(
    new Set(registry.listing().map((a) => a.path)).size,
    registry.listing().length,
  );
  assert.ok(diagnostics.every((d) => d.code === "asset-url-missing"));
  const refs = new AssetRegistry(
    { images: { ok: { url: "https://fs.moonvy.com/a.png" } } },
    [],
  );
  for (const fill of [
    { imageId: "ok" },
    { imageHash: "ok" },
    { imageRef: "ok" },
    { image: { id: "ok" } },
    { id: "ok" },
    { image: { url: "https://fs.moonvy.com/a.png" } },
    { url: "https://fs.moonvy.com/a.png" },
  ])
    assert.equal(
      refs.imageFills({
        fills: [
          { type: "color" },
          { type: "image", visible: false },
          { type: "image", ...fill },
        ],
      }).length,
      1,
    );
  assert.equal(refs.imageFills({ fills: [{ type: "image" }] }).length, 0);
  for (const layer of [
    { subType: "vector", slices: { svg: { id: "ok" } } },
    { subType: "line", slices: { max: { id: "ok" } } },
    { slices: { max: { id: "missing" }, base: { id: "ok" } } },
    { slices: { svg: { id: "ok" } } },
    { snapshot: "ok" },
  ])
    assert.ok(refs.slice(layer));
  assert.equal(refs.slice({ snapshot: "missing" }), undefined);
});
test("Tailwind 任意属性、零值、颜色和资源回退不丢失", () => {
  const node = (styles) => ({
    tag: "div",
    generatedClass: "example",
    classes: [],
    attrs: {},
    children: [],
    styles,
  });
  const r = node({
    "border-radius": "0px",
    width: "0",
    background: "0",
    color: "rgb(1 2 3)",
    "background-color": "#fff",
    "font-weight": "800",
    "object-fit": "cover",
    overflow: "visible",
    transform: "translateX(1px)",
  });
  assert.equal(applyStyleFormat(r, "tailwind", []), "\n");
  for (const cls of [
    "rounded-none",
    "w-0",
    "bg-transparent",
    "text-[rgb(1_2_3)]",
    "bg-[#fff]",
    "font-[800]",
    "object-cover",
    "overflow-visible",
    "[transform:translateX(1px)]",
  ])
    assert.ok(r.classes.includes(cls), cls);
  for (const background of ["#fff", "transparent"]) {
    const n = node({ background, "object-fit": "contain" });
    applyStyleFormat(n, "hybrid", []);
    assert.ok(n.classes.includes(`bg-[${background}]`));
    assert.ok(n.classes.includes("object-contain"));
  }
  const fallback = node({
    background: 'url("a")',
    content: '"quoted"',
    custom: "<unsafe>",
    unknown: "bad\nvalue",
  });
  const diagnostics = [];
  assert.match(
    applyStyleFormat(fallback, "hybrid", diagnostics, true),
    /url\("a"\)/,
  );
  assert.equal(diagnostics.length, 1);
  const cycle = node({});
  cycle.children = [cycle];
  assert.equal(applyStyleFormat(cycle, "css", []), "\n");
  const noClass = node({ background: 'url("a")' });
  delete noClass.generatedClass;
  assert.equal(applyStyleFormat(noClass, "hybrid", []), "\n");
  assert.equal(
    applyStyleFormat(
      { ...node({ width: "2px" }), generatedClass: undefined },
      "css",
      [],
    ),
    "\n",
  );
});

test("素材路径碰撞和矢量快照回退不会覆盖已有文件", () => {
  const registry = new AssetRegistry(
    { images: { snapshot: { url: "https://fs.moonvy.com/s.png" } } },
    [],
  );
  const first = registry.add("a/b", "l", "png", "https://fs.moonvy.com/a.png");
  const second = registry.add("a?b", "l", "png", "https://fs.moonvy.com/b.png");
  assert.notEqual(first.path, second.path);
  assert.match(second.path, /^assets\/a-b-[a-z0-9]+\.png$/);
  assert.equal(
    registry.slice({ subType: "vector", snapshot: "snapshot" }).url,
    "https://fs.moonvy.com/s.png",
  );
});
test("单值圆角和 backdrop blur 的不同字段均保留，严格模式报告无 ID 节点", () => {
  const s = baseStyles(
    { borderRadius: 6, effects: [{ type: "filterBackdropBlur", blur: 3 }] },
    rect,
    false,
    false,
    false,
  );
  assert.equal(s["border-radius"], "6px");
  assert.equal(s["backdrop-filter"], "blur(3px)");
  assert.throws(
    () =>
      applyStyleFormat(
        {
          tag: "div",
          attrs: {},
          children: [],
          classes: [],
          styles: { background: 'url("a")' },
        },
        "tailwind",
        [],
        true,
      ),
    /Unconvertible/,
  );
});
