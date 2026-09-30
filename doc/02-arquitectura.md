# 2. Arquitectura y flujo

## 2.1 Las piezas

```
                        ┌──────────────────────────────┐
   Usuario  ──/a11y-audit──►   Claude Code (VS Code)   │
                        │   sigue SKILL.md              │
                        └───────┬──────────────┬───────┘
                                │ MCP (stdio)  │ MCP (HTTP)
                                ▼              ▼
              ┌─────────────────────────┐   ┌──────────────────────────┐
              │ figma-a11y (este repo)  │   │ figma (MCP oficial)      │
              │ - audit_figma_node      │   │ - get_screenshot         │
              │ - check_contrast        │   │ - get_design_context     │
              │ - list_a11y_rules       │   │ - get_metadata           │
              │ - build_html_report     │   │ - get_variable_defs      │
              └───────────┬─────────────┘   └────────────┬─────────────┘
                          │ REST API (token personal)    │ OAuth
                          ▼                              ▼
                    ┌────────────────────────────────────────┐
                    │                 Figma                  │
                    └────────────────────────────────────────┘
                          │
                          ▼
                    reports/AAAA-MM-DD-<frame>.html   (o .md)
```

Por qué hay **dos** servidores y no uno:

- La **REST API** de Figma devuelve el diseño como JSON crudo: colores exactos, cajas, opacidades, estilos de texto. Es perfecta para **medir**, y es lo que usa nuestro servidor.
- El **MCP oficial** de Figma da a Claude una **captura** y una descripción legible del diseño. Es perfecto para **razonar**: ver que un botón solo tiene un icono o que falta un estado de error.

Juntos cubren lo medible y lo semántico. A esta combinación la llamamos **diseño híbrido**.

## 2.2 Recorrido completo de una auditoría

Esto es lo que ocurre cuando alguien escribe `/a11y-audit`:

```
0. Parámetros
   Claude pide el enlace de Figma y pregunta nivel (AA/AAA), alcance
   (completa / solo medible) y formato del informe (HTML / Markdown / chat).

1. Análisis determinista  ── servidor figma-a11y ──────────────────────────
   audit_figma_node(url, level)
     ├─ parseFigmaUrl      → fileKey + nodeId               (src/figma/url.ts)
     ├─ fetchNodes         → árbol JSON del frame           (src/figma/client.ts)
     ├─ normalizeAutoLayout→ corrige cajas desactualizadas  (src/figma/layout.ts)
     └─ auditTree          → findings + inventarios         (src/rules/engine.ts)

2. Análisis semántico  ── MCP oficial de Figma ─────────────────────────────
   get_screenshot, get_design_context, get_metadata, get_variable_defs
   Claude revisa uso del color, etiquetas, foco, textos truncados…
   y descarta falsos positivos del paso 1.

3. Informe
   build_html_report(review)
     ├─ vuelve a descargar el frame y a ejecutar las reglas
     ├─ fetchNodeImage     → render PNG del frame
     └─ renderHtmlReport   → HTML con capturas marcadas     (src/report/html.ts)
   Claude resume en el chat las 3-5 incidencias más graves.
```

## 2.3 El caso real que usamos de ejemplo

Durante el desarrollo auditamos el frame **"Eleccion registro MADRE"** del archivo *GDI – Loggin Validacion Registro – Mahou*: una pantalla móvil de registro con cabecera, stepper de progreso, botones de redes sociales, dos checkboxes y el botón "Siguiente". Lo usaremos de ejemplo en toda la documentación porque ilustra muy bien los matices:

- El motor detectó **4 errores de tamaño táctil** en las barras del stepper. Eran **falsos positivos**: las barras se llaman "Fondo stepper" y la palabra *stepper* las clasifica como interactivas, pero en la captura se ve que son un indicador de progreso. Claude las descartó.
- El motor **no** detectó el botón "atrás" como interactivo (se llama "Botón izquierda"), pero la revisión semántica encontró que **no tiene nombre accesible**.
- La API devolvió **posiciones desactualizadas** dentro de una instancia, lo que desplazaba las marcas del informe y provocaba un aviso de contraste falso. De ahí nació la corrección de auto-layout (ver [Módulo Figma](04-modulo-figma.md)).

## 2.4 Principios de diseño del código

| Principio | Dónde se nota |
|---|---|
| **No inventar números** | Ante una imagen, un degradado o una cobertura parcial, se emite `background-uncertain` en vez de un contraste. El informe HTML mide por su cuenta y no se fía del texto de la revisión. |
| **Funciones puras para la lógica** | `auditTree`, `renderHtmlReport` y `normalizeAutoLayout` no hacen peticiones de red ni escriben en disco. Se prueban con árboles sintéticos. |
| **Un único punto con red** | Solo `src/figma/client.ts` habla con Figma. Así los errores HTTP se tratan en un sitio. |
| **Mismo comportamiento en servidor y CLI** | Los dos llaman a `auditFromUrl` (`src/audit.ts`). |
| **Errores accionables** | Los mensajes dicen qué hacer ("Define FIGMA_TOKEN…", "Token inválido o sin permiso…"), no solo qué falló. |
| **Solo lectura** | Todas las peticiones a Figma son `GET`. |

## 2.5 Qué NO hace la aplicación

- No modifica el diseño de Figma.
- No audita código ni webs en producción.
- No sustituye una prueba con usuarios ni con lector de pantalla: lo que depende del comportamiento (orden de foco, anuncios) queda en "comprobaciones manuales".
- No evalúa prototipos ni animaciones.

Siguiente: [Puesta en marcha](03-puesta-en-marcha.md).
