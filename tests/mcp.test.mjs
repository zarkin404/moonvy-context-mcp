import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, symlink } from "node:fs/promises";
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
