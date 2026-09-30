import type { FigmaNode, FigmaPaint, FigmaRect } from "../figma/types.js";
import { compositeOver, WHITE, type RGB, type RGBA } from "../color/contrast.js";

/**
 * Figma pinta en preorden: primero los fills del nodo, luego sus hijos en orden de array
 * (el primer hijo queda debajo). Recorremos en ese orden y acumulamos "capas pintadas"
 * para poder reconstruir el fondo bajo cualquier nodo posterior.
 */

export type LayerKind = "solid" | "gradient" | "image" | "shape";

export interface PaintedLayer {
  nodeId: string;
  name: string;
  rect: FigmaRect;
  kind: LayerKind;
  /** Color con alfa efectiva (solo para kind = solid). */
  color?: RGBA;
  /** true si la capa cubre por completo su caja (rectángulos y frames). */
  fillsBox: boolean;
}

export interface ResolvedBackground {
  color: RGB;
  /** Colores hex de las capas sólidas que contribuyen, de abajo arriba. */
  stack: string[];
  /** No se encontró ninguna capa opaca: se asume lienzo blanco. */
  assumed: boolean;
  /** Hay gradientes, imágenes o formas parciales que hacen incierto el resultado. */
  uncertain: boolean;
  reasons: string[];
}

const BOX_TYPES = new Set(["RECTANGLE", "FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "SECTION"]);
const SHAPE_TYPES = new Set(["ELLIPSE", "VECTOR", "STAR", "POLYGON", "BOOLEAN_OPERATION", "LINE", "REGULAR_POLYGON"]);

/**
 * Extrae los rellenos sólidos visibles de un nodo y calcula su alfa efectiva.
 *
 * Un nodo de Figma puede tener varios rellenos apilados (el primero del array queda
 * debajo). Esta función descarta los que no aportan color medible: rellenos ocultos
 * (`visible: false`), degradados, imágenes y vídeos. Para cada relleno SOLID que queda
 * devuelve su color con un alfa que combina tres factores multiplicativos:
 *   - el alfa del propio color (`color.a`),
 *   - la opacidad del relleno (`paint.opacity`, 1 si no está definida),
 *   - la opacidad acumulada del nodo y de todos sus ancestros (`cumulativeOpacity`),
 *     porque en Figma la opacidad de un grupo afecta a todo lo que contiene.
 *
 * El orden del array se conserva para poder componer los rellenos de abajo arriba.
 *
 * @param paints Array `fills` o `strokes` del nodo (puede ser undefined).
 * @param cumulativeOpacity Producto de las opacidades del nodo y sus ancestros.
 * @returns Lista de colores RGBA en orden de pintado; vacía si no hay sólidos visibles.
 */
export function effectiveSolidFills(paints: FigmaPaint[] | undefined, cumulativeOpacity: number): RGBA[] {
  if (!paints) return [];
  const out: RGBA[] = [];
  for (const p of paints) {
    if (p.visible === false || p.type !== "SOLID" || !p.color) continue;
    out.push({ r: p.color.r, g: p.color.g, b: p.color.b, a: p.color.a * (p.opacity ?? 1) * cumulativeOpacity });
  }
  return out;
}

/**
 * Indica si entre los rellenos visibles de un nodo hay alguno que no sea un color plano.
 *
 * Recorre los rellenos ignorando los ocultos y devuelve la primera categoría "no medible"
 * que encuentra: "image" para imágenes y vídeos, "gradient" para cualquier tipo de
 * degradado (lineal, radial, angular o diamante, todos empiezan por "GRADIENT"). Si solo
 * hay rellenos sólidos, o ninguno, devuelve null.
 *
 * Sirve para dos cosas: marcar como incierto el fondo de los textos que se apoyan sobre
 * estas capas (no se puede reducir una imagen a un único color de contraste) y detectar
 * imágenes que necesitarán texto alternativo.
 *
 * @param paints Array `fills` del nodo.
 * @returns "image", "gradient" o null.
 */
export function hasNonSolidVisibleFill(paints: FigmaPaint[] | undefined): LayerKind | null {
  if (!paints) return null;
  for (const p of paints) {
    if (p.visible === false) continue;
    if (p.type === "IMAGE" || p.type === "VIDEO") return "image";
    if (p.type.startsWith("GRADIENT")) return "gradient";
  }
  return null;
}

/**
 * Traduce los rellenos de un nodo a "capas pintadas" que el resolvedor de fondos puede apilar.
 *
 * No incluye a los hijos del nodo: el recorrido del árbol se encarga de llamar a esta
 * función para cada nodo en orden de pintado. Reglas de clasificación:
 *   - Los nodos sin caja (`absoluteBoundingBox`) y los TEXT no generan capas: un texto no
 *     cubre su caja de forma sólida, así que no puede ser fondo de nada.
 *   - Los tipos rectangulares (RECTANGLE, FRAME, COMPONENT, COMPONENT_SET, INSTANCE,
 *     SECTION) cubren toda su caja: sus sólidos se marcan como kind "solid" y fillsBox true.
 *   - Las formas no rectangulares (ELLIPSE, VECTOR, STAR, POLYGON, BOOLEAN_OPERATION,
 *     LINE) solo cubren parte de su caja: sus sólidos se marcan como kind "shape", lo que
 *     el resolvedor interpreta como "hay algo aquí, pero no sé qué píxeles tapa".
 *   - Cualquier otro tipo (GROUP, SLICE...) no pinta nada por sí mismo.
 *   - Si el nodo tiene una imagen o degradado visible se añade primero una capa de ese
 *     tipo, y después las capas sólidas, respetando el orden en que Figma las pinta.
 *   - Los sólidos con alfa efectiva 0 se descartan porque no cambian ningún píxel.
 *
 * @param node Nodo de Figma.
 * @param cumulativeOpacity Producto de opacidades del nodo y sus ancestros.
 * @returns Capas pintadas por este nodo, de abajo arriba (posiblemente vacío).
 */
export function layersForNode(node: FigmaNode, cumulativeOpacity: number): PaintedLayer[] {
  const rect = node.absoluteBoundingBox;
  if (!rect || node.type === "TEXT") return [];
  const fillsBox = BOX_TYPES.has(node.type);
  const isShape = SHAPE_TYPES.has(node.type);
  if (!fillsBox && !isShape) return [];

  const layers: PaintedLayer[] = [];
  const nonSolid = hasNonSolidVisibleFill(node.fills);
  if (nonSolid) {
    layers.push({ nodeId: node.id, name: node.name, rect, kind: nonSolid, fillsBox });
  }
  for (const color of effectiveSolidFills(node.fills, cumulativeOpacity)) {
    if (color.a <= 0) continue;
    layers.push({ nodeId: node.id, name: node.name, rect, kind: fillsBox ? "solid" : "shape", color, fillsBox });
  }
  return layers;
}

/**
 * Calcula qué fracción del área de `target` queda cubierta por `layer`.
 *
 * Se obtiene el rectángulo intersección (máximo de los bordes izquierdo/superior, mínimo
 * de los derecho/inferior); si el ancho o el alto resultante no son positivos, los
 * rectángulos no se tocan y el resultado es 0. En caso contrario se divide el área de la
 * intersección entre el área de `target`. También devuelve 0 si `target` no tiene área
 * (ancho o alto cero), para evitar divisiones por cero.
 *
 * Las coordenadas son las absolutas que Figma devuelve en `absoluteBoundingBox`, todas
 * en el mismo sistema de referencia de la página, por lo que se pueden comparar
 * directamente entre nodos de distinta profundidad.
 *
 * @param target Caja del elemento cuyo fondo se busca (normalmente un texto).
 * @param layer Caja de una capa pintada.
 * @returns Valor entre 0 (sin solape) y 1 (la capa cubre por completo al target).
 */
export function intersectionRatio(target: FigmaRect, layer: FigmaRect): number {
  const x1 = Math.max(target.x, layer.x);
  const y1 = Math.max(target.y, layer.y);
  const x2 = Math.min(target.x + target.width, layer.x + layer.width);
  const y2 = Math.min(target.y + target.height, layer.y + layer.height);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return 0;
  const area = target.width * target.height;
  if (area <= 0) return 0;
  return (w * h) / area;
}

const COVER_THRESHOLD = 0.98;
const PARTIAL_THRESHOLD = 0.05;

/**
 * Reconstruye el color de fondo que hay debajo de un elemento apilando las capas pintadas antes que él.
 *
 * La REST API de Figma no dice qué hay detrás de una capa; solo da el árbol. Esta función
 * lo deduce simulando el pintado: parte de un lienzo blanco y recorre `painted` (las capas
 * ya dibujadas, en orden) aplicando una de estas decisiones a cada una:
 *   - Si cubre menos del 5 % del target (PARTIAL_THRESHOLD) se ignora: no está debajo.
 *   - Si es una imagen o un degradado se marca el resultado como incierto y se anota la
 *     razón, porque no se puede resumir en un solo color.
 *   - Si es una forma no rectangular (kind "shape") o cubre menos del 98 % del target
 *     (COVER_THRESHOLD) también se marca incierto: parte del texto estaría sobre otra cosa.
 *   - Si es un sólido que cubre el target por completo se compone sobre el color
 *     acumulado con compositeOver y se apunta el hex resultante en `stack`. Si además su
 *     alfa es prácticamente 1 se recuerda que hemos encontrado una capa opaca.
 *
 * Al terminar, `assumed` es true si ninguna capa opaca cubría el target (el blanco inicial
 * es una suposición, no un dato) y `uncertain` es true si intervino alguna capa no
 * medible. Los avisos del informe se apoyan en estas dos banderas para no presentar como
 * exacto un contraste que no lo es.
 *
 * `excludeNodeId` permite omitir las capas de un nodo concreto: se usa al evaluar el
 * contraste no textual de un componente, donde interesa el entorno que lo rodea y no su
 * propio relleno.
 *
 * @param target Caja del elemento a evaluar.
 * @param painted Capas pintadas hasta el momento, en orden de pintado.
 * @param excludeNodeId Id de un nodo cuyas capas deben ignorarse.
 * @returns Color de fondo compuesto, pila de colores, banderas y razones de incertidumbre.
 */
export function resolveBackground(target: FigmaRect, painted: PaintedLayer[], excludeNodeId?: string): ResolvedBackground {
  let color: RGB = WHITE;
  let foundOpaque = false;
  let uncertain = false;
  const stack: string[] = [];
  const reasons: string[] = [];

  for (const layer of painted) {
    if (excludeNodeId && layer.nodeId === excludeNodeId) continue;
    const ratio = intersectionRatio(target, layer.rect);
    if (ratio < PARTIAL_THRESHOLD) continue;

    if (layer.kind === "gradient" || layer.kind === "image") {
      uncertain = true;
      reasons.push(`"${layer.name}" tiene un relleno de ${layer.kind === "image" ? "imagen" : "degradado"} bajo el elemento`);
      continue;
    }
    if (!layer.color) continue;

    if (layer.kind === "shape" || ratio < COVER_THRESHOLD) {
      uncertain = true;
      reasons.push(`"${layer.name}" cubre parcialmente el elemento (${Math.round(ratio * 100)}%)`);
      continue;
    }

    color = compositeOver(layer.color, color);
    stack.push(hexOf(color));
    if (layer.color.a >= 0.999) foundOpaque = true;
  }

  return { color, stack, assumed: !foundOpaque, uncertain, reasons };
}

/**
 * Versión local de toHex para anotar la pila de colores sin crear una dependencia circular.
 *
 * Hace exactamente lo mismo que toHex en el módulo de color (recorta cada canal a 0..1,
 * escala a 0..255, redondea y formatea con dos dígitos en mayúsculas). Se mantiene aquí
 * porque la pila `stack` solo es informativa y no merecía importar más símbolos.
 *
 * @param c Color opaco con canales 0..1.
 * @returns Cadena "#RRGGBB".
 */
function hexOf(c: RGB): string {
  const h = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase();
}
