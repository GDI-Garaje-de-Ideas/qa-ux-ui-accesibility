# 11. Distribuir el skill

Este capítulo explica cómo se reparte la herramienta para que otra persona solo tenga que copiar una carpeta y escribir `/a11y-audit`. La guía para quien lo **usa** está en [INSTALAR.md](../INSTALAR.md).

## 11.1 Una carpeta autocontenida

Todo lo que necesita el skill vive en `.claude/skills/a11y-audit/`:

```
.claude/skills/a11y-audit/
├── SKILL.md              ← el procedimiento (paso previo, modo frame, modo flujo)
├── references/           ← gravedad.md (criterio fijo) y auditar-pantalla.md (instrucciones de los agentes)
├── componentes/          ← conocimiento inicial por archivo de Figma (GOfit, Club Nexo)
├── scripts/              ← flujos.mjs (lista flujos y pantallas) e indice.mjs (índice del flujo)
└── bin/                  ← GENERADO: audit, report, contraste y configurar (.mjs)
```

Claude Code descubre los skills que hay en `.claude/skills/` del proyecto abierto, así que copiar esa carpeta a otro proyecto es suficiente para que aparezca `/a11y-audit`.

## 11.2 La carpeta `bin/`

El código fuente está en `src/` (TypeScript) y depende de librerías de `node_modules`. Quien copie el skill no debe tener que compilar ni instalar nada, por eso `npm run build:skill` usa **esbuild** para generar en `bin/` programas `.mjs` autónomos que llevan dentro sus dependencias:

| Programa | Fuente | Qué hace |
|---|---|---|
| `audit.mjs` | `src/cli.ts` | Descarga un frame y mide (contrastes, tamaños…). Con `--json` devuelve el resultado completo |
| `report.mjs` | `src/report/cli.ts` | Genera el informe HTML a partir de la revisión del agente |
| `contraste.mjs` | `src/contrast-cli.ts` | Contraste entre dos colores concretos |
| `configurar.mjs` | `src/configure-cli.ts` | Guarda el token de Figma sin que pase por el chat; con `--estado` comprueba si hay uno |

`bin/` es código generado, pero **se versiona**, porque es lo que se distribuye.

**El servidor MCP propio (`src/server.ts`) no se incluye en el skill.** Hace lo mismo que `audit.mjs` y `report.mjs`, pero necesita registrarse en el `.mcp.json` de cada proyecto. Los programas de terminal dan el mismo resultado sin registrar nada. El servidor sigue disponible para desarrollo con el `.mcp.json` de este repositorio (`npm run build`).

## 11.3 Dos MCP, dos papeles

| | MCP oficial de Figma | Programas de `bin/` |
|---|---|---|
| Para qué | Revisión **semántica**: captura, estructura, estados | Revisión **medible**: contraste, tamaños, informe |
| Autenticación | Cuenta de Figma (OAuth, `/mcp`) | Token personal de Figma |
| Configuración | Entrada `figma` en `.mcp.json` del proyecto; el skill se ofrece a añadirla | Ninguna |

## 11.4 Sin configuración previa: el paso previo

El skill empieza siempre comprobando el entorno y pidiendo solo lo que falte:

1. **Node.js 20 o superior.**
2. **Token:** ejecuta `bin/configurar.mjs --estado`. Si no hay token, pregunta si la persona tiene definida `FIGMA_TOKEN`. Si la tiene pero Claude Code no la ve, prueba con `zsh -ic`; si no la tiene, le pide ejecutar `bin/configurar.mjs` en su terminal. Ese programa pide el token sin mostrarlo, lo valida con `GET /v1/me` y lo guarda en `~/.config/figma-a11y/token` con permisos 600 (`src/figma/token-store.ts`). **El token nunca pasa por el chat.**
3. **MCP oficial de Figma:** si falta, se ofrece a añadirlo al `.mcp.json` del proyecto. Mientras tanto ofrece el alcance "Solo medible".
4. **`reports/` en `.gitignore`**, porque los informes llevan capturas.

`resolveToken` (`src/figma/client.ts`) busca el token en este orden: argumento, `FIGMA_TOKEN`, `FIGMA_API_KEY` y el archivo guardado.

## 11.5 Rutas dentro del skill

El skill nunca usa rutas de este repositorio. Usa `${CLAUDE_SKILL_DIR}`, que Claude Code sustituye por la carpeta del skill. Por si no se sustituyera, SKILL.md indica usar la ruta que Claude Code muestra al invocarlo ("Base directory for this skill"). En el modo flujo, el orquestador pasa la ruta ya expandida a cada agente.

## 11.6 Lo aprendido vive en el proyecto

La carpeta del skill se sustituye entera al actualizarlo, así que no guarda nada. Los componentes conocidos de cada archivo de Figma se guardan en `.a11y-audit/componentes/<fileKey>.md` del proyecto donde se audita, y los informes en su `reports/`. El skill trae los de GOfit y Club Nexo como punto de partida y los copia la primera vez.

## 11.7 Flujo de trabajo al cambiar algo

1. Edita `src/` o los archivos de `.claude/skills/a11y-audit/`.
2. `npm test`.
3. `npm run build:skill`: compila con tsc y regenera `bin/`.
4. Prueba `/a11y-audit` en este mismo proyecto.
5. Haz commit incluyendo `bin/` y vuelve a copiar la carpeta en los proyectos que la usen.
