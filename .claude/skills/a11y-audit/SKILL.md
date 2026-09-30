---
name: a11y-audit
description: Audita un frame de Figma contra WCAG 2.2 AA combinando las reglas deterministas del MCP figma-a11y (contraste, tamaños, áreas táctiles) con una revisión semántica del diseño usando el MCP oficial de Figma (captura y contexto). Usar cuando el usuario pida revisar accesibilidad de un diseño, pase un enlace de Figma o mencione WCAG.
allowed-tools: mcp__figma-a11y__audit_figma_node, mcp__figma-a11y__check_contrast, mcp__figma-a11y__list_a11y_rules, mcp__figma-a11y__build_html_report, mcp__figma__get_screenshot, mcp__figma__get_design_context, mcp__figma__get_metadata, mcp__figma__get_variable_defs, AskUserQuestion, Write, Read
---

# Auditoría de accesibilidad de un diseño de Figma

## 0. Recogida de parámetros

Antes de llamar a ninguna herramienta, pregunta al usuario los parámetros de la auditoría. No los deduzcas de la conversación ni de argumentos del comando.

1. **Enlace de Figma.** Pídelo en un mensaje de texto y espera la respuesta. Explica cómo obtenerlo: en Figma, botón derecho sobre el frame > "Copy link to selection". Si el enlace no parece de Figma (no contiene `figma.com/design/`, `/file/`, `/proto/` o `/board/`), dilo y vuelve a pedirlo.
2. **Resto de opciones.** Una vez tengas el enlace, usa `AskUserQuestion` con estas preguntas en una sola llamada:
   - **Nivel WCAG** (`header`: "Nivel"): "AA (Recomendado)" o "AAA".
   - **Alcance** (`header`: "Alcance"): "Completa (Recomendado)", que ejecuta las secciones 1 y 2, o "Solo medible", que ejecuta únicamente la sección 1 sin el MCP oficial de Figma.
   - **Informe** (`header`: "Informe"): "HTML visual y chat (Recomendado)", que genera en `reports/` un informe HTML con capturas y marcas para abrir en el navegador y resume en el chat; "Markdown y chat", que escribe el informe en `reports/` como `.md`; o "Solo chat".
3. Confirma en una línea los parámetros elegidos y continúa sin pedir más confirmación.

## 1. Análisis determinista (figma-a11y)

1. Llama a `audit_figma_node` con el enlace y el nivel elegidos en la sección 0.
2. Si responde `needs-node`, muestra las páginas y frames al usuario y pide que elija uno. No sigas hasta tener un node-id.
3. Guarda el JSON: `summary`, `findings`, `textLayers`, `interactiveElements` y `notes` son la base del informe. No recalcules contrastes que ya vienen medidos; si necesitas comprobar un color concreto que no está en el inventario, usa `check_contrast`.

## 2. Análisis semántico (MCP oficial de Figma)

Omite esta sección si el usuario eligió el alcance "Solo medible" y, en ese caso, indica en el informe que la revisión semántica queda pendiente.

Con el mismo enlace:

1. `get_screenshot` para ver el diseño.
2. `get_design_context` para conocer estructura, textos y estados. Si el frame es grande y falla, usa `get_metadata` y pide contexto de subnodos concretos.
3. `get_variable_defs` si quieres citar tokens del sistema de diseño en las recomendaciones.

Revisa con la captura y el contexto estas reglas, que no son medibles automáticamente. Para cada una indica: cumple / no cumple / no se puede determinar desde el diseño, y en qué capa:

- **1.4.1 Uso del color**: ¿hay estados (error, activo, seleccionado, enlaces) que se distingan solo por color? Debe existir un segundo indicador (icono, subrayado, texto, peso).
- **1.3.1 Información y relaciones**: jerarquía visual de encabezados coherente, agrupación de campos, tablas con cabeceras.
- **3.3.2 Etiquetas o instrucciones**: cada campo de formulario tiene etiqueta visible persistente (un placeholder no basta), campos obligatorios marcados de forma no solo por color.
- **2.4.7 Foco visible** y **estados**: ¿el diseño define estados focus, hover, disabled, error? Si no aparecen en el frame, indícalo como pendiente de diseño.
- **2.4.4 Propósito de los enlaces** y **2.4.6 Encabezados y etiquetas**: textos de botones y enlaces descriptivos ("Ver más" sin contexto no lo es).
- **1.4.12 Espaciado de texto / 1.4.10 Reflow**: textos truncados con "..." o contenedores de alto fijo que impedirán ampliar el texto al 200 %.
- **2.5.8 Espaciado entre objetivos**: para los `target-size` en error, comprueba en la captura si el espaciado alrededor compensa (excepción de la regla).
- **1.1.1 Contenido no textual**: para cada `image-alt`, propón un texto alternativo o marca la imagen como decorativa según su función.
- **Iconos sin etiqueta**: botones solo con icono necesitan nombre accesible; indícalo en las anotaciones para desarrollo.
- **Falsos positivos**: si un finding de `non-text-contrast` o `target-size` afecta a un nodo que en la captura claramente no es interactivo (por ejemplo, un texto llamado "Link" que es una cabecera), márcalo como descartado y explica por qué.

## 3. Informe

### HTML visual

Si el usuario eligió "HTML visual y chat", llama a `build_html_report` con la revisión. La herramienta vuelve a descargar el frame, ejecuta las reglas, incrusta la captura y dibuja una marca numerada por incidencia. Tú solo aportas el criterio:

- `url` y `level`: los mismos de la sección 0.
- `verdict` (`cumple` / `no-cumple` / `pendiente`) y `verdictText`: una o dos frases que lo justifiquen. `scopeNote` para aclaraciones de alcance (por ejemplo, revisión semántica pendiente si el alcance fue "Solo medible", o partes del frame tapadas).
- `issues`: una entrada por incidencia, medida o semántica, con:
  - `title` corto y concreto;
  - `severity` y `status` (`confirmado`, `descartado` para falsos positivos, `manual` si depende de algo fuera del diseño);
  - `source` (`medido` o `semantico`) y `wcag`;
  - `nodeIds`: las capas afectadas, en formato API. Para findings medidos, copia el `nodeId`; para incidencias semánticas, toma los `data-node-id` de `get_design_context` o los ids de `get_metadata`. Déjalo vacío solo si la incidencia es global;
  - `rules`: en incidencias medidas, las reglas que cubre (por ejemplo `["target-size"]`), para que la tarjeta muestre solo esas mediciones cuando una capa tiene varios findings;
  - `problem` ("qué pasa", en lenguaje claro, para diseño) y `fix` ("cómo resolverlo", concreto, citando tokens si los tienes).
- `semantic`, `manualChecks` y `recommendations` con el contenido de las secciones 2, 4 y 5 de la estructura de abajo.

Cubre cada finding de la sección 1 con una incidencia, confirmada o descartada. Los que no cubras aparecerán como "sin revisar". No escribas en `problem` ni en `fix` valores que no vengan de las herramientas: la tarjeta ya muestra las mediciones reales.

Después resume en el chat las 3 a 5 incidencias más graves y da la ruta del archivo. Si `hasScreenshot` es false, avisa de que el informe se generó sin captura y por qué (`screenshotError`).

Si el servidor `figma-a11y` no está conectado, escribe la revisión como JSON en el directorio temporal y ejecuta `node dist/report/cli.js <revision.json>` desde la raíz del proyecto, con `FIGMA_TOKEN` en el entorno.

### Markdown o chat

Si el usuario eligió "Markdown y chat", escribe el informe en `reports/<AAAA-MM-DD>-<nombre-frame-slug>.md` y resume en el chat las 3 a 5 incidencias más graves. Si eligió "Solo chat", muestra el informe completo en el chat y no escribas ningún archivo. Estructura:

1. **Resumen**: archivo, frame, nivel, conteo de errores/avisos/notas y veredicto (cumple / no cumple / pendiente de comprobaciones manuales).
2. **Incidencias medidas** (tabla): criterio WCAG, capa (`nodePath`), valor medido vs requerido, sugerencia, enlace al nodo (`link`).
3. **Revisión semántica**: una línea por criterio de la sección 2 con el resultado y las capas afectadas.
4. **Comprobaciones manuales pendientes**: los `background-uncertain` y todo lo que no se pueda determinar desde el diseño (comportamiento, foco, lectores de pantalla).
5. **Recomendaciones priorizadas**: primero lo que bloquea AA, luego avisos, luego mejoras.

Sé concreto: cita siempre la capa y el valor. No inventes contrastes ni tamaños que no vengan de las herramientas.
