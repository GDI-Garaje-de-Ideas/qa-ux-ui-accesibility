import type { FigmaNode, FigmaRect } from "../figma/types.js";
import { figmaNodeLink } from "../figma/url.js";
import {
  compositeOver,
  contrastRatio,
  isLargeText,
  NON_TEXT_CONTRAST,
  requiredTextContrast,
  round2,
  toHex,
  type RGB,
} from "../color/contrast.js";
import { effectiveSolidFills, hasNonSolidVisibleFill, layersForNode, resolveBackground, type PaintedLayer } from "./background.js";
import type { AuditOptions, AuditResult, Finding, InteractiveInfo, TextLayerInfo } from "./types.js";

/**
 * Catálogo de reglas deterministas que aplica el motor.
 *
 * Cada entrada tiene un `id` (el mismo valor que aparece en `finding.rule`), el criterio
 * WCAG asociado, el nivel de conformidad y una descripción en castellano. El servidor MCP
 * lo expone con la herramienta `list_a11y_rules` para que el modelo sepa qué se ha
 * comprobado automáticamente y qué queda pendiente de revisión semántica. Es también la
 * referencia que debe mantenerse sincronizada con el README y el SKILL.md.
 */
export const RULES = [
  { id: "text-contrast", wcag: "1.4.3 Contrast (Minimum) / 1.4.6 Contrast (Enhanced)", level: "AA", description: "Contraste del texto con su fondo: 4.5:1 (3:1 para texto grande). En AAA: 7:1 y 4.5:1." },
  { id: "non-text-contrast", wcag: "1.4.11 Non-text Contrast", level: "AA", description: "Contraste de 3:1 entre el borde o relleno de componentes interactivos y su entorno." },
  { id: "target-size", wcag: "2.5.8 Target Size (Minimum)", level: "AA", description: "Elementos interactivos de al menos 24x24 px. Se recomienda 44x44 (2.5.5, AAA)." },
  { id: "text-size", wcag: "1.4.4 Resize Text (buena práctica)", level: "best-practice", description: "Aviso de texto por debajo de 12 px, difícil de leer incluso ampliado." },
  { id: "image-alt", wcag: "1.1.1 Non-text Content", level: "A", description: "Imágenes que necesitarán texto alternativo; nombres genéricos de capa dificultan el handoff." },
  { id: "background-uncertain", wcag: "1.4.3 (comprobación manual)", level: "AA", description: "Texto sobre imagen, degradado o formas parciales: el contraste debe verificarse a mano." },
] as const;

const INTERACTIVE_RE =
  /\b(button|btn|cta|link|tab|chip|toggle|switch|checkbox|check box|radio|input|text ?field|search|select|dropdown|combo ?box|menu ?item|nav ?item|nav ?link|icon ?button|fab|slider|stepper|pagination|accordion|segmented)\b/i;
const GENERIC_NAME_RE = /^(rectangle|image|frame|ellipse|vector|group|img|picture|photo)\s*\d*$/i;
const MIN_TARGET = 24;
const RECOMMENDED_TARGET = 44;
const DEFAULT_MIN_FONT = 12;

interface Ctx {
  opts: AuditOptions;
  painted: PaintedLayer[];
  findings: Finding[];
  textLayers: TextLayerInfo[];
  interactive: InteractiveInfo[];
  notes: Set<string>;
  visited: number;
}

/**
 * Punto de entrada del motor de reglas: audita un subárbol de Figma y devuelve el resultado completo.
 *
 * Flujo:
 *   1. Crea un contexto (Ctx) vacío que acumula, durante el recorrido, las capas pintadas,
 *      los findings, el inventario de textos y de elementos interactivos, las notas y el
 *      número de nodos visitados.
 *   2. Llama a `walk` sobre la raíz con ruta vacía, opacidad 1 y sin ancestro interactivo.
 *      Todo el trabajo real ocurre en ese recorrido.
 *   3. Calcula el resumen contando findings por severidad y tamaños de los inventarios.
 *   4. Ordena los findings por severidad (errores primero, luego avisos, luego notas)
 *      para que el informe muestre lo más grave arriba. El orden entre findings de la
 *      misma severidad se conserva, que es el orden de aparición en el diseño.
 *   5. Devuelve un AuditResult serializable, pensado para convertirse directamente en
 *      JSON en la respuesta del servidor MCP.
 *
 * Es una función pura respecto a la red: recibe el árbol ya descargado, lo que permite
 * probarla con árboles sintéticos en los tests.
 *
 * @param root Nodo raíz a auditar (normalmente un frame de pantalla) con sus descendientes.
 * @param fileName Nombre del archivo de Figma, solo informativo.
 * @param opts Nivel WCAG, clave del archivo (para enlaces) y umbral de texto pequeño.
 * @returns Resultado con resumen, findings ordenados, inventarios y notas.
 */
export function auditTree(root: FigmaNode, fileName: string, opts: AuditOptions): AuditResult {
  const ctx: Ctx = { opts, painted: [], findings: [], textLayers: [], interactive: [], notes: new Set(), visited: 0 };
  walk(root, [], 1, false, ctx);

  const summary = {
    errors: ctx.findings.filter((f) => f.severity === "error").length,
    warnings: ctx.findings.filter((f) => f.severity === "warning").length,
    infos: ctx.findings.filter((f) => f.severity === "info").length,
    textLayers: ctx.textLayers.length,
    interactiveElements: ctx.interactive.length,
    nodesVisited: ctx.visited,
  };
  const order = { error: 0, warning: 1, info: 2 };
  ctx.findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    fileName,
    fileKey: opts.fileKey,
    rootNodeId: root.id,
    rootNodeName: root.name,
    level: opts.level,
    summary,
    findings: ctx.findings,
    textLayers: ctx.textLayers,
    interactiveElements: ctx.interactive,
    notes: [...ctx.notes],
  };
}

/**
 * Recorre el árbol en el orden exacto en que Figma pinta las capas y aplica las reglas a cada nodo.
 *
 * El orden importa porque las reglas de contraste necesitan saber qué hay DEBAJO de cada
 * elemento, y "debajo" significa "pintado antes". Figma pinta en preorden: primero los
 * rellenos del nodo, después sus hijos empezando por el primero del array (el que queda
 * más al fondo). Por eso la función hace, en este orden:
 *   1. Descarta el nodo y todo su subárbol si está oculto (`visible: false`); lo que no se
 *      ve no afecta a la accesibilidad ni al fondo de otras capas.
 *   2. Calcula la opacidad acumulada multiplicando la del padre por la propia, ya que la
 *      opacidad de un grupo se aplica a todo su contenido.
 *   3. Evalúa las reglas sobre el nodo ANTES de registrar sus propias capas. Así, cuando
 *      un botón mide su contraste con el entorno, su propio relleno todavía no forma
 *      parte del fondo.
 *      - Si el nombre encaja con INTERACTIVE_RE y ningún ancestro era ya interactivo, se
 *        trata como elemento interactivo (tamaño de objetivo y contraste no textual).
 *        Los textos nunca se consideran interactivos por sí mismos.
 *      - Si es un TEXT se evalúa su contraste y tamaño.
 *      - Se comprueba si tiene un relleno de imagen (regla de texto alternativo).
 *   4. Añade al contexto las capas que pinta este nodo (layersForNode).
 *   5. Desciende a los hijos en orden, propagando la ruta de nombres, la opacidad
 *      acumulada y la bandera de "dentro de un elemento interactivo" para que los
 *      subcomponentes de un botón no generen findings duplicados.
 *
 * @param node Nodo actual.
 * @param path Nombres de los ancestros, de la raíz al padre; se usa para construir nodePath.
 * @param parentOpacity Opacidad acumulada de los ancestros (1 en la raíz).
 * @param insideInteractive true si algún ancestro ya fue clasificado como interactivo.
 * @param ctx Contexto mutable de la auditoría.
 */
function walk(node: FigmaNode, path: string[], parentOpacity: number, insideInteractive: boolean, ctx: Ctx): void {
  if (node.visible === false) return;
  ctx.visited++;
  const opacity = parentOpacity * (node.opacity ?? 1);
  const nodePath = [...path, node.name];

  // Reglas sobre el nodo ANTES de registrar sus propias capas (para comparar contra lo que hay debajo).
  let isInteractive = false;
  if (!insideInteractive && node.type !== "TEXT") {
    const match = INTERACTIVE_RE.exec(node.name);
    if (match) {
      isInteractive = true;
      checkInteractive(node, nodePath, match[0], opacity, ctx);
    }
  }
  if (node.type === "TEXT") checkText(node, nodePath, opacity, ctx);
  checkImage(node, nodePath, ctx);

  ctx.painted.push(...layersForNode(node, opacity));

  for (const child of node.children ?? []) {
    walk(child, nodePath, opacity, insideInteractive || isInteractive, ctx);
  }
}

/**
 * Construye los campos de identificación comunes a todos los findings de un nodo.
 *
 * Cada finding debe permitir localizar la capa afectada sin ambigüedad, así que incluye:
 *   - `nodeId`: id de Figma, único dentro del archivo.
 *   - `nodeName`: nombre de la capa tal y como lo puso el diseñador.
 *   - `nodePath`: ruta completa de nombres desde el frame auditado, unida con " > ",
 *     que es lo que un humano usa para encontrar la capa en el panel de capas.
 *   - `link`: enlace directo al nodo, generado con figmaNodeLink y la clave del archivo.
 *
 * Las reglas hacen `{ ...base(node, path, ctx), rule: ..., message: ... }` para no repetir
 * estos cuatro campos en cada finding.
 *
 * @param node Nodo afectado.
 * @param nodePath Ruta de nombres incluyendo el propio nodo.
 * @param ctx Contexto (para obtener la clave del archivo).
 * @returns Objeto parcial con nodeId, nodeName, nodePath y link.
 */
function base(node: FigmaNode, nodePath: string[], ctx: Ctx) {
  return {
    nodeId: node.id,
    nodeName: node.name,
    nodePath: nodePath.join(" > "),
    link: figmaNodeLink(ctx.opts.fileKey, node.id),
  };
}

/**
 * Determina el tamaño y peso de fuente con los que se evaluará un nodo de texto.
 *
 * Un TEXT de Figma tiene un estilo base en `style` y, si el diseñador aplicó formatos a
 * fragmentos concretos (una palabra en negrita, un número más pequeño...), una tabla
 * `styleOverrideTable` con los estilos alternativos. Como un mismo nodo puede mezclar
 * varios tamaños, la función toma el criterio más conservador para la accesibilidad:
 *   - `fontSize` es el MÍNIMO entre el estilo base y todos los overrides, porque el
 *     fragmento más pequeño es el que más contraste necesita.
 *   - `fontWeight` es también el mínimo, porque un fragmento más fino no se beneficia de
 *     la excepción de "texto grande en negrita".
 *   - `mixed` se pone a true si hubo cualquier diferencia de tamaño, peso o color entre
 *     fragmentos, para que el informe avise de que se evaluó con el peor caso y de que
 *     los fragmentos con otro color se deben revisar aparte.
 *
 * Valores por defecto si Figma no informa el estilo: 16 px y peso 400.
 *
 * @param node Nodo de tipo TEXT.
 * @returns Tamaño, peso, familia tipográfica y bandera de estilos mixtos.
 */
function textStyle(node: FigmaNode): { fontSize: number; fontWeight: number; fontFamily?: string; mixed: boolean } {
  let fontSize = node.style?.fontSize ?? 16;
  let fontWeight = node.style?.fontWeight ?? 400;
  let mixed = false;
  const overrides = node.styleOverrideTable ? Object.values(node.styleOverrideTable) : [];
  for (const o of overrides) {
    if (o.fontSize !== undefined && o.fontSize !== fontSize) { fontSize = Math.min(fontSize, o.fontSize); mixed = true; }
    if (o.fontWeight !== undefined && o.fontWeight !== fontWeight) { fontWeight = Math.min(fontWeight, o.fontWeight); mixed = true; }
    if (o.fills) mixed = true;
  }
  return { fontSize, fontWeight, fontFamily: node.style?.fontFamily, mixed };
}

/**
 * Aplica a un nodo de texto las reglas de contraste (1.4.3 / 1.4.6) y de tamaño mínimo.
 *
 * Secuencia completa:
 *   1. Se ignoran los textos sin caja o cuyo contenido, una vez recortado, está vacío
 *      (un espacio en blanco no tiene contraste que medir).
 *   2. Se obtienen tamaño y peso con textStyle, se decide si es texto grande y se calcula
 *      el umbral exigido para el nivel de la auditoría.
 *   3. Se resuelve el fondo bajo la caja del texto con resolveBackground y las capas
 *      pintadas hasta ahora.
 *   4. Se registra siempre una entrada en el inventario `textLayers` (con el texto
 *      truncado a 60 caracteres), aunque después no haya finding. El inventario permite
 *      al modelo razonar sobre todos los textos, no solo los que fallan.
 *   5. Regla de texto pequeño: si el tamaño baja de `minFontSizePx` (12 px por defecto)
 *      se emite un aviso de buena práctica.
 *   6. Se obtienen los rellenos sólidos del texto con su alfa efectiva. Si no hay
 *      ninguno pero sí un degradado o imagen, se emite `background-uncertain`
 *      (el color del texto varía) y se termina. Si no hay relleno alguno, se termina
 *      sin finding.
 *   7. El color de primer plano se calcula componiendo cada relleno sobre el fondo, de
 *      modo que un texto negro al 40 % se evalúe como el gris que realmente se ve.
 *   8. Si el fondo era incierto (imagen, degradado, forma parcial) se emite
 *      `background-uncertain` con el fondo estimado y se termina: nunca se reporta un
 *      ratio numérico que no sea fiable.
 *   9. Se calcula el ratio, se guarda en el inventario y, si el fondo fue asumido
 *      (blanco por defecto), se añade una nota global.
 *  10. Si el ratio no alcanza el umbral se emite un error `text-contrast` con todos los
 *      datos medidos y una sugerencia orientada (aclarar u oscurecer). Si cumple pero
 *      había estilos mixtos, se emite una nota informativa.
 *
 * @param node Nodo de tipo TEXT.
 * @param nodePath Ruta de nombres incluyendo el propio nodo.
 * @param opacity Opacidad acumulada (nodo y ancestros).
 * @param ctx Contexto mutable de la auditoría.
 */
function checkText(node: FigmaNode, nodePath: string[], opacity: number, ctx: Ctx): void {
  const rect = node.absoluteBoundingBox;
  const text = (node.characters ?? "").trim();
  if (!rect || !text) return;

  const { fontSize, fontWeight, fontFamily, mixed } = textStyle(node);
  const large = isLargeText(fontSize, fontWeight);
  const required = requiredTextContrast(ctx.opts.level, large);
  const b = base(node, nodePath, ctx);
  const bg = resolveBackground(rect, ctx.painted);

  const info: TextLayerInfo = {
    nodeId: node.id, nodeName: node.name, nodePath: b.nodePath,
    text: text.length > 60 ? `${text.slice(0, 57)}...` : text,
    fontSizePx: fontSize, fontWeight, fontFamily, largeText: large,
    foreground: null, background: toHex(bg.color),
    backgroundAssumed: bg.assumed, backgroundUncertain: bg.uncertain,
    contrast: null, required, passes: null,
    width: Math.round(rect.width), height: Math.round(rect.height),
  };
  ctx.textLayers.push(info);

  if (fontSize < (ctx.opts.minFontSizePx ?? DEFAULT_MIN_FONT)) {
    ctx.findings.push({
      ...b, rule: "text-size", wcag: "1.4.4 Resize Text", level: "best-practice", severity: "warning",
      message: `Texto de ${fontSize}px ("${info.text}"). Por debajo de ${ctx.opts.minFontSizePx ?? DEFAULT_MIN_FONT}px se compromete la legibilidad.`,
      details: { fontSizePx: fontSize },
      suggestion: "Sube el tamaño a 12px o más para texto secundario y a 16px para cuerpo.",
    });
  }

  const fills = effectiveSolidFills(node.fills, opacity);
  const nonSolid = hasNonSolidVisibleFill(node.fills);
  if (fills.length === 0) {
    if (nonSolid) {
      ctx.findings.push({
        ...b, rule: "background-uncertain", wcag: "1.4.3 Contrast (Minimum)", level: "AA", severity: "warning",
        message: `El texto "${info.text}" usa un relleno de ${nonSolid === "image" ? "imagen" : "degradado"}: comprueba el contraste manualmente en el punto más desfavorable.`,
      });
    }
    return;
  }

  // Texto semitransparente: se compone sobre el fondo antes de medir.
  let fg: RGB = bg.color;
  for (const f of fills) fg = compositeOver(f, fg);
  info.foreground = toHex(fg);

  if (bg.uncertain) {
    ctx.findings.push({
      ...b, rule: "background-uncertain", wcag: "1.4.3 Contrast (Minimum)", level: "AA", severity: "warning",
      message: `No se puede calcular con certeza el contraste de "${info.text}": ${bg.reasons.join("; ")}.`,
      details: { foreground: info.foreground, estimatedBackground: info.background, required },
      suggestion: "Verifica el contraste en la zona más clara/oscura del fondo o añade una capa sólida (scrim) tras el texto.",
    });
    return;
  }

  const ratio = round2(contrastRatio(fg, bg.color));
  info.contrast = ratio;
  info.passes = ratio >= required;
  if (bg.assumed) ctx.notes.add("Algunos textos no tienen ninguna capa opaca debajo dentro del nodo auditado; se ha asumido lienzo blanco (#FFFFFF).");

  if (!info.passes) {
    ctx.findings.push({
      ...b, rule: "text-contrast",
      wcag: ctx.opts.level === "AAA" ? "1.4.6 Contrast (Enhanced)" : "1.4.3 Contrast (Minimum)",
      level: ctx.opts.level, severity: "error",
      message: `Contraste ${ratio}:1 en "${info.text}" (${info.foreground} sobre ${info.background}${bg.assumed ? ", fondo asumido" : ""}); se requiere ${required}:1 para texto ${large ? "grande" : "normal"} de ${fontSize}px/${fontWeight}.`,
      details: { contrast: ratio, required, foreground: info.foreground, background: info.background, fontSizePx: fontSize, fontWeight, largeText: large, backgroundAssumed: bg.assumed, mixedStyles: mixed },
      suggestion: suggestFix(fg, bg.color, required),
    });
  } else if (mixed) {
    ctx.findings.push({
      ...b, rule: "text-contrast", wcag: "1.4.3 Contrast (Minimum)", level: "AA", severity: "info",
      message: `"${info.text}" mezcla varios estilos; se ha evaluado con el tamaño y peso más pequeños (${fontSize}px/${fontWeight}). Revisa los fragmentos con otro color.`,
    });
  }
}

/**
 * Redacta una sugerencia de corrección para un texto que no alcanza el contraste exigido.
 *
 * No calcula un color concreto (eso depende de la paleta del sistema de diseño), pero sí
 * orienta la dirección del cambio, que es lo que suele faltar en los informes automáticos:
 *   - Si el fondo es claro (la suma de sus canales supera 1.5, es decir, más cerca del
 *     blanco que del negro) recomienda oscurecer el texto o aclarar el fondo.
 *   - Si el fondo es oscuro, lo contrario.
 * En ambos casos menciona el color actual del texto y el ratio objetivo.
 *
 * @param fg Color efectivo del texto.
 * @param bg Color de fondo compuesto.
 * @param required Ratio que debe alcanzarse.
 * @returns Frase en castellano lista para el informe.
 */
function suggestFix(fg: RGB, bg: RGB, required: number): string {
  const lighterBg = bg.r + bg.g + bg.b > 1.5;
  return lighterBg
    ? `Oscurece el texto (o aclara el fondo) hasta alcanzar ${required}:1. Por ejemplo, prueba con un gris más oscuro que ${toHex(fg)}.`
    : `Aclara el texto (o oscurece el fondo) hasta alcanzar ${required}:1. Por ejemplo, prueba con un tono más claro que ${toHex(fg)}.`;
}

/**
 * Aplica a un elemento interactivo las reglas de tamaño de objetivo (2.5.8 / 2.5.5) y contraste no textual (1.4.11).
 *
 * Un nodo llega aquí cuando su nombre coincide con INTERACTIVE_RE (Button, Input, Link,
 * Tab, Checkbox...) y ningún ancestro ya fue clasificado como interactivo. Es una
 * heurística basada en nombres, por eso cada finding indica en `details.heuristic` qué
 * palabra provocó la clasificación, para poder descartar falsos positivos.
 *
 * Parte 1, tamaño del objetivo:
 *   - Registra el elemento en el inventario `interactiveElements` con sus medidas.
 *   - Si ancho o alto bajan de 24 px (MIN_TARGET, criterio 2.5.8 de nivel AA) emite un
 *     error. El mensaje recuerda la excepción de la norma: si hay espaciado suficiente
 *     alrededor puede cumplirse igualmente, cosa que solo se puede comprobar viendo el
 *     diseño, y por eso el skill lo revisa después sobre la captura.
 *   - Si cumple 24 pero no llega a 44 px (RECOMMENDED_TARGET, criterio 2.5.5 de nivel
 *     AAA) emite solo una nota informativa.
 *
 * Parte 2, contraste con el entorno:
 *   - Toma como color "identificador" del componente su primer borde sólido y, si no
 *     tiene borde, su primer relleno sólido. Si no tiene ninguno, termina: el contraste
 *     lo aportan sus hijos (texto o icono), que ya se evalúan por separado.
 *   - Resuelve el fondo que rodea al componente EXCLUYENDO sus propias capas
 *     (`excludeNodeId`), compone el color identificador sobre ese entorno y mide el ratio.
 *   - Si el entorno es incierto emite una nota; si el ratio baja de 3:1 emite un aviso
 *     `non-text-contrast` con sugerencia de añadir borde o renombrar la capa si en
 *     realidad no es interactiva.
 *
 * @param node Nodo clasificado como interactivo.
 * @param nodePath Ruta de nombres incluyendo el propio nodo.
 * @param matchedBy Fragmento del nombre que coincidió con la expresión regular.
 * @param opacity Opacidad acumulada.
 * @param ctx Contexto mutable de la auditoría.
 */
function checkInteractive(node: FigmaNode, nodePath: string[], matchedBy: string, opacity: number, ctx: Ctx): void {
  const rect = node.absoluteBoundingBox;
  if (!rect) return;
  const b = base(node, nodePath, ctx);
  ctx.interactive.push({ nodeId: node.id, nodeName: node.name, nodePath: b.nodePath, type: node.type, width: Math.round(rect.width), height: Math.round(rect.height), matchedBy });

  // 2.5.8 Target Size
  const w = rect.width;
  const h = rect.height;
  if (w < MIN_TARGET || h < MIN_TARGET) {
    ctx.findings.push({
      ...b, rule: "target-size", wcag: "2.5.8 Target Size (Minimum)", level: "AA", severity: "error",
      message: `"${node.name}" mide ${Math.round(w)}x${Math.round(h)} px; el mínimo es ${MIN_TARGET}x${MIN_TARGET} px (salvo que exista espaciado equivalente alrededor).`,
      details: { width: round2(w), height: round2(h), minimum: MIN_TARGET },
      suggestion: `Amplía el área táctil a ${RECOMMENDED_TARGET}x${RECOMMENDED_TARGET} px, aunque el icono visible sea más pequeño.`,
    });
  } else if (w < RECOMMENDED_TARGET || h < RECOMMENDED_TARGET) {
    ctx.findings.push({
      ...b, rule: "target-size", wcag: "2.5.5 Target Size (Enhanced)", level: "AAA", severity: "info",
      message: `"${node.name}" mide ${Math.round(w)}x${Math.round(h)} px; cumple el mínimo pero queda por debajo de los ${RECOMMENDED_TARGET}x${RECOMMENDED_TARGET} px recomendados en móvil.`,
      details: { width: round2(w), height: round2(h), recommended: RECOMMENDED_TARGET },
    });
  }

  // 1.4.11 Non-text contrast: borde si lo hay, si no el relleno, frente al entorno.
  const strokes = effectiveSolidFills(node.strokes, opacity).filter((s) => s.a > 0);
  const fills = effectiveSolidFills(node.fills, opacity).filter((f) => f.a > 0);
  const surrounding = resolveBackground(rect, ctx.painted, node.id);
  const candidate = strokes[0] ?? fills[0];
  if (!candidate) return; // Sin borde ni relleno propio: el contraste lo aportan sus hijos (texto/icono), ya evaluados.
  const color = compositeOver(candidate, surrounding.color);
  const ratio = round2(contrastRatio(color, surrounding.color));
  const via = strokes[0] ? "borde" : "relleno";

  if (surrounding.uncertain) {
    ctx.findings.push({
      ...b, rule: "non-text-contrast", wcag: "1.4.11 Non-text Contrast", level: "AA", severity: "info",
      message: `No se puede medir con certeza el contraste del ${via} de "${node.name}" con su entorno: ${surrounding.reasons.join("; ")}.`,
    });
    return;
  }
  if (ratio < NON_TEXT_CONTRAST) {
    ctx.findings.push({
      ...b, rule: "non-text-contrast", wcag: "1.4.11 Non-text Contrast", level: "AA", severity: "warning",
      message: `El ${via} de "${node.name}" (${toHex(color)}) tiene ${ratio}:1 frente a su entorno (${toHex(surrounding.color)}${surrounding.assumed ? ", asumido" : ""}); se requieren 3:1 para que el componente sea identificable.`,
      details: { contrast: ratio, required: NON_TEXT_CONTRAST, component: toHex(color), surrounding: toHex(surrounding.color), via, heuristic: `nombre coincide con "${matchedBy}"` },
      suggestion: "Añade un borde con 3:1 de contraste o ajusta el relleno. Si el elemento no es interactivo, renómbralo para que la auditoría no lo considere.",
    });
  }
}

/**
 * Detecta imágenes que necesitarán texto alternativo en la implementación (criterio 1.1.1).
 *
 * Un diseño de Figma no puede contener el atributo alt, pero sí puede preparar el
 * terreno: el nombre de la capa es lo primero que ve el desarrollador. La función:
 *   - Ignora los nodos que no tengan un relleno de imagen visible.
 *   - Comprueba con GENERIC_NAME_RE si el nombre es uno de los que Figma asigna por
 *     defecto ("Rectangle 12", "Image", "Frame 3"...). En ese caso emite un aviso, porque
 *     el nombre no dice nada sobre el contenido ni sobre si la imagen es decorativa.
 *   - Si el nombre es descriptivo emite solo una nota informativa recordando que hará
 *     falta un alt (o marcarla como decorativa).
 * La sugerencia en ambos casos es renombrar la capa o anotar el alt propuesto; el skill
 * completa después esta regla proponiendo el texto concreto a partir de la captura.
 *
 * @param node Nodo a comprobar.
 * @param nodePath Ruta de nombres incluyendo el propio nodo.
 * @param ctx Contexto mutable de la auditoría.
 */
function checkImage(node: FigmaNode, nodePath: string[], ctx: Ctx): void {
  if (hasNonSolidVisibleFill(node.fills) !== "image") return;
  const b = base(node, nodePath, ctx);
  const generic = GENERIC_NAME_RE.test(node.name.trim());
  ctx.findings.push({
    ...b, rule: "image-alt", wcag: "1.1.1 Non-text Content", level: "A", severity: generic ? "warning" : "info",
    message: generic
      ? `La imagen "${node.name}" tiene un nombre genérico: no indica su propósito ni qué texto alternativo necesita.`
      : `La imagen "${node.name}" necesitará texto alternativo (o marcarse como decorativa) en la implementación.`,
    suggestion: "Renombra la capa describiendo el contenido o añade una anotación con el alt propuesto.",
  });
}

/**
 * Devuelve la caja absoluta de un nodo o null si Figma no la informa.
 *
 * Algunos nodos (por ejemplo, ciertos grupos vacíos o capas sin geometría) llegan sin
 * `absoluteBoundingBox`. Esta función normaliza el acceso para que el resto del código
 * pueda distinguir "sin caja" de "caja con ceros" con una única comprobación.
 *
 * @param node Nodo de Figma.
 * @returns Caja con x, y, ancho y alto en coordenadas de página, o null.
 */
export function rectOf(node: FigmaNode): FigmaRect | null {
  return node.absoluteBoundingBox ?? null;
}
