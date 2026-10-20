# Requirements — Personalización y expansión de temas

Estado: implementado. Motivado por quejas de usuarios de que el tema
oscuro cansa la vista, y por la solicitud de más variedad de temas y de
poder crear temas propios. La profundidad de personalización de §4 se
amplió durante la implementación respecto al diseño original (ver nota en
esa sección) tras feedback directo probando la primera versión. Depende
del trabajo previo en
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

> **Nota de alcance (post-implementación):** el diseño original limitaba
> la personalización a un único color de acento sobre una base fija. Tras
> probar esa primera versión, el usuario la sintió demasiado limitada; se
> amplió a 3 colores semilla (acento, tinte de fondo, tinte de texto) más
> un control de intensidad — ver §4.2 actualizado y
> [`design.md`](./design.md) §3.4 para las fórmulas de derivación de cada
> escala.

### 4.1 Creación y gestión

- CUANDO el usuario abre la sección de temas en Configuración, el sistema
  DEBERÁ mostrar una grilla de 9 casillas: los 8 temas predefinidos
  (`system`, `light`, `dark`, `high-contrast`, `visual-rest`, `sepia`,
  `oled`, `nordic`) más una novena casilla "Personalizado" que representa
  el acceso a los temas personalizados del usuario.
- La casilla "Personalizado" DEBERÁ comportarse así según el estado:
  - SI hay un tema personalizado activo, la casilla muestra su color de
    acento y nombre, y al hacer click abre la pantalla de edición de ese
    tema.
  - SI no hay ninguno activo pero el usuario ya tiene alguno creado, el
    click activa automáticamente el primero de la lista; si tiene más de
    uno, además despliega la lista completa para elegir otro.
  - SI el usuario no tiene ningún tema personalizado todavía, el click
    abre la pantalla de creación de uno nuevo.
- CUANDO el usuario crea un tema personalizado, DEBERÁ especificar: un
  nombre, una base (`claro` u `oscuro`), y los 3 colores semilla + la
  intensidad descritos en §4.2 — todo en una pantalla/modal dedicado
  (`CustomThemeEditor`), no en un formulario inline dentro de la lista de
  temas.
- El sistema DEBERÁ permitir crear **múltiples** temas personalizados
  simultáneamente — no un solo slot que se sobreescribe.
- Debajo de la grilla de 9, el sistema DEBERÁ ofrecer un enlace discreto
  que expande la lista completa de temas personalizados creados, paginada
  de a 6. El texto del enlace DEBERÁ decir "Ver temas personalizados"
  mientras el usuario tenga 6 o menos creados, y cambiar a "Ver más" en
  cuanto supere ese umbral (momento en el que la paginación empieza a ser
  relevante).
- El sistema DEBERÁ permitir renombrar, duplicar y eliminar un tema
  personalizado existente desde un menú por tema (renombrar inline;
  duplicar y eliminar directos; editar sus colores abre la misma pantalla
  dedicada de creación, en modo edición).
- SI la eliminación de un tema personalizado está en curso Y el usuario
  tiene activada la preferencia de confirmar acciones destructivas
  (`confirmDestructiveActions`), ENTONCES el sistema DEBERÁ pedir
  confirmación antes de eliminar.
- SI el usuario elimina el tema personalizado que tiene activo en ese
  momento, el sistema DEBERÁ volver automáticamente al tema `dark` por
  defecto.
- Los 3 selectores de color de la pantalla dedicada DEBERÁN usar un
  componente de color picker propio de la interfaz (no el
  `<input type="color">` nativo del sistema operativo), para que se vea
  idéntico en macOS/Windows/Linux.
- CUANDO se abre la pantalla de creación de un tema nuevo (no edición), los
  valores de partida de los 3 colores y la base DEBERÁN reflejar el tema
  actualmente activo en la app en ese momento (leído de las variables CSS
  ya resueltas en el DOM), no un color fijo — así el usuario parte de algo
  visualmente relacionado con lo que ya está viendo.

### 4.2 Aplicación del tema personalizado

- CUANDO un tema personalizado está activo, el sistema DEBERÁ derivar sus
  ~23 variables a partir de **3 colores semilla** elegidos por el usuario,
  no solo del acento:
  - **Acento**: deriva las 7 variables `--accent*` (ver fórmula HSL en
    `design.md` §3.4), moduladas por un control de **intensidad** (0-100)
    que el usuario ajusta con un slider — a mayor intensidad, mayor
    saturación del acento resultante, independiente del color de entrada.
  - **Tinte de fondo**: deriva las 10 variables de fondo/borde
    (`--bg-base`, `--bg-panel`, `--bg-surface`, `--bg-secondary`,
    `--bg-hover`, `--bg-elevated`, `--bg-input`, `--border`,
    `--border-card`, `--border-high`) reutilizando la misma escala de
    luminosidad ya verificada de la base `claro`/`oscuro` correspondiente,
    solo recoloreada con el tono/saturación del tinte elegido.
  - **Tinte de texto**: deriva las 7 variables `--text-*` con el mismo
    criterio, reutilizando la escala de luminosidad de la base.
- El cálculo de las variables de acento derivadas DEBERÁ producir
  resultados con relaciones de brillo/tono similares a como se relacionan
  esas mismas 7 variables entre sí en los temas predefinidos existentes
  (`dark`, `light`, `visual-rest`) — no valores arbitrarios.
- CUALQUIERA de las 3 escalas derivadas (acento, fondo, texto) que resulte
  en un contraste texto/fondo por debajo de 4.5:1 (WCAG AA) DEBERÁ
  ajustarse automáticamente (aclarando en base oscura, oscureciendo en
  base clara) hasta alcanzar el mínimo — un usuario no debe poder crear,
  sin darse cuenta, un tema con texto o enlaces ilegibles, sin importar
  qué colores semilla elija.
- La barra de intensidad del acento, en la pantalla de edición, DEBERÁ
  teñirse con el color de acento que se está eligiendo en ese momento
  (retroalimentación visual inmediata), no un color fijo.
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
  backup en otra instalación — incluyendo el caso donde el tema activo
  exportado sea uno personalizado (el array de temas debe restaurarse
  antes de activar el tema importado).
- Los temas personalizados creados con una versión anterior de la app (sin
  tinte de fondo/texto ni intensidad) DEBERÁN seguir funcionando al
  cargar, recibiendo valores por defecto sensatos para los campos que no
  existían todavía.

## 5. Fuera de alcance

- **Edición manual de las ~23 variables una por una.** Aunque el alcance
  se amplió de 1 a 3 colores semilla (§4.2), sigue sin ser un editor de
  paleta completa — cada semilla deriva un grupo de variables
  automáticamente, el usuario nunca fija un valor individual como
  `--bg-hover` o `--text-tertiary` directamente.
- **Selector de color con rueda de color / paleta 2D tipo Photoshop.** El
  `ColorPicker` propio (`src/components/ColorPicker.tsx`) usa 3 barras
  (matiz, saturación, luminosidad) + entrada hexadecimal — suficiente para
  el caso de uso, no un color-picker de nivel profesional.
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
