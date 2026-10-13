import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync, deflateSync } from "node:zlib";
import {
  MoonvyClient,
  decodeGenome,
  resourceUrl,
  readBytes,
} from "../dist/services/moonvy-api.js";
import { parseMoonvyUrl } from "../dist/utils/url-parser.js";
import { normalizeAuthorization } from "../dist/config.js";
import { config, genome, url } from "./fixtures.mjs";

test("链接解析只接受具体月维设计文件", () => {
  assert.deepEqual(parseMoonvyUrl(url), {
    projectId: "project",
    dirId: "dir",
    fileId: "file",
  });
  for (const bad of [
    "bad",
    "https://example.com/project/a/b/c",
    "https://moonvy.com/project/a/b",
    "https://moonvy.com/project/a/b/%2F",
  ])
    assert.throws(() => parseMoonvyUrl(bad));
});
test("认证头规范化支持裸 token 与 Bearer", () => {
  assert.equal(normalizeAuthorization(" token "), "Bearer token");
  assert.equal(normalizeAuthorization("Bearer token"), "Bearer token");
  assert.equal(normalizeAuthorization(""), "");
});
test("Genome 解码支持 JSON、gzip、deflate，拒绝缺少结构", () => {
  const b = Buffer.from(JSON.stringify(genome));
  for (const input of [b, gzipSync(b), deflateSync(b)])
    assert.equal(decodeGenome(input).pages[0].id, "page");
  assert.throws(() => decodeGenome(Buffer.from("{}")), /Genome/);
});
for (const envelope of ["direct", "data", "result"])
  test(`支持 ${envelope} 响应且凭据只发给 API`, async () => {
    const calls = [];
    const fake = async (u, options) => {
      calls.push({ url: u, options });
      if (calls.length === 1) {
        const node = {
          id: "file",
          name: "设计",
          files: { genome: { url: "https://fs.moonvy.com/genome" } },
          preview: { normal: "https://fs.moonvy.com/preview.png" },
        };
        return Response.json(
          envelope === "direct" ? node : { [envelope]: node },
        );
      }
      return Response.json(genome);
    };
    const r = await new MoonvyClient(config, fake).getDesign(url);
    assert.equal(r.genome.pages[0].id, "page");
    assert.equal(calls[0].options.headers.Authorization, config.authorization);
    assert.equal(calls[1].options.headers, undefined);
    assert.equal(calls[1].options.redirect, "error");
  });
test("鉴权失败与业务错误不给出上游敏感响应", async () => {
  await assert.rejects(
    () =>
      new MoonvyClient(
        config,
        async () => new Response("Bearer confidential", { status: 401 }),
      ).getDesign(url),
    /HTTP 401/,
  );
  await assert.rejects(
    () =>
      new MoonvyClient(config, async () =>
        Response.json({ code: 401, message: "Bearer confidential" }),
      ).getDesign(url),
    (e) => !e.message.includes("confidential") && e.message.includes("权限"),
  );
});
test("资源下载限制主机、大小", async () => {
  assert.equal(resourceUrl("http://fs.moonvy.com/a"), undefined);
  assert.equal(resourceUrl("https://127.0.0.1/a"), undefined);
  assert.equal(resourceUrl("https://moonvy.com.evil.test/a"), undefined);
  await assert.rejects(() => readBytes(new Response("123456"), 3), /大小/);
});

test("资源地址拒绝非字符串、坏 URL 和外域，允许月维根域", () => {
  for (const value of [
    undefined,
    null,
    {},
    "broken",
    "ftp://moonvy.com/a",
    "https://evil.test/a",
  ])
    assert.equal(resourceUrl(value), undefined);
  assert.equal(resourceUrl("https://moonvy.com/a"), "https://moonvy.com/a");
});
test("流式下载同时限制声明大小和实际大小，空响应拒绝读取", async () => {
  await assert.rejects(
    readBytes(new Response("x", { headers: { "content-length": "100" } }), 3),
    /大小/,
  );
  await assert.rejects(readBytes(new Response(null)), /为空/);
  let canceled = false;
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array([1, 2]));
      c.enqueue(new Uint8Array([3, 4]));
    },
    cancel() {
      canceled = true;
    },
  });
  await assert.rejects(readBytes(new Response(stream), 3), /大小/);
  assert.equal(canceled, true);
  assert.deepEqual(
    await readBytes(new Response(new Uint8Array([1, 2, 3]))),
    Buffer.from([1, 2, 3]),
  );
});
test("下载失败不暴露响应内容，无效资源不发起请求", async () => {
  let calls = 0;
  const client = new MoonvyClient(config, async () => {
    calls++;
    return new Response("confidential", { status: 403 });
  });
  await assert.rejects(client.download("https://evil.test/a"), /资源地址/);
  assert.equal(calls, 0);
  await assert.rejects(client.download("https://fs.moonvy.com/a"), /HTTP 403/);
  assert.equal(calls, 1);
  const plain = await new MoonvyClient(
    config,
    async () => new Response(new Uint8Array([1])),
  ).download("https://fs.moonvy.com/a");
  assert.equal(plain.mimeType, "");
  assert.deepEqual(plain.bytes, Buffer.from([1]));
});
test("设计元数据补充缺失图片，保留 Genome 原有 URL 和完整预览", async () => {
  let calls = 0;
  const input = structuredClone(genome);
  const node = {
    id: "file",
    files: { genome: { url: "https://fs.moonvy.com/genome" } },
    preview: { large: "https://fs.moonvy.com/large.png" },
    meta: {
      assets: {
        img: "https://fs.moonvy.com/replaced.png",
        new: { url: "https://fs.moonvy.com/new.png" },
        bad: {},
        unsafe: "https://evil.test/a",
      },
    },
  };
  const client = new MoonvyClient(config, async () =>
    ++calls === 1 ? Response.json(node) : Response.json(input),
  );
  const result = await client.getDesign(url);
  assert.equal(result.name, "file");
  assert.equal(result.previewUrl, node.preview.large);
  assert.equal(result.genome.images.img.url, genome.images.img.url);
  assert.equal(result.genome.images.new.url, node.meta.assets.new.url);
  assert.equal(result.genome.images.bad, undefined);
  assert.equal(result.genome.images.unsafe, undefined);
  const withoutImages = { pages: genome.pages };
  let i = 0;
  const fresh = await new MoonvyClient(config, async () =>
    ++i === 1 ? Response.json(node) : Response.json(withoutImages),
  ).getDesign(url);
  assert.equal(fresh.genome.images.new.url, node.meta.assets.new.url);
});
test("缺失 Genome、无效返回节点和坏压缩数据产生明确错误", async () => {
  for (const node of [
    { id: "file" },
    { id: "file", files: { genome: { url: "https://evil.test/a" } } },
  ])
    await assert.rejects(
      new MoonvyClient(config, async () => Response.json(node)).getDesign(url),
      /Genome/,
    );
  assert.throws(() => decodeGenome(Buffer.from("broken")), /Genome/);
  assert.equal(
    decodeGenome(Buffer.from("\uFEFF" + JSON.stringify(genome))).pages[0].id,
    "page",
  );
  assert.throws(() => decodeGenome(Buffer.from('{"pages":[]}')), /Genome/);
});
