# 7. Informe HTML (`src/report/`)

El informe HTML es lo que ve la persona de diseño: un único archivo que se abre con doble clic, con la captura de la pantalla, una marca numerada sobre cada problema y, para cada uno, qué pasa y cómo resolverlo.

| Archivo | Responsabilidad |
|---|---|
| `schema.ts` | Esquema (con **zod**) de la *revisión* que redacta Claude |
| `build.ts` | Orquesta: descarga, normaliza, audita, renderiza y escribe el archivo |
| `html.ts` | Función pura que convierte todo en HTML |
| `cli.ts` | Generar el informe desde la terminal a partir de un JSON |
| `html.test.ts` | Tests del renderizado |

---

## 7.1 Quién aporta qué

```
        Claude (skill)                              Nuestro código
 ┌──────────────────────────────┐        ┌───────────────────────────────────┐
 │ La REVISIÓN (criterio):      │        │ Las MEDICIONES (datos):           │
 │ - veredicto                  │        │ - árbol del frame (fetchNodes)    │
 │ - qué se confirma/descarta   │  ───►  │ - cajas corregidas (layout.ts)    │
 │ - "qué pasa" / "cómo         │        │ - findings (auditTree)            │
 │   resolverlo"                │        │ - captura PNG (fetchNodeImage)    │
 │ - nodeIds afectados          │        └───────────────────────────────────┘
 └──────────────────────────────┘                        │
                                                          ▼
                                                  renderHtmlReport
```

`build_html_report` **vuelve a descargar y medir** el frame en lugar de fiarse de lo que escriba Claude. Así ningún número del informe sale de un texto redactado a mano.

## 7.2 La revisión (`schema.ts`)

```ts
{
  url, level, verdict: "cumple" | "no-cumple" | "pendiente", verdictText, scopeNote?,
  issues: [{
    title, severity: "error" | "warning" | "info",
    status: "confirmado" | "descartado" | "manual",
    source: "medido" | "semantico", wcag,
    nodeIds: string[],   // capas a marcar en la captura
    rules?: string[],    // qué reglas del motor cubre (solo incidencias medidas)
    problem, fix         // "qué pasa" y "cómo resolverlo"
  }],
  semantic: [{ criterion, result, detail }],
  manualChecks: string[],
  recommendations: [{ priority: "bloquea" | "aviso" | "mejora", text }]
}
```

**¿Por qué zod?** Porque la misma definición sirve para tres cosas: validar la entrada de la herramienta MCP, validar el JSON de la CLI y generar los tipos TypeScript (`z.infer`). Además rellena los valores por defecto (`status: "confirmado"`, `nodeIds: []`…).

**¿Para qué sirve `rules`?** Una capa puede tener varios findings. Las barras del stepper tenían dos: tamaño táctil (falso positivo) y contraste (real). Con `rules: ["target-size"]` la incidencia descartada solo "se queda" con ese finding, y la tarjeta de contraste no mezcla el 78×4 px.

## 7.3 Qué hace `buildDisplayIssues`

Convierte la revisión en la lista que se pinta:

1. Para cada incidencia busca las **cajas** de sus `nodeIds` en el árbol y las recorta al frame.
   - Si una capa no existe → `missingNodeIds` (se avisa en la tarjeta).
   - Si queda fuera del área visible → `offscreenNodeIds` (se avisa en la tarjeta).
2. Le asocia los **findings** y **textos** medidos de esas capas, que se muestran como "Medición" con muestras de color.
3. Los findings del motor que **ninguna** incidencia cubre se añaden como **"sin revisar"**. Así un olvido de la revisión nunca hace desaparecer una medición.
4. Ordena: confirmadas → sin revisar → manuales → descartadas, y dentro de cada grupo por gravedad. Después numera.

## 7.4 Las capturas: un solo PNG, muchas vistas

La captura se incrusta **una vez** como variable CSS:

```css
:root { --shot: url("data:image/png;base64,…"); }
```

Tanto el mapa general como cada ampliación usan `background-image: var(--shot)`. Si la incrustáramos en cada tarjeta, un informe con 10 incidencias pesaría 10 veces más.

### Cómo se colocan las marcas

Todas las posiciones se expresan en **porcentajes** del frame, no en píxeles, y así funcionan a cualquier tamaño de pantalla:

```
left   = (x_capa − x_frame) / ancho_frame × 100 %
top    = (y_capa − y_frame) / alto_frame  × 100 %
width  = ancho_capa / ancho_frame × 100 %
height = alto_capa  / alto_frame  × 100 %
```

### Cómo se calcula la zona ampliada (`cropRegion`)

1. Unión de las cajas de la incidencia.
2. Margen alrededor: el 35 % del lado mayor, con un mínimo de 32 px, para dar contexto.
3. Tamaño mínimo de 240×140 px: una barra de 4 px de alto no puede convertirse en una franja ilegible.
4. Recorte a los límites del frame.

Para la ampliación se desplaza y escala la misma imagen de fondo dentro de un contenedor con `overflow: hidden`.

## 7.5 Otros detalles que conviene conocer

- **Seguridad**: todo texto que viene de Figma o de la revisión pasa por `esc()` antes de entrar en el HTML. Un diseñador podría llamar a una capa `<script>`. Los colores solo se insertan si cumplen `^#[0-9a-f]{3,8}$`.
- **Accesibilidad del propio informe** (¡un informe de accesibilidad tiene que ser accesible!): enlace "saltar a las incidencias", encabezados jerárquicos, `aria-label` en las capturas, foco visible, `aria-pressed` en los filtros, modo oscuro automático y `prefers-reduced-motion`.
- **Interacción**: filtros por tipo, clic en una marca para saltar a su tarjeta y resaltado mutuo al pasar el ratón. Todo con un poco de JavaScript sin dependencias.
- **Impresión**: al imprimir se ocultan los filtros y se despliegan los anexos.
- **Sin captura**: si Figma no puede renderizar el frame, el informe se genera igualmente con las marcas sobre un fondo gris, y `build` devuelve el motivo en `screenshotError`.

## 7.6 Generarlo a mano

```bash
npm run report -- revision.json            # con tsx, desde src/
node dist/report/cli.js revision.json      # desde el código compilado
```

La salida va a `reports/<AAAA-MM-DD>-<frame>-<node-id>.html` (`slug` quita acentos y símbolos). El node-id evita que dos frames con el mismo nombre se sobrescriban. Necesita `FIGMA_TOKEN` en el entorno.

Siguiente: [Servidor MCP y skill](08-servidor-mcp-y-skill.md).
