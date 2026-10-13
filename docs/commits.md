# 提交说明规范

本项目使用 commitlint 与 Conventional Commits，格式为：

```text
type(scope): 描述
```

scope 可省略，描述默认使用中文。type 使用小写，描述不能为空，标题最多 100 个字符，末尾不加英文句点。

| type     | 使用场景           | 示例                                  |
| -------- | ------------------ | ------------------------------------- |
| feat     | 新增功能           | `feat(core): 支持新的图层类型`        |
| fix      | 修复错误           | `fix(mcp): 修复 Windows 资源目录校验` |
| docs     | 文档               | `docs: 更新接入说明`                  |
| test     | 测试               | `test: 补充 HTTP 错误场景`            |
| refactor | 保持行为的重构     | `refactor(core): 简化样式映射`        |
| perf     | 性能优化           | `perf(core): 优化图层遍历`            |
| style    | 格式调整           | `style: 统一代码格式`                 |
| build    | 依赖、构建配置     | `build: 更新 TypeScript`              |
| ci       | CI 流程            | `ci: 添加提交说明检查`                |
| chore    | 其他维护、版本发布 | `chore(release): 发布 0.0.2`          |
| revert   | 撤销改动           | `revert: 撤销上一版样式修改`          |

不兼容变更可用 `feat(core)!: 调整转换接口`，并在正文中说明影响和迁移方式。

## 本地校验

在仓库根目录执行 `pnpm install --frozen-lockfile` 后，prepare 脚本自动安装 Husky。每次 `git commit` 会通过 `.husky/commit-msg` 校验完整提交说明，不合规范时中止提交。

也可以直接调用：

```sh
pnpm lint:commit --edit /path/to/commit-message.txt
pnpm lint:commit --last --verbose
pnpm lint:commit --from <base-sha> --to <head-sha> --verbose
```

配置文件为 `commitlint.config.js`。中文描述可以包含 HTTP、MCP 等缩写；未限制描述的英文大小写。Git 自动生成的 merge 和 revert 等说明按 commitlint 默认规则处理。

CI 设置 `HUSKY=0`，不安装本地 Git 钩子。npm 包不包含 Husky 钩子和 commitlint 配置；这些工具只作为仓库的开发依赖。

参考 [commitlint 本地接入](https://commitlint.js.org/guides/local-setup.html)。
