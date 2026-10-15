# 8. Servidor MCP y skill

## 8.1 El servidor `figma-a11y` (`src/server.ts`)

Es un programa pequeño: crea un `McpServer` con el SDK oficial de MCP, registra cuatro herramientas y se conecta por stdio.

```ts
const server = new McpServer({ name: "figma-a11y", version: "0.1.0" });
server.registerTool("audit_figma_node", { title, description, inputSchema, annotations }, handler);
// … resto de herramientas
await server.connect(new StdioServerTransport());
```

Cada herramienta declara:

- **`description`**: lo que lee Claude para decidir cuándo usarla. Es casi documentación para la IA, así que tiene que ser precisa.
- **`inputSchema`**: los parámetros, definidos con **zod**. El SDK valida la entrada antes de llamar a nuestro código.
- **`annotations`**: pistas para el cliente. `readOnlyHint: true` indica que la herramienta no modifica nada; `openWorldHint: true`, que habla con un servicio externo (Figma).

### Las herramientas

| Herramienta | Entrada | Qué hace |
|---|---|---|
| `audit_figma_node` | `url`, `level`, `minFontSizePx?` | Ejecuta la auditoría determinista (`auditFromUrl`). Si el enlace no tiene node-id, devuelve páginas y frames para elegir. |
| `check_contrast` | `foreground`, `background`, `fontSizePx?`, `fontWeight?`, `level` | Calcula el contraste entre dos colores. Sirve para comprobar colores que no están en el inventario, como el de un estado hover que Claude ve en el contexto de diseño. |
| `list_a11y_rules` | — | Devuelve el catálogo `RULES`, para que Claude sepa qué está cubierto automáticamente y qué debe revisar él. |
| `build_html_report` | `review`, `outDir?` | Genera el informe HTML (ver [capítulo 7](07-informe-html.md)). Es la única que escribe algo, y lo escribe en disco local, nunca en Figma. |

Los errores se devuelven como `isError: true` con un mensaje en texto, para que Claude se los explique al usuario en lugar de fallar en silencio.

### `audit.ts` y `cli.ts`

`auditFromUrl` es la función que comparten el servidor y la CLI (`npm run audit`), y así ambos se comportan igual. La CLI sale con **código 1 si hay errores**, lo que permite usarla en integración continua (CI).

## 8.2 El MCP oficial de Figma

No es código nuestro, pero el skill lo usa en la revisión semántica:

| Herramienta | Para qué la usamos |
|---|---|
| `get_screenshot` | Ver la pantalla como la vería una persona |
| `get_design_context` | Estructura, textos, estados y colores exactos en forma de código de referencia; de aquí salen los `data-node-id` de las capas |
| `get_metadata` | Esquema ligero de capas con posiciones; útil cuando el frame es grande |
| `get_variable_defs` | Tokens del sistema de diseño (por ejemplo `core/shadow-input-focus`), para citarlos en las recomendaciones |

Este servidor tiene también herramientas que **escriben** en Figma (`use_figma`, `generate_figma_design`…). **El skill no las usa nunca.**

## 8.3 El skill `/a11y-audit` (`.claude/skills/a11y-audit/SKILL.md`)

El skill tiene dos modos. En el **modo frame** audita una pantalla, como se describe abajo. En el **modo flujo**, si el enlace es una página, pregunta qué flujo (sección) analizar y qué pantallas, las audita en paralelo por tandas con agentes que siguen `references/auditar-pantalla.md` y el criterio fijo de `references/gravedad.md`, aprende los componentes repetidos en `.a11y-audit/componentes/<fileKey>.md` del proyecto y termina con un índice HTML del flujo (`scripts/indice.mjs`). El skill no usa el servidor MCP de este repositorio: mide con los programas autónomos de su carpeta `bin/`, que dan el mismo resultado. El servidor de la sección 8.1 queda para desarrollo. El detalle está en el [capítulo 11](11-distribuir-skill.md).


La cabecera (*frontmatter*) define el nombre, cuándo debe usarse y **qué herramientas tiene permitidas** (`allowed-tools`). El cuerpo son las instrucciones, en cuatro secciones:

### Sección 0: parámetros

Pide primero el enlace (y explica cómo copiarlo) y después, con un formulario de opciones:

- **Nivel**: AA (recomendado) o AAA.
- **Alcance**: completa, o solo medible (sin el MCP oficial).
- **Informe**: HTML visual y chat (recomendado), Markdown y chat, o solo chat.

### Sección 1: análisis determinista

Llama a `audit_figma_node`. Regla importante: **no recalcular contrastes que ya vienen medidos**; para colores nuevos, `check_contrast`.

### Sección 2: análisis semántico

Con la captura y el contexto, Claude revisa lo que el código no puede medir:

| Criterio | Qué se mira |
|---|---|
| 1.4.1 Uso del color | ¿Algún estado se distingue solo por color? |
| 1.3.1 Información y relaciones | Jerarquía de encabezados, agrupaciones, tablas |
| 3.3.2 Etiquetas | Etiquetas visibles (un placeholder no basta), campos obligatorios |
| 2.4.7 Foco y estados | ¿Existen los estados focus, hover, disabled y error? |
| 2.4.4 / 2.4.6 | ¿Los textos de botones y enlaces son descriptivos? |
| 1.4.12 / 1.4.10 | Textos truncados o contenedores de alto fijo que se romperán al 200 % |
| 2.5.8 | Si el espaciado alrededor compensa un objetivo pequeño |
| 1.1.1 | Proponer el texto alternativo de cada imagen |
| Falsos positivos | Descartar findings sobre capas que no son interactivas |

### Sección 3: informe

Para el HTML, Claude compone la revisión (sección 7.2) y llama a `build_html_report`. Instrucciones clave:

- Cubrir **cada** finding con una incidencia, confirmada o descartada.
- Tomar los `nodeIds` semánticos de `get_design_context` o `get_metadata`.
- No escribir en `problem` ni en `fix` valores que no vengan de las herramientas.
- Resumir en el chat las 3 a 5 incidencias más graves.
- Si el servidor no conecta, usar la CLI como alternativa.

## 8.4 Cómo se relaciona todo con `CLAUDE.md`

`CLAUDE.md` son las reglas del proyecto que Claude lee siempre: compilar antes de probar, dónde viven las reglas, que el fondo nunca se inventa, que las posiciones se normalizan, que los tokens no van al repositorio… Si cambias una convención del proyecto, actualízalo.

Siguiente: [Herramientas y tecnologías](09-herramientas.md).
