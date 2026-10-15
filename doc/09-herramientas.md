# 9. Herramientas y tecnologías

## 9.1 Lenguaje y entorno

| Herramienta | Versión | Para qué la usamos |
|---|---|---|
| **Node.js** | ≥ 20 | Ejecuta el servidor, la CLI y los tests. Usamos APIs nativas que antes necesitaban librerías: `fetch` (peticiones HTTP), `structuredClone` (copiar el árbol en `layout.ts`) y `node:test` (tests). |
| **TypeScript** | 7 | Tipado estático. Detecta en compilación errores como pasar un `nodeId` donde se esperaba un `fileKey`. `tsconfig.json` usa `strict: true` y módulos `NodeNext` (ESM). |
| **ESM** | — | El proyecto es `"type": "module"`. Por eso los imports llevan extensión `.js` aunque el archivo sea `.ts`: el código compilado vive en `dist/` como `.js`. |
| **tsx** | 4 | Ejecuta TypeScript directamente, sin compilar. Lo usan `npm test`, `npm run dev`, `npm run audit` y `npm run report`. |
| **npm** | — | Dependencias y scripts. |

### Scripts de `package.json`

| Script | Qué hace |
|---|---|
| `npm run build` | Compila `src/` a `dist/`. **Obligatorio** antes de usar el servidor desde el `.mcp.json` de desarrollo. |
| `npm run build:skill` | Compila y empaqueta con **esbuild** los programas autónomos del skill (`.claude/skills/a11y-audit/bin/`). |
| `npm test` | Ejecuta todos los `*.test.ts` con `node:test`. |
| `npm run dev` | Arranca el servidor MCP desde `src/`, sin compilar. |
| `npm run audit -- <enlace> [--level AAA] [--json]` | Auditoría desde la terminal. |
| `npm run report -- <revision.json> [--out carpeta]` | Informe HTML desde la terminal. |

Los scripts invocan las herramientas como `node node_modules/typescript/bin/tsc` o `node --import tsx`, nunca como `tsc` o `tsx` a secas. El motivo es que la carpeta del proyecto contiene `:` y eso rompe el `PATH` que npm construye para encontrar los binarios.

## 9.2 Librerías

| Librería | Para qué |
|---|---|
| **@modelcontextprotocol/sdk** | SDK oficial de MCP: `McpServer`, `registerTool` y el transporte stdio. Nos ahorra implementar el protocolo JSON-RPC a mano. |
| **zod** | Esquemas de validación. Se usa para los parámetros de las herramientas MCP y para la revisión del informe HTML. Un único esquema sirve para validar y para generar los tipos (`z.infer`). |

Y ninguna más en producción, a propósito: menos dependencias significa menos mantenimiento y menos superficie de seguridad. El HTML del informe tampoco usa frameworks ni CDNs, así que funciona sin conexión.

## 9.3 Servicios externos

| Servicio | Cómo lo usamos |
|---|---|
| **Figma REST API** (`api.figma.com/v1`) | `GET /files/:key/nodes` (árbol), `GET /files/:key?depth=2` (índice de páginas) y `GET /images/:key` (render PNG). Autenticación con token personal en la cabecera `X-Figma-Token`. Solo lectura. |
| **MCP oficial de Figma** (`mcp.figma.com/mcp`) | Capturas y contexto para la revisión semántica. Autenticación OAuth con tu cuenta, desde `/mcp`. |

## 9.4 Claude Code

| Pieza | Qué es |
|---|---|
| **Extensión de VS Code** | Donde escribes `/a11y-audit` y ves las respuestas. |
| **`.mcp.json`** | Qué servidores MCP arrancar en este proyecto. |
| **Skill** (`.claude/skills/a11y-audit/`) | El procedimiento de auditoría y sus programas. Se distribuye copiando la carpeta (ver capítulo 11). |
| **`CLAUDE.md`** | Reglas del proyecto que Claude sigue siempre. |
| **`/mcp`** | Comando para ver, conectar o reconectar servidores MCP. Úsalo tras cada `npm run build`. |

## 9.5 Herramientas usadas durante el desarrollo

No forman parte de la aplicación, pero nos sirvieron para construirla y verificarla, y te servirán a ti:

| Herramienta | Uso |
|---|---|
| **Chrome en modo headless** | Hacer capturas del informe HTML desde la terminal para revisar que las marcas caían en su sitio: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=salida.png --window-size=1280,1500 file:///ruta/informe.html` |
| **`get_metadata` del MCP oficial** | Contrastar las posiciones de la REST API. Así descubrimos las cajas desactualizadas. |
| **Scripts de Node puntuales** | Volcar las cajas de un frame antes y después de `normalizeAutoLayout` (ver [Tareas habituales](10-tareas-habituales.md)). |
| **`open` (macOS)** | Abrir el informe en el navegador por defecto: `open reports/<archivo>.html`. |

## 9.6 Control de versiones

En este momento la carpeta **no es un repositorio git**. Si se inicializa, `.gitignore` ya excluye `node_modules/`, `dist/`, `.env` y `reports/` (los informes pueden contener capturas de diseños confidenciales).

Siguiente: [Tareas habituales y glosario](10-tareas-habituales.md).
