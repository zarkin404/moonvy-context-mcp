export const CREDENTIALS_MISSING =
  "MOONVY_CREDENTIALS_MISSING：未配置月维凭据。请在 MCP 运行环境中设置 MOONVY_TOKEN 或 MOONVY_AUTHORIZATION，或通过 --env-file 指定环境文件，配置后重启 MCP。请向用户说明原因，勿猜测缺失的设计信息。";
export const TOOL_DESCRIPTION =
  "读取月维设计稿，返回 HTML+CSS/Tailwind、本地参考图片清单、Design Tokens、实现指引和设计图预览。";
export const URL_INPUT_DESCRIPTION =
  "完整月维设计文件链接：https://moonvy.com/project/<projectId>/<dirId>/<fileId>。";
export const guide = (name: string) => `设计稿：${name}
1. 先检查目标仓库的技术栈、样式系统、已有组件、字体和 Tokens，再将参考代码适配到项目。
2. 保留设计中的尺寸、颜色、间距和排版；固定画板坐标是参考规格，响应式行为按目标项目需求处理。
3. 按目标项目的素材规范和技能约束，结合图片的清晰度、完整性及实际用途，选择复用所列图片，或替换为用户提供的高清素材。切图覆盖的子树不要重复绘制。
4. Tailwind 附带的补充 CSS 必须一起加载。不要丢弃不支持的属性，不要使用运行时 Tailwind CDN。
5. HTML/CSS 为转换参考；诊断中标注的缺失资源或近似属性需对照原图。Tokens 作为补充。
6. 交互、接口和业务状态以明确的产品要求为依据。
7. 完成后对照设计预览检查主要布局、文字和素材；需要时使用项目的浏览器验收工具。`;
