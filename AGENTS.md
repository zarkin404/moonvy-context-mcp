# 工作约定

- 默认中文沟通、注释与文档。
- 提交说明使用 Conventional Commits：`type(scope): 中文描述`，scope 可省略。
- 转换器在 src/core，API 与 MCP 适配保持独立。
- 凭据仅从环境变量或外部 env 文件读取，禁止写入产物、测试、日志或提交。
- 改动后运行 pnpm typecheck、pnpm test、pnpm play:build；转换改动需 pnpm test:live。
- 视觉验收保留完整画板和原始像素单位；只修转换错误，不做产品布局改动。
