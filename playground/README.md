# Moonvy MCP Playground

Vue 3 + Vite + Tailwind 3 的设计稿验收场地，复刻蓝湖 playground 的“链接 → MCP 上下文 → 页面实现 → 浏览器预览”能力。

先在仓库根目录加载外部凭据并执行 `pnpm test:live`，再执行 `pnpm play`，打开 http://127.0.0.1:4173。

首页展示原设计图、CSS/Tailwind 3/Tailwind 4 参考页，以及 `src/pages` 中的 Vue 页面。参考页面与素材由真实 MCP 调用产生；所有生成物均被 Git 排除。Agent 可另外编写 `src/pages/*.vue`，页面会自动加入选择列表。

干净检出可直接运行 `pnpm play:build`，不需要月维凭据或 generated 产物。预览图与参考页按运行时 URL 加载，实际浏览验收前仍需生成对应产物。

验收使用完整画板、原始 px 和本地编译的 Tailwind，不去掉状态栏、不放大内容、不引入响应式偏移。参考页面无 Tailwind Preflight；宿主项目使用自己的样式系统时应检查 reset 对边框、行高和图片布局的影响。

`pnpm play:clean` 仅删除 `generated` 目录与 MCP 本地产物，不删除手写页面或凭据。团队的日常实现约定可参考根目录 README 的 MCP 配置。
