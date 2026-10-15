# 10. Tareas habituales y glosario

## 10.1 Lanzar una auditoría

1. En Figma: clic derecho sobre el frame → **Copy link to selection**.
2. En Claude Code: `/a11y-audit`, pega el enlace y responde a las tres preguntas.
3. Abre el informe: `open reports/<fecha>-<frame>.html`.

## 10.2 Añadir una regla nueva

Ejemplo: avisar de textos con `letterSpacing` negativo.

1. **Tipo**: si necesitas un campo nuevo de Figma, añádelo como opcional en `src/figma/types.ts` (por ejemplo, `letterSpacing?: number` en `FigmaTypeStyle`).
2. **Catálogo**: añade una entrada a `RULES` en `src/rules/engine.ts`:
   ```ts
   { id: "letter-spacing", wcag: "1.4.12 Text Spacing (buena práctica)", level: "best-practice", description: "…" },
   ```
3. **Lógica**: dentro de `checkText` (o en una función nueva llamada desde `walk`), empuja un finding:
   ```ts
   ctx.findings.push({ ...b, rule: "letter-spacing", wcag: "…", level: "best-practice", severity: "warning",
     message: "…", details: { letterSpacing }, suggestion: "…" });
   ```
4. **Test**: en `src/rules/engine.test.ts`, crea un árbol mínimo con un texto que falle y otro que pase, y comprueba el resultado. Fíjate en los helpers `text()`, `solid()` y `run()` del principio del archivo.
5. **Documenta**: `README.md`, `SKILL.md` (si Claude debe revisar algo relacionado) y el capítulo 6 de esta carpeta.
6. `npm test` → `npm run build:skill` (y `npm run build` si usas el servidor MCP de desarrollo).
7. Si la regla afecta al informe, añade su nombre legible en `RULE_LABEL` (`src/report/html.ts`).

## 10.3 Depurar un frame que da resultados raros

**Ver el JSON completo de la auditoría:**

```bash
npm run audit -- "<enlace>" --json > /tmp/audit.json
```

**Ver las cajas que devuelve Figma y cómo quedan tras normalizar** (necesita `FIGMA_TOKEN`):

```bash
node --import tsx --input-type=module -e '
import { fetchNodes, resolveToken } from "./src/figma/client.ts";
import { normalizeAutoLayout } from "./src/figma/layout.ts";
const { nodes } = await fetchNodes("<fileKey>", ["<nodeId con :>"], resolveToken());
const a = nodes[0], b = normalizeAutoLayout(a), f = a.absoluteBoundingBox;
const flat = (n, o = []) => (o.push(n), (n.children ?? []).forEach(c => flat(c, o)), o);
const A = flat(a), B = flat(b);
A.forEach((n, i) => { const p = n.absoluteBoundingBox, q = B[i].absoluteBoundingBox;
  if (p && q && (p.x !== q.x || p.y !== q.y)) console.log(n.name, p.y - f.y, "→", q.y - f.y); });'
```

**Compara con el MCP oficial**: pide a Claude `get_metadata` del mismo nodo. Si sus posiciones no coinciden con las de la REST API, es otro caso de cajas desactualizadas.

**Checklist de sospechosos habituales:**

| Síntoma | Mira |
|---|---|
| Un control no aparece en el inventario de interactivos | Su nombre no encaja con `INTERACTIVE_RE` (¿está en español?) |
| Aparece como interactivo algo que no lo es | Su nombre contiene *link*, *tab*, *stepper*… → falso positivo |
| `background-uncertain` en un texto sobre fondo liso | Cajas desactualizadas, o una forma no rectangular debajo |
| Nota "se ha asumido lienzo blanco" | El frame no tiene relleno propio; el fondo real puede ser otro |

## 10.4 Generar un informe HTML sin Claude

1. Escribe un `revision.json` con el formato del [capítulo 7](07-informe-html.md#72-la-revisión-schemats).
2. `npm run report -- revision.json`.

## 10.5 Antes de dar un cambio por terminado

- [ ] `npm test` en verde.
- [ ] `npm run build:skill` sin errores (con `bin/` regenerado).
- [ ] Si tocaste una regla: caso nuevo en `engine.test.ts`, y `RULES`, README y SKILL.md sincronizados.
- [ ] Si tocaste posiciones o geometría: usas el árbol normalizado.
- [ ] Si tocaste el HTML: todo texto externo pasa por `esc()`, y lo has revisado en el navegador (claro y oscuro).
- [ ] Ningún token en el código ni en los ejemplos.
- [ ] Reconectado con `/mcp` y probado con un frame real.

---

## Glosario

| Término | Significado |
|---|---|
| **AA / AAA** | Niveles de conformidad de WCAG. AA es el habitual y el exigido por ley. |
| **absoluteBoundingBox** | Caja de un nodo (x, y, ancho, alto) en coordenadas de la página de Figma. |
| **Auto-layout** | Sistema de Figma para colocar elementos en fila o columna automáticamente (como flexbox). |
| **background-uncertain** | Resultado que indica que el contraste no se puede medir con certeza y hay que comprobarlo a mano. |
| **Criterio (WCAG)** | Cada requisito numerado de la norma, por ejemplo 1.4.3. |
| **Determinista** | Que da siempre el mismo resultado para la misma entrada. Nuestras mediciones lo son; la revisión de Claude no. |
| **Falso positivo** | Algo marcado como problema que no lo es (las barras del stepper). |
| **Falso negativo** | Un problema que la herramienta no detecta (el botón "Botón izquierda"). |
| **Fill / stroke** | Relleno / borde de un nodo. |
| **Finding** | Un hallazgo del motor, con regla, capa, medición y sugerencia. |
| **Frame** | Contenedor de Figma; normalmente una pantalla. |
| **Handoff** | Paso del diseño a desarrollo. |
| **Hug / Fill / Fixed** | Cómo se dimensiona un elemento en auto-layout: ajustado al contenido, ocupando el espacio del padre, o fijo. |
| **Instancia** | Uso concreto de un componente del sistema de diseño. |
| **Lector de pantalla** | Software que lee la interfaz en voz alta (VoiceOver, NVDA, TalkBack). |
| **Luminancia relativa** | Brillo percibido de un color, de 0 a 1. |
| **MCP** | Model Context Protocol: estándar para dar herramientas a un modelo de IA. |
| **node-id** | Identificador de un nodo de Figma (`1-141704` en la URL, `1:141704` en la API). |
| **Nombre accesible** | Lo que un lector de pantalla anuncia para un control ("Volver, botón"). |
| **Orden de pintado** | Orden en que Figma dibuja las capas; lo pintado antes queda debajo. |
| **Override** | Cambio aplicado a una instancia respecto a su componente (ocultar una capa, cambiar un texto). |
| **Revisión semántica** | Análisis con criterio que hace Claude sobre la captura (lo no medible). |
| **Skill** | Procedimiento en Markdown que Claude sigue para una tarea (`/a11y-audit`). |
| **stdio** | Entrada y salida estándar de un proceso; así se comunican Claude Code y nuestro servidor. |
| **Token (Figma)** | Credencial personal para usar la API. Solo lectura, y nunca en el repositorio. |
| **Token (diseño)** | Variable del sistema de diseño, por ejemplo `core-light/color/action/primary/bg/default`. |
| **WCAG** | Web Content Accessibility Guidelines, la norma de accesibilidad. Usamos la 2.2. |
| **zod** | Librería para definir y validar esquemas de datos en TypeScript. |
