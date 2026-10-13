import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { addPreviewFallback } from "../dist/utils/preview-fallback.js";

test("局部裁切补缺失素材，正确累计 frame 坐标并标注来源", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonvy-crop-"));
  try {
    const png = new PNG({ width: 100, height: 100 });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = (i / 4) % 100;
      png.data[i + 3] = 255;
    }
    const sample = {
      pages: [
        {
          id: "p",
          isFrame: true,
          rect: { x: 500, y: 600, w: 100, h: 100 },
          children: [
            {
              id: "frame",
              isFrame: true,
              rect: { x: 20, y: 20, w: 40, h: 40 },
              children: [
                {
                  id: "missing",
                  type: "layer",
                  rect: { x: 10, y: 10, w: 10, h: 10 },
                  fills: [{ type: "image", visible: true }],
                },
              ],
            },
          ],
        },
      ],
    };
    const r = await addPreviewFallback(
      sample,
      "p",
      { bytes: PNG.sync.write(png), mimeType: "image/png" },
      dir,
    );
    assert.equal(r.diagnostics.length, 1);
    assert.match(r.diagnostics[0].message, /局部裁切/);
    const asset = Object.values(r.genome.images)[0];
    const crop = PNG.sync.read(await readFile(fileURLToPath(asset.url)));
    assert.equal(crop.width, 10);
    assert.equal(crop.data[0], 30);
    assert.equal(sample.pages[0].children[0].children[0].slices, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("预览比例不匹配时不会从错误画板裁切", async () => {
  const png = new PNG({ width: 100, height: 10 });
  const r = await addPreviewFallback(
    {
      pages: [
        {
          id: "p",
          isFrame: true,
          rect: { x: 0, y: 0, w: 100, h: 100 },
          children: [
            {
              id: "c",
              type: "layer",
              rect: { x: 0, y: 0, w: 10, h: 10 },
              fills: [{ type: "image" }],
            },
          ],
        },
      ],
    },
    "p",
    { bytes: PNG.sync.write(png), mimeType: "image/png" },
    "/tmp/moonvy-crop-unused",
  );
  assert.equal(r.diagnostics.length, 0);
});

test("缺失画板、尺寸和非 PNG 预览不会产生错误裁切", async () => {
  for (const [input, pageId, mimeType] of [
    [{}, undefined, "image/png"],
    [{ pages: [{}] }, undefined, "image/png"],
    [{ pages: [{ id: "p", rect: { w: 4, h: 4 } }] }, "p", "image/jpeg"],
    [{ pages: [{ id: "p", rect: { w: 4, h: 4 } }] }, "other", "image/png"],
  ]) {
    const result = await addPreviewFallback(
      input,
      pageId,
      { bytes: Buffer.from("not png"), mimeType },
      "/unused",
    );
    assert.deepEqual(result.diagnostics, []);
  }
});
test("裁切保留实例边界，已引用素材和越界图层不会被替换", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonvy-crop-boundaries-"));
  try {
    const png = new PNG({ width: 4, height: 4 });
    png.data.fill(255);
    const rect = { x: 0, y: 0, w: 1, h: 1 };
    const children = [
      { id: "hidden", rect, visible: false },
      { id: "no-rect" },
      { id: "image", rect, name: "named", fills: [{ type: "image" }] },
      {
        id: "shape",
        rect,
        type: "layer",
        children: [],
        fills: [{ type: "color" }],
      },
      { id: "no-fill", rect, type: "layer" },
      {
        id: "instance",
        rect,
        type: "instance",
        children: [{ rect, fills: [{ type: "image" }] }],
      },
      { id: "empty-instance", rect, type: "instance" },
      ...["imageId", "imageHash", "imageRef", "image", "url", "id"].map(
        (key) => ({
          id: key,
          rect,
          fills: [{ type: "image", [key]: "existing" }],
        }),
      ),
      ...["max", "base", "svg"].map((key) => ({
        id: key,
        rect,
        slices: { [key]: { id: "existing" } },
        fills: [{ type: "image" }],
      })),
      { id: "snapshot", rect, snapshot: "existing" },
      { id: "bad-slice", rect, snapshot: "missing" },
      ...[
        { x: -1 },
        { y: -1 },
        { w: 0 },
        { h: 0 },
        { x: 3, w: 2 },
        { y: 3, h: 2 },
      ].map((bounds, i) => ({
        id: `outside-${i}`,
        rect: { ...rect, ...bounds },
        fills: [{ type: "image" }],
      })),
      { id: "hidden-image", rect, fills: [{ type: "image", visible: false }] },
    ];
    const sample = {
      pages: [
        { id: "p", isFrame: true, rect: { x: 0, y: 0, w: 4, h: 4 }, children },
      ],
      images: { existing: { url: "https://fs.moonvy.com/a.png" } },
    };
    const result = await addPreviewFallback(
      sample,
      undefined,
      { bytes: PNG.sync.write(png), mimeType: "image/png" },
      dir,
    );
    assert.deepEqual(
      result.diagnostics.map((d) => d.layerId),
      ["image", "shape", "instance"],
    );
    assert.match(result.diagnostics[0].message, /named/);
    assert.equal(
      result.genome.pages[0].children.find((n) => n.id === "snapshot").slices,
      undefined,
    );
    assert.equal(sample.pages[0].children[2].slices, undefined);
    let deep = { rect };
    for (let i = 0; i < 130; i++) deep = { rect, children: [deep] };
    const bounded = {
      pages: [
        {
          id: "p",
          rect: { x: 0, y: 0, w: 4, h: 4 },
          children: [deep, ...Array.from({ length: 10002 }, () => ({ rect }))],
        },
      ],
    };
    assert.equal(
      (
        await addPreviewFallback(
          bounded,
          "p",
          { bytes: PNG.sync.write(png), mimeType: "image/png" },
          dir,
        )
      ).diagnostics.length,
      0,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
