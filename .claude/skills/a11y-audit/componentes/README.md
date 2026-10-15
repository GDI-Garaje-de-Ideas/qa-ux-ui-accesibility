# Componentes conocidos por archivo de Figma

Este README describe el formato. Los archivos de esta carpeta son el conocimiento inicial que trae el skill. Los que se van aprendiendo se guardan en el proyecto donde se audita, en `.a11y-audit/componentes/<fileKey>.md`, y el skill copia ahí el inicial la primera vez. Así, al actualizar el skill copiando de nuevo su carpeta, no se pierde lo aprendido.

Cada archivo `<fileKey>.md` recoge los componentes del sistema de diseño de un archivo de Figma que ya se han auditado, con la gravedad que debe darse a sus problemas. Sirve para tres cosas:

1. Que todas las pantallas de un flujo clasifiquen igual el mismo componente.
2. Que una auditoría futura del mismo archivo sea comparable con las anteriores.
3. Que el índice del flujo muestre los problemas que se arreglan una vez en la librería.

`fileKey` es el segmento del enlace que va después de `/design/`.

## Formato

```markdown
# <Nombre del archivo de Figma> (<fileKey>)
Última actualización: AAAA-MM-DD · flujo auditado: <nombre>

- **<Componente o instancia>**, <qué parte>: **<error|warning|info|descartado>** <criterio>. <Problema en una frase>. Fix: <cómo resolverlo>.
```

## Cuándo se actualiza

El skill lo actualiza al terminar la primera tanda de un flujo, con los componentes que se repiten, y otra vez al final. Si cambias una clasificación a mano, las siguientes auditorías la aplicarán.
