#!/usr/bin/env node
import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// src/color/contrast.ts
function channelToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
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
function toHex({ r, g, b }) {
  const h = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}
function parseHex(input) {
  let hex = input.trim().replace(/^#/, "");
  if (hex.length === 3 || hex.length === 4) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) {
    throw new Error(`Color hexadecimal inv\xE1lido: "${input}". Usa #RRGGBB o #RRGGBBAA.`);
  }
  const n = (i) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) : 1 };
}
function isLargeText(fontSizePx, fontWeight) {
  return fontSizePx >= 24 || fontSizePx >= 18.66 && fontWeight >= 700;
}
function requiredTextContrast(level2, large2) {
  if (level2 === "AAA") return large2 ? 4.5 : 7;
  return large2 ? 3 : 4.5;
}
var NON_TEXT_CONTRAST = 3;
function round2(n) {
  return Math.round(n * 100) / 100;
}

// src/contrast-cli.ts
var args = process.argv.slice(2);
var levelIdx = args.indexOf("--level");
var level = levelIdx >= 0 ? args[levelIdx + 1] : "AA";
var pos = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--level");
var [fgArg, bgArg, sizeArg, weightArg] = pos;
if (!fgArg || !bgArg) {
  console.error('Uso: contraste "<#primer-plano>" "<#fondo>" [tama\xF1oPx pesoFuente] [--level AAA]');
  process.exit(2);
}
var bg = parseHex(bgArg);
var fg = compositeOver(parseHex(fgArg), bg);
var ratio = round2(contrastRatio(fg, bg));
var isText = sizeArg !== void 0;
var size = Number(sizeArg);
var weight = Number(weightArg ?? 400);
var large = isText && isLargeText(size, weight);
var required = isText ? requiredTextContrast(level, large) : NON_TEXT_CONTRAST;
console.log(
  JSON.stringify({
    foreground: toHex(fg),
    background: toHex(bg),
    contrast: ratio,
    required,
    passes: ratio >= required,
    context: isText ? `texto ${large ? "grande" : "normal"} (${size}px/${weight}), nivel ${level}` : "componente o gr\xE1fico (1.4.11)"
  })
);
