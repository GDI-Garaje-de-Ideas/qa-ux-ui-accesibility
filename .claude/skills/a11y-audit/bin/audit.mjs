#!/usr/bin/env node
import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// src/figma/token-store.ts
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
function tokenFilePath() {
  const base2 = process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config");
  return path.join(base2, "figma-a11y", "token");
}
function readStoredToken() {
  const file = tokenFilePath();
  if (!existsSync(file)) return void 0;
  const token = readFileSync(file, "utf8").trim();
  return token || void 0;
}

// src/figma/client.ts
var API = "https://api.figma.com/v1";
var FigmaApiError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "FigmaApiError";
  }
  status;
};
function resolveToken(explicit) {
  const found = findToken(explicit);
  if (!found) {
    throw new FigmaApiError(
      "Falta el token de Figma. Ejecuta en tu terminal `node <carpeta del skill>/bin/configurar.mjs` para guardarlo (Figma > Settings > Security > Personal access tokens, con permiso \xABFile content: Read\xBB)."
    );
  }
  return found.token;
}
function findToken(explicit) {
  const candidates = [
    [explicit, "argumento"],
    [process.env.FIGMA_TOKEN, "FIGMA_TOKEN"],
    [process.env.FIGMA_API_KEY, "FIGMA_API_KEY"]
  ];
  for (const [token, source] of candidates) if (token?.trim()) return { token: token.trim(), source };
  const stored = readStoredToken();
  return stored ? { token: stored, source: "archivo" } : void 0;
}
async function figmaGet(path2, token) {
  const res = await fetch(`${API}${path2}`, { headers: { "X-Figma-Token": token } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const hint = res.status === 401 ? "Token inv\xE1lido o caducado: vuelve a configurarlo con configurar.mjs." : res.status === 403 ? "Token inv\xE1lido o sin permiso sobre el archivo." : res.status === 404 ? "Archivo o nodo no encontrado. Comprueba la clave del archivo y el node-id." : res.status === 429 ? "L\xEDmite de peticiones de la API de Figma alcanzado. Espera un momento y reintenta." : "";
    throw new FigmaApiError(`Figma API ${res.status} en ${path2}. ${hint} ${body.slice(0, 200)}`.trim(), res.status);
  }
  return await res.json();
}
async function fetchNodes(fileKey, nodeIds, token) {
  const ids = nodeIds.map((id) => encodeURIComponent(id)).join(",");
  const data = await figmaGet(`/files/${fileKey}/nodes?ids=${ids}`, token);
  const nodes = [];
  for (const id of nodeIds) {
    const entry = data.nodes[id];
    if (!entry) throw new FigmaApiError(`El nodo ${id} no existe en el archivo ${fileKey}.`, 404);
    nodes.push(entry.document);
  }
  return { fileName: data.name, nodes };
}
async function fetchFileOutline(fileKey, token) {
  const data = await figmaGet(`/files/${fileKey}?depth=2`, token);
  const pages = (data.document.children ?? []).map((page) => ({
    id: page.id,
    name: page.name,
    frames: (page.children ?? []).map((f) => ({ id: f.id, name: f.name }))
  }));
  return { fileName: data.name, pages };
}

// src/figma/layout.ts
function normalizeAutoLayout(root) {
  const tree = structuredClone(root);
  hugPass(tree);
  placePass(tree);
  return tree;
}
var H = { pos: "x", size: "width" };
var V = { pos: "y", size: "height" };
function isFlow(n) {
  return (n.layoutMode === "HORIZONTAL" || n.layoutMode === "VERTICAL") && n.layoutWrap !== "WRAP";
}
function flowChildren(n) {
  return (n.children ?? []).filter((c) => c.visible !== false && c.layoutPositioning !== "ABSOLUTE" && c.absoluteBoundingBox);
}
function axes(n) {
  const vertical = n.layoutMode === "VERTICAL";
  const primary = vertical ? V : H;
  const counter = vertical ? H : V;
  const pad = {
    primaryStart: (vertical ? n.paddingTop : n.paddingLeft) ?? 0,
    primaryEnd: (vertical ? n.paddingBottom : n.paddingRight) ?? 0,
    counterStart: (vertical ? n.paddingLeft : n.paddingTop) ?? 0,
    counterEnd: (vertical ? n.paddingRight : n.paddingBottom) ?? 0
  };
  return { vertical, primary, counter, pad };
}
function sizing(n, axis) {
  return axis === H ? n.layoutSizingHorizontal : n.layoutSizingVertical;
}
function hugPass(n) {
  n.children?.forEach(hugPass);
  const box = n.absoluteBoundingBox;
  if (!box || !isFlow(n)) return;
  const kids = flowChildren(n);
  if (kids.length === 0) return;
  const { primary, counter, pad } = axes(n);
  const spacing = n.itemSpacing ?? 0;
  if (fitsContent(n, primary) && n.primaryAxisAlignItems !== "SPACE_BETWEEN") {
    const content = kids.reduce((s, c) => s + c.absoluteBoundingBox[primary.size], 0) + spacing * (kids.length - 1);
    resize(n, primary, content + pad.primaryStart + pad.primaryEnd);
  }
  if (fitsContent(n, counter)) {
    const content = Math.max(...kids.map((c) => c.absoluteBoundingBox[counter.size]));
    resize(n, counter, content + pad.counterStart + pad.counterEnd);
  }
}
function fitsContent(n, axis) {
  const s = sizing(n, axis);
  return s === "HUG" || s === "FILL";
}
function stretches(c, counter) {
  return c.layoutAlign === "STRETCH" || sizing(c, counter) === "FILL";
}
function placePass(n) {
  const box = n.absoluteBoundingBox;
  if (box && isFlow(n) && n.primaryAxisAlignItems !== "SPACE_BETWEEN") {
    const kids = flowChildren(n);
    const { primary, counter, pad } = axes(n);
    const spacing = n.itemSpacing ?? 0;
    const innerPrimary = box[primary.size] - pad.primaryStart - pad.primaryEnd;
    const innerCounter = box[counter.size] - pad.counterStart - pad.counterEnd;
    for (const c of kids) if (stretches(c, counter)) resize(c, counter, innerCounter);
    const growers = kids.filter((c) => (c.layoutGrow ?? 0) > 0 || sizing(c, primary) === "FILL");
    const fixedLen = kids.filter((c) => !growers.includes(c)).reduce((s, c) => s + c.absoluteBoundingBox[primary.size], 0);
    const free = innerPrimary - fixedLen - spacing * Math.max(0, kids.length - 1);
    if (growers.length > 0 && free > 0) for (const c of growers) resize(c, primary, free / growers.length);
    const total = kids.reduce((s, c) => s + c.absoluteBoundingBox[primary.size], 0) + spacing * Math.max(0, kids.length - 1);
    const slack = Math.max(0, innerPrimary - total);
    const align = n.primaryAxisAlignItems ?? "MIN";
    let cursor = box[primary.pos] + pad.primaryStart + (align === "CENTER" ? slack / 2 : align === "MAX" ? slack : 0);
    for (const c of kids) {
      const cb = c.absoluteBoundingBox;
      const counterAlign = stretches(c, counter) ? "MIN" : n.counterAxisAlignItems ?? "MIN";
      const counterSlack = innerCounter - cb[counter.size];
      const counterPos = box[counter.pos] + pad.counterStart + (counterAlign === "CENTER" ? counterSlack / 2 : counterAlign === "MAX" ? counterSlack : 0);
      const dPrimary = cursor - cb[primary.pos];
      const dCounter = counterPos - cb[counter.pos];
      translate(c, primary === H ? dPrimary : dCounter, primary === H ? dCounter : dPrimary);
      cursor += cb[primary.size] + spacing;
    }
  }
  n.children?.forEach(placePass);
}
function resize(n, axis, value) {
  const box = n.absoluteBoundingBox;
  if (!box || !(value > 0)) return;
  const delta = value - box[axis.size];
  if (Math.abs(delta) < 0.01) return;
  box[axis.size] = value;
  if (n.absoluteRenderBounds) n.absoluteRenderBounds[axis.size] = Math.max(0, n.absoluteRenderBounds[axis.size] + delta);
}
function translate(n, dx, dy) {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
  const move = (r2) => {
    if (r2) {
      r2.x += dx;
      r2.y += dy;
    }
  };
  move(n.absoluteBoundingBox);
  move(n.absoluteRenderBounds);
  n.children?.forEach((c) => translate(c, dx, dy));
}

// src/figma/url.ts
var PATH_RE = /figma\.com\/(design|file|proto|board)\/([A-Za-z0-9]+)(?:\/|$|\?)/;
function parseFigmaUrl(input) {
  const trimmed = input.trim();
  const m = PATH_RE.exec(trimmed);
  if (!m) {
    throw new Error(
      `No reconozco "${input}" como un enlace de Figma. Formato esperado: https://www.figma.com/design/<fileKey>/<nombre>?node-id=12-34`
    );
  }
  const kind = m[1];
  const fileKey = m[2];
  let nodeId;
  try {
    const url2 = new URL(trimmed);
    const raw = url2.searchParams.get("node-id");
    if (raw) nodeId = normalizeNodeId(raw);
  } catch {
  }
  return { fileKey, nodeId, kind };
}
function normalizeNodeId(raw) {
  return decodeURIComponent(raw).replace(/-/g, ":");
}
function figmaNodeLink(fileKey, nodeId) {
  return `https://www.figma.com/design/${fileKey}/?node-id=${nodeId.replace(":", "-")}`;
}

// src/color/contrast.ts
function channelToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function relativeLuminance({ r: r2, g, b }) {
  return 0.2126 * channelToLinear(r2) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}
function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}
function compositeOver(top, under) {
  const a = clamp01(top.a);
  return {
    r: top.r * a + under.r * (1 - a),
    g: top.g * a + under.g * (1 - a),
    b: top.b * a + under.b * (1 - a)
  };
}
function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}
function toHex({ r: r2, g, b }) {
  const h = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${h(r2)}${h(g)}${h(b)}`.toUpperCase();
}
var WHITE = { r: 1, g: 1, b: 1 };
function isLargeText(fontSizePx, fontWeight) {
  return fontSizePx >= 24 || fontSizePx >= 18.66 && fontWeight >= 700;
}
function requiredTextContrast(level2, large) {
  if (level2 === "AAA") return large ? 4.5 : 7;
  return large ? 3 : 4.5;
}
var NON_TEXT_CONTRAST = 3;
function round2(n) {
  return Math.round(n * 100) / 100;
}

// src/rules/background.ts
var BOX_TYPES = /* @__PURE__ */ new Set(["RECTANGLE", "FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "SECTION"]);
var SHAPE_TYPES = /* @__PURE__ */ new Set(["ELLIPSE", "VECTOR", "STAR", "POLYGON", "BOOLEAN_OPERATION", "LINE", "REGULAR_POLYGON"]);
function effectiveSolidFills(paints, cumulativeOpacity) {
  if (!paints) return [];
  const out = [];
  for (const p of paints) {
    if (p.visible === false || p.type !== "SOLID" || !p.color) continue;
    out.push({ r: p.color.r, g: p.color.g, b: p.color.b, a: p.color.a * (p.opacity ?? 1) * cumulativeOpacity });
  }
  return out;
}
function hasNonSolidVisibleFill(paints) {
  if (!paints) return null;
  for (const p of paints) {
    if (p.visible === false) continue;
    if (p.type === "IMAGE" || p.type === "VIDEO") return "image";
    if (p.type.startsWith("GRADIENT")) return "gradient";
  }
  return null;
}
function layersForNode(node, cumulativeOpacity) {
  const rect = node.absoluteBoundingBox;
  if (!rect || node.type === "TEXT") return [];
  const fillsBox = BOX_TYPES.has(node.type);
  const isShape = SHAPE_TYPES.has(node.type);
  if (!fillsBox && !isShape) return [];
  const layers = [];
  const nonSolid = hasNonSolidVisibleFill(node.fills);
  if (nonSolid) {
    layers.push({ nodeId: node.id, name: node.name, rect, kind: nonSolid, fillsBox });
  }
  for (const color of effectiveSolidFills(node.fills, cumulativeOpacity)) {
    if (color.a <= 0) continue;
    layers.push({ nodeId: node.id, name: node.name, rect, kind: fillsBox ? "solid" : "shape", color, fillsBox });
  }
  return layers;
}
function intersectionRatio(target, layer) {
  const x1 = Math.max(target.x, layer.x);
  const y1 = Math.max(target.y, layer.y);
  const x2 = Math.min(target.x + target.width, layer.x + layer.width);
  const y2 = Math.min(target.y + target.height, layer.y + layer.height);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return 0;
  const area = target.width * target.height;
  if (area <= 0) return 0;
  return w * h / area;
}
var COVER_THRESHOLD = 0.98;
var PARTIAL_THRESHOLD = 0.05;
function resolveBackground(target, painted, excludeNodeId) {
  let color = WHITE;
  let foundOpaque = false;
  let uncertain = false;
  const stack = [];
  const reasons = [];
  for (const layer of painted) {
    if (excludeNodeId && layer.nodeId === excludeNodeId) continue;
    const ratio = intersectionRatio(target, layer.rect);
    if (ratio < PARTIAL_THRESHOLD) continue;
    if (layer.kind === "gradient" || layer.kind === "image") {
      uncertain = true;
      reasons.push(`"${layer.name}" tiene un relleno de ${layer.kind === "image" ? "imagen" : "degradado"} bajo el elemento`);
      continue;
    }
    if (!layer.color) continue;
    if (layer.kind === "shape" || ratio < COVER_THRESHOLD) {
      uncertain = true;
      reasons.push(`"${layer.name}" cubre parcialmente el elemento (${Math.round(ratio * 100)}%)`);
      continue;
    }
    if (layer.color.a >= 0.999) {
      color = { r: layer.color.r, g: layer.color.g, b: layer.color.b };
      stack.length = 0;
      reasons.length = 0;
      uncertain = false;
      foundOpaque = true;
    } else {
      color = compositeOver(layer.color, color);
    }
    stack.push(hexOf(color));
  }
  return { color, stack, assumed: !foundOpaque, uncertain, reasons };
}
function hexOf(c) {
  const h = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase();
}

// src/rules/engine.ts
var INTERACTIVE_RE = /\b(button|btn|cta|link|tab|chip|toggle|switch|checkbox|check box|radio|input|text ?field|search|select|dropdown|combo ?box|menu ?item|nav ?item|nav ?link|icon ?button|fab|slider|stepper|pagination|accordion|segmented)\b/i;
var GENERIC_NAME_RE = /^(rectangle|image|frame|ellipse|vector|group|img|picture|photo)\s*\d*$/i;
var MIN_TARGET = 24;
var RECOMMENDED_TARGET = 44;
var DEFAULT_MIN_FONT = 12;
function auditTree(root, fileName, opts) {
  const ctx = { opts, painted: [], findings: [], textLayers: [], interactive: [], notes: /* @__PURE__ */ new Set(), visited: 0 };
  walk(root, [], 1, false, ctx);
  const summary = {
    errors: ctx.findings.filter((f) => f.severity === "error").length,
    warnings: ctx.findings.filter((f) => f.severity === "warning").length,
    infos: ctx.findings.filter((f) => f.severity === "info").length,
    textLayers: ctx.textLayers.length,
    interactiveElements: ctx.interactive.length,
    nodesVisited: ctx.visited
  };
  const order = { error: 0, warning: 1, info: 2 };
  ctx.findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    fileName,
    fileKey: opts.fileKey,
    rootNodeId: root.id,
    rootNodeName: root.name,
    level: opts.level,
    summary,
    findings: ctx.findings,
    textLayers: ctx.textLayers,
    interactiveElements: ctx.interactive,
    notes: [...ctx.notes]
  };
}
function walk(node, path2, parentOpacity, insideInteractive, ctx) {
  if (node.visible === false) return;
  ctx.visited++;
  const opacity = parentOpacity * (node.opacity ?? 1);
  const nodePath = [...path2, node.name];
  let isInteractive = false;
  if (!insideInteractive && node.type !== "TEXT") {
    const match = INTERACTIVE_RE.exec(node.name);
    if (match) {
      isInteractive = true;
      checkInteractive(node, nodePath, match[0], opacity, ctx);
    }
  }
  if (node.type === "TEXT") checkText(node, nodePath, opacity, ctx);
  checkImage(node, nodePath, ctx);
  ctx.painted.push(...layersForNode(node, opacity));
  for (const child of node.children ?? []) {
    walk(child, nodePath, opacity, insideInteractive || isInteractive, ctx);
  }
}
function base(node, nodePath, ctx) {
  return {
    nodeId: node.id,
    nodeName: node.name,
    nodePath: nodePath.join(" > "),
    link: figmaNodeLink(ctx.opts.fileKey, node.id)
  };
}
function textStyle(node) {
  let fontSize = node.style?.fontSize ?? 16;
  let fontWeight = node.style?.fontWeight ?? 400;
  let mixed = false;
  const overrides = node.styleOverrideTable ? Object.values(node.styleOverrideTable) : [];
  for (const o of overrides) {
    if (o.fontSize !== void 0 && o.fontSize !== fontSize) {
      fontSize = Math.min(fontSize, o.fontSize);
      mixed = true;
    }
    if (o.fontWeight !== void 0 && o.fontWeight !== fontWeight) {
      fontWeight = Math.min(fontWeight, o.fontWeight);
      mixed = true;
    }
    if (o.fills) mixed = true;
  }
  return { fontSize, fontWeight, fontFamily: node.style?.fontFamily, mixed };
}
function checkText(node, nodePath, opacity, ctx) {
  const rect = node.absoluteBoundingBox;
  const text = (node.characters ?? "").trim();
  if (!rect || !text) return;
  const { fontSize, fontWeight, fontFamily, mixed } = textStyle(node);
  const large = isLargeText(fontSize, fontWeight);
  const required = requiredTextContrast(ctx.opts.level, large);
  const b = base(node, nodePath, ctx);
  const bg = resolveBackground(rect, ctx.painted);
  const info = {
    nodeId: node.id,
    nodeName: node.name,
    nodePath: b.nodePath,
    text: text.length > 60 ? `${text.slice(0, 57)}...` : text,
    fontSizePx: fontSize,
    fontWeight,
    fontFamily,
    largeText: large,
    foreground: null,
    background: toHex(bg.color),
    backgroundAssumed: bg.assumed,
    backgroundUncertain: bg.uncertain,
    contrast: null,
    required,
    passes: null,
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
  ctx.textLayers.push(info);
  if (fontSize < (ctx.opts.minFontSizePx ?? DEFAULT_MIN_FONT)) {
    ctx.findings.push({
      ...b,
      rule: "text-size",
      wcag: "1.4.4 Resize Text",
      level: "best-practice",
      severity: "warning",
      message: `Texto de ${fontSize}px ("${info.text}"). Por debajo de ${ctx.opts.minFontSizePx ?? DEFAULT_MIN_FONT}px se compromete la legibilidad.`,
      details: { fontSizePx: fontSize },
      suggestion: "Sube el tama\xF1o a 12px o m\xE1s para texto secundario y a 16px para cuerpo."
    });
  }
  const fills = effectiveSolidFills(node.fills, opacity);
  const nonSolid = hasNonSolidVisibleFill(node.fills);
  if (fills.length === 0) {
    if (nonSolid) {
      ctx.findings.push({
        ...b,
        rule: "background-uncertain",
        wcag: "1.4.3 Contrast (Minimum)",
        level: "AA",
        severity: "warning",
        message: `El texto "${info.text}" usa un relleno de ${nonSolid === "image" ? "imagen" : "degradado"}: comprueba el contraste manualmente en el punto m\xE1s desfavorable.`
      });
    }
    return;
  }
  let fg = bg.color;
  for (const f of fills) fg = compositeOver(f, fg);
  info.foreground = toHex(fg);
  if (bg.uncertain) {
    ctx.findings.push({
      ...b,
      rule: "background-uncertain",
      wcag: "1.4.3 Contrast (Minimum)",
      level: "AA",
      severity: "warning",
      message: `No se puede calcular con certeza el contraste de "${info.text}": ${bg.reasons.join("; ")}.`,
      details: { foreground: info.foreground, estimatedBackground: info.background, required },
      suggestion: "Verifica el contraste en la zona m\xE1s clara/oscura del fondo o a\xF1ade una capa s\xF3lida (scrim) tras el texto."
    });
    return;
  }
  const ratio = round2(contrastRatio(fg, bg.color));
  info.contrast = ratio;
  info.passes = ratio >= required;
  if (bg.assumed) ctx.notes.add("Algunos textos no tienen ninguna capa opaca debajo dentro del nodo auditado; se ha asumido lienzo blanco (#FFFFFF).");
  if (!info.passes) {
    ctx.findings.push({
      ...b,
      rule: "text-contrast",
      wcag: ctx.opts.level === "AAA" ? "1.4.6 Contrast (Enhanced)" : "1.4.3 Contrast (Minimum)",
      level: ctx.opts.level,
      severity: "error",
      message: `Contraste ${ratio}:1 en "${info.text}" (${info.foreground} sobre ${info.background}${bg.assumed ? ", fondo asumido" : ""}); se requiere ${required}:1 para texto ${large ? "grande" : "normal"} de ${fontSize}px/${fontWeight}.`,
      details: { contrast: ratio, required, foreground: info.foreground, background: info.background, fontSizePx: fontSize, fontWeight, largeText: large, backgroundAssumed: bg.assumed, mixedStyles: mixed },
      suggestion: suggestFix(fg, bg.color, required)
    });
  } else if (mixed) {
    ctx.findings.push({
      ...b,
      rule: "text-contrast",
      wcag: "1.4.3 Contrast (Minimum)",
      level: "AA",
      severity: "info",
      message: `"${info.text}" mezcla varios estilos; se ha evaluado con el tama\xF1o y peso m\xE1s peque\xF1os (${fontSize}px/${fontWeight}). Revisa los fragmentos con otro color.`
    });
  }
}
function suggestFix(fg, bg, required) {
  const lighterBg = bg.r + bg.g + bg.b > 1.5;
  return lighterBg ? `Oscurece el texto (o aclara el fondo) hasta alcanzar ${required}:1. Por ejemplo, prueba con un gris m\xE1s oscuro que ${toHex(fg)}.` : `Aclara el texto (o oscurece el fondo) hasta alcanzar ${required}:1. Por ejemplo, prueba con un tono m\xE1s claro que ${toHex(fg)}.`;
}
function checkInteractive(node, nodePath, matchedBy, opacity, ctx) {
  const rect = node.absoluteBoundingBox;
  if (!rect) return;
  const b = base(node, nodePath, ctx);
  ctx.interactive.push({ nodeId: node.id, nodeName: node.name, nodePath: b.nodePath, type: node.type, width: Math.round(rect.width), height: Math.round(rect.height), matchedBy });
  const w = rect.width;
  const h = rect.height;
  if (w < MIN_TARGET || h < MIN_TARGET) {
    ctx.findings.push({
      ...b,
      rule: "target-size",
      wcag: "2.5.8 Target Size (Minimum)",
      level: "AA",
      severity: "error",
      message: `"${node.name}" mide ${Math.round(w)}x${Math.round(h)} px; el m\xEDnimo es ${MIN_TARGET}x${MIN_TARGET} px (salvo que exista espaciado equivalente alrededor).`,
      details: { width: round2(w), height: round2(h), minimum: MIN_TARGET },
      suggestion: `Ampl\xEDa el \xE1rea t\xE1ctil a ${RECOMMENDED_TARGET}x${RECOMMENDED_TARGET} px, aunque el icono visible sea m\xE1s peque\xF1o.`
    });
  } else if (w < RECOMMENDED_TARGET || h < RECOMMENDED_TARGET) {
    ctx.findings.push({
      ...b,
      rule: "target-size",
      wcag: "2.5.5 Target Size (Enhanced)",
      level: "AAA",
      severity: "info",
      message: `"${node.name}" mide ${Math.round(w)}x${Math.round(h)} px; cumple el m\xEDnimo pero queda por debajo de los ${RECOMMENDED_TARGET}x${RECOMMENDED_TARGET} px recomendados en m\xF3vil.`,
      details: { width: round2(w), height: round2(h), recommended: RECOMMENDED_TARGET }
    });
  }
  const strokes = effectiveSolidFills(node.strokes, opacity).filter((s) => s.a > 0);
  const fills = effectiveSolidFills(node.fills, opacity).filter((f) => f.a > 0);
  const surrounding = resolveBackground(rect, ctx.painted, node.id);
  const candidate = strokes[0] ?? fills[0];
  if (!candidate) return;
  const color = compositeOver(candidate, surrounding.color);
  const ratio = round2(contrastRatio(color, surrounding.color));
  const via = strokes[0] ? "borde" : "relleno";
  if (surrounding.uncertain) {
    ctx.findings.push({
      ...b,
      rule: "non-text-contrast",
      wcag: "1.4.11 Non-text Contrast",
      level: "AA",
      severity: "info",
      message: `No se puede medir con certeza el contraste del ${via} de "${node.name}" con su entorno: ${surrounding.reasons.join("; ")}.`
    });
    return;
  }
  if (ratio < NON_TEXT_CONTRAST) {
    ctx.findings.push({
      ...b,
      rule: "non-text-contrast",
      wcag: "1.4.11 Non-text Contrast",
      level: "AA",
      severity: "warning",
      message: `El ${via} de "${node.name}" (${toHex(color)}) tiene ${ratio}:1 frente a su entorno (${toHex(surrounding.color)}${surrounding.assumed ? ", asumido" : ""}); se requieren 3:1 para que el componente sea identificable.`,
      details: { contrast: ratio, required: NON_TEXT_CONTRAST, component: toHex(color), surrounding: toHex(surrounding.color), via, heuristic: `nombre coincide con "${matchedBy}"` },
      suggestion: "A\xF1ade un borde con 3:1 de contraste o ajusta el relleno. Si el elemento no es interactivo, ren\xF3mbralo para que la auditor\xEDa no lo considere."
    });
  }
}
function checkImage(node, nodePath, ctx) {
  if (hasNonSolidVisibleFill(node.fills) !== "image") return;
  const b = base(node, nodePath, ctx);
  const generic = GENERIC_NAME_RE.test(node.name.trim());
  ctx.findings.push({
    ...b,
    rule: "image-alt",
    wcag: "1.1.1 Non-text Content",
    level: "A",
    severity: generic ? "warning" : "info",
    message: generic ? `La imagen "${node.name}" tiene un nombre gen\xE9rico: no indica su prop\xF3sito ni qu\xE9 texto alternativo necesita.` : `La imagen "${node.name}" necesitar\xE1 texto alternativo (o marcarse como decorativa) en la implementaci\xF3n.`,
    suggestion: "Renombra la capa describiendo el contenido o a\xF1ade una anotaci\xF3n con el alt propuesto."
  });
}

// src/audit.ts
async function auditFromUrl(req) {
  const token = resolveToken(req.token);
  const parsed = parseFigmaUrl(req.url);
  if (!parsed.nodeId) {
    const outline = await fetchFileOutline(parsed.fileKey, token);
    return { kind: "needs-node", fileKey: parsed.fileKey, ...outline };
  }
  const { fileName, nodes } = await fetchNodes(parsed.fileKey, [parsed.nodeId], token);
  const opts = { level: req.level ?? "AA", fileKey: parsed.fileKey, minFontSizePx: req.minFontSizePx };
  return { kind: "result", result: auditTree(normalizeAutoLayout(nodes[0]), fileName, opts) };
}

// src/cli.ts
var args = process.argv.slice(2);
var url = args.find((a) => !a.startsWith("--"));
var levelIdx = args.indexOf("--level");
var level = levelIdx >= 0 ? args[levelIdx + 1] : "AA";
var asJson = args.includes("--json");
if (!url) {
  console.error("Uso: npm run audit -- <enlace-figma-con-node-id> [--level AA|AAA] [--json]");
  process.exit(2);
}
var outcome;
try {
  outcome = await auditFromUrl({ url, level });
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
}
if (outcome.kind === "needs-node") {
  console.log(`Archivo "${outcome.fileName}" (${outcome.fileKey}). A\xF1ade ?node-id=<id> con uno de estos frames:`);
  for (const page of outcome.pages) {
    console.log(`
P\xE1gina: ${page.name}`);
    for (const f of page.frames) console.log(`  ${f.id.replace(":", "-")}  ${f.name}`);
  }
  process.exit(0);
}
var r = outcome.result;
if (asJson) {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.summary.errors > 0 ? 1 : 0);
}
console.log(`
${r.fileName} > ${r.rootNodeName}  (WCAG 2.2 ${r.level})`);
console.log(`${r.summary.errors} errores, ${r.summary.warnings} avisos, ${r.summary.infos} notas \xB7 ${r.summary.textLayers} textos \xB7 ${r.summary.interactiveElements} interactivos \xB7 ${r.summary.nodesVisited} nodos
`);
var icon = { error: "\u2716", warning: "\u25B2", info: "\u2139" };
for (const f of r.findings) {
  console.log(`${icon[f.severity]} [${f.wcag}] ${f.message}`);
  console.log(`    ${f.nodePath}`);
  if (f.suggestion) console.log(`    \u2192 ${f.suggestion}`);
}
for (const n of r.notes) console.log(`
Nota: ${n}`);
process.exit(r.summary.errors > 0 ? 1 : 0);
