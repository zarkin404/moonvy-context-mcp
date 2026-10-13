import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
const moduleUrl = new URL("../dist/config.js", import.meta.url).href;
const keys = [
  "CWD",
  "ENV_FILE",
  "MOONVY_AUTHORIZATION",
  "MOONVY_TOKEN",
  "UNIT_SCALE",
  "TW_VERSION",
  "PORT",
  "HTTP_TIMEOUT",
  "MODE",
  "PROMPT_LANG",
  "STDIO",
  "HOST",
  "TAILWINDCSS",
  "SKIP_SLICES",
  "PREVIEW_FALLBACK",
  "OUT_DIR",
];
function readConfig(env = {}, args = []) {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { getServerConfig } from ${JSON.stringify(moduleUrl)}; process.argv = [process.execPath, 'config-check', ...${JSON.stringify(args)}]; console.log(JSON.stringify(getServerConfig()));`,
    ],
    {
      encoding: "utf8",
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) => !keys.includes(key)),
        ),
        MOONVY_TOKEN: "test-only-token",
        ENV_FILE: join(tmpdir(), "moonvy-no-config-file.env"),
        ...env,
      },
    },
  );
  return {
    ...result,
    config: result.status === 0 ? JSON.parse(result.stdout) : undefined,
  };
}
test("默认配置与环境变量覆盖完整解析", () => {
  const basic = readConfig();
  assert.equal(basic.status, 0, basic.stderr);
  assert.equal(basic.config.twVersion, 3);
  assert.equal(basic.config.previewFallback, true);
  assert.equal(basic.config.isHttpMode, false);
  const result = readConfig({
    MOONVY_AUTHORIZATION: "Bearer header-token",
    TW_VERSION: "4",
    UNIT_SCALE: "2",
    PORT: "8080",
    HTTP_TIMEOUT: "1234",
    MODE: "files",
    PROMPT_LANG: "en-US",
    STDIO: "0",
    HOST: "0.0.0.0",
    TAILWINDCSS: "1",
    SKIP_SLICES: "true",
    PREVIEW_FALLBACK: "false",
    OUT_DIR: "custom-out",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.config.authorization, "Bearer header-token");
  assert.equal(result.config.twVersion, 4);
  assert.equal(result.config.unitScale, 2);
  assert.equal(result.config.port, 8080);
  assert.equal(result.config.httpTimeout, 1234);
  assert.equal(result.config.isHttpMode, true);
  assert.equal(result.config.mode, "files");
  assert.equal(result.config.promptLang, "en-US");
  assert.equal(result.config.tailwindcss, true);
  assert.equal(result.config.skipSlices, true);
  assert.equal(result.config.previewFallback, false);
  assert.ok(result.config.outDir.endsWith("custom-out"));
  assert.equal(
    readConfig({ STDIO: "false", PREVIEW_FALLBACK: "1" }).config.isHttpMode,
    true,
  );
  assert.equal(
    readConfig({ PREVIEW_FALLBACK: "1" }).config.previewFallback,
    true,
  );
});
test("CLI 优先于环境变量，stdio 与 http 可以明确选择", () => {
  const result = readConfig(
    {
      TW_VERSION: "4",
      PORT: "8080",
      MODE: "files",
      PROMPT_LANG: "en-US",
      STDIO: "false",
      UNIT_SCALE: "2",
      HTTP_TIMEOUT: "1234",
    },
    [
      "--tw-version",
      "3",
      "--port",
      "5201",
      "--mode",
      "inline",
      "--prompt-lang",
      "zh-CN",
      "--stdio",
      "--host",
      "localhost",
      "--unit-scale",
      "1",
      "--http-timeout",
      "999",
      "--out-dir",
      "cli-out",
      "--tailwindcss",
      "--skip-slices",
      "--preview-fallback",
    ],
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.config.twVersion, 3);
  assert.equal(result.config.port, 5201);
  assert.equal(result.config.mode, "inline");
  assert.equal(result.config.promptLang, "zh-CN");
  assert.equal(result.config.unitScale, 1);
  assert.equal(result.config.httpTimeout, 999);
  assert.equal(result.config.host, "localhost");
  assert.equal(result.config.isHttpMode, false);
  assert.equal(result.config.tailwindcss, true);
  assert.equal(result.config.skipSlices, true);
  assert.equal(result.config.previewFallback, true);
  assert.equal(readConfig({}, ["--http"]).config.isHttpMode, true);
});
test("外部 env 文件和工作目录解析，进程环境优先", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonvy-config-"));
  try {
    await writeFile(
      join(dir, ".env.local"),
      "MOONVY_TOKEN=file-token\nTW_VERSION=4\n",
    );
    for (const [env, args] of [
      [{ CWD: dir, ENV_FILE: "", MOONVY_TOKEN: undefined }, []],
      [{}, ["--cwd", dir, "--env-file", ".env.local"]],
    ]) {
      const result = readConfig(env, args);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.config.twVersion, 4);
      assert.equal(
        await realpath(dirname(result.config.outDir)),
        await realpath(dir),
      );
    }
    assert.equal(
      readConfig({ CWD: dir, ENV_FILE: ".env.local", TW_VERSION: "3" }).config
        .twVersion,
      3,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("无凭据及非法配置拒绝启动，错误明确且不回显凭据", () => {
  for (const [env, expected] of [
    [{ MOONVY_TOKEN: "" }, /缺少 MOONVY/],
    [{ UNIT_SCALE: "0" }, /UNIT_SCALE/],
    [{ UNIT_SCALE: "NaN" }, /UNIT_SCALE/],
    [{ TW_VERSION: "5" }, /TW_VERSION/],
    [{ PORT: "0" }, /PORT/],
    [{ PORT: "65536" }, /PORT/],
    [{ PORT: "1.5" }, /PORT/],
    [{ HTTP_TIMEOUT: "0" }, /HTTP_TIMEOUT/],
    [{ HTTP_TIMEOUT: "NaN" }, /HTTP_TIMEOUT/],
    [{ MODE: "bad" }, /MODE/],
    [{ PROMPT_LANG: "bad" }, /PROMPT_LANG/],
  ]) {
    const result = readConfig(env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
    assert.ok(!result.stderr.includes("test-only-token"));
  }
});
test("CLI 启动失败返回非零退出码和简洁错误", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../dist/run.js", import.meta.url))],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        MOONVY_TOKEN: "",
        MOONVY_AUTHORIZATION: "",
        ENV_FILE: join(tmpdir(), "moonvy-no-config-file.env"),
      },
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /\[moonvy-context-mcp\].*缺少 MOONVY/);
});

test("CLI 对非 Error 异常返回通用错误，不泄漏异常对象", () => {
  const script = `process.env.CWD = '.'; process.chdir = () => { throw { private: 'not-for-output' }; }; await import(${JSON.stringify(new URL("../dist/run.js", import.meta.url).href)});`;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        MOONVY_TOKEN: "test-only-token",
        MOONVY_AUTHORIZATION: "",
      },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /服务启动失败/);
  assert.ok(!result.stderr.includes("not-for-output"));
});
