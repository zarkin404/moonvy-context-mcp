#!/usr/bin/env node
import { getServerConfig } from "./config.js";
import { startServer } from "./app.js";
try {
  await startServer(getServerConfig());
} catch (error) {
  console.error(
    "[moonvy-context-mcp]",
    error instanceof Error ? error.message : "服务启动失败。",
  );
  process.exitCode = 1;
}
