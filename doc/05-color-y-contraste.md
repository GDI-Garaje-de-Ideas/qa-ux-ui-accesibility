# 5. Color y contraste (`src/color/contrast.ts`)

Todo el cálculo de contraste del proyecto sale de este archivo. Son fórmulas definidas por WCAG, así que **no se "ajustan"**: se implementan tal cual.

## 5.1 Cómo guarda Figma los colores

Figma da los colores con canales de **0 a 1**, no de 0 a 255:

```json
{ "r": 0.1569, "g": 0.1569, "b": 0.1451, "a": 1 }   // = #282825
```

Nuestro código trabaja en ese formato (`RGB` y `RGBA`). Para mostrarlos usamos `toHex` y para leer colores escritos a mano, `parseHex` (acepta `#RGB`, `#RRGGBB` y `#RRGGBBAA`).

## 5.2 Del color al contraste en tres pasos

### Paso 1: linealizar cada canal

Los colores de pantalla están "comprimidos" con una curva gamma. Para medir la luz real hay que deshacerla (`channelToLinear`):

```
c ≤ 0.04045  →  c / 12.92
c > 0.04045  →  ((c + 0.055) / 1.055) ^ 2.4
```

### Paso 2: luminancia relativa

Es el brillo percibido, de 0 (negro) a 1 (blanco). El ojo es mucho más sensible al verde (`relativeLuminance`):

```
L = 0.2126·R + 0.7152·G + 0.0722·B      (con R, G y B ya linealizados)
```

### Paso 3: ratio de contraste

```
ratio = (L_clara + 0.05) / (L_oscura + 0.05)
```

Va de **1:1** (mismo color) a **21:1** (negro sobre blanco). `contrastRatio` ordena las luminancias internamente, así que da igual el orden de los argumentos.

### Ejemplo trabajado: la pista del stepper (#ECECEC sobre blanco)

```
236 / 255 = 0.9255
linealizado: ((0.9255 + 0.055) / 1.055) ^ 2.4 = 0.8388
luminancia (canales iguales): L = 0.8388      blanco: L = 1
ratio = (1 + 0.05) / (0.8388 + 0.05) = 1.05 / 0.8888 = 1.18
```

**1,18:1** frente a los 3:1 que pide 1.4.11. Por eso las barras grises del stepper casi no se ven.

Otros valores reales del caso Mahou, para que te hagas una idea:

| Primer plano | Fondo | Ratio | Comentario |
|---|---|---|---|
| #282825 (texto) | #FFFFFF | 14,78:1 | Excelente |
| #FFFFFF | #D8181B (botón rojo) | 5,16:1 | Cumple texto normal (4,5) |
| #8F8A8B (bordes) | #FFFFFF | 3,40:1 | Cumple componentes (3), no texto |
| #ECECEC | #FFFFFF | 1,18:1 | Casi invisible |

## 5.3 Transparencias: `compositeOver`

Un color con alfa < 1 no se puede medir directamente: hay que calcular qué color **se ve** al pintarlo sobre su fondo.

```
resultado = arriba · a + abajo · (1 − a)       (canal a canal)
```

Ejemplo real: el botón "atrás" tiene fondo `rgba(18, 18, 18, 0.1)` sobre blanco:

```
18/255 = 0.0706  →  0.0706 · 0.1 + 1 · 0.9 = 0.9071  →  231  →  #E7E7E7
```

Se usa en dos sitios:

- Para **apilar las capas** que hay debajo de un texto y obtener su fondo real.
- Para calcular el color **efectivo** de un texto o borde semitransparente. Un texto negro al 40 % se evalúa como el gris que realmente se ve.

## 5.4 Umbrales

`requiredTextContrast(level, large)`:

| | Texto normal | Texto grande |
|---|---|---|
| **AA** (1.4.3) | 4,5:1 | 3:1 |
| **AAA** (1.4.6) | 7:1 | 4,5:1 |

Componentes y gráficos (1.4.11): **3:1** (`NON_TEXT_CONTRAST`).

### ¿Qué es "texto grande"? (`isLargeText`)

WCAG lo define en puntos: 18 pt, o 14 pt en negrita. En píxeles CSS (1 pt = 1,333 px):

- **≥ 24 px** a cualquier peso, o
- **≥ 18,66 px** con peso **≥ 700**.

Ejemplo: "Siguiente" mide 19 px en peso 700, así que es texto grande y le basta 3:1.

## 5.5 Redondeo: `round2`

Los ratios se redondean a 2 decimales **antes** de compararlos con el umbral. Así lo que se muestra y lo que se decide coinciden: un 4,48 se reporta como 4,48 y no cumple 4,5. Sin redondear, podríamos mostrar "4.5" y decir que no cumple, lo que confunde.

Siguiente: [Motor de reglas](06-motor-de-reglas.md).
