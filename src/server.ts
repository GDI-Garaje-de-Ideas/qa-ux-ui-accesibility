#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { auditFromUrl } from "./audit.js";
import { contrastRatio, compositeOver, isLargeText, parseHex, requiredTextContrast, round2, toHex, NON_TEXT_CONTRAST } from "./color/contrast.js";
import { RULES } from "./rules/engine.js";
import { buildHtmlReport } from "./report/build.js";
import { reportReviewSchema } from "./report/schema.js";

const server = new McpServer({ name: "figma-a11y", version: "0.1.0" });

const levelSchema = z.enum(["AA", "AAA"]).default("AA").describe("Nivel WCAG objetivo.");

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

server.registerTool(
  "audit_figma_node",
  {
    title: "Auditar accesibilidad de un nodo de Figma",
    description:
      "Descarga un frame/nodo de Figma por su enlace (Copy link to selection) y aplica reglas deterministas WCAG 2.2: contraste de texto (1.4.3/1.4.6), contraste no textual (1.4.11), tamaño de área táctil (2.5.8), texto pequeño e imágenes sin nombre descriptivo. Devuelve findings con nodeId, ruta de capas, valores medidos y sugerencia, más un inventario de textos y elementos interactivos. Si el enlace no lleva node-id devuelve las páginas y frames del archivo para elegir uno.",
    inputSchema: {
      url: z.string().describe("Enlace de Figma con node-id, p. ej. https://www.figma.com/design/<fileKey>/<nombre>?node-id=12-34"),
      level: levelSchema,
      minFontSizePx: z.number().optional().describe("Umbral de aviso para texto pequeño (por defecto 12 px)."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ url, level, minFontSizePx }) => {
    try {
      const outcome = await auditFromUrl({ url, level, minFontSizePx });
      if (outcome.kind === "needs-node") {
        return json({
          message: "El enlace no incluye node-id. Elige un frame y vuelve a llamar con ?node-id=<id con guion>.",
          fileName: outcome.fileName,
          fileKey: outcome.fileKey,
          pages: outcome.pages,
        });
      }
      return json(outcome.result);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "check_contrast",
  {
    title: "Calcular contraste WCAG entre dos colores",
    description:
      "Calcula el ratio de contraste WCAG 2.x entre un color de primer plano y uno de fondo (hex #RRGGBB o #RRGGBBAA; el alfa del primer plano se compone sobre el fondo). Si se indica tamaño y peso de fuente evalúa el umbral de texto; si no, el de componentes (3:1).",
    inputSchema: {
      foreground: z.string().describe("Color del texto o componente, p. ej. #6B7280"),
      background: z.string().describe("Color de fondo opaco, p. ej. #FFFFFF"),
      fontSizePx: z.number().optional().describe("Tamaño de fuente en px (para texto)."),
      fontWeight: z.number().optional().describe("Peso de fuente (400, 700...)."),
      level: levelSchema,
    },
    annotations: { readOnlyHint: true },
  },
  async ({ foreground, background, fontSizePx, fontWeight, level }) => {
    try {
      const bg = parseHex(background);
      const fg = compositeOver(parseHex(foreground), bg);
      const ratio = round2(contrastRatio(fg, bg));
      const isText = fontSizePx !== undefined;
      const large = isText ? isLargeText(fontSizePx, fontWeight ?? 400) : false;
      const required = isText ? requiredTextContrast(level, large) : NON_TEXT_CONTRAST;
      return json({
        foreground: toHex(fg),
        background: toHex(bg),
        contrast: ratio,
        required,
        passes: ratio >= required,
        context: isText ? `texto ${large ? "grande" : "normal"} (${fontSizePx}px/${fontWeight ?? 400}), nivel ${level}` : "componente o gráfico (1.4.11)",
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_a11y_rules",
  {
    title: "Listar reglas deterministas",
    description: "Devuelve el catálogo de reglas que audit_figma_node comprueba automáticamente, para saber qué queda pendiente de revisión semántica.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => json(RULES)
);

server.registerTool(
  "build_html_report",
  {
    title: "Generar informe HTML visual",
    description:
      "Genera un informe HTML autocontenido para abrir en el navegador: captura del frame con cada incidencia marcada y numerada, zoom de la zona afectada, mediciones reales (colores, contraste, tamaños), qué pasa y cómo resolverlo, revisión semántica, comprobaciones manuales y recomendaciones. Vuelve a descargar el frame y a ejecutar las reglas, así que las mediciones salen de la herramienta; la revisión solo aporta el criterio (confirmar o descartar, explicar, proponer solución). Los hallazgos medidos que la revisión no cite se añaden como 'sin revisar'.",
    inputSchema: {
      review: reportReviewSchema.describe("Revisión del skill: veredicto, incidencias con nodeIds, problema y solución, revisión semántica, comprobaciones manuales y recomendaciones."),
      outDir: z.string().optional().describe("Carpeta de salida; por defecto reports/ en el directorio del proyecto."),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ review, outDir }) => {
    try {
      return json(await buildHtmlReport(review, { outDir }));
    } catch (err) {
      return errorResult(err);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
