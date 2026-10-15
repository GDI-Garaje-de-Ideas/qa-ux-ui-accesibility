# GDI - Club Nexo - Mahou (5S7ykdf8I7dyXiKIzreLAB)
Última actualización: 2026-10-05 · flujo auditado: Promociones ✅ 02/12/25 (8 pantallas representativas)

> Esta clasificación se fijó después de la auditoría del 2026-10-05, que se hizo sin criterio común. Las próximas auditorías de este archivo deben aplicarla.

- **Header**, botón atrás o cerrar ("Botón izquierda" / ds-button con ds-icon-arrow_back o ds-icon-close): **error** 4.1.2. Solo icono, sin nombre accesible. El motor no lo detecta por el nombre en español.
- **Header web (global-header-web)**, avatar ds-button y chevron ds-button-inverse sin nombre: **error** 4.1.2.
- **Header con imagen**, status-bar oscura (#282825) sobre la foto: **manual** 1.4.3, porque el fondo no se puede medir. Recomendación: variante clara o scrim.
- **Header**, "Selector" de local con chevron de 24×24 sin nombre ni estado expandido: **warning** 4.1.2. Nombre del local con ellipsis: **warning** 1.4.12.
- **ds-menu / _ds-menu-item** (pestañas Nuevas / Participando / Finalizadas), sin semántica tablist ni estado seleccionado: **warning** 4.1.2. Etiquetas con ellipsis: **warning** 1.4.12. La pestaña activa se distingue por relleno invertido, así que 1.4.1 se cumple.
- **ds-modal-header**, botón cerrar sin nombre: **error** 4.1.2. Título no anotado como encabezado: **warning** 1.3.1.
- **card-promociones-mensuales / _puntos-adquiridos**, puntos indicados solo con el icono de moneda y la cifra, o tachados cuando no se consiguen: **error** 1.1.1 / 1.3.1. Fix: texto "80 puntos" y "no conseguidos".
- **faldon promo** y bloque de marca, alto fijo con overflow-clip y el texto ya en dos líneas: **error** 1.4.4 / 1.4.12.
- **card-promos / ds-card**, "Participar" y "Ver detalle" repetidos sin contexto: **warning** 2.4.4. Variante de alto fijo de 314 px: **error** 1.4.12.
- **ds-tag**, tags tonales con ancho fijo que no cubre textos largos: **warning** 1.4.12. Pares tonales a 4,54:1: **warning** (justos). Tag sobre foto con relleno propio: cumple; no es incidencia.
- **ds-tag / _error-tag**, bloque vacío duplicado sobre el tag "Finalizada": **info**, por ser un override roto.
- **Footer web**, iconos mdi:spotify y mdi:linkedin sin nombre: **error** 1.1.1 / 2.4.4.
- **ds-button "volver arriba"** sin nombre: **error** 4.1.2.
- **ds-button / ds-link**, 40 px y 26 px de alto: **info** (AAA). Sin estados de foco: **warning** 2.4.7.
- **Token #79686A** sobre crema (#F3EDE5 o #F6EDE0, 4,51–4,53:1): **warning** (justo).
