import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// 只清理工具生成目录，不删除手写页面、共享素材或凭据文件。
for (const path of ['../public/generated/', '../src/pages/generated/', '../src/assets/imgs/generated/', '../../.moonvy-context-mcp.local/']) await rm(fileURLToPath(new URL(path, import.meta.url)), { recursive:true, force:true });
console.log('已清理 MCP 与 playground 生成产物。');
