import { readFileSync } from "node:fs";

// 源码和发布包都从各自根目录的 package.json 读取身份信息，版本只维护一处。
const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { name: string; version: string; description: string };

export const packageInfo = {
  name: manifest.name,
  version: manifest.version,
  description: manifest.description,
};
