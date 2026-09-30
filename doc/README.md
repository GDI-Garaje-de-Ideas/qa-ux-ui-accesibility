# Documentación de figma-a11y-mcp

Bienvenido. Esta carpeta explica **qué hace esta aplicación, cómo está construida y por qué se tomaron sus decisiones**. Está escrita para alguien que acaba de entrar al equipo: no damos nada por sabido, pero tampoco repetimos lo que ya dice el código. Cuando termines de leerla deberías poder lanzar una auditoría, entender cada línea del informe y cambiar una regla sin miedo.

## En una frase

Le pasas a Claude un enlace a una pantalla de Figma y te devuelve un **informe de accesibilidad** (WCAG 2.2) con capturas marcadas, qué falla, por qué y cómo arreglarlo.

## Orden de lectura recomendado

| # | Documento | Qué aprenderás | Tiempo |
|---|---|---|---|
| 1 | [Conceptos básicos](01-conceptos.md) | Qué es WCAG, qué es un frame de Figma, qué es MCP y qué es un skill | 15 min |
| 2 | [Arquitectura y flujo](02-arquitectura.md) | Las piezas del sistema y el recorrido completo de una auditoría | 15 min |
| 3 | [Puesta en marcha](03-puesta-en-marcha.md) | Instalar, configurar el token, conectar los servidores y resolver problemas típicos | 20 min |
| 4 | [Módulo Figma](04-modulo-figma.md) | Cómo leemos Figma: enlaces, API REST y la corrección del auto-layout | 20 min |
| 5 | [Color y contraste](05-color-y-contraste.md) | Las matemáticas del contraste, con ejemplos reales | 15 min |
| 6 | [Motor de reglas](06-motor-de-reglas.md) | Cómo se recorre el diseño, cómo se deduce el fondo de un texto y cada regla | 30 min |
| 7 | [Informe HTML](07-informe-html.md) | Cómo se genera el informe visual con capturas | 20 min |
| 8 | [Servidor MCP y skill](08-servidor-mcp-y-skill.md) | Las herramientas que exponemos a Claude y cómo las orquesta `/a11y-audit` | 15 min |
| 9 | [Herramientas y tecnologías](09-herramientas.md) | Todo lo que usamos y para qué sirve cada cosa | 10 min |
| 10 | [Tareas habituales y glosario](10-tareas-habituales.md) | Recetas paso a paso (añadir una regla, depurar un frame…) y vocabulario | consulta |

Si solo tienes 10 minutos, lee el 1 y el 2.

## Mapa rápido del repositorio

```
.
├── .claude/skills/a11y-audit/SKILL.md   ← instrucciones que sigue Claude en /a11y-audit
├── .mcp.json                            ← qué servidores MCP arranca Claude Code
├── CLAUDE.md                            ← reglas del proyecto para Claude
├── README.md                            ← resumen de uso
├── doc/                                 ← estás aquí
├── reports/                             ← informes generados (.md y .html), no se versionan
├── src/
│   ├── figma/    enlaces, cliente de la API, tipos y corrección de auto-layout
│   ├── color/    luminancia, contraste y mezcla de colores
│   ├── rules/    motor de reglas y resolución de fondos
│   ├── report/   informe HTML visual
│   ├── audit.ts  punto de entrada compartido (servidor y CLI)
│   ├── server.ts servidor MCP
│   └── cli.ts    auditoría desde la terminal
└── dist/         código compilado (lo genera `npm run build`)
```

## Tres ideas que conviene tener claras desde el principio

1. **Dos tipos de análisis.** Lo que se puede **medir** (contrastes, tamaños) lo calcula nuestro código de forma determinista. Lo que requiere **criterio** (si un texto de botón es descriptivo, si falta un estado de foco) lo revisa Claude mirando la captura. Ninguno de los dos basta por sí solo.
2. **Nunca inventamos un número.** Si el código no puede medir algo con certeza (texto sobre una foto, por ejemplo), lo dice y lo deja como comprobación manual. El informe HTML también sigue esta regla: las mediciones salen siempre del motor, nunca del texto que redacta Claude.
3. **Solo leemos Figma.** La aplicación no modifica nunca el diseño. Todas las peticiones a Figma son de lectura.
