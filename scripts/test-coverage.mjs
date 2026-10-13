import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

// 显式枚举测试文件，避免 Windows 和 POSIX shell 的通配符展开差异。
const tests = (await readdir("tests"))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => `tests/${name}`);
const result = spawnSync(
  process.execPath,
  ["--test", "--test-reporter=spec", ...tests],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
