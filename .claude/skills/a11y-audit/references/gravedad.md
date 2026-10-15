# Criterio de gravedad (obligatorio en todas las auditorías)

Aplica este criterio igual en todas las pantallas para que los veredictos sean comparables entre sí. Si dudas entre dos niveles, elige el que diga esta tabla, no tu impresión.

## Niveles

### error (status `confirmado`): incumplimiento verificable en el diseño
- Contraste medido por debajo del umbral: texto con 4,5:1 o 3:1 si es grande; componentes y gráficos con 3:1.
- Objetivo menor de 24×24 px sin espaciado que lo compense (2.5.8).
- Control solo-icono sin nombre accesible ni anotación (4.1.2 / 1.1.1).
- Información transmitida solo por color (1.4.1).
- Campo de formulario sin etiqueta visible persistente; un placeholder no basta (3.3.2).
- Error de formulario indicado solo con color o sin texto (3.3.1).
- Indicador de progreso o estado cuyo significado depende de un gráfico por debajo de 3:1 y sin texto alternativo (1.4.11).
- Contenido que se pierde con seguridad al ampliar el texto: alto fijo con overflow recortado y el texto ya al límite (1.4.4 / 1.4.12).

### warning (status `confirmado`): riesgo probable o carencia de diseño
- Estados de foco, hover, disabled o error no diseñados (2.4.7).
- Truncado con ellipsis o nowrap (1.4.12 / 1.4.10).
- Botones o enlaces repetidos con texto genérico ("Ver detalle", "Info", "Participar") (2.4.4 / 2.4.6).
- Obligatoriedad de campos no indicada (3.3.2).
- Contrastes justos al límite (menos de 4,6:1) en tokens del sistema.
- Falta la jerarquía de encabezados, los landmarks o la anotación de diálogo (1.3.1).
- Desplegables, pestañas o grupos de opciones sin rol ni estado anotado (4.1.2).
- Importes, totales o datos incoherentes en pasos de compra (3.3.4).

### info (status `confirmado`)
- Mejoras AAA, como objetivos entre 24 y 44 px.
- Buenas prácticas.
- Imágenes decorativas por anotar.
- Erratas.
- Nombres de capas o frames que no corresponden al contenido.

### manual (status `manual`)
- Lo que depende de la implementación: orden de foco, anuncios a lectores de pantalla (4.1.3), gestión del foco en modales, autocompletado (1.3.5), tiempo ajustable (2.2.1).
- Fondos que no se pueden medir de verdad: texto directamente sobre una foto o un degradado (`background-uncertain` real).

### descartado (status `descartado`)
- Falsos positivos del motor. Explica siempre por qué. Los habituales:
  - Un contenedor grande marcado como objetivo táctil porque su nombre contiene "stepper", "link", "tab"…
  - El borde de un botón de icono, cuando el icono ya identifica el control.
  - Controles deshabilitados de bajo contraste. WCAG los exime; recomienda aria-disabled.
  - Estilos mixtos de texto donde todos los fragmentos tienen el mismo color.

## Veredicto de la pantalla
- `no-cumple`: al menos un error confirmado.
- `pendiente`: sin errores, pero con avisos o comprobaciones manuales.
- `cumple`: sin errores, avisos ni manuales. Pueden quedar notas.

## Componentes ya conocidos
Si existe `.a11y-audit/componentes/<fileKey>.md` en el proyecto para el archivo de Figma, su clasificación **manda sobre esta tabla**. Así el mismo componente tiene la misma gravedad en todas las pantallas.
