import type { Genome, Layer } from "./types.js";
// 只展开已存在的共享样式；不从组件名猜测缺失的素材或几何。
export function normalizeGenome(input: Genome): Genome {
  const genome = structuredClone(input);
  const styles = new Map<string, any>();
  for (const values of Object.values(genome.styles || {}))
    if (Array.isArray(values))
      for (const style of values) if (style.id) styles.set(style.id, style);
  function link(target: any, id: string | undefined, key: string) {
    const style = id && styles.get(id);
    if (style?.data) target[key] = structuredClone(style.data);
  }
  let count = 0;
  function visit(layer: Layer, depth: number) {
    if (++count > 10000 || depth > 128) return;
    link(layer, layer.fillLink, "fills");
    link(layer, layer.effectLink, "effects");
    for (const stroke of layer.strokes || [])
      link(stroke, stroke.fillLink, "fills");
    for (const child of layer.children || []) visit(child, depth + 1);
  }
  for (const page of genome.pages || []) visit(page, 0);
  return genome;
}
