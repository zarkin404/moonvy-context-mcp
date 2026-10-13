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
