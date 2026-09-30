#!/usr/bin/env node
/** Uso: npm run report -- <revision.json> [--out <carpeta>] */
import { readFile } from "node:fs/promises";
import { buildHtmlReport } from "./build.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args[outIdx + 1] : undefined;

if (!file) {
  console.error("Uso: npm run report -- <revision.json> [--out <carpeta>]");
  process.exit(2);
}

const review = JSON.parse(await readFile(file, "utf8"));
const r = await buildHtmlReport(review, { outDir });
console.log(`Informe HTML: ${r.path}`);
if (!r.hasScreenshot) console.log(`Sin captura: ${r.screenshotError}`);
