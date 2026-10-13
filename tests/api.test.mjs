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
