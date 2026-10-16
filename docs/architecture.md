# 架构与接口

## 数据链路

```text
月维文件 URL
 → POST api.moonvy.com/anynode/get（只在此携带 Authorization）
 → 兼容直接对象 / data / result 包装
 → files.genome.url → JSON / gzip / deflate
 → 共享样式展开、画板选择
 → 高分辨率设计预览 → 必要时局部素材回退
 → 交接包转换器 → HTML/CSS 或 Tailwind + 补充 CSS
 → 参考图片自动缓存、Tokens、按需素材清单、诊断、双语指引
 → inline 文本/图片，或 files resource_link
```

## 模块边界

- `src/core`：独立纯转换器，不处理凭据、网络或 MCP。`generate(genome, options)` 可直接复用。布局保持固定画板规格；不推断业务交互。
- `src/services`：认证 API、资源下载、响应解包与压缩解码；认证头不会发给资源 CDN。
- `src/utils`：链接、上下文、Tokens、文件交付和预览局部裁切。局部回退有明确来源诊断。
- `src/tools` / `src/mcp.ts`：单工具注册、图片返回与受输出根目录约束的资源读取。
- `src/config.ts` / `src/app.ts`：CLI/env、stdio 与无状态 HTTP。日志仅写 stderr。
- `playground` / `scripts/verify-live.mjs`：实际 SDK 调用、框架适配、CSS 编译与浏览器证据。

## 资源回退

缺失素材的局部从同一画板的 PNG 原图裁切，逐级累计 isFrame 坐标。已有导出切图优先，普通分组不增加 frame 原点。每个页面输出到 `<页面标题>-<8 位 hash>/`，PNG 裁切图直接放入该页面的 `assets/`，映射为真实 file URI；平台图片复用受主机和大小限制的下载通道，认证头不会发给 CDN。inline 和 files 均落盘预览与清单，远程客户端可通过 resources/read 按需读取清单及缓存图片。

由于裁切含背景，换背景、局部透明、复杂旋转与多重遮罩仍应优先找回设计师提供的原始素材。本工具不宣称这些局部由纯 CSS 还原。
