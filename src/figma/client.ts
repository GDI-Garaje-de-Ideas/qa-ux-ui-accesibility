import type { FigmaFileResponse, FigmaNode, FigmaNodesResponse } from "./types.js";

const API = "https://api.figma.com/v1";

/**
 * Error específico de la comunicación con Figma.
 *
 * Extiende Error para conservar el mensaje y la traza, y añade el código HTTP (`status`)
 * cuando el fallo viene de una respuesta del servidor. Cuando el error es previo a la
 * petición (por ejemplo, falta el token) `status` queda undefined. Tener una clase propia
 * permite al servidor MCP y a la CLI reconocer estos errores y mostrarlos como texto al
 * usuario en lugar de tratarlos como fallos internos.
 */
export class FigmaApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "FigmaApiError";
  }
}

/**
 * Obtiene el token personal de Figma con el que se firmarán las peticiones.
 *
 * Orden de prioridad:
 *   1. El token pasado explícitamente como argumento (útil en tests o en la CLI).
 *   2. La variable de entorno FIGMA_TOKEN, que es la que rellena `.mcp.json`.
 *   3. La variable FIGMA_API_KEY, aceptada por compatibilidad con otros servidores MCP
 *      de Figma que usan ese nombre.
 *
 * Si no se encuentra ninguno lanza un FigmaApiError con instrucciones de dónde crear el
 * token, de modo que el error que ve el usuario sea accionable y no un 403 genérico.
 *
 * @param explicit Token opcional pasado por el llamador.
 * @returns Token listo para usar en la cabecera X-Figma-Token.
 * @throws FigmaApiError si no hay ningún token disponible.
 */
export function resolveToken(explicit?: string): string {
  const token = explicit ?? process.env.FIGMA_TOKEN ?? process.env.FIGMA_API_KEY;
  if (!token) {
    throw new FigmaApiError(
      "Falta el token de Figma. Define FIGMA_TOKEN (Figma > Settings > Security > Personal access tokens, con permiso de lectura de archivos)."
    );
  }
  return token;
}

/**
 * Realiza una petición GET autenticada a la REST API de Figma y devuelve el JSON tipado.
 *
 * Es la única función del proyecto que habla con la red, así que concentra toda la
 * gestión de errores HTTP. Cuando la respuesta no es 2xx:
 *   - Lee el cuerpo como texto (sin fallar si está vacío) para incluir sus primeros
 *     200 caracteres en el mensaje.
 *   - Añade una pista en castellano según el código: 403 (token inválido o sin acceso
 *     al archivo), 404 (archivo o nodo inexistente) y 429 (límite de peticiones).
 *   - Lanza un FigmaApiError con el estado HTTP para que el llamador pueda distinguir
 *     los casos si lo necesita.
 *
 * Usa el `fetch` nativo de Node (20 o superior), por lo que no requiere dependencias.
 *
 * @typeParam T Forma esperada del JSON de respuesta.
 * @param path Ruta relativa a https://api.figma.com/v1 (por ejemplo "/files/<key>/nodes?ids=1:2").
 * @param token Token personal de Figma.
 * @returns El cuerpo de la respuesta ya parseado como T.
 * @throws FigmaApiError en cualquier respuesta no exitosa.
 */
async function figmaGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { "X-Figma-Token": token } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const hint =
      res.status === 403
        ? "Token inválido o sin permiso sobre el archivo."
        : res.status === 404
          ? "Archivo o nodo no encontrado. Comprueba la clave del archivo y el node-id."
          : res.status === 429
            ? "Límite de peticiones de la API de Figma alcanzado. Espera un momento y reintenta."
            : "";
    throw new FigmaApiError(`Figma API ${res.status} en ${path}. ${hint} ${body.slice(0, 200)}`.trim(), res.status);
  }
  return (await res.json()) as T;
}

/**
 * Descarga el subárbol completo de uno o varios nodos de un archivo de Figma.
 *
 * Llama al endpoint GET /v1/files/:key/nodes?ids=a,b,c, que devuelve, para cada id
 * solicitado, el nodo con todos sus descendientes (fills, textos, cajas, hijos...). Es
 * el endpoint que alimenta el motor de reglas, porque a diferencia del MCP oficial de
 * Figma entrega las propiedades de estilo en JSON crudo.
 *
 * Detalles:
 *   - Cada id se codifica con encodeURIComponent porque contiene dos puntos.
 *   - La respuesta es un mapa `nodes` indexado por id; si algún id pedido no aparece
 *     (o viene como null) se lanza un FigmaApiError 404 con el id concreto.
 *   - Se devuelve el nombre del archivo, que el informe usa como título.
 *
 * @param fileKey Clave del archivo.
 * @param nodeIds Ids en formato API ("12:34"), normalmente uno solo.
 * @param token Token personal de Figma.
 * @returns Nombre del archivo y lista de nodos raíz en el mismo orden que nodeIds.
 * @throws FigmaApiError si la petición falla o falta algún nodo.
 */
export async function fetchNodes(fileKey: string, nodeIds: string[], token: string): Promise<{ fileName: string; nodes: FigmaNode[] }> {
  const ids = nodeIds.map((id) => encodeURIComponent(id)).join(",");
  const data = await figmaGet<FigmaNodesResponse>(`/files/${fileKey}/nodes?ids=${ids}`, token);
  const nodes: FigmaNode[] = [];
  for (const id of nodeIds) {
    const entry = data.nodes[id];
    if (!entry) throw new FigmaApiError(`El nodo ${id} no existe en el archivo ${fileKey}.`, 404);
    nodes.push(entry.document);
  }
  return { fileName: data.name, nodes };
}

/**
 * Descarga el render PNG de un nodo para ilustrar el informe HTML.
 *
 * Usa GET /v1/images/:key?ids=<id>&format=png&scale=<n>, que no devuelve la imagen sino
 * una URL temporal de descarga; esta función hace la segunda petición y devuelve los
 * bytes. Figma responde `images[id] = null` cuando no puede renderizar el nodo (por
 * ejemplo, si es invisible), y en ese caso se lanza un FigmaApiError explícito.
 *
 * @param fileKey Clave del archivo.
 * @param nodeId Id en formato API ("12:34").
 * @param token Token personal de Figma.
 * @param scale Escala del render (1 a 4). 2 da nitidez suficiente en pantallas retina.
 * @returns Bytes del PNG.
 * @throws FigmaApiError si la API falla o no puede renderizar el nodo.
 */
export async function fetchNodeImage(fileKey: string, nodeId: string, token: string, scale = 2): Promise<Buffer> {
  const data = await figmaGet<{ err: string | null; images: Record<string, string | null> }>(
    `/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${scale}`,
    token
  );
  const url = data.images[nodeId];
  if (!url) throw new FigmaApiError(`Figma no ha podido renderizar el nodo ${nodeId}${data.err ? `: ${data.err}` : "."}`);
  const res = await fetch(url);
  if (!res.ok) throw new FigmaApiError(`No se pudo descargar el render del nodo ${nodeId} (HTTP ${res.status}).`, res.status);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Obtiene un índice ligero del archivo: sus páginas y los frames de primer nivel de cada una.
 *
 * Se usa cuando el enlace recibido no incluye node-id. Auditar un archivo entero sería
 * lento y poco útil (podría tener decenas de pantallas), así que en su lugar se devuelve
 * este esquema para que el usuario o el modelo elijan un frame concreto y repitan la
 * llamada con su id.
 *
 * Usa GET /v1/files/:key?depth=2, donde depth=2 limita la respuesta a dos niveles
 * (documento > páginas > frames) y evita descargar el árbol completo. El documento raíz
 * de Figma tiene como hijos las páginas (tipo CANVAS) y cada página tiene como hijos los
 * frames, secciones y capas sueltas de primer nivel.
 *
 * @param fileKey Clave del archivo.
 * @param token Token personal de Figma.
 * @returns Nombre del archivo y, por cada página, su id, nombre y lista de frames.
 * @throws FigmaApiError si la petición falla.
 */
export async function fetchFileOutline(fileKey: string, token: string): Promise<{ fileName: string; pages: { id: string; name: string; frames: { id: string; name: string }[] }[] }> {
  const data = await figmaGet<FigmaFileResponse>(`/files/${fileKey}?depth=2`, token);
  const pages = (data.document.children ?? []).map((page) => ({
    id: page.id,
    name: page.name,
    frames: (page.children ?? []).map((f) => ({ id: f.id, name: f.name })),
  }));
  return { fileName: data.name, pages };
}
