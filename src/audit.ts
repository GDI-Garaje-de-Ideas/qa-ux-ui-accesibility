import { fetchFileOutline, fetchNodes, resolveToken } from "./figma/client.js";
import { normalizeAutoLayout } from "./figma/layout.js";
import { parseFigmaUrl } from "./figma/url.js";
import { auditTree } from "./rules/engine.js";
import type { AuditOptions, AuditResult } from "./rules/types.js";
import type { WcagLevel } from "./color/contrast.js";

export interface AuditRequest {
  url: string;
  level?: WcagLevel;
  minFontSizePx?: number;
  token?: string;
}

export type AuditOutcome =
  | { kind: "result"; result: AuditResult }
  | { kind: "needs-node"; fileName: string; fileKey: string; pages: { id: string; name: string; frames: { id: string; name: string }[] }[] };

/**
 * Orquesta una auditoría completa a partir de un enlace de Figma.
 *
 * Es la función que comparten el servidor MCP y la CLI, de modo que ambos se comporten
 * igual. Pasos:
 *   1. Resuelve el token (argumento explícito o variables de entorno) con resolveToken;
 *      si no hay token falla aquí, antes de tocar la red.
 *   2. Analiza el enlace con parseFigmaUrl para obtener clave de archivo y node-id.
 *   3. Si el enlace no lleva node-id, no audita nada: descarga el índice del archivo con
 *      fetchFileOutline y devuelve un resultado de tipo "needs-node" con las páginas y
 *      frames, para que quien llama elija uno y repita la petición.
 *   4. Si hay node-id, descarga ese subárbol con fetchNodes, normaliza sus cajas de
 *      auto-layout con normalizeAutoLayout (la API puede devolverlas desactualizadas
 *      dentro de instancias), monta las opciones (nivel
 *      WCAG por defecto "AA", clave del archivo para los enlaces, umbral de texto pequeño)
 *      y ejecuta auditTree.
 *   5. Devuelve un resultado de tipo "result" con el AuditResult.
 *
 * El tipo de retorno es una unión discriminada por `kind` para que el llamador esté
 * obligado a tratar el caso "needs-node" y no lo confunda con una auditoría vacía.
 *
 * @param req Enlace, nivel opcional, umbral de texto pequeño opcional y token opcional.
 * @returns Auditoría completa o índice del archivo si faltaba el node-id.
 * @throws FigmaApiError si falta el token o la API falla; Error si el enlace no es válido.
 */
export async function auditFromUrl(req: AuditRequest): Promise<AuditOutcome> {
  const token = resolveToken(req.token);
  const parsed = parseFigmaUrl(req.url);
  if (!parsed.nodeId) {
    const outline = await fetchFileOutline(parsed.fileKey, token);
    return { kind: "needs-node", fileKey: parsed.fileKey, ...outline };
  }
  const { fileName, nodes } = await fetchNodes(parsed.fileKey, [parsed.nodeId], token);
  const opts: AuditOptions = { level: req.level ?? "AA", fileKey: parsed.fileKey, minFontSizePx: req.minFontSizePx };
  return { kind: "result", result: auditTree(normalizeAutoLayout(nodes[0]), fileName, opts) };
}
