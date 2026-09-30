# 1. Conceptos básicos

Antes de mirar código necesitas cuatro conceptos: **accesibilidad y WCAG**, **cómo está organizado un diseño de Figma**, **MCP** y **skills de Claude Code**.

---

## 1.1 Accesibilidad y WCAG

**Accesibilidad** es que un producto digital lo pueda usar cualquier persona: alguien con baja visión, con daltonismo, que navega con teclado, que usa un lector de pantalla (un programa que lee la interfaz en voz alta) o que simplemente está al sol con el móvil.

**WCAG** (Web Content Accessibility Guidelines) es la norma internacional que define qué significa "accesible". La versión que usamos es la **2.2**. Está organizada en **criterios** numerados, por ejemplo:

| Criterio | Nombre | Qué pide, en cristiano |
|---|---|---|
| 1.4.3 | Contraste mínimo | El texto tiene que destacar lo suficiente sobre su fondo |
| 1.4.11 | Contraste no textual | Los bordes de botones, campos, etc. también deben verse |
| 2.5.8 | Tamaño del objetivo | Lo que se pulsa debe medir al menos 24×24 px |
| 1.4.1 | Uso del color | No transmitir información *solo* con color (un error solo en rojo no basta) |
| 3.3.2 | Etiquetas | Cada campo de formulario tiene una etiqueta visible |
| 2.4.7 | Foco visible | Al navegar con teclado se ve dónde estás |
| 1.1.1 | Contenido no textual | Imágenes e iconos necesitan un texto alternativo |

Cada criterio tiene un **nivel**:

- **A**: lo mínimo imprescindible.
- **AA**: lo que exige la ley en la mayoría de los casos (en Europa, la Directiva de Accesibilidad). **Es nuestro nivel por defecto.**
- **AAA**: el más exigente; se usa como objetivo en algunos proyectos.

> Truco para recordar: cuando alguien dice "cumple WCAG", casi siempre quiere decir "cumple WCAG 2.2 nivel AA".

### ¿Por qué auditar en el diseño y no en el código?

Porque es **mucho más barato**. Un contraste insuficiente detectado en Figma se arregla cambiando un color. Detectado en producción, supone tocar código, volver a probar y desplegar. Además, muchos problemas (falta un estado de error, el texto se corta) son decisiones de diseño que el desarrollador no puede arreglar solo.

---

## 1.2 Cómo está organizado un diseño de Figma

Figma guarda cada diseño como un **árbol de nodos** (igual que el DOM de una web). Lo que en la interfaz de Figma ves como "capas", para nosotros son nodos.

```
Archivo (fileKey: EUgEwS34WUfASG4ENlT4Gh)
└── Página
    └── Frame "Eleccion registro MADRE"      ← una pantalla (node-id 1:141704)
        ├── Instancia "Registro-header"
        │   └── ... status bar, botón atrás, stepper
        ├── Instancia "slot-registro-eleccion"
        │   ├── Texto "Regístrate"
        │   ├── Instancia "ds-input"
        │   └── ...
        └── Instancia "Registrp-sticky-bar"
```

Términos que vas a ver continuamente:

| Término | Qué es |
|---|---|
| **Frame** | Un contenedor. Normalmente una pantalla completa es un frame. Es lo que auditamos. |
| **Nodo / capa** | Cualquier elemento del árbol: un texto, un rectángulo, un grupo, un frame… |
| **node-id** | El identificador único de un nodo. En la URL aparece como `1-141704`; en la API, como `1:141704`. |
| **Componente / instancia** | Un componente es una pieza reutilizable del sistema de diseño (un botón, un input). Cada vez que se usa, se crea una *instancia*. Los ids de nodos dentro de instancias son largos: `I1:141707;2034:19270;22354:13963`. |
| **Fill / stroke** | Relleno y borde de un nodo. Puede haber varios apilados. |
| **Auto-layout** | El sistema de Figma para colocar elementos automáticamente en fila o columna, con espaciado y padding (como `display: flex` en CSS). |
| **absoluteBoundingBox** | La caja (x, y, ancho, alto) de un nodo en coordenadas de la página. La usamos para todo: saber qué hay debajo de un texto, medir tamaños y dibujar las marcas del informe. |

### El enlace a un frame

El usuario copia el enlace con **clic derecho sobre el frame → Copy link to selection**. Tiene esta forma:

```
https://www.figma.com/design/EUgEwS34WUfASG4ENlT4Gh/Nombre-del-archivo?node-id=1-141704
                              └──── fileKey ────┘                           └ node-id ┘
```

Con esos dos datos le pedimos el frame a la API de Figma.

---

## 1.3 Qué es MCP

**MCP (Model Context Protocol)** es un protocolo estándar para que un modelo de IA como Claude pueda usar **herramientas externas**. Un **servidor MCP** es un programa que dice "tengo estas herramientas, con estos parámetros", y Claude las llama cuando las necesita.

Analogía: si Claude fuera un cocinero, cada servidor MCP sería un electrodoméstico con sus botones. Claude sabe qué hace cada botón porque el servidor se lo describe.

En este proyecto hay **dos** servidores MCP:

| Servidor | Quién lo hace | Qué aporta |
|---|---|---|
| `figma-a11y` | **Nosotros** (este repositorio) | Mide contrastes, tamaños y áreas táctiles, y genera el informe HTML |
| `figma` | Figma (oficial) | Da a Claude capturas y el contexto del diseño para la revisión "con criterio" |

Nuestro servidor se comunica con Claude Code por **stdio**: Claude Code arranca el programa (`node dist/server.js`) y le envía y recibe mensajes JSON por la entrada y salida estándar. El oficial de Figma es **remoto** (HTTP) y se autentica con tu cuenta de Figma.

---

## 1.4 Qué es un skill de Claude Code

Un **skill** es un archivo Markdown con **instrucciones** para Claude: un procedimiento paso a paso para una tarea concreta. El nuestro está en `.claude/skills/a11y-audit/SKILL.md` y se lanza escribiendo `/a11y-audit` en Claude Code.

Diferencia clave con un servidor MCP:

- El **servidor MCP** es **código**: hace cálculos exactos y repetibles.
- El **skill** es **un procedimiento en lenguaje natural**: le dice a Claude en qué orden usar las herramientas, qué revisar con criterio y cómo presentar el resultado.

El skill es el "director de orquesta" y los servidores MCP son los "músicos".

---

## Resumen

- Auditamos pantallas de **Figma** contra **WCAG 2.2 AA**.
- Un diseño es un **árbol de nodos** con cajas, rellenos y auto-layout.
- Exponemos nuestras herramientas a Claude mediante **MCP**.
- El **skill** `/a11y-audit` combina nuestras mediciones con la revisión visual de Claude.

Siguiente: [Arquitectura y flujo](02-arquitectura.md).
