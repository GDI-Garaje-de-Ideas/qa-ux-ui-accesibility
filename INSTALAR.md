# Instalar y usar el skill /a11y-audit

Con este skill, Claude revisa la accesibilidad (WCAG 2.2) de tus diseños de Figma y te entrega informes HTML con capturas. Puedes auditar una pantalla o un flujo completo de una página. Cada informe marca dónde están los problemas, explica qué pasa y cómo resolverlo, e indica qué pantallas son accesibles.

## Lo que necesitas

| | Cómo comprobarlo |
|---|---|
| **Claude Code**: extensión de VS Code, app de escritorio o terminal | Puedes escribir `/` y ver comandos |
| **Node.js 20 o superior** | `node --version` en una terminal. Si no lo tienes, instálalo desde nodejs.org |
| **Acceso de lectura** al archivo de Figma que quieres revisar | Puedes abrirlo en el navegador |

No hace falta compilar nada ni saber programar.

## 1. Copia la carpeta del skill

Copia la carpeta **completa** `a11y-audit` (incluida `bin/`) dentro de `.claude/skills/` de tu proyecto:

```
<tu-proyecto>/
└── .claude/
    └── skills/
        └── a11y-audit/
            ├── SKILL.md
            ├── bin/          ← el programa que mide (no la borres)
            ├── references/
            ├── componentes/
            └── scripts/
```

Desde la terminal:

```bash
mkdir -p <tu-proyecto>/.claude/skills
cp -R <ruta-de-origen>/.claude/skills/a11y-audit <tu-proyecto>/.claude/skills/
```

> La carpeta `.claude` está **oculta** porque su nombre empieza por punto. En Finder se ve con `Cmd + Shift + .`; en VS Code se ve siempre.

## 2. Ejecútalo

Abre Claude Code **en tu proyecto**, escribe `/a11y-audit` y sigue las indicaciones.

### La primera vez

Antes de pedirte el enlace, el skill comprueba tu entorno y solo te pide lo que falte:

| Comprobación | Qué hace si falta |
|---|---|
| **Node.js** | Te dice cómo instalarlo |
| **Token de Figma** | Te pregunta si tienes definida la variable `FIGMA_TOKEN`. Si no, te da un comando para ejecutar **en la terminal de VS Code** (Ctrl+`): te pide el token **sin mostrarlo**, lo valida con Figma y lo guarda en tu ordenador (`~/.config/figma-a11y/token`, solo legible por tu usuario) |
| **MCP oficial de Figma** | Se ofrece a añadirlo al `.mcp.json` de tu proyecto. Después tendrás que reiniciar Claude Code y escribir `/mcp` para aprobarlo e iniciar sesión con tu cuenta de Figma. Mientras tanto puede hacer la parte medible de la auditoría |
| **`reports/` en `.gitignore`** | Se ofrece a añadirlo, porque los informes contienen capturas de los diseños |

**Nunca pegues el token en el chat**: quedaría en el historial de la conversación.

El token se crea en Figma, en **Settings → Security → Personal access tokens → Generate new token**, con solo el permiso **File content: Read**. El skill nunca modifica tus diseños.

Las siguientes veces irá directamente a pedirte el enlace.

### Una auditoría

1. En Figma, haz clic derecho sobre un **frame** (una pantalla) o sobre una **página** → **Copy link to selection**.
2. Pega el enlace cuando `/a11y-audit` te lo pida.
3. Claude te preguntará lo necesario:
   - Si es una **página**: qué **flujo** (sección) quieres analizar y qué pantallas de ese flujo.
   - **Nivel**: AA (lo habitual) o AAA.
   - **Alcance**: completa (lo recomendado) o solo lo que se puede medir.

Al terminar tendrás, en la carpeta `reports/` de tu proyecto:
- **Un informe HTML por pantalla**, con la captura marcada, las mediciones, qué pasa y cómo resolverlo.
- **En un flujo, además, un índice**: cuántas pantallas son accesibles, el veredicto de cada una y los problemas de componentes compartidos, que conviene arreglar una vez en la librería.

Los archivos HTML se abren con doble clic y funcionan sin conexión.

> Un flujo grande (20 pantallas o más) tarda varios minutos porque se audita por tandas. Claude te irá informando de cada pantalla.

## Qué subir a git en tu proyecto

| Sí | No |
|---|---|
| `.claude/skills/a11y-audit/` (incluida `bin/`) | `reports/`: contiene capturas de los diseños |
| `.mcp.json`: no contiene secretos | Ningún token |
| `.a11y-audit/`: lo que el skill aprende de cada archivo de Figma, para que todo el equipo clasifique igual | |

## Actualizar el skill

Vuelve a copiar la carpeta `a11y-audit` encima de la anterior. Lo aprendido no se pierde, porque está en `.a11y-audit/` de tu proyecto y no dentro del skill.

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| No aparece `/a11y-audit` | Comprueba que la carpeta está en `<tu-proyecto>/.claude/skills/a11y-audit/`, con `SKILL.md` dentro, y que has abierto Claude Code en ese proyecto |
| "Falta el token de Figma" o "Token inválido" | Vuelve a ejecutar `/a11y-audit`: te guiará. Para comprobarlo tú: `node .claude/skills/a11y-audit/bin/configurar.mjs --estado` |
| Tengo `FIGMA_TOKEN` en `~/.zshrc` pero dice que falta | Claude Code se abrió antes de definirla: ciérralo por completo (Cmd+Q) y ábrelo de nuevo |
| "Figma API 403" | El token no tiene acceso a ese archivo. Comprueba que puedes abrirlo en Figma |
| "Figma API 404" | El enlace no apunta a un nodo existente. Vuelve a copiarlo con *Copy link to selection* |
| "Figma API 429" | Demasiadas peticiones. Espera un minuto y vuelve a intentarlo |
| La auditoría no incluye la revisión semántica | Falta el MCP oficial de Figma o la sesión: `/mcp` → figma → iniciar sesión |
