export interface MoonvyUrlParams {
  projectId: string;
  dirId: string;
  fileId: string;
}
export function parseMoonvyUrl(value: string): MoonvyUrlParams {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("请输入完整的月维设计稿链接。");
  }
  if (
    url.protocol !== "https:" ||
    !["moonvy.com", "www.moonvy.com"].includes(url.hostname)
  )
    throw new Error("链接必须来自 https://moonvy.com。");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 4 || parts[0] !== "project")
    throw new Error(
      "需要具体设计文件链接：/project/<projectId>/<dirId>/<fileId>。",
    );
  const ids = parts.slice(1).map(decodeURIComponent);
  if (ids.some((id) => !/^[\w-]+$/.test(id)))
    throw new Error("月维链接包含无效 ID。");
  return { projectId: ids[0]!, dirId: ids[1]!, fileId: ids[2]! };
}
