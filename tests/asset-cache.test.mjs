import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../dist/mcp.js";
import { generate } from "../dist/core/generator.js";
import {
  getDesignOutputDir,
  writeDesignFiles,
} from "../dist/utils/file-delivery.js";
import { config, genome, url } from "./fixtures.mjs";

async function connected(options, api, fn) {
  const server = createMcpServer(options, api);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "asset-cache-test", version: "1" });
  try {
    await server.connect(a);
    await client.connect(b);
    await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test("两种交付模式自动缓存参考图片，精简上下文并保留按需清单", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonvy-cache-"));
  try {
    for (const mode of ["inline", "files"])
      for (const promptLang of ["zh-CN", "en-US"])
        for (const skipSlices of [false, true]) {
          const outDir = join(root, `${mode}-${promptLang}-${skipSlices}`);
          const downloads = [];
          await connected(
            { ...config, outDir, mode, promptLang, skipSlices },
            {
              getDesign: async () => ({ id: "file", name: "x", genome }),
              download: async (address, limit) => {
                downloads.push({ address, limit });
                return {
                  bytes: Buffer.from("reference bytes"),
                  mimeType: "image/png",
                };
              },
            },
            async (client) => {
              const result = await client.callTool({
                name: "get_design_context",
                arguments: { url },
              });
              assert.equal(result.isError, undefined);
              const [id] = await readdir(outDir);
              const dir = join(outDir, id);
              const context = await readFile(join(dir, "context.md"), "utf8");
              assert.equal(
                mode === "inline"
                  ? result.content[0].text
                  : (await client.readResource({ uri: result.content[0].uri }))
                      .contents[0].text,
                context,
              );
              assert.ok(context.includes(join(dir, "assets.json")));
              assert.ok(context.includes(join(dir, "index.html")));
              assert.ok(!context.includes("curl --fail"));
              assert.ok(!context.includes("Asset download mappings"));
              assert.ok(!context.includes("图片下载映射"));
              const manifest = JSON.parse(
                (
                  await client.readResource({
                    uri: pathToFileURL(join(dir, "assets.json")).href,
                  })
                ).contents[0].text,
              );
              assert.equal(manifest.length, 1);
              const html = await readFile(join(dir, "index.html"), "utf8");
              const path = join(dir, manifest[0].path);
              if (skipSlices) {
                assert.deepEqual(downloads, []);
                assert.ok(html.includes(manifest[0].url));
                await assert.rejects(readFile(path), { code: "ENOENT" });
              } else {
                assert.deepEqual(downloads, [
                  { address: manifest[0].url, limit: 20 * 1024 * 1024 },
                ]);
                assert.ok(!context.includes(manifest[0].url));
                assert.ok(html.includes(`src="${manifest[0].path}"`));
                assert.equal(await readFile(path, "utf8"), "reference bytes");
                const resource = await client.readResource({
                  uri: pathToFileURL(path).href,
                });
                assert.equal(
                  Buffer.from(resource.contents[0].blob, "base64").toString(),
                  "reference bytes",
                );
              }
            },
          );
        }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("缓存下载失败或返回非图片时明确报错，不返回假成功预览", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonvy-cache-error-"));
  try {
    for (const download of [
      async () => {
        throw new Error("download failed");
      },
      async () => ({ bytes: Buffer.from("html"), mimeType: "text/html" }),
    ])
      await connected(
        { ...config, outDir: dir },
        {
          getDesign: async () => ({ id: "file", name: "x", genome }),
          download,
        },
        async (client) => {
          const result = await client.callTool({
            name: "get_design_context",
            arguments: { url },
          });
          assert.equal(result.isError, true);
          assert.match(result.content[0].text, /download failed|图片格式/);
        },
      );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("本地素材只允许复制服务生成的裁切图，拒绝外部文件和伪造文件名", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonvy-local-cache-"));
  try {
    const output = join(dir, "outputs");
    const pageDir = getDesignOutputDir(output, "valid", "本地裁切");
    const crops = join(pageDir, "assets");
    await mkdir(crops, { recursive: true });
    const valid = join(crops, "preview-crop-0123456789abcdef.png");
    const outside = join(dir, "outside.png");
    const invalid = join(crops, "other.png");
    for (const path of [valid, outside, invalid])
      await writeFile(path, "local bytes");
    let remoteCalls = 0;
    const download = async () => {
      remoteCalls++;
      throw new Error("unexpected remote call");
    };
    for (const path of [valid, outside, invalid]) {
      const input = structuredClone(genome);
      input.images.img.url = pathToFileURL(path).href;
      const result = generate(input);
      if (path === valid) {
        const delivered = await writeDesignFiles(
          output,
          "valid",
          "本地裁切",
          result,
          undefined,
          download,
        );
        assert.equal(
          await readFile(join(delivered.dir, result.assets[0].path), "utf8"),
          "local bytes",
        );
      } else
        await assert.rejects(
          writeDesignFiles(
            output,
            "valid",
            "本地裁切",
            result,
            undefined,
            download,
          ),
          /本服务生成/,
        );
    }
    assert.equal(remoteCalls, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("缓存图片的各类 MIME 可按需读取，非产物目录与文件仍受限制", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonvy-cache-mime-"));
  try {
    const formats = {
      png: "image/png",
      jpg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/svg+xml",
      avif: "image/avif",
      bmp: "image/bmp",
      ico: "image/x-icon",
    };
    const input = {
      pages: [{ id: "p", rect: { x: 0, y: 0, w: 100, h: 100 }, children: [] }],
      images: {},
    };
    for (const type of Object.keys(formats)) {
      input.images[type] = { url: `https://fs.moonvy.com/${type}`, type };
      input.pages[0].children.push({
        id: type,
        rect: { x: 0, y: 0, w: 1, h: 1 },
        slices: { max: { id: type } },
      });
    }
    const result = generate(input);
    const delivered = await writeDesignFiles(
      dir,
      "mime",
      "缓存格式",
      result,
      undefined,
      async (address) => ({
        bytes: Buffer.from(address),
        mimeType: formats[address.split("/").at(-1)],
      }),
    );
    const denied = [
      join(dir, "assets", "test.png"),
      join(dir, "wrong-id", "assets", "test.png"),
      join(delivered.dir, "wrong-folder", "test.png"),
      join(delivered.dir, "assets", "private.txt"),
    ];
    for (const path of denied) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "private");
    }
    await connected({ ...config, outDir: dir }, undefined, async (client) => {
      for (const asset of result.assets) {
        const resource = (
          await client.readResource({
            uri: pathToFileURL(join(delivered.dir, asset.path)).href,
          })
        ).contents[0];
        assert.equal(resource.mimeType, formats[asset.type]);
        assert.equal(
          Buffer.from(resource.blob, "base64").toString(),
          asset.url,
        );
      }
      for (const path of denied)
        await assert.rejects(
          client.readResource({ uri: pathToFileURL(path).href }),
        );
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("页面目录保留中文标题、稳定区分同名页面并清理跨平台非法文件名", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonvy-page-names-"));
  try {
    const a = getDesignOutputDir(root, "page-a", " 登录 / 手机:验证码. ");
    const b = getDesignOutputDir(root, "page-b", " 登录 / 手机:验证码. ");
    assert.match(a.slice(root.length + 1), /^登录-手机-验证码-[a-f0-9]{8}$/);
    assert.equal(
      a,
      getDesignOutputDir(root, "page-a", " 登录 / 手机:验证码. "),
    );
    assert.notEqual(a, b);
    assert.equal(dirname(a), root);
    const empty = getDesignOutputDir(root, "empty", "../:*?\u0000   ");
    assert.match(empty.slice(root.length + 1), /^设计稿-[a-f0-9]{8}$/);
    const long = getDesignOutputDir(root, "long", "😀".repeat(120));
    assert.ok(Buffer.byteLength(long.slice(root.length + 1)) < 255);
    await mkdir(long);
    await mkdir(a);
    await mkdir(b);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("同名画板独立交付，裁切图直接位于各页面 assets 且可通过 MCP 读取", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonvy-page-crops-"));
  try {
    const { PNG } = await import("pngjs");
    const png = new PNG({ width: 2, height: 2 });
    png.data.fill(255);
    const input = {
      pages: ["a", "b"].map((id) => ({
        id,
        name: "重复页面",
        snapshot: id,
        rect: { x: 0, y: 0, w: 2, h: 2 },
        children: [
          {
            id: "same-layer",
            rect: { x: 0, y: 0, w: 1, h: 1 },
            fills: [{ type: "image" }],
          },
        ],
      })),
      images: {
        a: { url: "https://fs.moonvy.com/a.png" },
        b: { url: "https://fs.moonvy.com/b.png" },
      },
    };
    const paths = [];
    await connected(
      { ...config, outDir: root, mode: "files", previewFallback: true },
      {
        getDesign: async () => ({
          id: "file",
          name: "文档标题",
          genome: input,
        }),
        download: async () => ({
          bytes: PNG.sync.write(png),
          mimeType: "image/png",
        }),
      },
      async (client) => {
        const { fileURLToPath } = await import("node:url");
        for (const pageId of ["a", "b"]) {
          const result = await client.callTool({
            name: "get_design_context",
            arguments: { url, pageId },
          });
          assert.equal(result.isError, undefined);
          const dir = dirname(fileURLToPath(result.content[0].uri));
          assert.match(dir.slice(root.length + 1), /^重复页面-[a-f0-9]{8}$/);
          const context = await readFile(join(dir, "context.md"), "utf8");
          assert.ok(context.startsWith("# 重复页面\n"));
          assert.ok(context.includes(join(dir, "assets.json")));
          const assets = JSON.parse(
            await readFile(join(dir, "assets.json"), "utf8"),
          );
          assert.equal(assets.length, 1);
          const path = fileURLToPath(assets[0].url);
          assert.equal(dirname(path), join(dir, "assets"));
          assert.equal(path, join(dir, assets[0].path));
          const resource = await client.readResource({ uri: assets[0].url });
          assert.equal(
            PNG.sync.read(Buffer.from(resource.contents[0].blob, "base64"))
              .width,
            1,
          );
          paths.push(path);
        }
      },
    );
    assert.notEqual(paths[0], paths[1]);
    assert.equal((await readdir(root)).length, 2);
    assert.ok(!(await readdir(root)).includes("preview-assets"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
