import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".moonvy-context-mcp.local", "package-verification");
const staging = await mkdtemp(join(tmpdir(), "moonvy-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
await mkdir(outDir, { recursive: true });
function run(args, cwd) {
  return execFileSync(npm, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180000,
  });
}
try {
  // npm pack 真实执行 prepack，检查最终 tarball，而不是源码目录。
  const packed = JSON.parse(
    run(["pack", "--json", "--pack-destination", outDir], root),
  )[0];
  const paths = packed.files.map((file) => file.path);
  assert.ok(paths.includes("LICENSE"));
  const readme = await readFile(join(root, "README.md"), "utf8");
  assert.ok(readme.includes("Copyright (c) 2026-present, REFINIST"));
  assert.ok(readme.includes("Permission is hereby granted, free of charge"));
  assert.ok(!paths.includes("THIRD_PARTY_NOTICES.md"));
  assert.ok(paths.includes(manifest.bin[manifest.name]));
  for (const path of paths)
    assert.match(
      path,
      /^(dist\/[^.].*|README\.md|LICENSE|package\.json)$/,
      `不应发布的文件：${path}`,
    );
  run(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(outDir, packed.filename),
    ],
    staging,
  );
  const installedManifestPath = join(
    staging,
    "node_modules",
    manifest.name,
    "package.json",
  );
  const installed = JSON.parse(await readFile(installedManifestPath, "utf8"));
  const entry = join(
    staging,
    "node_modules",
    manifest.name,
    installed.bin[manifest.name],
  );
  assert.ok((await readFile(entry, "utf8")).startsWith("#!/usr/bin/env node"));
  const help = run(
    ["exec", "--offline", "--", manifest.name, "--help"],
    staging,
  );
  assert.ok(help.includes(manifest.name));
  async function verifyVersion(expected) {
    const version = run(
      ["exec", "--offline", "--", manifest.name, "--version"],
      staging,
    );
    assert.ok(version.includes(expected));
    const client = new Client({
      name: "npm-package-verifier",
      version: "1.0.0",
    });
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [entry],
          cwd: staging,
          stderr: "pipe",
          env: {
            ...Object.fromEntries(
              Object.entries(process.env).filter(
                ([, value]) => typeof value === "string",
              ),
            ),
            MOONVY_TOKEN: "test-only-not-a-secret",
            MOONVY_AUTHORIZATION: "",
            ENV_FILE: join(staging, "missing.env"),
          },
        }),
      );
      assert.deepEqual(client.getServerVersion(), {
        name: installed.name,
        version: expected,
      });
      assert.ok(
        (await client.listTools()).tools.some(
          (tool) => tool.name === "get_design_context",
        ),
      );
      const response = await client.callTool({
        name: "get_design_context",
        arguments: { url: "invalid" },
      });
      assert.equal(response.isError, true);
    } finally {
      await client.close();
    }
  }
  await verifyVersion(installed.version);
  // 修改已安装副本的版本，不修改源码或重编译，证明服务没有残留硬编码版本。
  const changedVersion = "0.0.0-package-version-check";
  await writeFile(
    installedManifestPath,
    JSON.stringify({ ...installed, version: changedVersion }),
  );
  await verifyVersion(changedVersion);
  const report = {
    name: installed.name,
    version: installed.version,
    files: paths,
    packageFile: packed.filename,
    packageBytes: packed.size,
    cleanInstall: true,
    npxEntry: true,
    mcpInitialization: true,
    toolCall: true,
    versionSyncWithoutRebuild: true,
  };
  await writeFile(
    join(outDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      name: report.name,
      version: report.version,
      files: paths.length,
      cleanInstall: true,
      npxEntry: true,
      mcpInitialization: true,
      versionSyncWithoutRebuild: true,
      report: ".moonvy-context-mcp.local/package-verification/report.json",
    }),
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
