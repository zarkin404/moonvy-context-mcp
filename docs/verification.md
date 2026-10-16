# 端到端验收记录

日期：2026-10-13。设计稿：设备中心-连接成功-已连接，画板 390×844。测试链接为本次用户指定的月维设计文件。

## 验证路径

1. shell 中 `source` 外部 `.env`，凭据未读取到对话、未写入项目文件。
2. 真实 SDK stdio 客户端执行 `get_design_context`，覆盖 CSS、Tailwind 3、Tailwind 4 的 files 模式与 inline 模式。
3. 验证 resource_link 可通过 MCP resources/read 读取；HTTP files 也通过真实客户端验证。
4. 按工具返回的素材映射下载全部 17 个素材：14 个源切图，3 个明确标注的局部预览裁切。
5. 在本地真实编译 Tailwind 3/4；Chromium 以 390×844、DPR=1 加载完整页面，检查图片与脚本错误并截图。
6. 直接消费返回的 context.md，适配为 Vue 组件，复制素材并更新引用；通过 Vite 渲染独立页面，与 Tailwind 参考页逐像素对照。

## 结果

| 格式 | 缺图 | 页面脚本错误 | RGB 平均绝对通道差（0–255） | 差异像素占比（阈值 24） |
| ---- | ---- | ------------ | --------------------------- | ----------------------- |
| css  | 0    | 0            | 2.641                       | 3.32%                   |
| tw3  | 0    | 0            | 2.641                       | 3.32%                   |
| tw4  | 0    | 0            | 2.641                       | 3.32%                   |

Vue 适配页面与 Tailwind 3 工具参考页的不同通道数为 **0**。这证明本样本经过 MCP、资源引用、Tailwind 编译和 Vue 模板适配后没有引入额外视觉差异。

上述差异像素的定义是同一位置的 R/G/B 任一通道相差超过 24；原图为 780×1688，按 2×2 像素平均缩小到 390×844。该比例不是“还原准确率”，也不是跨项目的通用验收标准。

## 定位并修复的问题

- 初版未处理 `autoLayout.padding[]`、盒模型与隐藏 fill，造成卡片错位和白色文字背景。
- `fillLink` 未展开，导致底部安全区指示条消失。
- 导出切图被 CSS 再次旋转，导致电量图标朝向错误；零高度线条也需要保留描边厚度。
- Tailwind 字体任意值缺少类型提示，被识别为字重；已改为 `font-[family-name:...]`。
- 文字容器继承宿主默认字体，导致行盒高度不同；已继承第一文字段的源排版。
- `preview.normal` 只有 119×256，不能用于精细验收；改为优先 780×1688 的 `preview.large`。

对官方代码只做了定点查询：`app.ddc2df024d.js` 中的 `isBorderBox` 和 padding 编码、`d4.37236c587c.js` 中的 `image-fill-reference-missing` 与 `asset-fallback-missing`。

## 剩余差异与范围

布局、主要文字和素材已基本还原。原稿与实现仍有少量文字抗锯齿、边缘及细线位置差异，未宣称像素完全一致。

设备图片缺少 image 引用，两个状态栏图标缺少形状路径。官方转换逻辑也无法从这类空引用还原素材；当前从设计预览裁切三个对应局部并明确标注。它们包含原背景，不能替代透明原始素材；`PREVIEW_FALLBACK=false` 可关闭此行为。

复杂变换、mask 链、变量绑定和其他导入器版本未在本样本中充分覆盖，需要后续真实设计稿扩充回归样本。

## 查看与复现

- `pnpm test`：24 项转换、API、协议与裁切回归。
- `pnpm typecheck`：TypeScript 检查。
- `pnpm play:build`：Vue/Vite 生产构建。
- 已通过 shell 加载凭据后运行 `pnpm test:live`，自动重新获取设计并生成验证证据。
- `pnpm play`：打开 http://127.0.0.1:4173；独立 Vue 页为 `/?standalone=1`。

证据目录 `.moonvy-context-mcp.local/verification/` 已被 Git 排除，包含 `report.json`、`reference.png`、`css.png`、`tw3.png`、`tw4.png`、`vue.png`、`comparison.png` 与 `vue-comparison.png`。生成的 Vue 页面、素材和原始 Genome 也仅保存在被忽略的本地目录。

原图与 Vue 页面（左原图、右实现）：

![原图与 Vue 对照](../.moonvy-context-mcp.local/verification/vue-comparison.png)

## 独立 HTML 预览

Tailwind 模式导出的 `index.html` 根据 `TW_VERSION` 加载对应 Play CDN：版本 3 使用 `https://cdn.tailwindcss.com`，版本 4 使用 `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4`。联网后无需先编译 Tailwind 即可查看页面；MCP 默认将引用图片缓存到对应 `assets/` 目录，非空的补充 `style.css` 也须保留。

CDN 仅用于独立预览。交给项目集成的 `context.md` 只包含正文结构和所需补充样式，不包含 CDN 脚本；正式页面继续使用项目自己的 Tailwind 构建。普通 CSS 模式不引入 CDN。

`pnpm test:live` 的截图回归会移除预览 CDN，并使用本地 Tailwind 编译结果，保持与既有基准一致。

## 页面输出目录

每个页面的产物使用 `<页面标题>-<8 位 hash>/` 目录。优先使用所选画板名称，缺失时使用设计文件名称；标题会清理文件名禁用字符，hash 继续区分画板与输出配置。同名页面不会互相覆盖。

`context.md`、`index.html`、`style.css`、`assets.json`、`diagnostics.json` 和 `preview.png` 放在页面目录内；参考图片和预览裁切图统一位于该目录的 `assets/`。不再创建输出根目录下共享的 `preview-assets/`。
