import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { startServer } from "../dist/app.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./fixtures.mjs";
test("真实 HTTP 初始化、工具调用、方法限制和 JSON 错误", async () => {
  const server = await startServer({ ...config, isHttpMode: true, port: 0 });
  const url = new URL(`http://127.0.0.1:${server.address().port}/mcp`);
  const client = new Client({ name: "http-test", version: "1" });
  try {
    for (const method of ["GET", "DELETE"]) {
      const response = await fetch(url, { method });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get("allow"), "POST");
    }
    await client.connect(new StreamableHTTPClientTransport(url));
    assert.equal(
      (await client.listTools()).tools[0].name,
      "get_design_context",
    );
    const result = await client.callTool({
      name: "get_design_context",
      arguments: { url: "invalid" },
    });
    assert.equal(result.isError, true);
    const badJson = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{broken",
    });
    assert.equal(badJson.status, 500);
    assert.deepEqual(await badJson.json(), { error: "MCP 请求处理失败。" });
    await assert.rejects(
      startServer({ ...config, isHttpMode: true, port: server.address().port }),
      /EADDRINUSE/,
    );
  } finally {
    await client.close();
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
});
test("HTTP 传输异常返回通用错误，已发送响应不重复写入", async (t) => {
  const server = await startServer({ ...config, isHttpMode: true, port: 0 });
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  try {
    const mocked = t.mock.method(
      StreamableHTTPServerTransport.prototype,
      "handleRequest",
      async () => {
        throw new Error("private upstream error");
      },
    );
    const response = await fetch(url, { method: "POST" });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "MCP 请求处理失败。" });
    mocked.mock.mockImplementation(async (_req, res) => {
      res.end("already sent");
      throw new Error("late failure");
    });
    const sent = await fetch(url, { method: "POST" });
    assert.equal(sent.status, 200);
    assert.equal(await sent.text(), "already sent");
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
});
