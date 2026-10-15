#!/usr/bin/env node
/**
 * Uso: contraste <primer-plano> <fondo> [tamañoPx pesoFuente] [--level AAA]
 * Ejemplos: contraste "#878787" "#FFFFFF" 14 400 · contraste "#EBEBEB" "#FFFFFF"
 *
 * Mismo cálculo que la herramienta MCP check_contrast, para los agentes del skill que
 * trabajan por terminal. Sin tamaño de fuente evalúa el umbral de componentes (3:1).
 * Un primer plano con alfa (#RRGGBBAA) se compone sobre el fondo antes de medir.
 */
import { compositeOver, contrastRatio, isLargeText, NON_TEXT_CONTRAST, parseHex, requiredTextContrast, round2, toHex, type WcagLevel } from "./color/contrast.js";

const args = process.argv.slice(2);
const levelIdx = args.indexOf("--level");
const level = (levelIdx >= 0 ? args[levelIdx + 1] : "AA") as WcagLevel;
const pos = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--level");
const [fgArg, bgArg, sizeArg, weightArg] = pos;

if (!fgArg || !bgArg) {
  console.error('Uso: contraste "<#primer-plano>" "<#fondo>" [tamañoPx pesoFuente] [--level AAA]');
  process.exit(2);
}

const bg = parseHex(bgArg);
const fg = compositeOver(parseHex(fgArg), bg);
const ratio = round2(contrastRatio(fg, bg));
const isText = sizeArg !== undefined;
const size = Number(sizeArg);
const weight = Number(weightArg ?? 400);
const large = isText && isLargeText(size, weight);
const required = isText ? requiredTextContrast(level, large) : NON_TEXT_CONTRAST;
console.log(
  JSON.stringify({
    foreground: toHex(fg),
    background: toHex(bg),
    contrast: ratio,
    required,
    passes: ratio >= required,
    context: isText ? `texto ${large ? "grande" : "normal"} (${size}px/${weight}), nivel ${level}` : "componente o gráfico (1.4.11)",
  })
);
