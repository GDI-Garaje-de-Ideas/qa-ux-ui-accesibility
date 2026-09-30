import type { WcagLevel } from "../color/contrast.js";

export type Severity = "error" | "warning" | "info";

export interface Finding {
  rule: string;
  wcag: string;
  level: "A" | "AA" | "AAA" | "best-practice";
  severity: Severity;
  nodeId: string;
  nodeName: string;
  nodePath: string;
  link: string;
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;
}

export interface TextLayerInfo {
  nodeId: string;
  nodeName: string;
  nodePath: string;
  text: string;
  fontSizePx: number;
  fontWeight: number;
  fontFamily?: string;
  largeText: boolean;
  foreground: string | null;
  background: string | null;
  backgroundAssumed: boolean;
  backgroundUncertain: boolean;
  contrast: number | null;
  required: number;
  passes: boolean | null;
  width: number;
  height: number;
}

export interface InteractiveInfo {
  nodeId: string;
  nodeName: string;
  nodePath: string;
  type: string;
  width: number;
  height: number;
  matchedBy: string;
}

export interface AuditOptions {
  level: WcagLevel;
  fileKey: string;
  /** Umbral (px) por debajo del cual se avisa de texto pequeño. */
  minFontSizePx?: number;
}

export interface AuditResult {
  fileName: string;
  fileKey: string;
  rootNodeId: string;
  rootNodeName: string;
  level: WcagLevel;
  summary: { errors: number; warnings: number; infos: number; textLayers: number; interactiveElements: number; nodesVisited: number };
  findings: Finding[];
  textLayers: TextLayerInfo[];
  interactiveElements: InteractiveInfo[];
  notes: string[];
}
