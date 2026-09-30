import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchNodeImage, fetchNodes, resolveToken } from "../figma/client.js";
import { normalizeAutoLayout } from "../figma/layout.js";
import { parseFigmaUrl } from "../figma/url.js";
import { auditTree } from "../rules/engine.js";
import { renderHtmlReport, type FrameImage } from "./html.js";
import { reportReviewSchema, type ReportReviewInput } from "./schema.js";

export interface BuildReportOptions {
  /** Carpeta de salida; por defecto `reports/` bajo el directorio de trabajo. */
  outDir?: string;
  /** Nombre de archivo; por defecto `<AAAA-MM-DD>-<frame-slug>.html`. */
  fileName?: string;
  token?: string;
  now?: Date;
}

export interface BuildReportResult {
  path: string;
  issues: number;
  hasScreenshot: boolean;
  screenshotError?: string;
}

/**
 * Genera el informe HTML visual de un frame a partir de la revisión del skill.
 *
 * Pasos:
 *   1. Valida la revisión con el esquema (aplica valores por defecto).
 *   2. Descarga el subárbol del frame, normaliza sus cajas de auto-layout y vuelve a
 *      ejecutar el motor de reglas, para que las mediciones del informe salgan de la
 *      herramienta y no del texto de la revisión, y las marcas caigan sobre el render.
 *   3. Descarga el render PNG del frame. Si falla, el informe se genera sin captura y el
 *      motivo se devuelve en `screenshotError`.
 *   4. Escribe un único archivo HTML autocontenido (la captura va incrustada en base64).
 *
 * @param reviewInput Revisión escrita por el skill.
 * @param opts Carpeta, nombre de archivo, token y fecha opcionales.
 * @returns Ruta absoluta del archivo y datos para el resumen.
 * @throws FigmaApiError si falta el token o no se puede leer el nodo; ZodError si la revisión no es válida.
 */
export async function buildHtmlReport(reviewInput: ReportReviewInput, opts: BuildReportOptions = {}): Promise<BuildReportResult> {
  const review = reportReviewSchema.parse(reviewInput);
  const token = resolveToken(opts.token);
  const parsed = parseFigmaUrl(review.url);
  if (!parsed.nodeId) throw new Error("El enlace de la revisión no incluye node-id; usa el mismo enlace que en la auditoría.");

  const { fileName, nodes } = await fetchNodes(parsed.fileKey, [parsed.nodeId], token);
  const root = normalizeAutoLayout(nodes[0]);
  const audit = auditTree(root, fileName, { level: review.level, fileKey: parsed.fileKey });

  let image: FrameImage | null = null;
  let screenshotError: string | undefined;
  try {
    const png = await fetchNodeImage(parsed.fileKey, parsed.nodeId, token, 2);
    const { width, height } = pngSize(png);
    image = { dataUri: `data:image/png;base64,${png.toString("base64")}`, width, height };
  } catch (err) {
    screenshotError = err instanceof Error ? err.message : String(err);
  }

  const now = opts.now ?? new Date();
  const html = renderHtmlReport({ review, audit, root, image, generatedAt: now });
  const outDir = path.resolve(opts.outDir ?? "reports");
  const name = opts.fileName ?? `${now.toISOString().slice(0, 10)}-${slug(root.name)}.html`;
  const outPath = path.join(outDir, name);
  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, html, "utf8");
  return { path: outPath, issues: review.issues.length, hasScreenshot: image !== null, screenshotError };
}

/** Lee ancho y alto de la cabecera IHDR de un PNG (bytes 16-23). */
export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || png.toString("ascii", 12, 16) !== "IHDR") throw new Error("El render recibido no es un PNG válido.");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Convierte el nombre del frame en un fragmento de nombre de archivo (sin acentos ni símbolos). */
export function slug(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "frame";
}
