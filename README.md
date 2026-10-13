# moonvy-context-mcp

[![npm](https://img.shields.io/npm/v/moonvy-context-mcp.svg?colorA=2878ff&colorB=000000)](https://www.npmjs.com/package/moonvy-context-mcp) [![downloads/month](https://img.shields.io/npm/dm/moonvy-context-mcp.svg?colorA=2878ff&colorB=000000)](https://www.npmjs.com/package/moonvy-context-mcp) [![Unit Test](https://img.shields.io/github/actions/workflow/status/zarkin404/moonvy-context-mcp/unit-test.yml?branch=main&colorA=2878ff&colorB=000000&label=Unit%20Test)](https://github.com/zarkin404/moonvy-context-mcp/actions/workflows/unit-test.yml) [![codecov](https://img.shields.io/codecov/c/github/zarkin404/moonvy-context-mcp?colorA=2878ff&colorB=000000)](https://codecov.io/gh/zarkin404/moonvy-context-mcp)

把月维设计稿整理成 AI 可用于还原页面的上下文。

## 特性

- 支持 `HTML+CSS` 和 `HTML+Tailwind CSS 3/4`，按目标项目的样式系统选择输出。
- 返回素材映射和下载命令，补充 Design Tokens、设计预览和实现指引。
- 提供 `inline` / `files` 两种模式；大稿可落盘为 `context.md` 和预览图，通过 resource_link 读取。
- 支持多画板选择；缺失图像或形状可用明确标注的局部预览裁切补充。

## 快速开始

### 环境要求

- Node.js >=22.12.0。
- 月维登录凭据。

### Step 1. 准备登录凭据

打开 Moonvy 官网登录后，再打开浏览器的开发者工具，在 Console 中执行来获取凭据：

```js
console.log(window.app?.api?.$options?.token);
```

在项目的本地的 `.env.local` 文件中保存月维登录凭据：

```dotenv
MOONVY_TOKEN=your_moonvy_token
```

凭据只保存在本地，勿提交到 Git。默认读取工作目录的 `.env.local`；已有外部配置文件可通过 `--env-file` 指定。进程环境变量优先于文件内容。

### Step 2. 配置 MCP

Claude Code（`.mcp.json`）/ Cursor（`.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "moonvy-context-mcp": {
      "command": "npx",
      "args": ["-y", "moonvy-context-mcp"]
    }
  }
}
```

Codex（`.codex/config.toml`）：

```toml
[mcp_servers.moonvy-context-mcp]
cwd = "/absolute/path/to/current-project"
command = "npx"
args = ["-y", "moonvy-context-mcp"]
```

全局配置的客户端可显式指定工作目录和外部凭据文件：

```json
{
  "mcpServers": {
    "moonvy-context-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "moonvy-context-mcp",
        "--cwd",
        "/absolute/path/to/current-project",
        "--env-file",
        "/absolute/path/to/.env"
      ]
    }
  }
}
```

Windows 下直接启动 npx 失败时，可使用 `command: "cmd"`，args 开头改为 `"/c", "npx", "-y", "moonvy-context-mcp"`，再追加其他参数。

### Step 3. 将月维链接交给 AI

```text
请根据这个月维设计稿实现页面：
https://moonvy.com/project/<projectId>/<dirId>/<fileId>
```

链接必须指向具体设计文件。核心工具为 `get_design_context({ url, pageId? })`：单画板仅需要 url，多画板未指定 pageId 时会返回画板列表，要求明确选择。

## 配置

| CLI                  | 环境变量           | 默认值                                   |
| -------------------- | ------------------ | ---------------------------------------- |
| `--cwd`              | `CWD`              | 进程工作目录                             |
| `--env-file`         | `ENV_FILE`         | `.env.local`                             |
| `--mode`             | `MODE`             | `inline`                                 |
| `--out-dir`          | `OUT_DIR`          | `.moonvy-context-mcp.local`              |
| `--tailwindcss`      | `TAILWINDCSS`      | `false`，输出 CSS                        |
| `--tw-version`       | `TW_VERSION`       | `3`，支持 3/4                            |
| `--skip-slices`      | `SKIP_SLICES`      | `false`；true 保留源地址，不生成下载映射 |
| `--unit-scale`       | `UNIT_SCALE`       | `1`，缩放 CSS px 数值                    |
| `--preview-fallback` | `PREVIEW_FALLBACK` | `true`，按需使用局部预览裁切             |
| `--prompt-lang`      | `PROMPT_LANG`      | `zh-CN`，支持 `en-US`                    |
| `--http-timeout`     | `HTTP_TIMEOUT`     | `30000` ms                               |
| `--http` / `--stdio` | `STDIO`            | stdio                                    |
| `--host` / `--port`  | `HOST` / `PORT`    | `127.0.0.1:5200`                         |

CLI 参数优先于环境变量。布尔环境变量支持 true/false 或 1/0。Tailwind 输出示例：

```dotenv
TAILWINDCSS=true
TW_VERSION=4
MODE=files
```

HTTP 模式：

```sh
npx -y moonvy-context-mcp --http --mode files
```

端点为 `POST http://127.0.0.1:5200/mcp`，采用无状态 Streamable HTTP。服务使用一份月维登录凭据，当前不提供多人账号管理。

## 输出与使用边界

- `inline` 直接返回上下文文本和 MCP 图片；`files` 写入上下文与预览，仅返回相应链接，适合大稿。
- files 模式同时保存 HTML、CSS、素材清单和诊断，便于检查。客户端可通过 MCP resources/read 读取输出目录内的产物。
- 图片映射用于下游 Agent 下载或复用素材，不会自动写入目标项目的业务资源目录。
- 不同画板、格式、语言和倍率分别保存；每次调用重新获取设计数据。
- 参考代码需要适配目标框架与样式系统，交互和接口以产品需求为准。
- Tailwind 无法表达的属性会保留在补充 CSS 中，必须一起加载。

部分 Genome 文件不含完整图像引用或形状路径。默认从同一画板的 PNG 预览裁切缺失的局部图层，并在诊断中标注 `preview-crop-fallback`。这些素材带原背景，不等于透明源切图；可以设置 `PREVIEW_FALLBACK=false` 关闭。

复杂仿射变换、mask 链、变量绑定及所有导入器版本尚未逐项覆盖；实现后应对照预览检查。详情见 [架构说明](https://github.com/zarkin404/moonvy-context-mcp/blob/main/docs/architecture.md)。

## 从 lanhu-context-mcp 迁移

1. 将启动包换为 `moonvy-context-mcp`；保留 `--mode`、`--tailwindcss`、`--tw-version`、`--unit-scale` 等通用参数，移除蓝湖专用参数。
2. 配置月维凭据，使用月维设计文件链接。
3. Tailwind 版本通过环境变量 `TW_VERSION` 或 CLI `--tw-version` 配置。
4. 将 `.moonvy-context-mcp.local/` 加入目标项目 `.gitignore`，并更新 AGENTS.md、skill 和提示词中的平台、服务与 URL 规则。
5. 确保运行环境满足 Node.js >=22.12.0；本包未覆盖蓝湖原先支持的全部 Node 20 环境。

如果脚本写死旧服务标识，过渡期可保留旧配置键，只替换启动包；更新引用后再改为月维标识。核心工具名仍为 get_design_context，中文指引默认开启。

## 参与开发

欢迎提交 issue 或 PR。仓库包含 MCP 服务和 Vue playground，开发环境使用 pnpm 9。

```sh
pnpm install --frozen-lockfile
pnpm build
```

无凭据检查：

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm play:build
pnpm test:package
```

真实设计验收需要本地月维凭据。通过 `MOONVY_TEST_URL` 指定有权限访问的单画板链接，再执行 `pnpm test:live`。浏览器可通过 `pnpm exec playwright install chromium` 安装。

`pnpm play` 启动 Vue 3 + Vite + Tailwind playground，展示设计原图、CSS/Tailwind 3/4 参考页和 Vue 实现页面。生成页面与素材被 Git 排除，`pnpm play:clean` 仅清理生成产物。详见 [playground 文档](https://github.com/zarkin404/moonvy-context-mcp/blob/main/playground/README.md)。

## 许可证

本项目采用 [MIT](LICENSE)。

## 参考

- 项目结构、工具边界和 playground 工作流参考 [REFINIST/lanhu-context-mcp](https://github.com/refinist/lanhu-context-mcp)（MIT）。
