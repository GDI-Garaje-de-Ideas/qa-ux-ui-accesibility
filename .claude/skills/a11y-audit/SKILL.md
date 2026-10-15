---
name: a11y-audit
description: Audita la accesibilidad (WCAG 2.2) de diseños de Figma, sea un frame o una página completa. Con una página, pregunta qué flujo analizar, audita sus pantallas en paralelo y genera un informe HTML por pantalla más un índice del flujo con qué pantallas son accesibles y qué errores tienen. Combina mediciones deterministas (contraste, tamaños, áreas táctiles) con una revisión semántica usando el MCP oficial de Figma. Es autocontenido: basta con copiar esta carpeta a `.claude/skills/` de cualquier proyecto. Usar cuando el usuario pida revisar la accesibilidad de un diseño, pase un enlace de Figma o mencione WCAG.
allowed-tools: mcp__figma__get_screenshot, mcp__figma__get_design_context, mcp__figma__get_metadata, mcp__figma__get_variable_defs, AskUserQuestion, Agent, Bash, Write, Edit, Read
---

# Auditoría de accesibilidad de diseños de Figma

Carpeta del skill: `${CLAUDE_SKILL_DIR}`. Si esa variable no aparece sustituida por una ruta, usa la ruta que Claude Code indica al invocar el skill («Base directory for this skill»). En todos los comandos, escribe la ruta absoluta entre comillas, porque puede contener espacios. Contiene:
- `references/gravedad.md`: criterio de gravedad y veredicto. **Obligatorio en los dos modos.**
- `references/auditar-pantalla.md`: instrucciones para cada agente en el modo flujo.
- `componentes/<fileKey>.md`: conocimiento inicial de algunos archivos de Figma (ver «Componentes conocidos»).
- `scripts/flujos.mjs`: indica si el enlace es un archivo, una página, una sección o un frame, y lista flujos y pantallas. Solo lectura.
- `scripts/indice.mjs`: genera el índice HTML de un flujo.
- `bin/audit.mjs`, `bin/report.mjs`, `bin/contraste.mjs`: auditoría (mediciones WCAG), informe HTML y cálculo de contraste. Son programas autónomos: solo necesitan Node.js 20 o superior, sin compilar ni instalar nada.
- `bin/configurar.mjs`: guarda el token de Figma del usuario. Con `--estado` comprueba si está configurado, sin mostrarlo.

**Dónde se trabaja.** Ejecuta todos los comandos desde el directorio de trabajo actual, que es el proyecto del usuario. Los informes se escriben en su carpeta `reports/` y los datos de trabajo en `reports/.trabajo/`.

**Token de Figma.** Los programas lo buscan en este orden: la variable de entorno `FIGMA_TOKEN` y el archivo que guarda `bin/configurar.mjs` (`~/.config/figma-a11y/token`). El paso previo comprueba que haya uno. Si en mitad de la auditoría un programa responde "Falta el token de Figma" o "Token inválido", vuelve al paso previo.

**No imprimas nunca el token.** En Figma todo es de solo lectura: no uses nunca herramientas que escriban.

**Componentes conocidos.** Lo aprendido de cada archivo de Figma se guarda en el proyecto del usuario, en `.a11y-audit/componentes/<fileKey>.md` (`fileKey` es el segmento del enlace que va después de `/design/`). Si no existe pero sí hay uno en `${CLAUDE_SKILL_DIR}/componentes/<fileKey>.md`, cópialo primero al proyecto. Si el archivo existe, su clasificación manda sobre `gravedad.md`. El formato está en `${CLAUDE_SKILL_DIR}/componentes/README.md`.

## Paso previo: comprobar el entorno (siempre, antes del paso 0)

El usuario no tiene que configurar nada antes de usar el skill: compruébalo tú y pide solo lo que falte. Si todo está bien, dilo en una línea y sigue.

1. **Node.js.** Ejecuta `node --version`. Si no existe o es menor que 20, explica que hace falta Node.js 20 o superior (instalador en nodejs.org, o `brew install node` en macOS) y detente hasta que lo tenga.
2. **Token de Figma** (variables de entorno). Ejecuta `node "${CLAUDE_SKILL_DIR}/bin/configurar.mjs" --estado`:
   - **Código 0 (`OK`)**: di "Figma conectado como <nombre>", indica el origen que muestra el programa (variable `FIGMA_TOKEN` o archivo guardado) y sigue. No muestres el email.
   - **Código 3 (`SIN TOKEN`)**: antes de nada, **pregunta al usuario si tiene definida la variable de entorno `FIGMA_TOKEN`**, por ejemplo en su `~/.zshrc`:
     - **Si dice que sí**: probablemente Claude Code se abrió antes de definirla y no la ve. Repite `--estado` con `zsh -ic '…'` (ignora el aviso de zsh "not valid in this context"). Si así funciona, ejecuta los demás programas del skill también con `zsh -ic` y recomiéndale reiniciar Claude Code (Cmd+Q) para no depender de eso. Si tampoco funciona, sigue con el caso "no".
     - **Si dice que no o no lo sabe**: guíale para guardarlo con el programa del skill, como se explica a continuación.
   - **Código 4 (`TOKEN INVÁLIDO`)** o el usuario no tiene la variable: pide al usuario que lo configure él, **en su terminal y no en el chat**:
     1. Crear el token en Figma: Settings > Security > Personal access tokens > Generate new token, con solo el permiso «File content: Read».
     2. Abrir la terminal de VS Code (Ctrl+`) o cualquier terminal y ejecutar este comando. Escríbelo con la ruta absoluta ya sustituida, entre comillas:
        `node "<valor de ${CLAUDE_SKILL_DIR}>/bin/configurar.mjs"`
     3. Pegar el token cuando lo pida. No se ve mientras se escribe. El programa lo valida con Figma y lo guarda solo para su usuario.
     4. Volver al chat y escribir "listo".

     Cuando responda, repite `--estado`. **No pidas nunca el token en el chat.** Si el usuario lo pega igualmente, no lo repitas ni lo guardes tú. Explícale que ha quedado en el historial de la conversación, recomiéndale revocarlo en Figma y generar otro, y que lo configure con el comando.
   - **Código 1 (`ERROR`)**: problema de red o de Figma. Muestra el mensaje y ofrece reintentar.
3. **MCP oficial de Figma**, necesario para la revisión semántica. Comprueba con ToolSearch `select:mcp__figma__get_screenshot` si está disponible:
   - Si está disponible, sigue. Si al usarlo responde que falta autenticación, pide al usuario que escriba `/mcp`, elija **figma** e inicie sesión.
   - Si no está, **ofrece añadirlo tú** al `.mcp.json` de la raíz del proyecto, pidiendo permiso con `AskUserQuestion`. Si el archivo existe, añade la entrada dentro de `mcpServers` sin tocar las demás; si no existe, créalo:
     ```json
     { "mcpServers": { "figma": { "type": "http", "url": "https://mcp.figma.com/mcp" } } }
     ```
     Después explica que hay que **reiniciar Claude Code** y escribir `/mcp` para aprobar el servidor e iniciar sesión con la cuenta de Figma. Mientras tanto, ofrece seguir con el alcance **"Solo medible"**; en ese caso no hagas la pregunta de alcance del paso 0.4.
4. **Informes fuera de git.** Si el proyecto tiene `.gitignore` y no incluye `reports/`, avisa de que los informes contienen capturas de los diseños y ofrece añadir la línea `reports/`, pidiendo permiso. Sugiere también versionar `.a11y-audit/`, que guarda lo aprendido de cada archivo de Figma.

## 0. Recogida de parámetros

Antes de auditar, pregunta al usuario los parámetros. No los deduzcas de la conversación ni de argumentos del comando.

1. **Enlace de Figma.** Pídelo en un mensaje de texto y espera la respuesta. Explica cómo obtenerlo: en Figma, botón derecho sobre el frame o la página > "Copy link to selection". Si el enlace no parece de Figma (no contiene `figma.com/design/`, `/file/`, `/proto/` o `/board/`), dilo y vuelve a pedirlo.
2. **Tipo de enlace.** Ejecuta `node "${CLAUDE_SKILL_DIR}/scripts/flujos.mjs" "<enlace>"` y actúa según la línea `TIPO`:
   - **frame**: es una pantalla. Sigue con el paso 4 y después con el **modo frame**.
   - **archivo** (sin node-id): muestra las páginas y pregunta cuál analizar. Con 4 o menos, usa `AskUserQuestion`; con más, una lista numerada en texto. Vuelve a ejecutar el script con `?node-id=<id de la página con guion>`.
   - **página**: muestra los flujos (secciones, con su número de pantallas y su ancho, que indica móvil o web) y **pregunta qué flujo quiere analizar**. Con 4 o menos, usa `AskUserQuestion`; con más, una lista numerada en texto. Si el usuario nombra un flujo que no está en la lista, dilo y muéstrala otra vez.
   - **sección**: es directamente un flujo. Sigue con el paso 3.
3. **Pantallas del flujo.** Ejecuta `flujos.mjs "<enlace>" --flujo <id del flujo>`. Muestra las pantallas en una tabla: n.º, nombre, tamaño e id. Excluye por defecto las duplicadas y las que parecen documentación, e indícalo. Después pregunta con `AskUserQuestion` (`header`: "Pantallas"):
   - "Todas las únicas (N)": todas, menos duplicadas y documentación.
   - "Selección representativa": propón como máximo 8, una por tipo de pantalla (formulario, selección, resumen, error, éxito, modal…), y muéstralas antes de lanzar.
   - "Elijo yo": el usuario indica números o ids.

   Si van a ser más de 12 pantallas, avisa de que la auditoría tardará y se hará por tandas.
4. **Resto de opciones**, en una sola llamada a `AskUserQuestion`:
   - **Nivel WCAG** (`header`: "Nivel"): "AA (Recomendado)" o "AAA".
   - **Alcance** (`header`: "Alcance"): "Completa (Recomendado)", que hace la revisión medible y la semántica, o "Solo medible", sin el MCP oficial de Figma.
   - **Informe** (`header`: "Informe"), **solo en el modo frame**: "HTML visual y chat (Recomendado)", "Markdown y chat" o "Solo chat". En el modo flujo el informe es siempre HTML por pantalla más el índice del flujo; dilo.
5. Confirma en una línea los parámetros elegidos y continúa sin pedir más confirmación.

---

# MODO FRAME (una pantalla)

## 1. Análisis determinista (mediciones)

1. Crea la carpeta de trabajo `reports/.trabajo/<AAAA-MM-DD>-<slug del frame>/` y ejecuta:
   `node "${CLAUDE_SKILL_DIR}/bin/audit.mjs" "<enlace>" --level <nivel> --json > "<carpeta>/audit.json"`
   Sale con código 1 si hay errores, y es normal.
2. Guarda el JSON: `summary`, `findings`, `textLayers`, `interactiveElements` y `notes` son la base del informe. No recalcules contrastes que ya vienen medidos. Si necesitas comprobar un color concreto que no está en el inventario, usa `node "${CLAUDE_SKILL_DIR}/bin/contraste.mjs" "#fg" "#bg" [tamañoPx peso]` (sin tamaño, evalúa el umbral de componentes, 3:1).

## 2. Análisis semántico (MCP oficial de Figma)

Omite esta sección si el usuario eligió el alcance "Solo medible" y, en ese caso, indica en el informe que la revisión semántica queda pendiente.

Con el mismo enlace:

1. `get_screenshot` para ver el diseño.
2. `get_design_context` para conocer estructura, textos y estados. Si el frame es grande y falla, usa `get_metadata` y pide contexto de subnodos concretos.
3. `get_variable_defs` si quieres citar tokens del sistema de diseño en las recomendaciones.

Revisa con la captura y el contexto estas reglas, que no se pueden medir automáticamente. Para cada una indica: cumple, no cumple o no se puede determinar desde el diseño, y en qué capa:

- **1.4.1 Uso del color**: ¿hay estados (error, activo, seleccionado, enlaces) que se distingan solo por color? Debe existir un segundo indicador (icono, subrayado, texto, peso).
- **1.3.1 Información y relaciones**: jerarquía visual de encabezados coherente, agrupación de campos, tablas con cabeceras.
- **3.3.2 Etiquetas o instrucciones**: cada campo de formulario tiene etiqueta visible persistente (un placeholder no basta), y los campos obligatorios se marcan de forma que no dependa solo del color.
- **2.4.7 Foco visible** y **estados**: ¿el diseño define estados focus, hover, disabled y error? Si no aparecen en el frame, indícalo como pendiente de diseño.
- **2.4.4 Propósito de los enlaces** y **2.4.6 Encabezados y etiquetas**: textos de botones y enlaces descriptivos ("Ver más" sin contexto no lo es).
- **1.4.12 Espaciado de texto / 1.4.10 Reflow**: textos truncados con "..." o contenedores de alto fijo que impedirán ampliar el texto al 200 %.
- **2.5.8 Espaciado entre objetivos**: para los `target-size` en error, comprueba en la captura si el espaciado alrededor compensa (excepción de la regla).
- **1.1.1 Contenido no textual**: para cada `image-alt`, propón un texto alternativo o marca la imagen como decorativa según su función.
- **Iconos sin etiqueta**: los botones solo con icono necesitan nombre accesible; indícalo en las anotaciones para desarrollo.
- **Falsos positivos**: si un finding de `non-text-contrast` o `target-size` afecta a un nodo que en la captura claramente no es interactivo (por ejemplo, un texto llamado "Link" que es una cabecera), márcalo como descartado y explica por qué.

Clasifica cada incidencia y decide el veredicto según `${CLAUDE_SKILL_DIR}/references/gravedad.md` y, si existe, `.a11y-audit/componentes/<fileKey>.md`.

## 3. Informe

### HTML visual

Si el usuario eligió "HTML visual y chat", escribe la revisión en `<carpeta>/review.json` y ejecuta `node "${CLAUDE_SKILL_DIR}/bin/report.mjs" "<carpeta>/review.json"`. El programa vuelve a descargar el frame, ejecuta las reglas, incrusta la captura, dibuja una marca numerada por incidencia y escribe el HTML en `reports/`. Tú solo aportas el criterio:

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

Después resume en el chat las 3 a 5 incidencias más graves y da la ruta del archivo, que el programa imprime como "Informe HTML: <ruta>". Si imprime "Sin captura", avisa de que el informe se generó sin captura y por qué.

### Markdown o chat

Si el usuario eligió "Markdown y chat", escribe el informe en `reports/<AAAA-MM-DD>-<nombre-frame-slug>.md` y resume en el chat las 3 a 5 incidencias más graves. Si eligió "Solo chat", muestra el informe completo en el chat y no escribas ningún archivo. Estructura:

1. **Resumen**: archivo, frame, nivel, conteo de errores, avisos y notas, y veredicto (cumple / no cumple / pendiente de comprobaciones manuales).
2. **Incidencias medidas** (tabla): criterio WCAG, capa (`nodePath`), valor medido frente al requerido, sugerencia, enlace al nodo (`link`).
3. **Revisión semántica**: una línea por criterio de la sección 2 con el resultado y las capas afectadas.
4. **Comprobaciones manuales pendientes**: los `background-uncertain` y todo lo que no se pueda determinar desde el diseño (comportamiento, foco, lectores de pantalla).
5. **Recomendaciones priorizadas**: primero lo que bloquea AA, luego los avisos y después las mejoras.

Sé concreto: cita siempre la capa y el valor. No inventes contrastes ni tamaños que no vengan de las herramientas.

---

# MODO FLUJO (varias pantallas de una página)

## F1. Preparar

1. Crea la carpeta de trabajo `reports/.trabajo/<AAAA-MM-DD>-<slug del flujo>/`. Ahí se guardan las revisiones de cada pantalla, que no se pierden al cerrar la sesión.
2. Escribe en ella `flujo.json`:
   ```json
   { "fileKey": "…", "fileName": "…", "pageName": "…", "flowName": "…", "flowId": "…", "level": "AA",
     "date": "AAAA-MM-DD", "alcance": "completa", "screens": ["id1", "id2"], "componentes": [] }
   ```
   `screens` son los ids elegidos en el paso 0.3, en el orden del flujo.
3. Prepara los componentes conocidos (ver «Componentes conocidos») y lee `.a11y-audit/componentes/<fileKey>.md` si existe: tus agentes lo aplicarán. Si no existe, se creará tras la primera tanda.

## F2. Auditar por tandas

Lanza las pantallas en **tandas de hasta 8 agentes en paralelo**, con la herramienta Agent (`subagent_type: general-purpose`, en segundo plano). Una tanda más grande satura la API de Figma. Este es el prompt de cada agente:

```
Audita la accesibilidad (WCAG 2.2 <nivel>) de UNA pantalla de Figma y genera su informe HTML.
Carpeta del skill: <valor de ${CLAUDE_SKILL_DIR}>. Lee y sigue al pie de la letra <carpeta del skill>/references/auditar-pantalla.md,
con el criterio de <carpeta del skill>/references/gravedad.md[ y los componentes conocidos de <ruta absoluta>/.a11y-audit/componentes/<fileKey>.md].
Directorio de trabajo: <ruta absoluta del proyecto del usuario>.
fileKey: <fileKey> · nodeId: <id> (con guion: <id-con-guion>) · nivel: <nivel> · alcance: <completa|solo medible>
trabajo: <ruta absoluta de la carpeta de trabajo> · pantalla: "<nombre>"
<si en el paso previo hizo falta zsh -ic: "Ejecuta los programas de bin/ y scripts/ con zsh -ic '…'.">
<si aplica, una línea con qué revisar especialmente: formulario, modal, calendario, pago, selección…>
```

Mientras llegan los resultados, informa al usuario en una línea por pantalla: "Tanda X: n de N · <pantalla> <veredicto>, <lo más grave>". No repitas los informes completos.

## F3. Aprender de la primera tanda

Cuando termine la primera tanda y **antes de lanzar la siguiente**:

1. Reúne los "componentes compartidos con problemas" que han devuelto los agentes.
2. Si el mismo componente ha recibido gravedades distintas, decide una según `gravedad.md`.
3. Crea o actualiza `.a11y-audit/componentes/<fileKey>.md` en el proyecto con esa clasificación, siguiendo el formato de `${CLAUDE_SKILL_DIR}/componentes/README.md`.
4. Lanza las siguientes tandas, que ya aplicarán el archivo.

## F4. Consistencia

Al terminar todas las tandas:

1. Comprueba en los `review.json` que cada componente de `.a11y-audit/componentes/<fileKey>.md` tiene la misma gravedad en todas las pantallas. Puedes buscarlo con `node -e` o con grep.
2. Corrige las discrepancias en los `review.json` y regenera esos informes con `node "${CLAUDE_SKILL_DIR}/bin/report.mjs" "<carpeta>/review.json"`.
3. Recalcula el veredicto de las pantallas corregidas según `gravedad.md`.

## F5. Índice del flujo

1. Rellena `componentes` en `flujo.json`, de más a menos grave: `{ "component", "severity": "error|warning|info", "screens": <n.º de pantallas afectadas>, "problem", "fix" }`.
2. Ejecuta `node "${CLAUDE_SKILL_DIR}/scripts/indice.mjs" "<carpeta de trabajo>"`. Genera `reports/<fecha>-<flujo>-indice.html`, con cuántas pantallas son accesibles, el veredicto y los errores de cada una, enlaces a cada informe y la tabla de componentes.
3. Actualiza `.a11y-audit/componentes/<fileKey>.md` con lo aprendido en todo el flujo. Sugiere al usuario versionar la carpeta `.a11y-audit/` para que su equipo comparta ese conocimiento.
4. Abre el índice en el navegador (`open <ruta>` en macOS).

## F6. Resumen en el chat

- Ruta del índice y "X de N pantallas son accesibles (cumplen WCAG 2.2 <nivel>)".
- Tabla breve: pantalla, veredicto, errores, avisos y enlace a su informe.
- Los 3 a 6 problemas de componentes que más pantallas bloquean, con su arreglo.
- Anomalías de contenido: frames mal nombrados, importes incoherentes, erratas, pantallas que faltan (por ejemplo, un formulario que no está diseñado en el flujo).
- Ofrece auditar otro flujo de la misma página.
