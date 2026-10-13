<script setup lang="ts">
import { ref } from "vue";
const mode = ref("css");
const standalone = new URLSearchParams(location.search).has("standalone");
const pages = Object.entries(
  import.meta.glob("./pages/**/*.vue", { eager: true, import: "default" }),
);
const chosen = ref(pages[0]?.[0] || "");
</script>
<template>
  <main v-if="!standalone">
    <h1>Moonvy MCP Playground</h1>
    <p>
      通过真实 MCP 调用生成上下文，再在 pages
      中实现页面；下方原始参考用于检查转换器。
    </p>
    <nav>
      <label
        >转换格式
        <select v-model="mode">
          <option value="css">CSS</option>
          <option value="tw3">Tailwind 3</option>
          <option value="tw4">Tailwind 4</option>
        </select></label
      ><a :href="`/generated/${mode}/index.html`" target="_blank"
        >打开独立参考页面</a
      >
    </nav>
    <section class="comparison">
      <div>
        <h2>设计原图</h2>
        <img
          src="/generated/preview.png"
          alt="设计原图"
          width="390"
          height="844"
        />
      </div>
      <div>
        <h2>转换结果</h2>
        <iframe
          :key="mode"
          :src="`/generated/${mode}/index.html`"
          title="转换结果"
          width="390"
          height="844"
        ></iframe>
      </div>
    </section>
    <section v-if="pages.length">
      <h2>Agent 实现页面</h2>
      <select v-model="chosen">
        <option v-for="[name] in pages" :key="name">{{ name }}</option>
      </select>
      <div class="implementation">
        <component :is="pages.find(([name]) => name === chosen)?.[1]" />
      </div>
    </section>
  </main>
  <div v-else class="implementation">
    <component :is="pages.find(([name]) => name === chosen)?.[1]" />
  </div>
</template>
<style scoped>
main {
  padding: 24px;
}
h1 {
  margin-top: 0;
}
nav {
  display: flex;
  gap: 24px;
  align-items: center;
}
select {
  margin-left: 8px;
  padding: 6px;
}
.comparison {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}
iframe {
  border: 0;
  background: white;
}
img {
  display: block;
}
.implementation {
  width: 390px;
  overflow: hidden;
}
</style>
