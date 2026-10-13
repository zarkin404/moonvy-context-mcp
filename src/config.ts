import { resolve } from "node:path";
import { cli } from "cleye";
import { config as loadEnv } from "dotenv";
import { packageInfo } from "./package-info.js";
import type { ServerConfig } from "./types/config.js";

export function normalizeAuthorization(value: string): string {
  const token = value
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();
  return token ? `Bearer ${token}` : "";
}
export function getServerConfig(): ServerConfig {
  const { flags: f } = cli({
    name: packageInfo.name,
    version: packageInfo.version,
    flags: {
      http: { type: Boolean },
      stdio: { type: Boolean },
      host: { type: String },
      port: { type: Number },
      httpTimeout: { type: Number },
      tailwindcss: { type: Boolean },
      twVersion: { type: Number },
      skipSlices: { type: Boolean },
      previewFallback: { type: Boolean },
      unitScale: { type: Number },
      promptLang: { type: String },
      envFile: { type: String },
      cwd: { type: String },
      mode: { type: String },
      outDir: { type: String },
    },
  });
  if (f.cwd || process.env.CWD)
    process.chdir(resolve(f.cwd || process.env.CWD!));
  loadEnv({
    path: resolve(f.envFile || process.env.ENV_FILE || ".env.local"),
    quiet: true,
  });
  const env = process.env;
  const bool = (name: string) => ["true", "1"].includes(env[name] || "");
  const number = (arg: number | undefined, name: string, fallback: number) =>
    arg ?? (env[name] ? Number(env[name]) : fallback);
  const authorization = normalizeAuthorization(
    env.MOONVY_AUTHORIZATION || env.MOONVY_TOKEN || "",
  );
  if (!authorization)
    throw new Error(
      "缺少 MOONVY_TOKEN 或 MOONVY_AUTHORIZATION，请通过环境变量或 --env-file 配置。",
    );
  const unitScale = number(f.unitScale, "UNIT_SCALE", 1);
  const twVersion = number(f.twVersion, "TW_VERSION", 3);
  const port = number(f.port, "PORT", 5200);
  const httpTimeout = number(f.httpTimeout, "HTTP_TIMEOUT", 30000);
  const mode = f.mode || env.MODE || "inline";
  const promptLang = f.promptLang || env.PROMPT_LANG || "zh-CN";
  if (!Number.isFinite(unitScale) || unitScale <= 0)
    throw new Error("UNIT_SCALE 必须是正数。");
  if (twVersion !== 3 && twVersion !== 4)
    throw new Error("TW_VERSION 必须为 3 或 4。");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT 必须为有效端口。");
  if (!Number.isFinite(httpTimeout) || httpTimeout <= 0)
    throw new Error("HTTP_TIMEOUT 必须是正数。");
  if (mode !== "inline" && mode !== "files")
    throw new Error("MODE 必须为 inline 或 files。");
  if (promptLang !== "zh-CN" && promptLang !== "en-US")
    throw new Error("PROMPT_LANG 必须为 zh-CN 或 en-US。");
  return {
    authorization,
    httpTimeout,
    isHttpMode:
      f.http === true
        ? true
        : f.stdio === true
          ? false
          : env.STDIO === "false" || env.STDIO === "0",
    host: f.host || env.HOST || "127.0.0.1",
    port,
    tailwindcss: f.tailwindcss ?? bool("TAILWINDCSS"),
    twVersion,
    skipSlices: f.skipSlices ?? bool("SKIP_SLICES"),
    previewFallback:
      f.previewFallback ??
      (env.PREVIEW_FALLBACK ? bool("PREVIEW_FALLBACK") : true),
    unitScale,
    promptLang,
    mode,
    outDir: resolve(f.outDir || env.OUT_DIR || ".moonvy-context-mcp.local"),
  };
}
