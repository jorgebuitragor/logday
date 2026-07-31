# Requirements — Personalización y expansión de temas

Estado: en diseño. Describe el comportamiento deseado; nada de esto está
implementado todavía. Motivado por quejas de usuarios de que el tema
oscuro cansa la vista, y por la solicitud de más variedad de temas y de
poder crear temas propios. Depende del trabajo previo en
[`../temas-consistencia-visual/`](../temas-consistencia-visual/requirements.md)
(que redujo la cantidad de color hardcodeado fuera del sistema de
variables — cuanto menos color hardcodeado quede, mejor se comportan los
temas nuevos y personalizados que aquí se especifican).

## 1. Contexto

El tema oscuro actual (`src/App.css:12-39`) tiene un fondo casi negro puro
(`--bg-base: #0f0f0f`) combinado con texto primario blanco puro
(`--text-primary: #ffffff`). El contraste resultante (~19:1, calculado con
la fórmula de luminancia relativa de WCAG 2.1) es excesivo — muy por
encima del máximo recomendado por guías de diseño de temas oscuros
(Material Design explícitamente desaconseja negro/blanco puros en dark
mode) — y es la causa técnica más probable de las quejas de fatiga visual:
el fenómeno se conoce como "halation"/glare, no falta de contraste sino
exceso.

En el otro extremo, `--text-faint` (`#555555`) da solo ~2.6:1 de contraste
contra el mismo fondo — por debajo del mínimo de accesibilidad WCAG AA
(3:1 para texto grande, 4.5:1 para texto normal) — y se usa en 14 sitios
de texto real (placeholders, estados vacíos, hints), no solo decorativos.
El tema oscuro tiene simultáneamente zonas que "queman" la vista y zonas
casi ilegibles.

## 2. Requisitos — contraste del tema oscuro existente

- El sistema DEBERÁ dejar de usar negro puro (`#000000`–`#0f0f0f`) como
  `--bg-base` del tema `dark`, y dejar de usar blanco puro (`#ffffff`)
  como `--text-primary` del mismo tema.
- CUANDO se mide el contraste de cualquier variable `--text-*` del tema
  `dark` contra `--bg-base` o `--bg-panel` (los dos fondos donde aparece
  texto con más frecuencia), el resultado DEBERÁ ser ≥4.5:1 (WCAG AA para
  texto normal).
- El cambio DEBERÁ preservar la jerarquía visual actual: el orden relativo
  de luminosidad entre `--text-primary > --text-body > --text-secondary >
  --text-tertiary > --text-muted > --text-hint > --text-faint` no debe
  invertirse, y la diferenciación entre `--bg-base` y los demás fondos
  (`--bg-panel`, `--bg-surface`, `--bg-hover`, `--bg-elevated`,
  `--bg-input`) DEBERÁ seguir siendo perceptible.
- El cambio DEBERÁ tocar el mínimo número de variables necesario — no es
  un rediseño de la paleta, es un ajuste de los valores que fallan el
  criterio de arriba.
  — Valores concretos propuestos y verificados, ver
  [`design.md`](./design.md) §1: `--bg-base`, `--text-primary`,
  `--text-hint`, `--text-faint`.

## 3. Requisitos — temas nuevos predefinidos

- El sistema DEBERÁ seguir soportando añadir un tema predefinido nuevo
  mediante el patrón ya existente: un bloque `:root[data-theme="<id>"]`
  con las 23 variables en `src/App.css`, una entrada en `THEME_VALUES`
  (`src/components/SettingsModal.tsx`), y un par de claves i18n
  (`theme<Nombre>`/`themeDesc<Nombre>`) en `es`/`en`
  (`src/lib/i18n.ts`) — sin requerir cambios adicionales de código.
- El sistema DEBERÁ incluir 3 temas nuevos con identidad y propósito
  claros, cada uno con contraste de texto verificado (≥4.5:1 contra su
  propio `--bg-base`) siguiendo el mismo criterio del §2:
  1. **Sepia** — base clara y cálida, para lectura prolongada.
  2. **OLED** — base oscura con negro puro intencional (pensado para
     pantallas AMOLED/ahorro de batería), pero con texto suavizado — a
     diferencia del tema `dark` original, este SÍ puede usar
     `--bg-base: #000000` porque el negro puro aquí es la característica
     deseada, no un defecto; lo que se corrige es el texto, no el fondo.
  3. **Nórdico** — base oscura y fría, basado en la paleta
     [Nord](https://www.nordtheme.com/).
  — Paletas completas (23 variables cada una) en
  [`design.md`](./design.md) §2.

## 4. Requisitos — temas personalizados

### 4.1 Creación y gestión

- CUANDO el usuario abre la sección de temas en Configuración, el sistema
  DEBERÁ mostrar, además de los temas predefinidos, una lista de los
  temas personalizados que el usuario ha creado (puede ser cero).
- CUANDO el usuario crea un tema personalizado, DEBERÁ especificar: un
  nombre, una base (`claro` u `oscuro`) y un único color de acento
  (mediante un selector de color).
- El sistema DEBERÁ permitir crear **múltiples** temas personalizados
  simultáneamente — no un solo slot que se sobreescribe.
- El sistema DEBERÁ permitir renombrar, duplicar y eliminar un tema
  personalizado existente.
- SI la eliminación de un tema personalizado está en curso Y el usuario
  tiene activada la preferencia de confirmar acciones destructivas
  (`confirmDestructiveActions`), ENTONCES el sistema DEBERÁ pedir
  confirmación antes de eliminar.
- SI el usuario elimina el tema personalizado que tiene activo en ese
  momento, el sistema DEBERÁ volver automáticamente al tema `dark` por
  defecto.

### 4.2 Aplicación del tema personalizado

- CUANDO un tema personalizado está activo, el sistema DEBERÁ aplicar las
  variables de fondo/borde/texto (16 variables) de la base elegida
  (`claro` u `oscuro`) tal cual están definidas para esa base, y calcular
  las 7 variables de acento (`--accent`, `--accent-strong`,
  `--accent-soft`, `--accent-ink`, `--accent-inline`, `--accent-link`,
  `--accent-code`) a partir del único color elegido por el usuario.
- El cálculo de las variables de acento derivadas DEBERÁ producir
  resultados con relaciones de brillo/tono similares a como se relacionan
  esas mismas 7 variables entre sí en los temas predefinidos existentes
  (`dark`, `light`, `visual-rest`) — no valores arbitrarios.
- SI la base elegida es `claro` Y el color de acento elegido por el
  usuario produce un `--accent-strong`/`--accent-link` con contraste
  menor a 4.5:1 contra el fondo, ENTONCES el sistema DEBERÁ oscurecer
  automáticamente esa variable derivada hasta alcanzar el mínimo — un
  usuario no debe poder crear, sin darse cuenta, un tema con enlaces
  ilegibles.
- CUANDO un tema personalizado (o cualquier tema con un acento distinto
  del índigo por defecto) está activo, el sistema DEBERÁ seguir
  repintando correctamente los elementos de la UI que hoy dependen del
  mecanismo de `src/App.css:128-158` (que actualmente solo cubre
  `high-contrast`/`visual-rest` por nombre) — ver decisión de
  generalización en [`design.md`](./design.md) §4.

### 4.3 Persistencia

- Los temas personalizados creados por el usuario DEBERÁN sobrevivir a
  cerrar y reabrir la aplicación.
- Los temas personalizados DEBERÁN incluirse en el mecanismo de
  exportación/importación de configuración ya existente (backup manual en
  `SettingsModal.tsx`), de forma que sobrevivan a una restauración desde
  backup en otra instalación.

## 5. Fuera de alcance

- **Personalización de la paleta completa** (las 16 variables de
  fondo/borde/texto, no solo el acento). Decisión explícita del usuario:
  v1 solo permite elegir un color de acento sobre una base predefinida.
- **Compartir o exportar un tema personalizado entre usuarios** (ej. un
  archivo `.json` de tema para importar en otra instalación,
  independiente del backup completo de configuración).
- **Más de 3 temas predefinidos nuevos** en esta iteración — el mecanismo
  para añadir más queda documentado y es reutilizable, pero no se
  proponen paletas adicionales ahora.
- **Detección automática de tema del sistema operativo en vivo** y
  **sincronización de la ventana nativa de Tauri para todos los temas**
  — gaps ya documentados como fuera de alcance en
  `../temas-consistencia-visual/requirements.md` §5, siguen sin
  abordarse aquí.
- **Generar automáticamente una versión "personalizada" de los 3 temas
  nuevos** (Sepia/OLED/Nórdico) como base seleccionable para un tema
  custom — la base de un tema personalizado en v1 es únicamente `claro` u
  `oscuro` (los dos temas originales), no cualquier tema predefinido.
