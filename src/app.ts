import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp.js";
import type { ServerConfig } from "./types/config.js";
export async function startServer(config: ServerConfig) {
  if (!config.isHttpMode) {
    const server = createMcpServer(config);
    await server.connect(new StdioServerTransport());
    return server;
  }
  const app = createMcpExpressApp({ host: config.host });
  app.post("/mcp", async (req, res, next) => {
    const server = createMcpServer(config);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      next(error);
    }
  });
  app.get("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").end();
  });
  app.delete("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").end();
  });
  app.use((_err: unknown, _req: unknown, res: any, _next: unknown) => {
    if (!res.headersSent) res.status(500).json({ error: "MCP 请求处理失败。" });
  });
  return await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listener = app.listen(config.port, config.host, (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      console.error(`[http] http://${config.host}:${config.port}/mcp`);
      resolve(listener);
    });
    listener.on("error", reject);
  });
}
