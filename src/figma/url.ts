export interface ParsedFigmaUrl {
  fileKey: string;
  /** Id de nodo en formato API ("12:34"). Undefined si el enlace apunta al archivo completo. */
  nodeId?: string;
  kind: "design" | "file" | "proto" | "board" | "unknown";
}

const PATH_RE = /figma\.com\/(design|file|proto|board)\/([A-Za-z0-9]+)(?:\/|$|\?)/;

/**
 * Convierte un enlace de Figma en sus dos datos útiles para la REST API: la clave del
 * archivo y, si existe, el identificador del nodo seleccionado.
 *
 * Acepta los formatos de enlace que genera Figma con "Copy link to selection" y también
 * los enlaces antiguos:
 *   - https://www.figma.com/design/<fileKey>/<nombre>?node-id=12-34   (formato actual)
 *   - https://www.figma.com/file/<fileKey>/<nombre>?node-id=12%3A34    (formato antiguo)
 *   - https://www.figma.com/proto/<fileKey>/... y /board/<fileKey>/...  (prototipos y FigJam)
 *
 * Pasos:
 *   1. Recorta espacios y aplica la expresión regular PATH_RE, que captura el tipo de
 *      enlace (design, file, proto, board) y la clave alfanumérica del archivo.
 *   2. Si no hay coincidencia lanza un Error con el formato esperado, para que el
 *      mensaje llegue tal cual al usuario o al modelo que llamó a la herramienta.
 *   3. Intenta construir un objeto URL para leer el parámetro de consulta `node-id`.
 *      Si el enlace no es una URL válida (sin esquema, por ejemplo) se ignora el fallo
 *      y se devuelve solo la clave del archivo.
 *   4. Normaliza el node-id al formato que espera la API ("12:34") con normalizeNodeId.
 *
 * @param input Enlace tal y como lo pega el usuario.
 * @returns Objeto con fileKey, nodeId (undefined si el enlace apunta al archivo entero)
 *          y kind (tipo de enlace).
 * @throws Error si el texto no parece un enlace de Figma.
 */
export function parseFigmaUrl(input: string): ParsedFigmaUrl {
  const trimmed = input.trim();
  const m = PATH_RE.exec(trimmed);
  if (!m) {
    throw new Error(
      `No reconozco "${input}" como un enlace de Figma. Formato esperado: https://www.figma.com/design/<fileKey>/<nombre>?node-id=12-34`
    );
  }
  const kind = m[1] as ParsedFigmaUrl["kind"];
  const fileKey = m[2];
  let nodeId: string | undefined;
  try {
    const url = new URL(trimmed);
    const raw = url.searchParams.get("node-id");
    if (raw) nodeId = normalizeNodeId(raw);
  } catch {
    // Enlace sin esquema o mal formado; nos quedamos solo con la clave.
  }
  return { fileKey, nodeId, kind };
}

/**
 * Normaliza un identificador de nodo al formato interno de la API de Figma.
 *
 * En la interfaz web el node-id aparece con guion ("12-34") y en enlaces antiguos con
 * los dos puntos codificados en URL ("12%3A34"). La REST API, en cambio, siempre usa
 * dos puntos ("12:34"), tanto en el parámetro `ids` como en las claves de la respuesta.
 * La función primero decodifica la URL (convierte %3A en ":") y después sustituye todos
 * los guiones por dos puntos. Si el valor ya viene en formato API se devuelve sin cambios.
 *
 * @param raw Valor del parámetro node-id tal y como aparece en el enlace.
 * @returns Identificador con el formato "<número>:<número>".
 */
export function normalizeNodeId(raw: string): string {
  return decodeURIComponent(raw).replace(/-/g, ":");
}

/**
 * Construye un enlace directo a un nodo concreto de un archivo de Figma.
 *
 * Se usa en cada finding del informe para que quien lo lea pueda abrir la capa afectada
 * con un clic. Hace la conversión inversa a normalizeNodeId: la API devuelve "12:34" y
 * la web espera "12-34" en el parámetro node-id. El nombre del archivo se omite porque
 * Figma lo ignora al resolver el enlace; solo importan la clave y el node-id.
 *
 * @param fileKey Clave del archivo (segmento alfanumérico del enlace).
 * @param nodeId Identificador del nodo en formato API ("12:34").
 * @returns URL absoluta al nodo en el editor de Figma.
 */
export function figmaNodeLink(fileKey: string, nodeId: string): string {
  return `https://www.figma.com/design/${fileKey}/?node-id=${nodeId.replace(":", "-")}`;
}
