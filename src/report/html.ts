import type { FigmaNode, FigmaRect } from "../figma/types.js";
import { figmaNodeLink } from "../figma/url.js";
import type { AuditResult, Finding, TextLayerInfo } from "../rules/types.js";
import type { ReportIssue, ReportReview } from "./schema.js";

/** Render del frame ya codificado para incrustarlo en el HTML. */
export interface FrameImage {
  dataUri: string;
  /** Tamaño en píxeles del PNG (a la escala pedida a Figma). */
  width: number;
  height: number;
}

export interface RenderInput {
  review: ReportReview;
  audit: AuditResult;
  /** Nodo raíz auditado con su subárbol, para localizar las cajas de las capas. */
  root: FigmaNode;
  /** null si Figma no pudo renderizar el frame; el informe se genera igualmente sin captura. */
  image: FrameImage | null;
  generatedAt: Date;
}

export type DisplayStatus = ReportIssue["status"] | "sin-revisar";

/** Incidencia lista para pintar: numerada, con sus cajas y las mediciones asociadas. */
export interface DisplayIssue extends Omit<ReportIssue, "status"> {
  number: number;
  status: DisplayStatus;
  /** Cajas de las capas en coordenadas del lienzo de Figma, ya recortadas al frame. */
  rects: FigmaRect[];
  /** nodeIds que no existen en el subárbol auditado o quedan fuera del área visible. */
  missingNodeIds: string[];
  offscreenNodeIds: string[];
  findings: Finding[];
  textLayers: TextLayerInfo[];
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;
const STATUS_ORDER: Record<DisplayStatus, number> = { confirmado: 0, "sin-revisar": 1, manual: 2, descartado: 3 };

/**
 * Convierte la revisión y el resultado del motor en la lista de incidencias del informe.
 *
 * - Asocia a cada incidencia las cajas de sus capas (recortadas al área del frame), los
 *   findings medidos y las capas de texto del inventario que comparten nodeId, para que
 *   la tarjeta muestre valores reales y no texto redactado a mano.
 * - Añade como "sin-revisar" los findings del motor que ninguna incidencia de la revisión
 *   cita, de modo que un olvido del revisor no haga desaparecer una medición.
 * - Ordena por estado (confirmadas primero, descartadas al final) y gravedad, y numera.
 *
 * @param review Revisión validada con el esquema.
 * @param audit Resultado de auditTree para el mismo frame.
 * @param root Nodo raíz con su subárbol.
 * @returns Incidencias numeradas desde 1.
 */
export function buildDisplayIssues(review: ReportReview, audit: AuditResult, root: FigmaNode): DisplayIssue[] {
  const rects = collectRects(root);
  const frame = frameRect(root);
  const covers = (i: { nodeIds: string[]; rules?: string[] }, f: Finding) => i.nodeIds.includes(f.nodeId) && (!i.rules || i.rules.includes(f.rule));

  const reviewed: Omit<DisplayIssue, "number" | "rects" | "missingNodeIds" | "offscreenNodeIds" | "findings" | "textLayers">[] = review.issues.map((i) => ({ ...i }));
  const unreviewed = audit.findings
    .filter((f) => !review.issues.some((i) => covers(i, f)))
    .map((f) => ({
      title: `${ruleLabel(f.rule)}: ${f.nodeName}`,
      severity: f.severity,
      status: "sin-revisar" as const,
      source: "medido" as const,
      wcag: f.wcag,
      nodeIds: [f.nodeId],
      problem: f.message,
      fix: f.suggestion ?? "Revisar manualmente.",
      rules: [f.rule],
    }));

  const all = [...reviewed, ...unreviewed].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  return all.map((issue, idx) => {
    const found: FigmaRect[] = [];
    const missingNodeIds: string[] = [];
    const offscreenNodeIds: string[] = [];
    for (const id of issue.nodeIds) {
      const r = rects.get(id);
      if (!r) missingNodeIds.push(id);
      else {
        const clipped = frame ? intersect(r, frame) : r;
        if (clipped) found.push(clipped);
        else offscreenNodeIds.push(id);
      }
    }
    const ids = new Set(issue.nodeIds);
    return {
      ...issue,
      number: idx + 1,
      rects: found,
      missingNodeIds,
      offscreenNodeIds,
      findings: audit.findings.filter((f) => covers(issue, f)),
      textLayers: audit.textLayers.filter((t) => ids.has(t.nodeId)),
    };
  });
}

/**
 * Calcula la zona de la captura que se muestra ampliada en la tarjeta de una incidencia.
 *
 * Toma la unión de las cajas, añade un margen proporcional para dar contexto (mínimo
 * 32 px), impone un tamaño mínimo para que un elemento de 4 px no se convierta en una
 * franja ilegible, y recorta el resultado al frame.
 *
 * @param rects Cajas de las capas afectadas, en coordenadas del lienzo.
 * @param frame Caja del frame renderizado.
 * @returns Zona a mostrar, o null si no hay cajas.
 */
export function cropRegion(rects: FigmaRect[], frame: FigmaRect): FigmaRect | null {
  if (rects.length === 0) return null;
  const u = union(rects);
  const pad = Math.max(32, 0.35 * Math.max(u.width, u.height));
  const minW = Math.min(frame.width, 240);
  const minH = Math.min(frame.height, 140);
  let w = Math.max(u.width + 2 * pad, minW);
  let h = Math.max(u.height + 2 * pad, minH);
  w = Math.min(w, frame.width);
  h = Math.min(h, frame.height);
  const cx = u.x + u.width / 2;
  const cy = u.y + u.height / 2;
  const x = clamp(cx - w / 2, frame.x, frame.x + frame.width - w);
  const y = clamp(cy - h / 2, frame.y, frame.y + frame.height - h);
  return { x, y, width: w, height: h };
}

/**
 * Genera el informe HTML autocontenido.
 *
 * La captura se incrusta una sola vez como variable CSS (`--shot`) y todas las vistas
 * (mapa general y ampliaciones) la reutilizan como fondo, así el archivo no crece con
 * cada incidencia. Todo texto procedente de Figma o de la revisión se escapa.
 *
 * @param input Revisión, resultado del motor, árbol raíz, captura y fecha.
 * @returns Documento HTML completo.
 */
export function renderHtmlReport(input: RenderInput): string {
  const { review, audit, root, image, generatedAt } = input;
  const issues = buildDisplayIssues(review, audit, root);
  const frame = frameRect(root) ?? { x: 0, y: 0, width: 390, height: 844 };
  const date = new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(generatedAt);
  const count = (pred: (i: DisplayIssue) => boolean) => issues.filter(pred).length;
  const active = (i: DisplayIssue) => i.status === "confirmado" || i.status === "sin-revisar";
  const stats = [
    { label: "Errores", value: count((i) => active(i) && i.severity === "error"), tone: "error" },
    { label: "Avisos", value: count((i) => active(i) && i.severity === "warning"), tone: "warning" },
    { label: "Notas", value: count((i) => active(i) && i.severity === "info"), tone: "info" },
    { label: "Comprobación manual", value: count((i) => i.status === "manual"), tone: "manual" },
    { label: "Descartadas", value: count((i) => i.status === "descartado"), tone: "muted" },
  ];
  const rootLink = figmaNodeLink(audit.fileKey, audit.rootNodeId);

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accesibilidad · ${esc(audit.rootNodeName)}</title>
<style>
${CSS}
:root { --shot: ${image ? `url("${image.dataUri}")` : "none"}; }
</style>
</head>
<body data-filter="todas">
<a class="skip" href="#incidencias">Saltar a las incidencias</a>
<header class="hero">
  <div class="wrap">
    <p class="eyebrow">Informe de accesibilidad · WCAG 2.2 ${esc(audit.level)}</p>
    <h1>${esc(audit.rootNodeName)}</h1>
    <p class="meta">${esc(audit.fileName)} · ${esc(date)} · <a href="${esc(rootLink)}">Abrir frame en Figma</a></p>
    <div class="verdict verdict--${review.verdict}" role="status">
      <span class="verdict__badge">${esc(VERDICT_LABEL[review.verdict])}</span>
      <p>${esc(review.verdictText)}</p>
    </div>
    ${review.scopeNote ? `<p class="scope">${esc(review.scopeNote)}</p>` : ""}
    <ul class="stats" aria-label="Recuento de incidencias">
      ${stats.map((s) => `<li class="stat stat--${s.tone}"><span class="stat__value">${s.value}</span><span class="stat__label">${esc(s.label)}</span></li>`).join("")}
    </ul>
    <p class="tool">Medición automática: ${audit.summary.textLayers} textos, ${audit.summary.interactiveElements} elementos interactivos y ${audit.summary.nodesVisited} capas analizadas.</p>
  </div>
</header>

<main class="wrap">
  <section class="map" aria-labelledby="mapa">
    <h2 id="mapa">Mapa de incidencias</h2>
    <div class="map__grid">
      <div class="map__shot">
        ${renderOverview(issues, frame, image !== null)}
        <ul class="legend" aria-label="Leyenda">
          <li><span class="sw sw--error"></span>Error</li>
          <li><span class="sw sw--warning"></span>Aviso</li>
          <li><span class="sw sw--info"></span>Nota</li>
          <li><span class="sw sw--manual"></span>Manual</li>
          <li><span class="sw sw--muted"></span>Descartada</li>
        </ul>
      </div>
      <div class="map__list">
        <div class="filters" role="group" aria-label="Filtrar incidencias">
          ${FILTERS.map((f, i) => `<button type="button" data-set-filter="${f.key}" aria-pressed="${i === 0}">${esc(f.label)}</button>`).join("")}
        </div>
        <ol class="index">
          ${issues.map((i) => `<li ${issueAttrs(i)}><a href="#inc-${i.number}"><span class="num num--${tone(i)}">${i.number}</span><span class="index__title">${esc(i.title)}</span><span class="pill pill--${tone(i)}">${esc(statusLabel(i))}</span></a></li>`).join("")}
        </ol>
      </div>
    </div>
  </section>

  <section aria-labelledby="incidencias">
    <h2 id="incidencias">Incidencias</h2>
    ${issues.length === 0 ? `<p class="empty">No hay incidencias.</p>` : issues.map((i) => renderCard(i, frame, audit.fileKey, image !== null)).join("")}
  </section>

  ${renderSemantic(review)}
  ${renderManual(review)}
  ${renderRecommendations(review)}
  ${renderAppendix(audit)}
</main>

<footer class="wrap footer">
  <p>Generado por figma-a11y el ${esc(date)}. Las mediciones proceden de la API de Figma; la revisión semántica, de la captura y el contexto del diseño.</p>
  ${audit.notes.map((n) => `<p>Nota del motor: ${esc(n)}</p>`).join("")}
</footer>
<script>
${JS}
</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Bloques del informe

function renderOverview(issues: DisplayIssue[], frame: FigmaRect, hasImage: boolean): string {
  const boxes = [...issues]
    .reverse()
    .flatMap((i) =>
      i.rects.map(
        (r, k) =>
          `<a class="box box--${tone(i)}" href="#inc-${i.number}" ${issueAttrs(i)} data-box="${i.number}" style="${pctBox(r, frame)}" aria-label="Incidencia ${i.number}: ${esc(i.title)}">${k === 0 ? `<span class="box__tag">${i.number}</span>` : ""}</a>`
      )
    )
    .join("");
  return `<div class="shot${hasImage ? "" : " shot--noimg"}" style="aspect-ratio:${fmt(frame.width)}/${fmt(frame.height)}" role="img" aria-label="Captura del frame con las incidencias marcadas">
    ${hasImage ? `<div class="shot__img" style="inset:0"></div>` : `<p class="shot__missing">Figma no devolvió la captura del frame.</p>`}
    ${boxes}
  </div>`;
}

function renderCard(i: DisplayIssue, frame: FigmaRect, fileKey: string, hasImage: boolean): string {
  const crop = cropRegion(i.rects, frame);
  const figure = crop
    ? `<figure class="card__fig">
        <div class="shot shot--crop${hasImage ? "" : " shot--noimg"}" style="aspect-ratio:${fmt(crop.width)}/${fmt(crop.height)}" role="img" aria-label="Zona ampliada de la incidencia ${i.number}">
          ${hasImage ? `<div class="shot__img" style="width:${pct(frame.width / crop.width)};height:${pct(frame.height / crop.height)};left:${pct(-(crop.x - frame.x) / crop.width)};top:${pct(-(crop.y - frame.y) / crop.height)}"></div>` : ""}
          ${i.rects.map((r) => `<span class="box box--${tone(i)} box--static" style="${pctBox(r, crop)}"></span>`).join("")}
        </div>
        <figcaption>Zona ampliada · ${fmt(Math.round(crop.width))}×${fmt(Math.round(crop.height))} px del frame</figcaption>
      </figure>`
    : `<div class="card__nofig">${i.nodeIds.length === 0 ? "Incidencia global: afecta al frame completo o a estados que no aparecen en él." : "La capa no está en el área visible del frame."}</div>`;

  const layers = i.findings.length ? uniqBy(i.findings, (f) => f.nodeId) : [];
  const paths = uniq([...layers.map((f) => f.nodePath), ...i.textLayers.map((t) => t.nodePath)]);
  const links = uniq(i.nodeIds).map((id) => `<a href="${esc(figmaNodeLink(fileKey, id))}">${esc(id)}</a>`);
  const measurements = renderMeasurements(i);

  return `<article class="card card--${tone(i)}" id="inc-${i.number}" ${issueAttrs(i)} data-card="${i.number}" tabindex="-1">
    <header class="card__head">
      <span class="num num--${tone(i)}">${i.number}</span>
      <div>
        <h3>${esc(i.title)}</h3>
        <p class="card__meta"><span class="pill pill--${tone(i)}">${esc(statusLabel(i))}</span> <span class="crit">${esc(i.wcag)}</span> <span class="src">${i.source === "medido" ? "Medido por la herramienta" : "Revisión semántica"}</span></p>
      </div>
    </header>
    <div class="card__body">
      ${figure}
      <div class="card__text">
        <h4>Qué pasa</h4>
        <p>${esc(i.problem)}</p>
        ${measurements}
        <h4>${i.status === "descartado" ? "Qué hacer" : "Cómo resolverlo"}</h4>
        <p>${esc(i.fix)}</p>
        ${paths.length ? `<h4>Capas</h4><ul class="paths">${paths.map((p) => `<li><code>${esc(p)}</code></li>`).join("")}</ul>` : ""}
        ${links.length ? `<p class="links">Abrir en Figma: ${links.join(" · ")}</p>` : ""}
        ${i.offscreenNodeIds.length ? `<p class="warn">${i.offscreenNodeIds.length} capa(s) quedan fuera del área visible del frame y no se pueden marcar en la captura.</p>` : ""}
        ${i.missingNodeIds.length ? `<p class="warn">No se han encontrado en el frame: ${i.missingNodeIds.map(esc).join(", ")}.</p>` : ""}
      </div>
    </div>
  </article>`;
}

/**
 * Muestra los valores medidos asociados a la incidencia: muestras de color con el ratio
 * para contrastes y dimensiones para áreas táctiles. Solo usa datos del motor.
 */
function renderMeasurements(i: DisplayIssue): string {
  const rows: string[] = [];
  const seen = new Set<string>();
  for (const f of i.findings) {
    const d = f.details ?? {};
    const fg = str(d.foreground) ?? str(d.component);
    const bg = str(d.background) ?? str(d.estimatedBackground) ?? str(d.surrounding);
    const ratio = num(d.contrast);
    const required = num(d.required) ?? num(d.minimum);
    let row: string;
    if (fg && bg) {
      row = `${swatchPair(fg, bg)}<span>${ratio !== undefined ? `<strong>${fmtRatio(ratio)}</strong>` : "<strong>sin calcular</strong>"}${required !== undefined ? ` · requerido ${fmtRatio(required)}` : ""}</span>`;
    } else if (num(d.width) !== undefined && num(d.height) !== undefined) {
      row = `<span class="dim">${fmt(num(d.width)!)}×${fmt(num(d.height)!)} px</span><span>mínimo ${fmt(required ?? 0)}×${fmt(required ?? 0)} px</span>`;
    } else {
      row = `<span>${esc(f.message)}</span>`;
    }
    if (!seen.has(row)) {
      seen.add(row);
      rows.push(`<li>${row}</li>`);
    }
  }
  for (const t of i.textLayers) {
    if (!t.foreground || !t.background || t.contrast === null) continue;
    const row = `${swatchPair(t.foreground, t.background, t.text)}<span><strong>${fmtRatio(t.contrast)}</strong> · requerido ${fmtRatio(t.required)} · ${fmt(Math.round(t.fontSizePx * 10) / 10)} px/${t.fontWeight}</span>`;
    if (!seen.has(row)) {
      seen.add(row);
      rows.push(`<li>${row}</li>`);
    }
  }
  return rows.length ? `<h4>Medición</h4><ul class="measures">${rows.join("")}</ul>` : "";
}

function renderSemantic(review: ReportReview): string {
  if (review.semantic.length === 0) return "";
  return `<section aria-labelledby="semantica">
    <h2 id="semantica">Revisión semántica</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Criterio</th><th scope="col">Resultado</th><th scope="col">Detalle</th></tr></thead>
      <tbody>${review.semantic
        .map((s) => `<tr><th scope="row">${esc(s.criterion)}</th><td><span class="pill pill--${RESULT_TONE[s.result]}">${esc(RESULT_LABEL[s.result])}</span></td><td>${esc(s.detail)}</td></tr>`)
        .join("")}</tbody>
    </table></div>
  </section>`;
}

function renderManual(review: ReportReview): string {
  if (review.manualChecks.length === 0) return "";
  return `<section aria-labelledby="manual">
    <h2 id="manual">Comprobaciones manuales pendientes</h2>
    <ol class="checklist">${review.manualChecks.map((c) => `<li>${esc(c)}</li>`).join("")}</ol>
  </section>`;
}

function renderRecommendations(review: ReportReview): string {
  if (review.recommendations.length === 0) return "";
  const groups = (["bloquea", "aviso", "mejora"] as const)
    .map((p) => ({ p, items: review.recommendations.filter((r) => r.priority === p) }))
    .filter((g) => g.items.length > 0);
  return `<section aria-labelledby="recomendaciones">
    <h2 id="recomendaciones">Recomendaciones priorizadas</h2>
    <div class="recs">${groups
      .map(
        (g) => `<div class="rec rec--${g.p}"><h3>${esc(PRIORITY_LABEL[g.p])}</h3><ol>${g.items.map((r) => `<li>${esc(r.text)}</li>`).join("")}</ol></div>`
      )
      .join("")}</div>
  </section>`;
}

function renderAppendix(audit: AuditResult): string {
  const texts = audit.textLayers;
  return `<section aria-labelledby="anexo">
    <h2 id="anexo">Anexo: datos medidos</h2>
    <details>
      <summary>Hallazgos brutos del motor (${audit.findings.length})</summary>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Gravedad</th><th scope="col">Criterio</th><th scope="col">Capa</th><th scope="col">Mensaje</th></tr></thead>
        <tbody>${audit.findings
          .map((f) => `<tr><td><span class="pill pill--${f.severity}">${esc(SEVERITY_LABEL[f.severity])}</span></td><td>${esc(f.wcag)}</td><td><code>${esc(f.nodePath)}</code></td><td>${esc(f.message)}</td></tr>`)
          .join("")}</tbody>
      </table></div>
    </details>
    <details>
      <summary>Contraste de todos los textos (${texts.length})</summary>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Texto</th><th scope="col">Colores</th><th scope="col">Contraste</th><th scope="col">Requerido</th><th scope="col">Resultado</th></tr></thead>
        <tbody>${texts
          .map(
            (t) => `<tr><td>${esc(truncate(t.text, 60))}<br><small>${fmt(Math.round(t.fontSizePx * 10) / 10)} px/${t.fontWeight}</small></td><td>${t.foreground && t.background ? swatchPair(t.foreground, t.background) : "—"}</td><td>${t.contrast === null ? "sin calcular" : fmtRatio(t.contrast)}</td><td>${fmtRatio(t.required)}</td><td>${t.passes === null ? `<span class="pill pill--manual">Manual</span>` : t.passes ? `<span class="pill pill--ok">Cumple</span>` : `<span class="pill pill--error">No cumple</span>`}</td></tr>`
          )
          .join("")}</tbody>
      </table></div>
    </details>
  </section>`;
}

// ---------------------------------------------------------------------------
// Utilidades

function collectRects(root: FigmaNode): Map<string, FigmaRect> {
  const map = new Map<string, FigmaRect>();
  const walk = (n: FigmaNode) => {
    if (n.absoluteBoundingBox) map.set(n.id, n.absoluteBoundingBox);
    n.children?.forEach(walk);
  };
  walk(root);
  return map;
}

/** Caja del render: absoluteRenderBounds si Figma la da (incluye sombras), si no la caja del frame. */
export function frameRect(root: FigmaNode): FigmaRect | null {
  return root.absoluteRenderBounds ?? root.absoluteBoundingBox ?? null;
}

function intersect(a: FigmaRect, b: FigmaRect): FigmaRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width);
  const btm = Math.min(a.y + a.height, b.y + b.height);
  if (r <= x || btm <= y) return null;
  return { x, y, width: r - x, height: btm - y };
}

function union(rects: FigmaRect[]): FigmaRect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const r = Math.max(...rects.map((q) => q.x + q.width));
  const b = Math.max(...rects.map((q) => q.y + q.height));
  return { x, y, width: r - x, height: b - y };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

function pct(v: number): string {
  return `${fmt(Math.round(v * 100000) / 1000)}%`;
}

function pctBox(r: FigmaRect, base: FigmaRect): string {
  return `left:${pct((r.x - base.x) / base.width)};top:${pct((r.y - base.y) / base.height)};width:${pct(r.width / base.width)};height:${pct(r.height / base.height)}`;
}

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function fmtRatio(n: number): string {
  return `${n.toFixed(2).replace(".", ",")}:1`;
}

function tone(i: DisplayIssue): string {
  if (i.status === "descartado") return "muted";
  if (i.status === "manual") return "manual";
  return i.severity;
}

function statusLabel(i: DisplayIssue): string {
  if (i.status === "descartado") return "Descartada";
  if (i.status === "manual") return "Manual";
  if (i.status === "sin-revisar") return `${SEVERITY_LABEL[i.severity]} · sin revisar`;
  return SEVERITY_LABEL[i.severity];
}

function issueAttrs(i: DisplayIssue): string {
  return `data-tone="${tone(i)}"`;
}

function swatchPair(fg: string, bg: string, sample = "Aa"): string {
  const safeFg = safeColor(fg);
  const safeBg = safeColor(bg);
  return `<span class="pair" style="color:${safeFg};background:${safeBg}" title="${esc(fg)} sobre ${esc(bg)}">${esc(truncate(sample.split("\n")[0], 18))}</span><code>${esc(fg)} / ${esc(bg)}</code>`;
}

function safeColor(c: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "transparent";
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function uniqBy<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)));
}

/** Escapa texto para HTML (contenido y atributos entre comillas dobles). */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function ruleLabel(rule: string): string {
  return RULE_LABEL[rule] ?? rule;
}

const RULE_LABEL: Record<string, string> = {
  "text-contrast": "Contraste de texto",
  "non-text-contrast": "Contraste de componente",
  "target-size": "Área táctil",
  "background-uncertain": "Fondo no determinable",
  "small-text": "Texto pequeño",
  "image-alt": "Imagen sin nombre",
};

const SEVERITY_LABEL = { error: "Error", warning: "Aviso", info: "Nota" } as const;
const VERDICT_LABEL = { cumple: "Cumple", "no-cumple": "No cumple", pendiente: "Pendiente de comprobaciones" } as const;
const RESULT_LABEL = { cumple: "Cumple", "no-cumple": "No cumple", parcial: "Parcial", pendiente: "Pendiente", "no-determinable": "No determinable" } as const;
const RESULT_TONE = { cumple: "ok", "no-cumple": "error", parcial: "warning", pendiente: "manual", "no-determinable": "muted" } as const;
const PRIORITY_LABEL = { bloquea: "Bloquea el nivel: resolver antes de desarrollo", aviso: "Avisos", mejora: "Mejoras" } as const;
const FILTERS = [
  { key: "todas", label: "Todas" },
  { key: "error", label: "Errores" },
  { key: "warning", label: "Avisos" },
  { key: "info", label: "Notas" },
  { key: "manual", label: "Manual" },
  { key: "muted", label: "Descartadas" },
];

const CSS = `
:root {
  --bg: #f6f6f4; --surface: #ffffff; --ink: #1d1d1b; --ink-2: #55534f; --line: #e2e0dc;
  --error: #b3261e; --error-bg: #fbe9e7; --warning: #8a5300; --warning-bg: #fff3dc;
  --info: #1a5fb4; --info-bg: #e6f0fb; --manual: #6a3fb5; --manual-bg: #f0eafb;
  --muted: #6b6965; --muted-bg: #eeedea; --ok: #1e6b3a; --ok-bg: #e5f4ea; --focus: #1a5fb4;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161615; --surface: #20201e; --ink: #f1f0ec; --ink-2: #b9b6af; --line: #3a3935;
    --error: #ff8a80; --error-bg: #3b1d1a; --warning: #ffc266; --warning-bg: #37290f;
    --info: #8ab8ff; --info-bg: #172a44; --manual: #c3a6ff; --manual-bg: #2b2140;
    --muted: #a8a59e; --muted-bg: #2c2b28; --ok: #7fd49a; --ok-bg: #173323; --focus: #8ab8ff;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
a { color: var(--info); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 16px; top: 16px; background: var(--surface); padding: 8px 12px; z-index: 10; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 16px; }
h1, h2, h3, h4 { line-height: 1.25; }
h2 { font-size: 1.45rem; margin: 48px 0 16px; }
h4 { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-2); margin: 16px 0 4px; }
code { font: .85em ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }

.hero { background: var(--surface); border-bottom: 1px solid var(--line); padding: 32px 0 24px; }
.eyebrow { margin: 0; color: var(--ink-2); font-size: .85rem; text-transform: uppercase; letter-spacing: .08em; }
.hero h1 { font-size: clamp(1.6rem, 4vw, 2.3rem); margin: 4px 0; }
.meta, .tool, .scope { color: var(--ink-2); margin: 4px 0; }
.verdict { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin: 20px 0 8px; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--line); }
.verdict p { margin: 0; flex: 1 1 320px; }
.verdict__badge { font-weight: 700; padding: 6px 12px; border-radius: 999px; white-space: nowrap; }
.verdict--cumple { background: var(--ok-bg); } .verdict--cumple .verdict__badge { background: var(--ok); color: var(--surface); }
.verdict--no-cumple { background: var(--error-bg); } .verdict--no-cumple .verdict__badge { background: var(--error); color: var(--surface); }
.verdict--pendiente { background: var(--warning-bg); } .verdict--pendiente .verdict__badge { background: var(--warning); color: var(--surface); }
.stats { list-style: none; padding: 0; margin: 16px 0 8px; display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
.stat { background: var(--bg); border-radius: 10px; padding: 12px 14px; border-top: 4px solid var(--line); }
.stat__value { display: block; font-size: 1.9rem; font-weight: 700; line-height: 1.1; }
.stat__label { color: var(--ink-2); font-size: .9rem; }
.stat--error { border-color: var(--error); } .stat--warning { border-color: var(--warning); } .stat--info { border-color: var(--info); }
.stat--manual { border-color: var(--manual); } .stat--muted { border-color: var(--muted); }

.map__grid { display: grid; grid-template-columns: minmax(0, 420px) minmax(0, 1fr); gap: 24px; align-items: start; }
@media (max-width: 820px) { .map__grid { grid-template-columns: minmax(0, 1fr); } }
.map__shot { position: sticky; top: 16px; }
@media (max-width: 820px) { .map__shot { position: static; } }
.shot { position: relative; border-radius: 14px; background: var(--muted-bg); border: 1px solid var(--line); box-shadow: 0 6px 24px rgba(0,0,0,.08); }
.shot--crop { border-radius: 10px; box-shadow: none; overflow: hidden; }
.shot__img { position: absolute; background-image: var(--shot); background-size: 100% 100%; background-repeat: no-repeat; border-radius: inherit; }
.shot--crop .shot__img { border-radius: 0; }
.shot--noimg { min-height: 160px; }
.shot__missing { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: 16px; text-align: center; color: var(--ink-2); }
.box { position: absolute; min-width: 6px; min-height: 6px; border: 2.5px solid currentColor; border-radius: 4px; box-shadow: 0 0 0 1.5px rgba(255,255,255,.95), inset 0 0 0 1px rgba(255,255,255,.6); background: color-mix(in srgb, currentColor 12%, transparent); text-decoration: none; transition: background .15s; }
.box:hover, .box.is-hot { background: color-mix(in srgb, currentColor 30%, transparent); }
.box--static { pointer-events: none; }
.box--error { color: #d32f2f; } .box--warning { color: #e08a00; } .box--info { color: #1e6fd9; } .box--manual { color: #7c4dff; } .box--muted { color: #8a8782; border-style: dashed; }
.box__tag { position: absolute; top: -11px; left: -11px; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px; display: grid; place-items: center; color: #fff; font: 700 12px/1 system-ui, sans-serif; box-shadow: 0 0 0 2px #fff; }
.box--error .box__tag { background: #d32f2f; } .box--warning .box__tag { background: #b86e00; } .box--info .box__tag { background: #1e6fd9; }
.box--manual .box__tag { background: #7c4dff; } .box--muted .box__tag { background: #77746f; }
.legend { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: .85rem; color: var(--ink-2); }
.sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.sw--error { background: #d32f2f; } .sw--warning { background: #e08a00; } .sw--info { background: #1e6fd9; } .sw--manual { background: #7c4dff; } .sw--muted { background: #8a8782; }

.filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.filters button { font: inherit; font-size: .9rem; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; }
.filters button[aria-pressed="true"] { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.index { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.index a { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); text-decoration: none; }
.index a:hover { border-color: var(--ink-2); }
.index__title { min-width: 0; }

.num { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 14px; font-weight: 700; font-size: .85rem; color: #fff; }
.num--error { background: #d32f2f; } .num--warning { background: #b86e00; } .num--info { background: #1e6fd9; } .num--manual { background: #7c4dff; } .num--muted { background: #77746f; }
.pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: .78rem; font-weight: 600; white-space: nowrap; }
.pill--error { background: var(--error-bg); color: var(--error); } .pill--warning { background: var(--warning-bg); color: var(--warning); }
.pill--info { background: var(--info-bg); color: var(--info); } .pill--manual { background: var(--manual-bg); color: var(--manual); }
.pill--muted { background: var(--muted-bg); color: var(--muted); } .pill--ok { background: var(--ok-bg); color: var(--ok); }

.card { background: var(--surface); border: 1px solid var(--line); border-left: 6px solid var(--line); border-radius: 14px; padding: 20px; margin: 0 0 18px; scroll-margin-top: 16px; }
.card:target, .card.is-hot { box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus) 45%, transparent); }
.card--error { border-left-color: #d32f2f; } .card--warning { border-left-color: #e08a00; } .card--info { border-left-color: #1e6fd9; }
.card--manual { border-left-color: #7c4dff; } .card--muted { border-left-color: #8a8782; }
.card__head { display: flex; gap: 12px; align-items: flex-start; }
.card__head h3 { margin: 0 0 6px; font-size: 1.15rem; }
.card__meta { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: .88rem; color: var(--ink-2); }
.card__body { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); gap: 24px; margin-top: 12px; }
@media (max-width: 760px) { .card__body { grid-template-columns: minmax(0, 1fr); } }
.card__fig { margin: 0; }
.card__fig figcaption { font-size: .8rem; color: var(--ink-2); margin-top: 6px; }
.card__nofig { padding: 20px; border: 1px dashed var(--line); border-radius: 10px; color: var(--ink-2); align-self: start; }
.card__text p { margin: 0 0 8px; }
.paths { margin: 0; padding-left: 18px; font-size: .9rem; }
.links { font-size: .88rem; overflow-wrap: anywhere; }
.warn { color: var(--warning); font-size: .9rem; }
.measures { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.measures li { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pair { display: inline-grid; place-items: center; min-width: 44px; height: 30px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--line); font-weight: 600; }
.dim { font-weight: 700; }

.table-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
table { border-collapse: collapse; width: 100%; font-size: .93rem; }
th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--line); }
thead th { font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; color: var(--ink-2); }
tbody tr:last-child > * { border-bottom: 0; }
td .pair { margin-right: 6px; }
.checklist { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 16px 16px 40px; margin: 0; }
.checklist li { margin: 6px 0; }
.recs { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.rec { background: var(--surface); border: 1px solid var(--line); border-top: 5px solid var(--line); border-radius: 12px; padding: 4px 18px 12px; }
.rec h3 { font-size: 1rem; }
.rec ol { padding-left: 20px; margin: 0; } .rec li { margin: 6px 0; }
.rec--bloquea { border-top-color: #d32f2f; } .rec--aviso { border-top-color: #e08a00; } .rec--mejora { border-top-color: #1e6fd9; }
details { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; margin: 0 0 12px; }
details .table-wrap { margin-top: 12px; border: 0; }
summary { cursor: pointer; font-weight: 600; }
.footer { color: var(--ink-2); font-size: .85rem; padding-top: 24px; padding-bottom: 48px; }
.empty { color: var(--ink-2); }

body:not([data-filter="todas"]) [data-tone] { display: none; }
body[data-filter="error"] [data-tone="error"], body[data-filter="warning"] [data-tone="warning"], body[data-filter="info"] [data-tone="info"],
body[data-filter="manual"] [data-tone="manual"], body[data-filter="muted"] [data-tone="muted"] { display: revert; }

@media print {
  body { background: #fff; }
  .filters, .skip { display: none; }
  .map__shot { position: static; }
  .card, .rec, details { break-inside: avoid; box-shadow: none; }
  details { display: block; } details > summary { display: none; }
  body [data-tone] { display: revert !important; }
}
`;

const JS = `
(function () {
  var body = document.body;
  document.querySelectorAll('[data-set-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      body.setAttribute('data-filter', btn.getAttribute('data-set-filter'));
      document.querySelectorAll('[data-set-filter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
    });
  });
  function hot(n, on) {
    document.querySelectorAll('[data-box="' + n + '"], [data-card="' + n + '"]').forEach(function (el) { el.classList.toggle('is-hot', on); });
  }
  document.querySelectorAll('[data-card]').forEach(function (card) {
    var n = card.getAttribute('data-card');
    card.addEventListener('mouseenter', function () { hot(n, true); });
    card.addEventListener('mouseleave', function () { hot(n, false); });
  });
  document.querySelectorAll('[data-box]').forEach(function (box) {
    var n = box.getAttribute('data-box');
    box.addEventListener('mouseenter', function () { hot(n, true); });
    box.addEventListener('mouseleave', function () { hot(n, false); });
    box.addEventListener('click', function () { setTimeout(function () { var c = document.getElementById('inc-' + n); if (c) c.focus({ preventScroll: true }); }, 0); });
  });
})();
`;
