/** Utilidades de color según WCAG 2.x (luminancia relativa y ratio de contraste). */

export interface RGB {
  r: number; // 0..1
  g: number;
  b: number;
}

export interface RGBA extends RGB {
  a: number; // 0..1
}

/**
 * Convierte un canal sRGB (0..1, con la curva gamma aplicada) a su valor lineal.
 *
 * Los colores de pantalla se almacenan con una curva gamma que no es proporcional a la
 * cantidad de luz emitida. Para medir contraste hay que deshacer esa curva. Es la fórmula
 * exacta que define WCAG 2.x: por debajo de 0.04045 la relación es lineal (dividir entre
 * 12.92) y por encima se aplica la potencia 2.4 sobre (c + 0.055) / 1.055.
 *
 * @param c Valor del canal entre 0 y 1.
 * @returns Valor lineal del canal entre 0 y 1.
 */
function channelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Calcula la luminancia relativa de un color según WCAG 2.x.
 *
 * La luminancia relativa es el brillo percibido de un color en una escala donde el negro
 * vale 0 y el blanco vale 1. Se obtiene linealizando cada canal con channelToLinear y
 * ponderando por la sensibilidad del ojo humano a cada primario: el verde pesa mucho
 * más (0.7152) que el rojo (0.2126) y el azul (0.0722). Es el paso previo obligatorio
 * para calcular cualquier ratio de contraste.
 *
 * @param color Color opaco con canales r, g, b entre 0 y 1 (formato que devuelve Figma).
 * @returns Luminancia relativa entre 0 y 1.
 */
export function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/**
 * Calcula el ratio de contraste WCAG entre dos colores opacos.
 *
 * Fórmula: (L1 + 0.05) / (L2 + 0.05), donde L1 es la luminancia del color más claro y
 * L2 la del más oscuro. El 0.05 modela la luz ambiental reflejada en la pantalla y evita
 * divisiones por cero con el negro puro. El resultado va de 1:1 (colores idénticos) a
 * 21:1 (blanco sobre negro). La función ordena las luminancias internamente, así que el
 * orden de los argumentos no importa.
 *
 * Ambos colores deben ser opacos: si el primer plano tiene transparencia, hay que
 * componerlo antes sobre el fondo con compositeOver.
 *
 * @param a Primer color.
 * @param b Segundo color.
 * @returns Ratio de contraste como número (por ejemplo 4.54 para 4.54:1).
 */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Compone un color con transparencia sobre un fondo opaco (operador "source over").
 *
 * Es lo que hace la pantalla cuando pinta una capa semitransparente: cada canal del
 * resultado es una mezcla ponderada por el alfa, `top * a + under * (1 - a)`. Con alfa 1
 * el resultado es exactamente `top`; con alfa 0 es exactamente `under`.
 *
 * Se usa en dos sitios: para reconstruir el fondo real bajo un texto apilando las capas
 * que Figma pinta debajo, y para obtener el color efectivo de un texto o borde que tenga
 * opacidad reducida, ya que WCAG exige medir contraste sobre los colores finales que ve
 * el usuario y no sobre los valores nominales de la capa.
 *
 * @param top Color superior con alfa (el alfa se recorta al rango 0..1).
 * @param under Color de fondo opaco.
 * @returns Color opaco resultante de la mezcla.
 */
export function compositeOver(top: RGBA, under: RGB): RGB {
  const a = clamp01(top.a);
  return {
    r: top.r * a + under.r * (1 - a),
    g: top.g * a + under.g * (1 - a),
    b: top.b * a + under.b * (1 - a),
  };
}

/**
 * Recorta un número al intervalo cerrado [0, 1].
 *
 * Los valores de color y de opacidad que llegan de Figma deberían estar ya en ese rango,
 * pero al multiplicar opacidades acumuladas o al componer capas pueden aparecer errores
 * de redondeo (por ejemplo 1.0000001). Esta función garantiza que nunca se generen
 * componentes fuera de rango, que darían hexadecimales inválidos o luminancias absurdas.
 *
 * @param n Valor a recortar.
 * @returns 0 si n es negativo, 1 si supera 1, n en cualquier otro caso.
 */
export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Convierte un color opaco con canales 0..1 a notación hexadecimal "#RRGGBB" en mayúsculas.
 *
 * Cada canal se recorta al rango válido, se escala a 0..255, se redondea al entero más
 * cercano y se formatea con dos dígitos hexadecimales (rellenando con cero a la
 * izquierda). Se usa en los informes para mostrar colores en el formato que designers y
 * desarrolladores reconocen de inmediato.
 *
 * @param color Color con r, g, b entre 0 y 1.
 * @returns Cadena hexadecimal, por ejemplo "#1F2937".
 */
export function toHex({ r, g, b }: RGB): string {
  const h = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/**
 * Interpreta una cadena hexadecimal de color y la convierte a canales 0..1 con alfa.
 *
 * Formatos admitidos (con o sin almohadilla inicial, sin distinguir mayúsculas):
 *   - "#RGB"      → se expande duplicando cada dígito ("#FFF" es "#FFFFFF").
 *   - "#RGBA"     → igual, con alfa de un dígito.
 *   - "#RRGGBB"   → alfa implícito 1.
 *   - "#RRGGBBAA" → los dos últimos dígitos son el alfa.
 *
 * Si la cadena no encaja en ninguno de esos formatos se lanza un Error con el texto
 * recibido, para que la herramienta check_contrast pueda devolver un mensaje claro.
 *
 * @param input Color en hexadecimal.
 * @returns Objeto con r, g, b y a entre 0 y 1.
 * @throws Error si el formato no es válido.
 */
export function parseHex(input: string): RGBA {
  let hex = input.trim().replace(/^#/, "");
  if (hex.length === 3 || hex.length === 4) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) {
    throw new Error(`Color hexadecimal inválido: "${input}". Usa #RRGGBB o #RRGGBBAA.`);
  }
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) : 1 };
}

export const WHITE: RGB = { r: 1, g: 1, b: 1 };

/**
 * Decide si un texto cuenta como "texto grande" según la definición de WCAG.
 *
 * WCAG relaja el umbral de contraste para el texto grande porque es más legible a igual
 * contraste. La definición oficial está en puntos tipográficos: 18 pt, o 14 pt si el
 * texto está en negrita. Figma expresa los tamaños en píxeles CSS, y la equivalencia
 * habitual es 1 pt = 1.333 px, de donde salen los umbrales 24 px y 18.66 px. Se considera
 * negrita un peso de fuente de 700 o superior, que es el criterio que aplican las
 * herramientas de referencia.
 *
 * @param fontSizePx Tamaño de fuente en píxeles.
 * @param fontWeight Peso de fuente numérico (400 normal, 700 negrita...).
 * @returns true si el texto es grande y puede usar el umbral reducido.
 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

export type WcagLevel = "AA" | "AAA";

/**
 * Devuelve el ratio de contraste mínimo que exige WCAG para un texto.
 *
 * Tabla de umbrales:
 *   - Nivel AA  (criterio 1.4.3): 4.5:1 para texto normal, 3:1 para texto grande.
 *   - Nivel AAA (criterio 1.4.6): 7:1 para texto normal, 4.5:1 para texto grande.
 *
 * Centralizar estos valores evita que cada regla los repita y facilita añadir en el
 * futuro otros niveles o un modo APCA.
 *
 * @param level Nivel objetivo de la auditoría ("AA" o "AAA").
 * @param large Resultado de isLargeText para ese texto.
 * @returns Ratio mínimo exigido.
 */
export function requiredTextContrast(level: WcagLevel, large: boolean): number {
  if (level === "AAA") return large ? 4.5 : 7;
  return large ? 3 : 4.5;
}

export const NON_TEXT_CONTRAST = 3;

/**
 * Redondea un número a dos decimales.
 *
 * Los ratios de contraste y las medidas en píxeles se muestran con dos decimales en los
 * informes; mostrar la precisión completa de coma flotante (4.479999999) confunde y no
 * aporta nada. Se redondea multiplicando por 100, aplicando Math.round y dividiendo de
 * nuevo. Importante: el redondeo se aplica ANTES de comparar con el umbral, de modo que
 * un 4.48 medido se reporta y se evalúa como 4.48 y no cumple 4.5, sin sorpresas entre
 * lo que se muestra y lo que se decide.
 *
 * @param n Número a redondear.
 * @returns Número con como máximo dos decimales.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
