# GOfit - Bloque 1 - Alta de usuario (SqkBUHnza4Hbp7HtLJZdpC)
Última actualización: 2026-10-09 · flujo auditado: ✅ Web / V2 (25 pantallas)

- **Stepper**, botones atrás y cerrar (instancias "checkbox / plus_minus" con chevron_left / close_small): **error** 4.1.2. Solo icono, sin nombre accesible. Fix: un componente "Icon button" con aria-label ("Volver", "Salir del alta").
- **Stepper**, contenedor de 1680×40 marcado como target-size por el motor: **descartado**. Los objetivos reales son sus botones.
- **Stepper**, segmentos inactivos `Navegación / Items / Progress` #EBEBEB a 1,19:1, sin texto "Paso X de Y": **error** 1.4.11. Fix: texto de paso (o role=progressbar), o una pista de 3:1 o más.
- **Modal / Header**, botón cerrar (misma instancia "checkbox / plus_minus"): **error** 4.1.2. Fix: aria-label "Cerrar".
- **Modal / Header**, borde #EBEBEB del botón cerrar a 1,19:1: **descartado**, porque la X #1A1A1A identifica el control.
- **Modal / Default**, título no anotado como encabezado ni nombre del diálogo, y ancho fijo de 538 px sin variante a 320 px: **warning** 1.3.1 / 1.4.10.
- **Input / Input_field**, relleno #FAF7FA sin borde (1,06:1): **error** 1.4.11. Fix: borde de 3:1 o más (p. ej. #707070).
- **Input / Input_field**, placeholder como única etiqueta: **error** 3.3.2.
- **Input / OTP**, borde #EBEBEB a 1,19:1: **error** 1.4.11.
- **Quantity Selector**, botones + y − (instancias "checkbox / plus_minus" S, 24×24) sin nombre: **error** 4.1.2. Su borde #EBEBEB es **descartado**.
- **Token text/tertiary #878787** en texto (3,59:1 sobre blanco): **error** 1.4.3. Fix: subir a 4,5:1 o más (p. ej. #707070, 4,95:1).
- **Token brand/primary #FB4652** en texto normal (3,44:1): **error** 1.4.3.
- **Email / Social media**, iconos-enlace sin alt: **error** 1.1.1 / 2.4.4.
- **Toast**, botón cerrar close_small sin nombre: **error** 4.1.2.
- **Modal / Resume / Total cart**, desplegable "Total" con chevron sin rol ni aria-expanded: **warning** 4.1.2. Total sin periodicidad o que no cuadra con el resumen: **warning** 3.3.4.
- **Selection Card / Radio / M**, sin anotar como radiogroup y con el botón "Info" anidado y genérico: **warning** 1.3.1 / 4.1.2 / 2.4.4.
- **Header proceso / Dropdown / Language Selector**, 59×26 px: **info** (AAA). "ES" sin nombre completo: **warning**.
- **Button / Button** y **Button / Store**, sin estados de foco ni hover y con etiqueta nowrap: **warning** 2.4.7 / 1.4.12.
- **text/secondary #707070** sobre blanco (4,95:1) y sobre #FAF7FA (4,66:1): cumple. No es incidencia.
- Controles deshabilitados de bajo contraste (p. ej. "Aplicar", "Reenviar código"): **descartado**. Recomienda aria-disabled.
