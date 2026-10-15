# figma-a11y-mcp

Servidor MCP (TypeScript, ESM, Node 20+) que audita accesibilidad WCAG 2.2 en nodos de Figma, más el skill `/a11y-audit` que combina sus reglas deterministas con el MCP oficial de Figma para la revisión semántica. Se distribuye copiando la carpeta `.claude/skills/a11y-audit/` a otros proyectos (ver `doc/11-distribuir-skill.md`).

- `npm run build` antes de probar el servidor desde `.mcp.json` (apunta a `dist/server.js`).
- `npm run build:skill` después de cambiar `src/`: regenera los ejecutables autónomos de `.claude/skills/a11y-audit/bin/`, que se versionan porque son lo que se distribuye. El servidor MCP no se empaqueta: el skill usa los programas de terminal.
- El skill vive en `.claude/skills/a11y-audit/` y debe ser autocontenido. Usa siempre `${CLAUDE_SKILL_DIR}` para sus rutas, nunca rutas de este repositorio: tiene que funcionar instalado en cualquier proyecto.
- `npm test` ejecuta los tests con `node:test` a través de `tsx`. Los tests de reglas usan árboles sintéticos en `src/rules/engine.test.ts`; añade un caso ahí cuando cambies una regla.
- Las reglas viven en `src/rules/engine.ts` y se documentan en la constante `RULES`. Mantén sincronizados `RULES`, el README y `.claude/skills/a11y-audit/SKILL.md` al añadir una regla.
- El fondo de un texto se resuelve en `src/rules/background.ts` siguiendo el orden de pintado de Figma. Ante imagen, degradado o cobertura parcial se emite `background-uncertain`, nunca un número inventado.
- Las cajas de la API se normalizan con `normalizeAutoLayout` (`src/figma/layout.ts`) antes de auditar, porque pueden llegar desactualizadas dentro de instancias. Usa el árbol normalizado en cualquier código nuevo que dependa de posiciones.
- El informe HTML vive en `src/report/`: `schema.ts` define la revisión que escribe el skill y `html.ts` la renderiza como función pura (tests en `html.test.ts`). Las mediciones del informe salen siempre del motor, nunca de la revisión.
- No guardes tokens de Figma en el repo. El token viene de `FIGMA_TOKEN` o de `~/.config/figma-a11y/token`, que guarda `bin/configurar.mjs` (`src/configure-cli.ts`). El skill nunca debe pedir el token por el chat.
- Preguntar si se han definido las variables de entorno que son necesarias para su ejecución.
