/** Subconjunto tipado de la respuesta de la REST API de Figma que usan las reglas. */

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaPaint {
  type: "SOLID" | "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND" | "IMAGE" | "VIDEO" | "EMOJI";
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  blendMode?: string;
  imageRef?: string;
}

export interface FigmaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  textCase?: string;
  fills?: FigmaPaint[];
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  opacity?: number;
  children?: FigmaNode[];
  absoluteBoundingBox?: FigmaRect | null;
  /** Caja realmente pintada (incluye sombras y contenido no recortado); la usa el informe HTML. */
  absoluteRenderBounds?: FigmaRect | null;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  characters?: string;
  style?: FigmaTypeStyle;
  characterStyleOverrides?: number[];
  styleOverrideTable?: Record<string, FigmaTypeStyle>;
  componentId?: string;
  clipsContent?: boolean;
  // Auto-layout (ver src/figma/layout.ts)
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";
  layoutWrap?: "NO_WRAP" | "WRAP";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "BASELINE";
  layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL";
  layoutSizingVertical?: "FIXED" | "HUG" | "FILL";
  layoutAlign?: "INHERIT" | "STRETCH" | "MIN" | "CENTER" | "MAX";
  layoutGrow?: number;
  layoutPositioning?: "AUTO" | "ABSOLUTE";
}

export interface FigmaNodesResponse {
  name: string;
  nodes: Record<string, { document: FigmaNode; components?: Record<string, { name: string }> } | null>;
}

export interface FigmaFileResponse {
  name: string;
  document: FigmaNode;
}
