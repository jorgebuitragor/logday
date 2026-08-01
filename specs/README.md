# Specs (SDD)

Este directorio contiene specs de features siguiendo un flujo ligero de
Spec-Driven Development (SDD), sin herramientas externas.

## Estructura

Cada feature vive en su propia carpeta: `specs/<feature-slug>/`, con hasta
tres archivos:

- **`requirements.md`** — qué debe hacer la feature, en formato EARS
  ("Cuando X, el sistema DEBERÁ Y"). Es el contrato: si un comportamiento no
  está aquí, no se considera parte de la feature.
- **`design.md`** — cómo se implementa: componentes, estado, contratos entre
  frontend/backend (Tauri), decisiones y sus alternativas descartadas.
- **`tasks.md`** — checklist de implementación, casilla por casilla,
  referenciando los requirements que cada tarea satisface.

## Convenciones

- Los specs de features **ya existentes** documentan el comportamiento actual
  como baseline (reverse-spec) — no son aspiracionales. Se marcan con
  `Estado: implementado (baseline)` al inicio de `requirements.md`.
- Los specs de features **nuevas** se escriben antes de tocar código y guían
  la implementación. Se marcan `Estado: en diseño` o `Estado: en progreso`.
- Al modificar una feature ya especificada: actualiza el spec en el mismo PR
  que el código. Un spec desactualizado es peor que no tener spec.
- No se especifica retroactivamente todo el código existente — solo las
  áreas que se van a tocar o que son complejas.

## Índice de features

| Feature | Estado | Carpeta |
|---|---|---|
| Notas + Link Preview | implementado (baseline) | [`notas-link-preview/`](./notas-link-preview/requirements.md) |
| Consistencia visual de temas | implementado | [`temas-consistencia-visual/`](./temas-consistencia-visual/requirements.md) |
| Personalización y expansión de temas | implementado | [`temas-personalizacion/`](./temas-personalizacion/requirements.md) |
| Estructura de código y buenas prácticas React | en progreso | [`estructura-codigo/`](./estructura-codigo/requirements.md) |
