#!/usr/bin/env node
/**
 * Genera el índice HTML de un flujo auditado: qué pantallas son accesibles, cuáles no,
 * sus errores principales y los problemas de componentes compartidos.
 *
 * Uso (desde el proyecto del usuario): node <carpeta del skill>/scripts/indice.mjs <carpeta-de-trabajo>
 *
 * La carpeta de trabajo contiene:
 *   flujo.json     { fileKey, fileName, pageName?, flowName, flowId, level, date,
 *                    screens: [nodeId, ...] (orden del índice),
 *                    componentes: [{ component, severity, screens, problem, fix }] }
 *   s<id>/review.json y s<id>/audit.json de cada pantalla (los escribe cada agente)
 * Los informes HTML de cada pantalla se buscan en reports/ por el sufijo -<node-id>.html.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const work = process.argv[2];
if (!work || !existsSync(path.join(work, "flujo.json"))) {
  console.error("Uso: node indice.mjs <carpeta-de-trabajo con flujo.json>");
  process.exit(2);
}
const reportsDir = path.resolve("reports");
const flow = JSON.parse(readFileSync(path.join(work, "flujo.json"), "utf8"));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dash = (id) => id.replace(/:/g, "-");
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "flujo";
const figmaLink = (id) => `https://www.figma.com/design/${flow.fileKey}/x?node-id=${dash(id)}`;

const reportFiles = existsSync(reportsDir) ? readdirSync(reportsDir).filter((f) => f.endsWith(".html")).sort() : [];
const dirs = readdirSync(work).filter((d) => d.startsWith("s") && existsSync(path.join(work, d, "review.json")));
const order = (flow.screens ?? []).map(dash);

const rows = dirs.map((d) => {
  const id = d.slice(1);
  const review = JSON.parse(readFileSync(path.join(work, d, "review.json"), "utf8"));
  const auditPath = path.join(work, d, "audit.json");
  const name = existsSync(auditPath) ? JSON.parse(readFileSync(auditPath, "utf8")).rootNodeName : id;
  const st = (i) => i.status ?? "confirmado";
  const count = (p) => review.issues.filter(p).length;
  const c = {
    error: count((i) => i.severity === "error" && st(i) === "confirmado"),
    warning: count((i) => i.severity === "warning" && st(i) === "confirmado"),
    info: count((i) => i.severity === "info" && st(i) === "confirmado"),
    manual: count((i) => st(i) === "manual"),
    desc: count((i) => st(i) === "descartado"),
  };
  const top = review.issues.filter((i) => i.severity === "error" && st(i) === "confirmado").slice(0, 4).map((i) => i.title);
  const file = reportFiles.filter((f) => f.endsWith(`-${id}.html`)).pop();
  return { id, name, verdict: review.verdict, c, top, note: review.scopeNote ?? "", file };
});
rows.sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));

const total = (k) => rows.reduce((s, r) => s + r.c[k], 0);
const by = (v) => rows.filter((r) => r.verdict === v).length;
const VL = { cumple: "Cumple", "no-cumple": "No cumple", pendiente: "Pendiente" };
const SL = { error: "Error", warning: "Aviso", info: "Nota" };
const comps = [...(flow.componentes ?? [])].sort((a, b) => ({ error: 0, warning: 1, info: 2 })[a.severity] - ({ error: 0, warning: 1, info: 2 })[b.severity] || b.screens - a.screens);

const rowHtml = (r, i) => `<tr><td class="n">${i + 1}</td>
<td><strong>${r.file ? `<a href="${esc(r.file)}">${esc(r.name)}</a>` : esc(r.name)}</strong><br><a class="fig" href="${esc(figmaLink(r.id))}">Figma ${esc(r.id.replace("-", ":"))}</a>${r.note ? `<p class="note">${esc(r.note)}</p>` : ""}</td>
<td><span class="v v--${r.verdict}">${VL[r.verdict]}</span></td>
<td class="c e">${r.c.error}</td><td class="c w">${r.c.warning}</td><td class="c">${r.c.info}</td><td class="c">${r.c.manual}</td><td class="c">${r.c.desc}</td>
<td>${r.top.length ? `<ul>${r.top.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "—"}</td></tr>`;

const compHtml = comps.map((c) => `<tr><td><strong>${esc(c.component)}</strong></td><td><span class="p p--${c.severity}">${SL[c.severity]}</span></td><td>${esc(c.problem)}</td><td class="c">${c.screens}</td><td>${esc(c.fix)}</td></tr>`).join("");
const flowLink = flow.flowId ? figmaLink(flow.flowId) : `https://www.figma.com/design/${flow.fileKey}`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accesibilidad · ${esc(flow.flowName)}</title><style>
:root{--bg:#f6f6f4;--s:#fff;--i:#1d1d1b;--i2:#55534f;--l:#e2e0dc;--er:#b3261e;--erb:#fbe9e7;--wa:#8a5300;--wab:#fff3dc;--in:#1a5fb4;--inb:#e6f0fb;--ok:#1e6b3a;--okb:#e5f4ea;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--s:#20201e;--i:#f1f0ec;--i2:#b9b6af;--l:#3a3935;--er:#ff8a80;--erb:#3b1d1a;--wa:#ffc266;--wab:#37290f;--in:#8ab8ff;--inb:#172a44;--ok:#7fd49a;--okb:#173323}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--i);font:16px/1.5 system-ui,-apple-system,sans-serif}
.w{max-width:1280px;margin:0 auto;padding:0 16px 48px}header{background:var(--s);border-bottom:1px solid var(--l);padding:28px 0 20px;margin-bottom:24px}
a{color:var(--in)}:focus-visible{outline:3px solid var(--in);outline-offset:2px}h1{margin:4px 0}h2{margin:40px 0 12px}.ey{margin:0;color:var(--i2);text-transform:uppercase;letter-spacing:.08em;font-size:.85rem}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;list-style:none;padding:0;margin:16px 0 0}
.stats li{background:var(--bg);border-radius:10px;padding:12px 14px;border-top:4px solid var(--l)}.stats b{display:block;font-size:1.8rem;line-height:1.1}
.stats .st-ok{border-color:#2e7d32}.stats .st-e{border-color:#d32f2f}.stats .st-w{border-color:#e08a00}
.tw{overflow-x:auto;background:var(--s);border:1px solid var(--l);border-radius:12px}table{border-collapse:collapse;width:100%;font-size:.93rem}
th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--l)}thead th{font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--i2)}
td.c{text-align:center;font-weight:600}td.e{color:var(--er)}td.w{color:var(--wa)}td.n{color:var(--i2)}td ul{margin:0;padding-left:18px}
.fig{font-size:.8rem;color:var(--i2)}.note{margin:6px 0 0;font-size:.82rem;color:var(--wa)}.muted{color:var(--i2)}
.v,.p{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:600;font-size:.8rem;white-space:nowrap}
.v--no-cumple,.p--error{background:var(--erb);color:var(--er)}.v--pendiente,.p--warning{background:var(--wab);color:var(--wa)}.v--cumple{background:var(--okb);color:var(--ok)}.p--info{background:var(--inb);color:var(--in)}
</style></head><body><header><div class="w" style="padding-bottom:0">
<p class="ey">Índice de auditoría · WCAG 2.2 ${esc(flow.level ?? "AA")}</p><h1>${esc(flow.flowName)}</h1>
<p class="muted" style="margin:0">${esc(flow.fileName)}${flow.pageName ? ` · página «${esc(flow.pageName)}»` : ""} · ${rows.length} pantallas · ${esc(flow.date ?? "")} · <a href="${esc(flowLink)}">Abrir en Figma</a></p>
<ul class="stats" aria-label="Resumen">
<li class="st-ok"><b>${by("cumple")}/${rows.length}</b>pantallas accesibles</li><li class="st-e"><b>${by("no-cumple")}</b>no cumplen</li><li class="st-w"><b>${by("pendiente")}</b>pendientes</li>
<li class="st-e"><b>${total("error")}</b>errores</li><li class="st-w"><b>${total("warning")}</b>avisos</li><li><b>${total("manual")}</b>manuales</li></ul>
</div></header><main class="w">
${comps.length ? `<h2>Problemas de componentes compartidos</h2><p class="muted">Arreglarlos en la librería corrige todas las pantallas a la vez.</p>
<div class="tw"><table><thead><tr><th scope="col">Componente</th><th scope="col">Gravedad</th><th scope="col">Problema</th><th scope="col">Pantallas</th><th scope="col">Cómo resolverlo</th></tr></thead><tbody>${compHtml}</tbody></table></div>` : ""}
<h2>Pantallas</h2><div class="tw"><table><thead><tr><th scope="col">#</th><th scope="col">Pantalla (abre su informe)</th><th scope="col">Veredicto</th><th scope="col">Err.</th><th scope="col">Avisos</th><th scope="col">Notas</th><th scope="col">Man.</th><th scope="col">Desc.</th><th scope="col">Errores principales</th></tr></thead>
<tbody>${rows.map(rowHtml).join("")}</tbody></table></div>
<p class="muted" style="font-size:.85rem;margin-top:24px">Una pantalla es accesible («Cumple») cuando no tiene errores, avisos ni comprobaciones manuales pendientes. Cada informe incluye la captura con las incidencias marcadas, la medición, qué pasa y cómo resolverlo. Generado por /a11y-audit.</p>
</main></body></html>`;

const out = path.join(reportsDir, `${flow.date ?? new Date().toISOString().slice(0, 10)}-${slug(flow.flowName)}-indice.html`);
writeFileSync(out, html, "utf8");
console.log(`Índice HTML: ${out} (${rows.length} pantallas: ${by("cumple")} cumplen, ${by("pendiente")} pendientes, ${by("no-cumple")} no cumplen)`);
