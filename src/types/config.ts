export interface ServerConfig {
  authorization: string;
  httpTimeout: number;
  isHttpMode: boolean;
  host: string;
  port: number;
  tailwindcss: boolean;
  twVersion: 3 | 4;
  skipSlices: boolean;
  previewFallback: boolean;
  unitScale: number;
  promptLang: "zh-CN" | "en-US";
  mode: "inline" | "files";
  outDir: string;
}
