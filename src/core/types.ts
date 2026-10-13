export type StyleFormat = "css" | "tailwind" | "hybrid";
export type CSSMap = Record<string, string>;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Color {
  r: number;
  g: number;
  b: number;
  alpha?: number;
}
export interface Fill {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: Color;
  gradient?: any;
  image?: any;
  imageId?: string;
  imageHash?: string;
  imageRef?: any;
  id?: string;
  url?: string;
  scaleMode?: string;
  imageTransform?: number[][];
  scalingFactor?: number;
  imageSize?: { width: number; height: number };
  [key: string]: unknown;
}
export interface TextSegment {
  start?: number;
  end?: number;
  fontName?: { family?: string; style?: string };
  fontSize?: number;
  fontWeight?: number;
  fills?: Fill[];
  letterSpacing?: { value: number; unit?: string };
  lineHeight?: { value: number; unit?: string };
  textDecoration?: string;
  textCase?: string;
  hyperlink?: { url?: string };
}
export interface Layer {
  id?: string;
  name?: string;
  type?: string;
  subType?: string;
  rect?: Rect;
  absoluteLayer?: { rect?: Rect; transform?: any };
  children?: Layer[];
  editState?: { hide?: boolean };
  blend?: {
    visible?: boolean;
    opacity?: number;
    isClip?: boolean;
    isMask?: boolean;
    isPureMask?: boolean;
  };
  autoLayout?: {
    isAutoLayoutContainer?: boolean;
    direction?: string;
    position?: string;
    mainAxisGap?: number;
    crossAxisGap?: number;
    mainAxisAlignItems?: string;
    crossAxisAlignItems?: string;
    wrap?: string;
    grow?: number;
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    [key: string]: unknown;
  };
  fills?: Fill[];
  strokes?: any[];
  effects?: any[];
  borderRadius?: number | number[];
  slices?: {
    max?: { id?: string; ratio?: number };
    base?: { id?: string; ratio?: number };
    svg?: { id?: string; ratio?: number };
  };
  snapshot?: string;
  textbox?: {
    text?: string;
    align?: string;
    alignVertical?: string;
    segments?: TextSegment[];
    fills?: Fill[];
    [key: string]: any;
  };
  transform?: any;
  [key: string]: any;
}
export interface Genome {
  genomeVer?: number;
  images?: Record<
    string,
    { url?: string; type?: string; width?: number; height?: number }
  >;
  pages?: Layer[];
  variables?: any;
  styles?: any;
  [key: string]: unknown;
}
export interface Asset {
  id: string;
  path: string;
  url: string;
  type: string;
  usedBy: string[];
}
export interface Diagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  layerId?: string;
}
export interface GenerateOptions {
  pageId?: string;
  unitScale?: number;
  styleFormat?: StyleFormat;
  tailwindVersion?: 3 | 4;
  includeLayerMarker?: boolean;
  strictTailwind?: boolean;
}
export interface GenerateResult {
  html: string;
  css: string;
  context: string;
  viewport: { width: number; height: number };
  assets: Asset[];
  previewUrl?: string;
  diagnostics: Diagnostic[];
  nodeMap: Record<string, string>;
  stats: {
    visibleLayers: number;
    renderedLayers: number;
    slices: number;
    textNodes: number;
  };
  styleFormat: StyleFormat;
}
export interface RenderNode {
  tag: "div" | "span" | "img" | "a" | "br";
  classes: string[];
  styles: CSSMap;
  attrs: Record<string, string>;
  children: RenderNode[];
  text?: string;
  layerId?: string;
  generatedClass?: string;
}
