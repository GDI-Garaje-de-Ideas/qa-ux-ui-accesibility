# 6. Motor de reglas (`src/rules/`)

El motor recibe el árbol de un frame (ya normalizado) y devuelve un `AuditResult`: hallazgos (*findings*), un inventario de textos y otro de elementos interactivos. Es una **función pura**: no toca la red, y por eso se prueba con árboles inventados en `engine.test.ts`.

| Archivo | Qué contiene |
|---|---|
| `engine.ts` | `auditTree`, el recorrido del árbol y cada regla. También el catálogo `RULES`. |
| `background.ts` | La deducción del color de fondo bajo cualquier elemento. |
| `types.ts` | `Finding`, `TextLayerInfo`, `InteractiveInfo`, `AuditResult`. |

---

## 6.1 La idea clave: recorrer en orden de pintado

Para saber el contraste de un texto necesitamos saber **qué hay debajo**. La API de Figma no lo dice: solo da el árbol. Pero sabemos **en qué orden pinta Figma**:

1. Primero los rellenos del nodo.
2. Después sus hijos, empezando por el **primero del array** (que queda más al fondo).

Si recorremos el árbol en ese orden y vamos apuntando cada capa pintada, cuando lleguemos a un texto **todo lo que tiene debajo ya estará apuntado**. Eso hace `walk()`:

```
walk(nodo):
  si está oculto → se ignora con todo su subárbol
  opacidad acumulada = opacidad del padre × opacidad propia
  ┌ reglas del nodo (ANTES de apuntar sus propias capas)
  │   ¿el nombre parece interactivo?  → checkInteractive
  │   ¿es un TEXT?                    → checkText
  │   ¿tiene un relleno de imagen?    → checkImage
  └
  apuntar las capas que pinta este nodo (layersForNode)
  walk(cada hijo, en orden)
```

¿Por qué evaluar **antes** de apuntar las capas propias? Porque cuando un botón mide su contraste con el entorno, su propio relleno todavía no debe contar como "fondo".

## 6.2 Deducir el fondo: `background.ts`

### Qué capas se apuntan (`layersForNode`)

| Tipo de nodo | Capa que genera |
|---|---|
| `RECTANGLE`, `FRAME`, `INSTANCE`, `COMPONENT`, `SECTION` | `solid`: cubre toda su caja |
| `ELLIPSE`, `VECTOR`, `STAR`, `POLYGON`, `LINE`… | `shape`: cubre *parte* de su caja; no sabemos qué píxeles |
| Relleno de imagen o degradado | `image` / `gradient`: no se puede resumir en un color |
| `TEXT`, `GROUP` | Nada: un texto no es fondo de nada y un grupo no pinta por sí mismo |

### Cómo se compone el fondo (`resolveBackground`)

Se parte de **blanco** y se recorren las capas apuntadas. Para cada una se calcula qué porcentaje del texto cubre (`intersectionRatio`):

```
cubre < 5 %                       → se ignora (no está debajo)
es imagen o degradado             → INCIERTO (no hay un único color)
es una forma, o cubre < 98 %      → INCIERTO (parte del texto está sobre otra cosa)
es un sólido que cubre ≥ 98 %     → se mezcla con compositeOver sobre el color acumulado
```

El resultado lleva dos banderas que el informe respeta al pie de la letra:

- `uncertain`: intervino algo no medible. **No se da ningún ratio**; se emite `background-uncertain` para comprobación manual.
- `assumed`: ninguna capa opaca cubría el texto, así que el blanco inicial es una suposición. Se añade una nota al informe.

> Este es el principio "no inventar números" en código. Ante la duda, el motor lo dice.

## 6.3 Las reglas

El catálogo está en la constante `RULES` y el servidor lo expone con `list_a11y_rules`.

### `text-contrast` (1.4.3 / 1.4.6): `checkText`

1. Se ignoran los textos vacíos.
2. `textStyle` elige el tamaño y el peso **más pequeños** entre el estilo base y los fragmentos con otro estilo (`styleOverrideTable`). Es el caso más desfavorable. Si hay mezcla, `mixed = true`.
3. Se decide si es texto grande y el umbral exigido.
4. Se resuelve el fondo y el color efectivo del texto (componiendo su alfa).
5. Siempre se añade al inventario `textLayers`, falle o no.
6. Si el ratio no llega al umbral: **error**, con una sugerencia orientada ("oscurece el texto o aclara el fondo").
7. Si cumple pero había estilos mixtos: **nota**, porque un fragmento de otro color podría no cumplir. Ejemplo real: "Acepto la Política de privacidad…" tiene enlaces en rojo; la herramienta avisó y la revisión comprobó que el rojo da 5,16:1.

### `non-text-contrast` (1.4.11) y `target-size` (2.5.8): `checkInteractive`

**¿Cómo sabe el motor qué es interactivo?** Por el **nombre de la capa**, con la expresión regular `INTERACTIVE_RE` (`button`, `btn`, `link`, `tab`, `checkbox`, `input`, `stepper`…). Es una heurística, y tiene consecuencias:

- **Falsos positivos**: "Fondo stepper" contiene *stepper* y se trató como control. La revisión semántica los descarta. Cada finding guarda en `details.heuristic` qué palabra lo clasificó.
- **Falsos negativos**: "Botón izquierda" (en español) o "Card-rrss" no coinciden, así que no se miden. Nombrar bien las capas en inglés mejora la auditoría.
- Solo se evalúa el elemento interactivo **más externo**: los hijos de un botón no generan findings duplicados.

Comprobaciones:

| Medida | Resultado |
|---|---|
| Ancho o alto < 24 px | **Error** 2.5.8 (la norma admite una excepción si hay espaciado alrededor; la comprueba Claude en la captura) |
| Entre 24 y 44 px | **Nota** 2.5.5 (AAA) |
| Borde (o, si no hay, relleno) frente al entorno < 3:1 | **Aviso** 1.4.11 |

Para el contraste con el entorno se resuelve el fondo **excluyendo** las capas del propio componente (`excludeNodeId`).

### `text-size` (buena práctica)

Aviso si un texto mide menos de 12 px (configurable con `minFontSizePx`).

### `image-alt` (1.1.1): `checkImage`

Una capa con relleno de imagen necesitará texto alternativo. Si su nombre es genérico ("Rectangle 12", "Image") es un **aviso**, porque no dice nada del contenido; si es descriptivo, una **nota**. La revisión semántica propone el texto alternativo mirando la captura.

### `background-uncertain`

No es una regla en sí, sino el resultado de un contraste que no se puede medir con certeza (ver 6.2). Siempre significa "compruébalo a mano".

## 6.4 El resultado: `AuditResult`

```ts
{
  fileName, fileKey, rootNodeId, rootNodeName, level,
  summary: { errors, warnings, infos, textLayers, interactiveElements, nodesVisited },
  findings: Finding[],          // ordenados: errores → avisos → notas
  textLayers: TextLayerInfo[],  // TODOS los textos, con su contraste
  interactiveElements: InteractiveInfo[],
  notes: string[]
}
```

Cada `Finding` trae lo necesario para localizar y arreglar el problema:

```ts
{
  rule: "target-size", wcag: "2.5.8 Target Size (Minimum)", level: "AA", severity: "error",
  nodeId: "I1:141707;…;23636:6806", nodeName: "Fondo stepper",
  nodePath: "Eleccion registro MADRE > Registro-header > Header > _stepper-header > Fondo stepper",
  link: "https://www.figma.com/design/…",
  message: "\"Fondo stepper\" mide 78x4 px; el mínimo es 24x24 px …",
  details: { width: 78, height: 4, minimum: 24 },
  suggestion: "Amplía el área táctil a 44x44 px …"
}
```

## 6.5 Si cambias una regla

1. Modifica `engine.ts` (o `background.ts`).
2. **Añade un caso** en `src/rules/engine.test.ts` con un árbol sintético que lo demuestre.
3. Mantén sincronizados `RULES`, el `README.md` y el `SKILL.md`.
4. `npm test` y `npm run build`.

Hay una receta completa en [Tareas habituales](10-tareas-habituales.md).

Siguiente: [Informe HTML](07-informe-html.md).
