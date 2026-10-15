# figma-a11y-mcp

Herramienta para detectar incumplimientos de accesibilidad (WCAG 2.2) en diseños de Figma desde Claude Code. Combina dos MCP:

| Servidor | Qué aporta | Cómo se conecta |
|---|---|---|
| `figma-a11y` (este repo) | Reglas **deterministas** calculadas desde la REST API de Figma: contraste de texto (1.4.3 / 1.4.6), contraste no textual (1.4.11), tamaño de área táctil (2.5.8 / 2.5.5), texto pequeño, imágenes sin nombre descriptivo. | stdio, `node dist/server.js`, token personal en `FIGMA_TOKEN`. |
| `figma` (oficial, remoto) | Captura y contexto del diseño para la revisión **semántica** (uso del color, etiquetas, jerarquía, estados, textos de enlaces). | `https://mcp.figma.com/mcp`, OAuth desde Claude Code. |

El skill `/a11y-audit` orquesta ambos. Audita un frame o un flujo completo de una página y genera informes HTML con capturas en `reports/`, más un índice del flujo con qué pantallas son accesibles.

**¿Solo quieres usarlo?** Copia la carpeta `.claude/skills/a11y-audit/` a tu proyecto y sigue [INSTALAR.md](INSTALAR.md). No hace falta clonar ni compilar nada: lo que falte te lo pide el propio skill.

¿Acabas de llegar al proyecto? Empieza por la [documentación para el equipo](doc/README.md): conceptos, arquitectura, cada módulo explicado y recetas paso a paso.

## Requisitos

- Node 20 o superior.
- Token personal de Figma con permiso de lectura de archivos: Figma > Settings > Security > Personal access tokens.
- Claude Code con acceso al MCP remoto de Figma (disponible en todos los planes).

## Instalación para desarrollo

Esto es para trabajar en el código. Para usarlo, ver [INSTALAR.md](INSTALAR.md).

```bash
npm install
npm run build
cp .env.example .env   # y pega tu token
export FIGMA_TOKEN=figd_...   # o `source .env`; .mcp.json lee la variable del entorno
```

Abre Claude Code en esta carpeta. Detectará `.mcp.json` y pedirá aprobar los dos servidores. Para el servidor `figma` ejecuta `/mcp` y completa el inicio de sesión en el navegador.

## Uso

En Figma, botón derecho sobre un frame > **Copy link to selection**. Después, en Claude Code, lanza el skill sin argumentos:

```
/a11y-audit
```

El skill te pedirá el enlace y después te preguntará el nivel WCAG (AA o AAA), el alcance (completa o solo reglas medibles) y dónde quieres el informe (chat y archivo, o solo chat).

También puedes lanzar solo la parte determinista desde la terminal, sin Claude:

```bash
npm run audit -- "https://www.figma.com/design/<fileKey>/<nombre>?node-id=12-34"
npm run audit -- "<enlace>" --level AAA --json > informe.json
```

Sale con código 1 si hay errores, así que sirve como comprobación en CI.

## Herramientas MCP expuestas por `figma-a11y`

| Tool | Entrada | Salida |
|---|---|---|
| `audit_figma_node` | `url`, `level` (AA/AAA), `minFontSizePx` | `summary`, `findings[]`, `textLayers[]`, `interactiveElements[]`, `notes[]`. Si el enlace no tiene node-id, lista páginas y frames. |
| `check_contrast` | `foreground`, `background`, `fontSizePx?`, `fontWeight?`, `level` | Ratio, umbral requerido y si pasa. |
| `list_a11y_rules` | ninguna | Catálogo de reglas deterministas. |
| `build_html_report` | `review` (veredicto, incidencias con `nodeIds`, problema y solución, revisión semántica, comprobaciones manuales, recomendaciones), `outDir?` | Escribe `reports/<fecha>-<frame>-<node-id>.html` y devuelve la ruta. |

Cada finding incluye `rule`, `wcag`, `severity`, `nodeId`, `nodePath`, `link` directo al nodo, valores medidos y una sugerencia.

## Informe HTML visual

`build_html_report` genera un único archivo HTML autocontenido, con la captura incrustada, que se abre con doble clic y funciona sin conexión:

- Mapa del frame con cada incidencia marcada y numerada por gravedad, con filtros por tipo.
- Una tarjeta por incidencia con la zona ampliada, las mediciones reales (muestras de color, contraste, tamaños), qué pasa, cómo resolverlo y enlaces a las capas en Figma.
- Revisión semántica, comprobaciones manuales, recomendaciones priorizadas y un anexo con los datos brutos del motor.

Las mediciones no vienen de la revisión: la herramienta vuelve a descargar el frame y a ejecutar las reglas. Los hallazgos medidos que la revisión no cite aparecen como "sin revisar". También se puede generar desde la terminal a partir de una revisión en JSON:

```bash
npm run report -- revision.json [--out reports]
```

## Geometría de auto-layout

La REST API de Figma puede devolver cajas (`absoluteBoundingBox`) desactualizadas dentro de instancias cuyo auto-layout se ha reajustado por overrides, como capas ocultas o textos cambiados. `src/figma/layout.ts` recalcula esas cajas a partir de las propiedades de auto-layout (dirección, padding, espaciado, alineación, hug, fill, grow y stretch) antes de auditar y de dibujar el informe. No se tocan contenedores con wrap, grid o `SPACE_BETWEEN`.

## Cómo se calcula el fondo de un texto

La REST API no dice "qué hay detrás" de una capa. El motor recorre el árbol en el orden de pintado de Figma (fills del nodo, luego hijos de abajo arriba), acumula las capas sólidas que cubren la caja del texto y las compone con alfa. Si bajo el texto hay una imagen, un degradado o una forma que solo lo cubre parcialmente, no se inventa un número: se emite `background-uncertain` para comprobación manual. Si no hay ninguna capa opaca, se asume lienzo blanco y se avisa en `notes`.

## Límites conocidos

- La detección de elementos interactivos es por nombre de capa (`Button`, `Input`, `Link`, `Tab`, `Checkbox`...). Nombra los componentes de forma consistente o revisa los falsos positivos en el informe.
- No se evalúan prototipos ni interacciones: estados de foco, orden de tabulación y comportamiento con lector de pantalla quedan como comprobaciones manuales.
- Los textos con estilos mixtos se evalúan con el tamaño y peso más pequeños del fragmento.
- Frames muy grandes tardan más y pueden superar el límite de peticiones de Figma; audita pantalla a pantalla.

## Desarrollo

```bash
npm test          # tests unitarios (node:test via tsx)
npm run build:skill  # compila y regenera los programas del skill (.claude/skills/a11y-audit/bin/)
npm run dev       # arranca el servidor MCP por stdio con tsx
```

Estructura:

```
src/figma/     parseo de enlaces, tipos, cliente REST y normalización de auto-layout
src/report/    informe HTML visual (esquema de la revisión, render, CLI)
src/color/     luminancia, contraste, composición alfa
src/rules/     resolución de fondos por orden de pintado y reglas
src/audit.ts   punto de entrada compartido
src/server.ts  servidor MCP (solo desarrollo; el skill no lo necesita)
src/cli.ts     auditoría por terminal
src/contrast-cli.ts            contraste por terminal (lo usan los agentes del skill)
src/configure-cli.ts           guarda el token de Figma sin pasar por el chat
scripts/build-skill.mjs        empaqueta src/ en .claude/skills/a11y-audit/bin/ (npm run build:skill)
.claude/skills/a11y-audit/     el skill que se distribuye: SKILL.md, references/, componentes/, scripts/, bin/
```
