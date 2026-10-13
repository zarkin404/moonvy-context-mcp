import type { Asset, Diagnostic, Fill, Genome, Layer } from "./types.js";
import { fnv1a36 } from "./util.js";
const safeId = (id: string) =>
  (id.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "image")
    .slice(0, 48)
    .replace(/_/g, "-");
function allowResourceUrl(url: string): boolean {
  try {
    const x = new URL(url);
    return (
      x.protocol === "https:" ||
      x.protocol === "http:" ||
      x.protocol === "file:"
    );
  } catch {
    return false;
  }
}
export class AssetRegistry {
  readonly files = new Map<string, Asset>();
  private refs = new Map<string, Asset>();
  private urls = new Map<string, Asset>();
  constructor(
    private genome: Genome,
    private diagnostics: Diagnostic[],
  ) {}
  add(
    id: string | undefined,
    layerId: string,
    typeHint?: string,
    urlHint?: string,
  ): Asset | undefined {
    const key = String(id || urlHint || "");
    if (!key) return;
    const known = this.refs.get(key);
    if (known) {
      if (!known.usedBy.includes(layerId)) known.usedBy.push(layerId);
      return known;
    }
    const image = this.genome.images?.[key],
      url = urlHint || image?.url;
    if (!url || !allowResourceUrl(url)) {
      this.diagnostics.push({
        code: "asset-url-missing",
        severity: "warning",
        message: `Asset is unavailable: ${key}`,
        layerId,
      });
      return;
    }
    const same = this.urls.get(url);
    if (same) {
      same.usedBy.push(layerId);
      this.refs.set(key, same);
      return same;
    }
    let type =
      String(
        typeHint ||
          image?.type ||
          /\.([a-zA-Z]{2,5})(?:\?|$)/.exec(url)?.[1] ||
          "png",
      )
        .replace(/^\./, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "png";
    if (type === "jpeg") type = "jpg";
    // 文件扩展名只使用已知图片类型。
    if (
      !["png", "jpg", "gif", "webp", "avif", "bmp", "svg", "ico"].includes(type)
    )
      type = "png";
    let path = `assets/${safeId(key)}.${type}`;
    if (this.files.has(path))
      path = `assets/${safeId(key)}-${fnv1a36(key)}.${type}`;
    const a: Asset = { id: key, url, path, type, usedBy: [layerId] };
    this.files.set(path, a);
    this.refs.set(key, a);
    this.urls.set(url, a);
    return a;
  }
  slice(layer: Layer): Asset | undefined {
    const s = layer.slices,
      id = layer.id ?? "unknown";
    const vector = layer.subType === "vector" || layer.subType === "line";
    const candidates = vector
      ? [
          s?.svg,
          s?.max,
          s?.base,
          layer.snapshot ? { id: layer.snapshot } : undefined,
        ]
      : [
          s?.max,
          s?.base,
          s?.svg,
          layer.snapshot ? { id: layer.snapshot } : undefined,
        ];
    for (const c of candidates)
      if (c?.id) {
        const a = this.add(c.id, id, c === s?.svg ? "svg" : undefined);
        if (a) return a;
      }
    return;
  }
  imageFills(layer: Layer): { asset: Asset; fill: Fill }[] {
    const out: { asset: Asset; fill: Fill }[] = [];
    for (const f of layer.fills ?? []) {
      if (f.type !== "image" || f.visible === false) continue;
      const obj = typeof f.image === "object" ? f.image : undefined;
      const id =
        f.imageId ||
        f.imageHash ||
        (typeof f.imageRef === "string" ? f.imageRef : undefined) ||
        obj?.id ||
        f.id;
      const url = f.url || obj?.url;
      const asset = this.add(
        String(id || url || ""),
        layer.id ?? "unknown",
        undefined,
        url,
      );
      if (asset) out.push({ asset, fill: f });
    }
    return out;
  }
  listing(): Asset[] {
    return [...this.files.values()];
  }
}
