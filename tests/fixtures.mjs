export const url = "https://moonvy.com/project/project/dir/file";
export const config = {
  authorization: "Bearer test-only-not-a-secret",
  httpTimeout: 30000,
  isHttpMode: false,
  host: "127.0.0.1",
  port: 5200,
  tailwindcss: false,
  twVersion: 3,
  skipSlices: false,
  previewFallback: false,
  unitScale: 1,
  promptLang: "zh-CN",
  mode: "inline",
  outDir: "/tmp/moonvy-test",
};
export const genome = {
  genomeVer: 1.9,
  pages: [
    {
      id: "page",
      name: "测试画板",
      isFrame: true,
      rect: { x: 0, y: 0, w: 390, h: 844 },
      children: [
        {
          id: "text",
          rect: { x: 10, y: 20, w: 100, h: 20 },
          textbox: {
            text: "Hello <Moonvy>",
            segments: [
              {
                start: 0,
                end: 14,
                fontName: { family: "Arial", style: "Regular" },
                fontSize: 16,
                fills: [{ type: "color", color: { r: 1, g: 2, b: 3 } }],
              },
            ],
          },
        },
        {
          id: "slice",
          rect: { x: 20, y: 40, w: 24, h: 24 },
          slices: { max: { id: "img" } },
          children: [{ id: "baked", textbox: { text: "切图中的文字" } }],
        },
        {
          id: "hidden",
          editState: { hide: true },
          textbox: { text: "隐藏文字" },
        },
      ],
    },
  ],
  images: { img: { url: "https://fs.moonvy.com/test.png", type: "png" } },
};
