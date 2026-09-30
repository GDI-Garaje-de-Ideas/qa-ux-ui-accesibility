import { z } from "zod";

/**
 * Esquema de la revisión que el skill /a11y-audit entrega al generador del informe HTML.
 *
 * Las mediciones (contrastes, tamaños, cajas de las capas y captura) no forman parte de
 * este esquema: el generador las obtiene de Figma y del motor de reglas, de modo que el
 * informe nunca muestra un valor que no haya medido la herramienta. La revisión aporta
 * solo el criterio humano: qué incidencias se confirman o descartan, por qué, y cómo
 * resolverlas.
 */

export const reportIssueSchema = z.object({
  title: z.string().describe("Título corto de la incidencia, p. ej. \"Botón atrás sin nombre accesible\"."),
  severity: z.enum(["error", "warning", "info"]).describe("error bloquea el nivel; warning es aviso; info es nota o mejora."),
  status: z
    .enum(["confirmado", "descartado", "manual"])
    .default("confirmado")
    .describe("descartado = falso positivo; manual = requiere comprobación fuera del diseño."),
  source: z.enum(["medido", "semantico"]).describe("medido = viene de audit_figma_node; semantico = revisión con la captura."),
  wcag: z.string().describe("Criterio WCAG, p. ej. \"1.4.3 Contrast (Minimum)\"."),
  nodeIds: z
    .array(z.string())
    .default([])
    .describe("Ids de las capas afectadas (formato API, p. ej. \"I1:2;3:4\"). Se marcan en la captura. Vacío si la incidencia es global."),
  rules: z
    .array(z.string())
    .optional()
    .describe("Reglas del motor que cubre esta incidencia (p. ej. [\"target-size\"]). Si se omite, cubre todos los hallazgos de sus capas."),
  problem: z.string().describe("Qué pasa y a quién afecta, en lenguaje claro."),
  fix: z.string().describe("Cómo resolverlo en el diseño o en desarrollo."),
});

export const semanticCheckSchema = z.object({
  criterion: z.string().describe("Criterio revisado, p. ej. \"1.4.1 Uso del color\"."),
  result: z.enum(["cumple", "no-cumple", "parcial", "pendiente", "no-determinable"]),
  detail: z.string().describe("Capas afectadas y justificación."),
});

export const recommendationSchema = z.object({
  priority: z.enum(["bloquea", "aviso", "mejora"]),
  text: z.string(),
});

export const reportReviewSchema = z.object({
  url: z.string().describe("Enlace de Figma con node-id del frame auditado."),
  level: z.enum(["AA", "AAA"]).default("AA"),
  verdict: z.enum(["cumple", "no-cumple", "pendiente"]).describe("Veredicto tras la revisión."),
  verdictText: z.string().describe("Una o dos frases que justifican el veredicto."),
  scopeNote: z.string().optional().describe("Aclaraciones de alcance (p. ej. revisión semántica pendiente)."),
  issues: z.array(reportIssueSchema).describe("Incidencias revisadas, medidas y semánticas."),
  semantic: z.array(semanticCheckSchema).default([]),
  manualChecks: z.array(z.string()).default([]),
  recommendations: z.array(recommendationSchema).default([]),
});

export type ReportIssue = z.infer<typeof reportIssueSchema>;
export type SemanticCheck = z.infer<typeof semanticCheckSchema>;
export type ReportReview = z.infer<typeof reportReviewSchema>;
/** Forma de entrada antes de aplicar los valores por defecto (lo que escribe el skill). */
export type ReportReviewInput = z.input<typeof reportReviewSchema>;
