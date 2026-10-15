# figma-a11y-mcp

Servidor MCP (TypeScript, ESM, Node 20+) que audita accesibilidad WCAG 2.2 en nodos de Figma, más el skill `/a11y-audit` que combina sus reglas deterministas con el MCP oficial de Figma para la revisión semántica.

- `npm run build` antes de probar el servidor desde `.mcp.json` (apunta a `dist/server.js`).
- `npm test` ejecuta los tests con `node:test` a través de `tsx`. Los tests de reglas usan árboles sintéticos en `src/rules/engine.test.ts`; añade un caso ahí cuando cambies una regla.
- Las reglas viven en `src/rules/engine.ts` y se documentan en la constante `RULES`. Mantén sincronizados `RULES`, el README y el SKILL.md al añadir una regla.
- El fondo de un texto se resuelve en `src/rules/background.ts` siguiendo el orden de pintado de Figma. Ante imagen, degradado o cobertura parcial se emite `background-uncertain`, nunca un número inventado.
- Las cajas de la API se normalizan con `normalizeAutoLayout` (`src/figma/layout.ts`) antes de auditar, porque pueden llegar desactualizadas dentro de instancias. Usa el árbol normalizado en cualquier código nuevo que dependa de posiciones.
- El informe HTML vive en `src/report/`: `schema.ts` define la revisión que escribe el skill y `html.ts` la renderiza como función pura (tests en `html.test.ts`). Las mediciones del informe salen siempre del motor, nunca de la revisión.
- No guardes tokens de Figma en el repo; `FIGMA_TOKEN` viene del entorno.
- Preguntar si se han definido las variables de entorno que son necesarias para su ejecución.
