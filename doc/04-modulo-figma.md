# 4. Módulo Figma (`src/figma/`)

Este módulo es la **frontera con Figma**: entiende los enlaces, descarga los datos y los deja listos para que el resto del código trabaje sin preocuparse de la API.

| Archivo | Responsabilidad |
|---|---|
| `url.ts` | Extraer `fileKey` y `nodeId` de un enlace, y construir enlaces a nodos |
| `client.ts` | Todas las peticiones HTTP a la REST API de Figma |
| `types.ts` | Tipos TypeScript del subconjunto de la respuesta de Figma que usamos |
| `layout.ts` | Corregir cajas desactualizadas recalculando el auto-layout |

---

## 4.1 `url.ts`: de enlace a identificadores

```ts
parseFigmaUrl("https://www.figma.com/design/EUgEwS34WUfASG4ENlT4Gh/Mahou?node-id=1-141704")
// → { fileKey: "EUgEwS34WUfASG4ENlT4Gh", nodeId: "1:141704", kind: "design" }
```

Detalles importantes:

- Acepta enlaces `/design/`, `/file/` (formato antiguo), `/proto/` y `/board/`.
- **El node-id cambia de formato**: en la URL se escribe `1-141704` (o `1%3A141704` en enlaces antiguos) y en la API `1:141704`. `normalizeNodeId` hace la conversión.
- Si el enlace no lleva `node-id`, `nodeId` queda `undefined`. En ese caso no auditamos el archivo entero (sería lento e inútil), sino que devolvemos la lista de páginas y frames para que el usuario elija uno.
- `figmaNodeLink(fileKey, nodeId)` hace el camino inverso para poner en el informe un enlace que abre la capa. Limitación conocida: solo convierte el **primer** `:` en `-`, así que en los ids largos de instancia (`I1:141707;2034:19270`) el resto queda con `:`. Figma suele resolverlos igualmente, pero conviene revisarlo si algún enlace no abre la capa.

## 4.2 `client.ts`: el único sitio que habla con la red

| Función | Endpoint | Para qué |
|---|---|---|
| `resolveToken()` | — | Busca el token en este orden: argumento → `FIGMA_TOKEN` → `FIGMA_API_KEY`. Si no hay ninguno, lanza un error que explica dónde crearlo. |
| `fetchNodes(fileKey, ids)` | `GET /v1/files/:key/nodes?ids=…` | Descarga el subárbol completo del frame (todos sus nodos con colores, cajas y estilos). Alimenta el motor de reglas. |
| `fetchFileOutline(fileKey)` | `GET /v1/files/:key?depth=2` | Solo páginas y frames de primer nivel. Se usa cuando el enlace no trae node-id. |
| `fetchNodeImage(fileKey, id)` | `GET /v1/images/:key?ids=…&format=png&scale=2` | Render PNG del frame para el informe HTML. Figma no devuelve la imagen, sino una URL temporal, así que la función hace una segunda petición para bajar los bytes. |

Todas usan `figmaGet`, que añade la cabecera `X-Figma-Token` y convierte los errores HTTP en un `FigmaApiError` con una pista en castellano (403, 404 y 429).

**Todo son peticiones `GET`: la aplicación nunca modifica un archivo de Figma.**

## 4.3 `types.ts`: lo que usamos de la respuesta

La respuesta de Figma tiene cientos de campos. Solo tipamos los que usamos:

- Geometría: `absoluteBoundingBox`, `absoluteRenderBounds`.
- Apariencia: `fills`, `strokes`, `opacity`, `visible`.
- Texto: `characters`, `style` (tamaño, peso, familia) y `styleOverrideTable` (fragmentos con otro estilo).
- Auto-layout: `layoutMode`, `itemSpacing`, `padding*`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `layoutSizingHorizontal/Vertical`, `layoutAlign`, `layoutGrow`, `layoutPositioning`, `layoutWrap`.

Si necesitas un campo nuevo, añádelo aquí como opcional (`?`): Figma no siempre los envía.

## 4.4 `layout.ts`: corregir el auto-layout

### El problema

La REST API de Figma **a veces devuelve posiciones desactualizadas** dentro de instancias de componentes cuyo auto-layout se ha reajustado por *overrides* (por ejemplo, al ocultar una capa o cambiar un texto de la instancia). El render de Figma es correcto, pero el JSON no.

Lo descubrimos con el frame de Mahou. La API decía:

```
selección    y = -34   alto = 324    → termina en y = 290
checks       y = 419                  ← ¿? con espaciado 32 debería empezar en 322
```

Los propios datos eran incoherentes: `290 + 32 = 322`, no `419`. El MCP oficial de Figma y la captura confirmaban que `checks` estaba en 322. Con 97 px de error pasaban dos cosas:

1. En el informe HTML, las marcas de los checkboxes caían en el sitio equivocado.
2. El motor calculó que el campo de email solo cubría el 56 % de su texto (el campo figuraba con 200 px de ancho en lugar de 358) y emitió un aviso de contraste **falso**.

### La solución: `normalizeAutoLayout(root)`

Recalcula las cajas a partir de las propiedades de auto-layout, igual que haría Figma. Trabaja sobre una **copia** del árbol (`structuredClone`); el original no se toca. Tiene dos pasadas:

```
Pasada 1 — de abajo arriba (hugPass)
  Cada contenedor "hug" (se ajusta a su contenido) calcula su tamaño
  sumando sus hijos visibles + espaciados + paddings.
  Las capas ocultas y las de posición absoluta NO ocupan sitio.

Pasada 2 — de arriba abajo (placePass)
  En cada contenedor con auto-layout:
   1. stretch/fill en el eje secundario → el hijo ocupa todo el ancho interior
   2. grow/fill en el eje principal     → los hijos reparten el espacio sobrante
   3. coloca a cada hijo en orden: padding + tamaños previos + espaciado,
      respetando la alineación (inicio, centro, final)
   4. al mover un hijo, traslada todo su subárbol
```

Vocabulario de auto-layout, para entender el código:

| Propiedad de Figma | Significado | Equivalente CSS aproximado |
|---|---|---|
| `layoutMode: VERTICAL / HORIZONTAL` | Columna o fila | `flex-direction` |
| `itemSpacing` | Espacio entre hijos | `gap` |
| `paddingTop/Left/…` | Relleno interior | `padding` |
| `primaryAxisAlignItems` | Alineación en el eje principal | `justify-content` |
| `counterAxisAlignItems` | Alineación en el eje secundario | `align-items` |
| `layoutSizing…: HUG` | Se ajusta al contenido | `width: fit-content` |
| `layoutSizing…: FILL` / `layoutAlign: STRETCH` | Ocupa el espacio del padre | `align-self: stretch` / `flex: 1` |
| `layoutGrow: 1` | Crece para llenar el hueco | `flex-grow: 1` |
| `layoutPositioning: ABSOLUTE` | Fuera del flujo | `position: absolute` |

Límites (a propósito, para no inventar): no se tocan contenedores con `WRAP`, `GRID` o `SPACE_BETWEEN` (se conservan las cajas de la API), ni se recalcula el alto de un texto cuyo ancho cambia (necesitaríamos las métricas de la fuente).

Resultado en el caso real: se corrigieron **63 de 344 nodos**, todos dentro de la instancia desactualizada. El resto quedó intacto.

**Regla del proyecto:** cualquier código nuevo que dependa de posiciones debe usar el árbol normalizado. `auditFromUrl` y `buildHtmlReport` ya lo hacen.

Siguiente: [Color y contraste](05-color-y-contraste.md).
