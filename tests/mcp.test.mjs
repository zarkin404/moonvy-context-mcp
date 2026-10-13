import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  readFile,
  symlink,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { PNG } from "pngjs";
import { writeDesignFiles } from "../dist/utils/file-delivery.js";
import { generate } from "../dist/core/generator.js";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createMcpServer } from "../dist/mcp.js";
import { config, genome, url } from "./fixtures.mjs";
const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const preview = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=",
  "base64",
);
const fake = {
  getDesign: async () => ({
    id: "file",
    name: "测试设计",
    genome,
    previewUrl: "https://fs.moonvy.com/preview.png",
  }),
  download: async () => ({ bytes: preview, mimeType: "image/png" }),
};
async function withClient(options, fn, clientApi = fake) {
  const server = createMcpServer(options, clientApi),
    [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  try {
    await server.connect(a);
    await client.connect(b);
    await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}
test("真实 SDK inline 协议返回文本和图片", async () => {
  await withClient(config, async (c) => {
    assert.deepEqual(c.getServerVersion(), {
      name: manifest.name,
      version: manifest.version,
    });
    assert.equal((await c.listTools()).tools[0].name, "get_design_context");
    const r = await c.callTool({
      name: "get_design_context",
      arguments: { url },
    });
    assert.ok(!r.isError);
    assert.deepEqual(
      r.content.map((x) => x.type),
      ["text", "image"],
    );
  });
});
test("files 模式返回链接且可以通过 resources/read 读取", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonvy-"));
  try {
    await withClient({ ...config, mode: "files", outDir: dir }, async (c) => {
      const r = await c.callTool({
        name: "get_design_context",
        arguments: { url },
      });
      assert.deepEqual(
        r.content.map((x) => x.type),
        ["resource_link", "resource_link"],
      );
      const link = r.content[0];
      const result = await c.readResource({ uri: link.uri });
      assert.match(result.contents[0].text, /Design Tokens/);
      const target = dirname(fileURLToPath(link.uri));
      assert.ok(
        (await readFile(join(target, "index.html"), "utf8")).includes("Hello"),
      );
      const image = await c.readResource({ uri: r.content[1].uri });
      assert.equal(image.contents[0].mimeType, "image/png");
      await assert.rejects(() =>
        c.readResource({
          uri: pathToFileURL(join(process.cwd(), "package.json")).href,
        }),
      );
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("错误响应清除认证头并设置 isError", async () => {
  await withClient(
    config,
    async (c) => {
      const r = await c.callTool({
        name: "get_design_context",
        arguments: { url },
      });
      assert.equal(r.isError, true);
      assert.ok(!JSON.stringify(r).includes("test-only-not-a-secret"));
    },
    {
      getDesign: async () => {
        throw new Error(config.authorization);
      },
    },
  );
});
test("stdio 进程初始化与错误返回，stdout 没有普通日志", async () => {
  const client = new Client({ name: "stdio-test", version: "1" });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["dist/run.js"],
        env: {
          ...process.env,
          MOONVY_TOKEN: "test-only-not-a-secret",
          MOONVY_AUTHORIZATION: "",
        },
        stderr: "pipe",
      }),
    );
    assert.equal((await client.listTools()).tools.length, 1);
    const r = await client.callTool({
      name: "get_design_context",
      arguments: { url: "invalid" },
    });
    assert.equal(r.isError, true);
  } finally {
    await client.close();
  }
});

test("所有产物 MIME、目录穿越和不允许的文件都通过实际 resource 协议验证", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonvy-resource-"));
  try {
    const root = join(dir, "outputs");
    await mkdir(root);
    const formats = {
      "context.md": "text/markdown",
      "index.html": "text/html",
      "style.css": "text/css",
      "assets.json": "application/json",
      "preview.png": "image/png",
      "preview.jpg": "image/jpeg",
      "preview.webp": "image/webp",
      "preview.gif": "image/gif",
      "preview-crop-a1.png": "image/png",
    };
    for (const name of [...Object.keys(formats), "private.txt"])
      await writeFile(join(root, name), "test bytes");
    const outside = join(dir, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "context.md"), "outside output directory");
    await symlink(outside, join(root, "linked"), "junction");
    await withClient({ ...config, outDir: root }, async (c) => {
      for (const [name, mimeType] of Object.entries(formats)) {
        const result = await c.readResource({
          uri: pathToFileURL(join(root, name)).href,
        });
        assert.equal(result.contents[0].mimeType, mimeType);
        assert.equal(
          mimeType.startsWith("image/")
            ? Buffer.from(result.contents[0].blob, "base64").toString()
            : result.contents[0].text,
          "test bytes",
        );
      }
      for (const path of [
        dir,
        join(root, "private.txt"),
        join(root, "missing.md"),
        join(root, "linked", "context.md"),
      ])
        await assert.rejects(c.readResource({ uri: pathToFileURL(path).href }));
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("多画板只使用所选快照，缺少快照时只返回文字", async () => {
  const multi = structuredClone(genome);
  multi.pages.push({
    id: "other",
    rect: { x: 0, y: 0, w: 1, h: 1 },
    snapshot: "snapshot",
  });
  multi.images.snapshot = { url: "https://fs.moonvy.com/page.png" };
  const downloads = [];
  const api = {
    getDesign: async () => ({
      id: "file",
      name: "x",
      genome: multi,
      previewUrl: "https://fs.moonvy.com/overview.png",
    }),
    download: async (address) => {
      downloads.push(address);
      return { bytes: preview, mimeType: "image/png" };
    },
  };
  await withClient(
    { ...config, promptLang: "en-US" },
    async (c) => {
      const missing = await c.callTool({
        name: "get_design_context",
        arguments: { url },
      });
      assert.equal(missing.isError, true);
      assert.match(missing.content[0].text, /pageId/);
      const selected = await c.callTool({
        name: "get_design_context",
        arguments: { url, pageId: "other" },
      });
      assert.equal(selected.isError, undefined);
      assert.deepEqual(downloads, [multi.images.snapshot.url]);
      const plain = await c.callTool({
        name: "get_design_context",
        arguments: { url, pageId: "page" },
      });
      assert.deepEqual(
        plain.content.map((x) => x.type),
        ["text"],
      );
      const bad = await c.callTool({
        name: "get_design_context",
        arguments: { url, pageId: "missing" },
      });
      assert.equal(bad.isError, true);
    },
    api,
  );
});
test("预览格式拒绝 HTML，普通错误和未知异常均不暴露凭据", async () => {
  await withClient(
    config,
    async (c) => {
      const result = await c.callTool({
        name: "get_design_context",
        arguments: { url },
      });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /图片格式/);
    },
    {
      ...fake,
      download: async () => ({
        bytes: Buffer.from("html"),
        mimeType: "text/html",
      }),
    },
  );
  await withClient(
    { ...config, promptLang: "en-US" },
    async (c) => {
      const result = await c.callTool({
        name: "get_design_context",
        arguments: { url },
      });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /Report this error/);
    },
    {
      getDesign: async () => {
        throw { secret: config.authorization };
      },
    },
  );
});
test("局部预览回退通过 MCP 返回诊断和可读取的裁切资源", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonvy-fallback-"));
  try {
    const png = new PNG({ width: 4, height: 4 });
    png.data.fill(255);
    const sample = {
      pages: [
        {
          id: "p",
          rect: { x: 0, y: 0, w: 4, h: 4 },
          children: [
            {
              id: "missing",
              rect: { x: 0, y: 0, w: 2, h: 2 },
              fills: [{ type: "image" }],
            },
          ],
        },
      ],
    };
    const api = {
      getDesign: async () => ({
        id: "file",
        name: "x",
        genome: sample,
        previewUrl: "https://fs.moonvy.com/preview.png",
      }),
      download: async () => ({
        bytes: PNG.sync.write(png),
        mimeType: "image/png",
      }),
    };
    for (const promptLang of ["zh-CN", "en-US"])
      await withClient(
        { ...config, previewFallback: true, outDir: dir, promptLang },
        async (c) => {
          const result = await c.callTool({
            name: "get_design_context",
            arguments: { url },
          });
          assert.equal(result.isError, undefined);
          assert.match(
            result.content[0].text,
            promptLang === "zh-CN" ? /预览裁切回退/ : /Preview crop fallbacks/,
          );
          const cropUrl = result.content[0].text.match(
            /file:\/\/[^'\s]+preview-crop-[a-f0-9]+\.png/,
          )?.[0];
          assert.ok(cropUrl);
          const resource = await c.readResource({ uri: cropUrl });
          const crop = PNG.sync.read(
            Buffer.from(resource.contents[0].blob, "base64"),
          );
          assert.equal(crop.width, 2);
          assert.equal(crop.height, 2);
        },
        api,
      );
    await withClient(
      { ...config, previewFallback: true, outDir: dir },
      async (c) => {
        assert.equal(
          (await c.callTool({ name: "get_design_context", arguments: { url } }))
            .isError,
          undefined,
        );
      },
      {
        ...fake,
        download: async () => ({
          bytes: PNG.sync.write(png),
          mimeType: "image/png",
        }),
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("文件交付支持各图片格式，无预览及无效预览有明确行为", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonvy-files-"));
  try {
    const result = generate(genome);
    assert.equal((await writeDesignFiles(dir, "none", result)).files.length, 5);
    for (const [mimeType, extension] of [
      ["image/png", "png"],
      ["image/jpeg", "jpg"],
      ["image/webp", "webp"],
      ["image/gif", "gif"],
    ]) {
      const files = await writeDesignFiles(dir, mimeType, result, {
        bytes: preview,
        mimeType,
      });
      assert.equal(files.files.at(-1).name, `preview.${extension}`);
    }
    await assert.rejects(
      writeDesignFiles(dir, "bad", result, {
        bytes: preview,
        mimeType: "text/html",
      }),
      /格式不受支持/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("单画板缺少文件预览时采用画板快照", async () => {
  const single = structuredClone(genome);
  single.pages[0].snapshot = "snapshot";
  single.images.snapshot = { url: "https://fs.moonvy.com/snapshot.png" };
  let downloaded;
  await withClient(
    config,
    async (c) => {
      const result = await c.callTool({
        name: "get_design_context",
        arguments: { url },
      });
      assert.equal(result.isError, undefined);
      assert.equal(downloaded, single.images.snapshot.url);
    },
    {
      getDesign: async () => ({ id: "f", name: "x", genome: single }),
      download: async (address) => {
        downloaded = address;
        return { bytes: preview, mimeType: "image/png" };
      },
    },
  );
});
