export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // 中文描述和 HTTP、MCP 等缩写不受英文大小写规则限制。
    "subject-case": [0],
  },
};
