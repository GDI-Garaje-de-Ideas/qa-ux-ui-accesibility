# Instrucciones para auditar UNA pantalla (modo flujo)

Estas instrucciones las sigue cada agente al que el skill `/a11y-audit` le encarga una pantalla de un flujo. Trabaja en español. El prompt del agente te da: la carpeta del skill (`<skill>`), el directorio de trabajo, `fileKey`, `nodeId`, `nivel`, `alcance`, `trabajo` (carpeta de trabajo del flujo) y el nombre de la pantalla.

## Reglas
- Ejecuta todos los comandos desde el directorio de trabajo que te indica el prompt. Los programas están en `<skill>/bin/` y son autónomos. No modifiques nada del skill.
- El token de Figma ya está configurado: el skill lo comprueba antes de lanzarte. Los programas lo leen solos (de `FIGMA_TOKEN` o de `~/.config/figma-a11y/token`). Si el prompt indica que hay que ejecutarlos con `zsh -ic '…'`, hazlo así. Si aun así responden "Falta el token de Figma" o "Token inválido", detente y devuélvelo como anomalía. NUNCA imprimas el token ni lo pidas.
- Solo lectura en Figma: NUNCA uses herramientas que escriban (use_figma, generate_figma_design, upload_assets, create_new_file…).
- Si Figma devuelve 429, espera 60 s y reintenta, como máximo 3 veces.
- Tu carpeta es `<trabajo>/s<nodeId con ":" cambiado por "-">`. Créala.

## 1. Análisis determinista
```
node "<skill>/bin/audit.mjs" "https://www.figma.com/design/<fileKey>/x?node-id=<id-con-guion>" --level <nivel> --json > "<carpeta>/audit.json"
```
Sale con código 1 si hay errores, y es normal. Lee `summary`, `findings`, `textLayers`, `interactiveElements` y `notes`. No recalcules contrastes ya medidos. Para medir un color extra:
```
node "<skill>/bin/contraste.mjs" "#primer-plano" "#fondo" [tamañoPx peso]   # sin tamaño evalúa componentes (3:1)
```

## 2. Análisis semántico
Omite este paso si el alcance es "Solo medible" y escríbelo en `scopeNote`.

Carga las herramientas con ToolSearch `select:mcp__figma__get_screenshot,mcp__figma__get_design_context,mcp__figma__get_metadata,mcp__figma__get_variable_defs`.

- `get_screenshot` (fileKey, nodeId) para ver la pantalla.
- `get_design_context` con `excludeScreenshot: true`, `clientFrameworks: "unknown"` y `clientLanguages: "unknown"`. Es solo para leer estructura, textos, colores y `data-node-id`. Si la salida es enorme se guarda en un archivo: búscala con grep, no la leas entera. Si solo devuelve metadatos, pide subnodos concretos. Si responde con un aviso de Code Connect, repite con `disableCodeConnect: true`.
- `get_metadata` y `get_variable_defs` si te ayudan.

Revisa:
- 1.4.1 uso del color.
- 1.3.1 estructura: encabezados, landmarks, agrupaciones, tablas.
- 3.3.1, 3.3.2, 3.3.3 y 3.3.4 formularios y transacciones.
- 2.4.7 foco y estados.
- 2.4.4 y 2.4.6 textos de botones y enlaces.
- 1.4.12 y 1.4.10 truncados, alto fijo y reflow a 320 px.
- 2.5.8 objetivos pequeños.
- 1.1.1 imágenes: propón un alt o márcalas como decorativas.
- Controles solo-icono sin nombre.
- Falsos positivos del motor.

En **modales**, revisa además:
- El título como encabezado o como nombre del diálogo.
- El botón cerrar con nombre accesible.
- El overlay.
- Comprobaciones manuales de foco: atraparlo, cerrar con Escape y devolverlo al cerrar.

La detección automática de interactivos va por nombre de capa (button, link, tab, input…) y no reconoce nombres en español. Revisa a mano los controles que no estén en `interactiveElements`.

## 3. Revisión: `<carpeta>/review.json`
Este es el esquema; el programa lo valida al generar el informe:
```
{ url, level, verdict, verdictText, scopeNote?, issues:[{title, severity, status, source:"medido"|"semantico", wcag, nodeIds:[…], rules?:[…], problem, fix}],
  semantic:[{criterion, result:"cumple"|"no-cumple"|"parcial"|"pendiente"|"no-determinable", detail}], manualChecks:[…], recommendations:[{priority:"bloquea"|"aviso"|"mejora", text}] }
```
- `url`: `https://www.figma.com/design/<fileKey>/x?node-id=<id-con-guion>`.
- **Gravedad y veredicto**: aplica `<skill>/references/gravedad.md`. Si el prompt te indica un archivo de componentes conocidos, su clasificación manda.
- Cubre CADA finding del paso 1 con una incidencia, confirmada o descartada. Agrupa los findings idénticos de un componente repetido en una sola incidencia con todos sus nodeIds. En las incidencias medidas, indica `rules`.
- En las incidencias semánticas, usa los `data-node-id` de get_design_context, en formato API (`I1811:1;2:3`).
- No escribas en `problem` ni en `fix` números que no vengan de las herramientas. Cita las capas.
- Si el nombre del frame no corresponde a su contenido, indícalo en `scopeNote`.

## 4. Informe HTML
```
node "<skill>/bin/report.mjs" "<carpeta>/review.json"
```
Debe imprimir "Informe HTML: <ruta>". Si imprime "Sin captura", anota el motivo.

## 5. Qué devolver (texto breve, sin el JSON)
- La ruta del HTML.
- El veredicto y el recuento: errores, avisos, notas, manuales y descartadas.
- Las 3 a 5 incidencias más graves: título, capa, criterio y valor medido.
- **Componentes compartidos con problemas**: nombre exacto del componente o instancia en Figma, problema, gravedad que le has dado y si ya estaba en el archivo de componentes conocidos.
- Anomalías: frame mal nombrado, cajas desplazadas, falta de captura, erratas.
