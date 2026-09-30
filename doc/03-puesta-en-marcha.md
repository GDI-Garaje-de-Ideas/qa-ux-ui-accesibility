# 3. Puesta en marcha

## 3.1 Requisitos

| Necesitas | Para qué | Cómo comprobarlo |
|---|---|---|
| **Node.js 20 o superior** | Ejecutar el servidor y los tests | `node --version` |
| **VS Code + extensión de Claude Code** | Lanzar `/a11y-audit` | Icono de Claude en la barra lateral |
| **Cuenta de Figma con acceso al archivo** | Leer los diseños | Poder abrir el archivo en el navegador |
| **Token personal de Figma** | Que nuestro servidor lea la API REST | Ver 3.3 |

## 3.2 Instalación

```bash
cd "/ruta/al/proyecto"
npm install        # descarga dependencias en node_modules/
npm run build      # compila TypeScript (src/) a JavaScript (dist/)
npm test           # comprueba que todo funciona
```

`npm run build` es obligatorio: Claude Code arranca el servidor desde `dist/server.js`, no desde `src/`. **Cada vez que cambies código del servidor, vuelve a compilar** y reconecta con `/mcp`.

## 3.3 El token de Figma

El token es una "contraseña de aplicación" que permite a nuestro servidor leer tus archivos de Figma.

1. En Figma: **Settings → Security → Personal access tokens → Generate new token**.
2. Permisos: solo **File content: Read**. No le des permisos de escritura; no los necesitamos.
3. Cópialo (empieza por `figd_`). Figma solo lo muestra una vez.

### Dónde guardarlo

**Nunca en el repositorio.** Ni en `.mcp.json` ni en ningún archivo versionado. Lo ponemos en el perfil de la shell, `~/.zshrc`:

```zsh
export FIGMA_TOKEN="figd_tu_token"
```

Qué hace cada parte:

| Parte | Significado |
|---|---|
| `export` | Convierte la variable en variable de **entorno**: la heredan los programas que arrancas (VS Code, Claude Code, nuestro servidor). |
| `FIGMA_TOKEN` | El nombre que busca el servidor (`resolveToken` en `src/figma/client.ts`). |
| `=` sin espacios | Con espacios alrededor, zsh da error. |
| `~/.zshrc` | Archivo oculto (empieza por punto) en tu carpeta personal. zsh lo ejecuta al abrir cada terminal. Para verlo en Finder: `Cmd+Shift+.` |

Después **cierra VS Code por completo con Cmd+Q** y vuelve a abrirlo. VS Code lee el entorno al arrancar; si solo cierras la ventana, no ve la variable nueva.

> Si un token acaba escrito por error en un archivo o en un chat, **revócalo** en Figma y genera otro.

## 3.4 El archivo `.mcp.json`

Le dice a Claude Code qué servidores MCP debe arrancar en este proyecto:

```json
{
  "mcpServers": {
    "figma": {
      "type": "http",
      "url": "https://mcp.figma.com/mcp"
    },
    "figma-a11y": {
      "type": "stdio",
      "command": "node",
      "args": ["${CLAUDE_PROJECT_DIR:-.}/dist/server.js"],
      "env": {
        "FIGMA_TOKEN": "${FIGMA_TOKEN}"
      }
    }
  }
}
```

- `figma`: el MCP oficial, remoto. La primera vez, ejecuta `/mcp` en Claude Code e inicia sesión con tu cuenta de Figma.
- `figma-a11y`: el nuestro. `type: "stdio"` significa que Claude Code lanza el proceso `node .../dist/server.js` y se comunica con él por entrada y salida estándar.
- `${CLAUDE_PROJECT_DIR:-.}`: "usa la variable `CLAUDE_PROJECT_DIR` y, si no existe, `.`". Claude Code arranca el servidor desde la carpeta del proyecto, así que `.` ya funciona. **No hace falta definir `CLAUDE_PROJECT_DIR` en tu `~/.zshrc`**; si lo haces, afectará a todos tus proyectos.
- `"FIGMA_TOKEN": "${FIGMA_TOKEN}"`: pasa al servidor el token de tu entorno sin escribirlo en el archivo.

## 3.5 Comprobar que todo está conectado

En Claude Code, escribe `/mcp`. Deberías ver `figma` y `figma-a11y` como **connected**. Después lanza `/a11y-audit` y pega un enlace de un frame.

Prueba rápida sin Claude, desde la terminal:

```bash
npm run audit -- "https://www.figma.com/design/<fileKey>/x?node-id=1-2"
```

## 3.6 Problemas conocidos y soluciones

| Síntoma | Causa | Solución |
|---|---|---|
| `figma-a11y` sale como **failed / Connection closed** | La ruta de `args` en `.mcp.json` es incorrecta (nos pasó con una `}` de más) o falta `dist/` | Revisa la ruta y ejecuta `npm run build` |
| El servidor conecta, pero la auditoría dice **"Falta el token de Figma"** | VS Code no ha heredado `FIGMA_TOKEN` | Comprueba `~/.zshrc` y reinicia VS Code con **Cmd+Q** |
| **Figma API 403** | Token inválido, revocado o sin acceso a ese archivo | Genera otro token y comprueba que puedes abrir el archivo |
| **Figma API 404** | El node-id no existe en ese archivo | Vuelve a copiar el enlace con *Copy link to selection* |
| **Figma API 429** | Demasiadas peticiones seguidas | Espera un minuto; audita pantalla a pantalla |
| `npx tsc` o `tsx` fallan con "command not found" o rutas raras | La carpeta del proyecto contiene `:` (`Proyecto UX:UI IA`) y los dos puntos rompen el `PATH` que usa npm para los binarios | Los scripts de `package.json` ya invocan las herramientas con `node node_modules/...` o `node --import tsx`. Haz tú lo mismo y no las llames por su nombre |
| Al abrir la terminal sale `export: not valid in this context` | Una línea mal escrita en `~/.zshrc` | Ábrelo con `open -e ~/.zshrc` y corrige o borra la línea |

Siguiente: [Módulo Figma](04-modulo-figma.md).
