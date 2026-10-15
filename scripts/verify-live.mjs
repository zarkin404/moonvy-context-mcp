import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import postcss from "postcss";
import tailwind3 from "tailwindcss";
import tailwind4 from "@tailwindcss/postcss";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { getServerConfig } from "../dist/config.js";
import { packageInfo } from "../dist/package-info.js";
import { MoonvyClient } from "../dist/services/moonvy-api.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url =
  process.env.MOONVY_TEST_URL ||
  "https://moonvy.com/project/f5f1e453-5260-466a-af63-a634ce1af622/e0750666-a3ff-48b2-9527-aa7524b98e04/a02add1a-b87e-49a0-88c1-a0dd800222ff";
const out = join(root, ".moonvy-context-mcp.local", "verification");
const publicDir = join(root, "playground/public/generated");
const config = getServerConfig();
const api = new MoonvyClient(config);
await mkdir(out, { recursive: true });
await mkdir(publicDir, { recursive: true });
const design = await api.getDesign(url);
await writeFile(join(out, "genome.json"), JSON.stringify(design.genome));
const report = {
  design: design.name,
  pages: design.genome.pages.map((p) => ({
    id: p.id,
    name: p.name,
    rect: p.rect,
  })),
  protocol: [],
  renders: [],
};
async function connected(args, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "dist/run.js"), "--cwd", root, ...args],
    env: Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => typeof v === "string"),
    ),
    stderr: "pipe",
  });
  const client = new Client({
    name: "moonvy-live-verifier",
    version: packageInfo.version,
  });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    await client.close();
  }
}
for (const format of ["css", "tw3", "tw4"]) {
  const args = ["--mode", "files", "--out-dir", join(out, format)];
  if (format !== "css")
    args.push("--tailwindcss", "--tw-version", format === "tw3" ? "3" : "4");
  const output = await connected(args, async (client) => {
    const tools = await client.listTools();
    assert.ok(tools.tools.some((t) => t.name === "get_design_context"));
    const result = await client.callTool({
      name: "get_design_context",
      arguments: { url },
    });
    assert.ok(!result.isError, JSON.stringify(result.content));
    const context = result.content.find(
      (c) => c.type === "resource_link" && c.name === "context.md",
    );
    assert.ok(context);
    const resource = await client.readResource({ uri: context.uri });
    assert.ok(resource.contents[0].text.includes("Design Tokens"));
    const fileDir = dirname(fileURLToPath(context.uri));
    return {
      fileDir,
      context: resource.contents[0].text,
      preview: result.content.find(
        (c) => c.type === "resource_link" && c.name.startsWith("preview."),
      ),
    };
  });
  const target = join(publicDir, format);
  await mkdir(target, { recursive: true });
  let html = await readFile(join(output.fileDir, "index.html"), "utf8");
  // 截图基准使用本地编译产物，避免 CDN 再次注入样式或引入网络波动。
  html = html.replace(
    /<script src="https:\/\/(?:cdn\.tailwindcss\.com|cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4)"><\/script>\n?/g,
    "",
  );
  let css = await readFile(join(output.fileDir, "style.css"), "utf8");
  const assets = JSON.parse(
    await readFile(join(output.fileDir, "assets.json"), "utf8"),
  );
  for (const asset of assets) {
    const download = asset.url.startsWith("file:")
      ? { bytes: await readFile(fileURLToPath(asset.url)) }
      : await api.download(asset.url);
    const path = join(target, asset.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, download.bytes);
  }
  if (format === "tw3") {
    const compiled = await postcss([
      tailwind3({
        content: [{ raw: html, extension: "html" }],
        corePlugins: { preflight: false },
      }),
    ]).process("@tailwind utilities;", { from: undefined });
    css = compiled.css + "\n" + css;
  }
  if (format === "tw4") {
    await writeFile(join(target, "index.html"), html);
    const compiled = await postcss([
      tailwind4({ base: target, optimize: false }),
    ]).process(
      '@import "tailwindcss4/theme.css";\n@import "tailwindcss4/utilities.css";\n@source "./index.html";',
      { from: join(target, "input.css") },
    );
    css = compiled.css + "\n" + css;
  }
  if (!html.includes('href="style.css"'))
    html = html.replace(
      "</head>",
      '<link rel="stylesheet" href="style.css" />\n</head>',
    );
  await writeFile(join(target, "index.html"), html);
  await writeFile(join(target, "style.css"), css);
  await copyFile(
    join(output.fileDir, "context.md"),
    join(target, "context.md"),
  );
  if (output.preview) {
    await copyFile(
      fileURLToPath(output.preview.uri),
      join(publicDir, "preview.png"),
    );
  }
  if (format === "tw3") {
    // 直接消费工具返回的 context.md，验证 Agent 到 Vue 页面这一层的适配。
    const body = output.context.match(/```html\n([\s\S]*?)\n```/)?.[1];
    assert.ok(body);
    let template = body,
      imports = [];
    const assetDir = join(root, "playground/src/assets/imgs/generated");
    await mkdir(assetDir, { recursive: true });
    for (const [index, asset] of assets.entries()) {
      const filename = asset.path.split("/").at(-1),
        localName = `image${index}`;
      await copyFile(join(target, asset.path), join(assetDir, filename));
      imports.push(
        `import ${localName} from '../../assets/imgs/generated/${filename}';`,
      );
      template = template
        .split(`src="${asset.path}"`)
        .join(`:src="${localName}"`);
    }
    const vueDir = join(root, "playground/src/pages/generated");
    await mkdir(vueDir, { recursive: true });
    const fallbackCSS = await readFile(
      join(output.fileDir, "style.css"),
      "utf8",
    );
    await writeFile(
      join(vueDir, "device-center.vue"),
      `<script setup lang="ts">\n${imports.join("\n")}\n</script>\n<template>\n${template}\n</template>\n${fallbackCSS.trim() ? "<style>\n" + fallbackCSS + "\n</style>" : ""}`,
    );
  }
  report.protocol.push({
    transport: "stdio",
    format,
    mode: "files",
    resourceRead: true,
    assets: assets.length,
  });
  console.log(
    JSON.stringify({ stage: "mcp-files", format, assets: assets.length }),
  );
}
await connected(["--mode", "inline"], async (client) => {
  const result = await client.callTool({
    name: "get_design_context",
    arguments: { url },
  });
  assert.ok(!result.isError);
  assert.ok(
    result.content.some(
      (c) => c.type === "text" && c.text.includes("Design Tokens"),
    ),
  );
  assert.ok(result.content.some((c) => c.type === "image"));
  const bad = await client.callTool({
    name: "get_design_context",
    arguments: { url: "https://example.com/design" },
  });
  assert.equal(bad.isError, true);
  report.protocol.push({
    transport: "stdio",
    mode: "inline",
    image: true,
    invalidUrlRejected: true,
  });
});
// HTTP 也通过真正的 SDK 客户端连接，不绕过协议调用 handler。
const httpPort = await new Promise((resolve) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => resolve(p));
  });
});
const httpProcess = spawn(
  process.execPath,
  [
    join(root, "dist/run.js"),
    "--http",
    "--port",
    String(httpPort),
    "--mode",
    "files",
    "--out-dir",
    join(out, "http"),
  ],
  { cwd: root, env: process.env, stdio: "ignore" },
);
try {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://127.0.0.1:${httpPort}/mcp`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const client = new Client({
    name: "moonvy-http-verifier",
    version: packageInfo.version,
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${httpPort}/mcp`),
      ),
    );
    const result = await client.callTool({
      name: "get_design_context",
      arguments: { url },
    });
    assert.ok(!result.isError);
    const link = result.content.find(
      (c) => c.type === "resource_link" && c.name === "context.md",
    );
    assert.ok(link);
    const resource = await client.readResource({ uri: link.uri });
    assert.ok(resource.contents[0].text.includes("Design Tokens"));
    report.protocol.push({
      transport: "http",
      mode: "files",
      resourceRead: true,
    });
  } finally {
    await client.close();
  }
} finally {
  httpProcess.kill();
}
// 按实际文件提供参考页，避免仅验证字符串而遗漏素材、CSS 编译或字体布局。
const server = createServer(async (req, res) => {
  try {
    const path = resolve(
      publicDir,
      "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
    );
    if (!path.startsWith(publicDir + "/")) {
      res.writeHead(403);
      res.end();
      return;
    }
    const bytes = await readFile(path);
    res.setHeader(
      "Content-Type",
      path.endsWith(".html")
        ? "text/html"
        : path.endsWith(".css")
          ? "text/css"
          : path.endsWith(".svg")
            ? "image/svg+xml"
            : path.endsWith(".png")
              ? "image/png"
              : path.endsWith(".webp")
                ? "image/webp"
                : "application/octet-stream",
    );
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const original = PNG.sync.read(
    await readFile(join(publicDir, "preview.png")),
  );
  const previewPNG = new PNG({ width: 390, height: 844 });
  for (let y = 0; y < 844; y++)
    for (let x = 0; x < 390; x++) {
      const target = (y * 390 + x) * 4;
      const sx = Math.floor((x * original.width) / 390),
        sy = Math.floor((y * original.height) / 844),
        nx = Math.max(1, Math.floor(original.width / 390)),
        ny = Math.max(1, Math.floor(original.height / 844));
      for (let c = 0; c < 4; c++) {
        let total = 0;
        for (let yy = 0; yy < ny; yy++)
          for (let xx = 0; xx < nx; xx++)
            total +=
              original.data[((sy + yy) * original.width + sx + xx) * 4 + c];
        previewPNG.data[target + c] = Math.round(total / (nx * ny));
      }
    }
  const preview = previewPNG.data;
  await writeFile(join(out, "reference.png"), PNG.sync.write(previewPNG));
  for (const format of ["css", "tw3", "tw4"]) {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.name));
    await page.goto(`http://127.0.0.1:${port}/${format}/index.html`, {
      waitUntil: "networkidle",
    });
    await page.evaluate(() => document.fonts.ready);
    const missingImages = await page
      .locator("img")
      .evaluateAll(
        (images) =>
          images.filter((img) => !img.complete || img.naturalWidth === 0)
            .length,
      );
    assert.equal(missingImages, 0);
    const shot = join(out, `${format}.png`);
    await page.screenshot({ path: shot });
    const rendered = PNG.sync.read(await readFile(shot)).data;
    let absoluteError = 0,
      changedPixels = 0;
    for (let i = 0; i < preview.length; i += 4) {
      const d = Math.max(
        Math.abs(preview[i] - rendered[i]),
        Math.abs(preview[i + 1] - rendered[i + 1]),
        Math.abs(preview[i + 2] - rendered[i + 2]),
      );
      if (d > 24) changedPixels++;
      absoluteError +=
        Math.abs(preview[i] - rendered[i]) +
        Math.abs(preview[i + 1] - rendered[i + 1]) +
        Math.abs(preview[i + 2] - rendered[i + 2]);
    }
    const item = {
      format,
      missingImages,
      meanChannelError: Number((absoluteError / (390 * 844 * 3)).toFixed(3)),
      pixelsOver24Percent: Number(
        ((changedPixels / (390 * 844)) * 100).toFixed(2),
      ),
      pageErrors: errors.length,
    };
    report.renders.push(item);
    console.log(JSON.stringify({ stage: "rendered", ...item }));
  }
  // 通过 Vite 运行真正的 Vue 页面，补齐上下文到框架实现的端到端验证。
  const vuePort = await new Promise((resolve) => {
    const listener = createServer();
    listener.listen(0, "127.0.0.1", () => {
      const p = listener.address().port;
      listener.close(() => resolve(p));
    });
  });
  const requirePlayground = createRequire(
    join(root, "playground/package.json"),
  );
  const vitePath = join(
    dirname(requirePlayground.resolve("vite/package.json")),
    "bin/vite.js",
  );
  const vite = spawn(
    process.execPath,
    [
      vitePath,
      "--host",
      "127.0.0.1",
      "--port",
      String(vuePort),
      "--strictPort",
    ],
    { cwd: join(root, "playground"), env: process.env, stdio: "ignore" },
  );
  try {
    for (let i = 0; i < 150; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${vuePort}`);
        if (response.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.goto(`http://127.0.0.1:${vuePort}/?standalone=1`, {
      waitUntil: "networkidle",
    });
    await page.locator(".implementation").waitFor();
    await page.evaluate(() => document.fonts.ready);
    const vueShot = join(out, "vue.png");
    await page.locator(".implementation").screenshot({ path: vueShot });
    const source = PNG.sync.read(await readFile(vueShot));
    assert.equal(source.width, 390);
    assert.equal(source.height, 844);
    const reference = PNG.sync.read(await readFile(join(out, "tw3.png")));
    let difference = 0;
    for (let i = 0; i < reference.data.length; i++)
      if (reference.data[i] !== source.data[i]) difference++;
    report.vue = {
      width: source.width,
      height: source.height,
      channelsDifferentFromTailwindReference: difference,
      rendered: true,
    };
    assert.equal(difference, 0, "Vue 页面与工具参考页不一致");
    const pair = new PNG({ width: 780, height: 844 });
    for (const [index, name] of ["reference", "vue"].entries()) {
      const image = PNG.sync.read(await readFile(join(out, `${name}.png`)));
      for (let y = 0; y < 844; y++)
        image.data.copy(
          pair.data,
          (y * 780 + index * 390) * 4,
          y * 390 * 4,
          (y + 1) * 390 * 4,
        );
    }
    await writeFile(join(out, "vue-comparison.png"), PNG.sync.write(pair));
    console.log(JSON.stringify({ stage: "vue-rendered", ...report.vue }));
  } finally {
    vite.kill();
  }
  const montage = new PNG({ width: 390 * 4, height: 844 });
  const labels = ["reference", "css", "tw3", "tw4"];
  for (const [index, label] of labels.entries()) {
    const image = PNG.sync.read(await readFile(join(out, `${label}.png`)));
    for (let y = 0; y < 844; y++)
      image.data.copy(
        montage.data,
        (y * 1560 + index * 390) * 4,
        y * 390 * 4,
        (y + 1) * 390 * 4,
      );
  }
  await writeFile(join(out, "comparison.png"), PNG.sync.write(montage));
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    stage: "complete",
    report: "./.moonvy-context-mcp.local/verification/report.json",
    comparison: "./.moonvy-context-mcp.local/verification/comparison.png",
  }),
);
