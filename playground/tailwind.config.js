export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,ts}",
    "./public/generated/**/*.html",
  ],
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};
