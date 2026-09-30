#!/usr/bin/env node
/** Uso: npm run audit -- <enlace-figma> [--level AAA] [--json] */
import { auditFromUrl } from "./audit.js";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--"));
const levelIdx = args.indexOf("--level");
const level = levelIdx >= 0 ? (args[levelIdx + 1] as "AA" | "AAA") : "AA";
const asJson = args.includes("--json");

if (!url) {
  console.error("Uso: npm run audit -- <enlace-figma-con-node-id> [--level AA|AAA] [--json]");
  process.exit(2);
}

const outcome = await auditFromUrl({ url, level });
if (outcome.kind === "needs-node") {
  console.log(`Archivo "${outcome.fileName}" (${outcome.fileKey}). Añade ?node-id=<id> con uno de estos frames:`);
  for (const page of outcome.pages) {
    console.log(`\nPágina: ${page.name}`);
    for (const f of page.frames) console.log(`  ${f.id.replace(":", "-")}  ${f.name}`);
  }
  process.exit(0);
}

const r = outcome.result;
if (asJson) {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.summary.errors > 0 ? 1 : 0);
}

console.log(`\n${r.fileName} > ${r.rootNodeName}  (WCAG 2.2 ${r.level})`);
console.log(`${r.summary.errors} errores, ${r.summary.warnings} avisos, ${r.summary.infos} notas · ${r.summary.textLayers} textos · ${r.summary.interactiveElements} interactivos · ${r.summary.nodesVisited} nodos\n`);
const icon = { error: "✖", warning: "▲", info: "ℹ" };
for (const f of r.findings) {
  console.log(`${icon[f.severity]} [${f.wcag}] ${f.message}`);
  console.log(`    ${f.nodePath}`);
  if (f.suggestion) console.log(`    → ${f.suggestion}`);
}
for (const n of r.notes) console.log(`\nNota: ${n}`);
process.exit(r.summary.errors > 0 ? 1 : 0);
