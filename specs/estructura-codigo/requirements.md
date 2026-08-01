# Requirements — Estructura de código y buenas prácticas React

Estado: en progreso (Fase 0 implementada, ver `tasks.md`). Describe el
comportamiento y la organización deseados para las fases restantes.
Motivado por
observación directa del usuario (archivos que superan las 2000 líneas,
tipos concentrados en un solo archivo, componentes con patrones
repetidos) y confirmado con una auditoría exhaustiva del código a fecha
2026-07-31.

## 1. Contexto y diagnóstico

El proyecto tiene 52 archivos TypeScript/TSX bajo `src/`, 24,893 líneas
en total, sin ninguna herramienta de lint configurada (confirmado: no
existe `.eslintrc*` ni `eslint.config.*`, `eslint` no está en
`package.json`, no hay script `lint`). Esto significa que cualquier
convención que este spec proponga no tiene, hoy, ninguna forma de
hacerse cumplir automáticamente — de ahí que la Fase 0 sea introducir
ESLint antes de tocar código.

### 1.1 Tamaño de archivos (top 10)

| Archivo | Líneas | Naturaleza |
|---|---|---|
| `src/components/NoteEditor.tsx` | 2851 | Un componente haciendo ≥6 trabajos independientes |
| `src/components/Sidebar.tsx` | 2209 | Un componente con 6 listas/menús independientes + lógica de drag&drop inline |
| `src/store/appStore.ts` | 2145 | Un store de Zustand con 10 dominios — **fuera de alcance de este spec**, ver §9 |
| `src/lib/i18n.ts` | 1666 | Diccionario de strings bilingüe — no es lógica, ver §9 |
| `src/components/SettingsModal.tsx` | 1564 | Un componente con 6 pestañas inlineadas |
| `src/components/CalendarView.tsx` | 1209 | 3 componentes en un archivo (`AppSelect`, `EventEditor`, `CalendarView`) |
| `src/components/NoteList.tsx` | 975 | — |
| `src/components/DailyEditor.tsx` | 845 | — |
| `src/lib/exportNote.ts` | 834 | — |
| `src/components/DashboardView.tsx` | 765 | Incluye `WeeklyMiniCalendar` inlineado |

### 1.2 `src/types/index.ts` (160 líneas, 28 exports, ~9 dominios mezclados)

Dominios detectados sin ninguna separación física: Task, Note, Daily,
Overtime, Calendar, Absence, Theme, Git, App-config/Settings, y un grupo
genuinamente transversal (`Language`, `StartupScreen`, `ToastKind`/
`AppToast`). Hallazgos de limpieza:
- `DailyEntry` (interfaz) no se importa ni se usa en ningún archivo del
  proyecto — código muerto.
- `SearchResult` está definida dos veces: una en `types/index.ts` (no
  usada por nadie) y otra en `src/lib/invoke.ts` (la que sí se importa
  en todo el proyecto).

El proyecto ya tiene precedente para "muchos archivos pequeños
enfocados, sin barrel, importados por ruta directa": `src/lib/` (12
archivos — `colombianHolidays.ts`, `overtimeCalc.ts`, `themeColor.ts`,
`menuPosition.ts`, `i18n.ts`, etc. — ninguno reexportado desde un
`index.ts`). Separar `types/` de la misma forma es consistente con la
convención ya existente, no un patrón nuevo.

`store/appStore.ts` importa 19 de los 28 exports en una sola línea, y
`SettingsModal.tsx` importa 7 — ambos son "agregadores" legítimos
(el store global y la pantalla de configuración) y seguirán necesitando
importar de varios archivos de dominio tras la separación; eso es
esperado, no un fallo del split.

### 1.3 Patrones de UI duplicados (6 patrones, conteo verificado)

| # | Patrón | Ocurrencias | Archivos principales |
|---|---|---|---|
| 1 | Modal de confirmar-eliminar | 12 | DailyEditor, DailyList, CalendarView, OvertimeList, NoteList, NoteEditor, AbsenceModal, CustomThemeEditor, Sidebar (×2), SettingsModal, TaskContextMenu |
| 2 | Máquina de estados de menú contextual/kebab (abrir, medir, posicionar, cerrar en click-afuera, cerrar con Escape) | ~15+ | Sidebar (×7), NoteList (×3), DailyList (×2), CalendarView (×2), OvertimeList (×2), MermaidBlock, DailyEditor, TaskContextMenu (×2 internas) |
| 3 | Input de renombrado inline | 4 | Sidebar (×2), NoteList, SettingsModal |
| 4 | Switch on/off | 14 (3 tamaños) | CalendarView, SettingsModal, GitModal |
| 5 | Tile de selección de tema | 3 | SettingsModal (únicamente) |
| 6 | Wrapper de modal (backdrop + panel) | ~19 | AbsenceModal, ExportModal, GitModal, ImageLinkModal, MermaidEditorModal, OvertimePreviewModal, SearchModal, SettingsModal, TaskList, OvertimeEditor + los 12 del patrón 1 |

Detalles relevantes por patrón:
- **Patrón 1**: `TaskEditor.tsx` no usa este modal en absoluto — usa
  `window.confirm()` nativo del navegador para eliminar una tarea, una
  inconsistencia de UX real (bloquea el hilo, no respeta el tema visual).
- **Patrón 2**: es el de mayor repetición de toda la auditoría. Dentro
  de `TaskContextMenu.tsx` mismo, `TaskContextMenu` y
  `NewTaskContextMenu` repiten línea por línea el mismo mecanismo.
- **Patrón 4**: `GitModal.tsx` (función `toggleCls`) y
  `SettingsModal.tsx` (función `gitToggleCls`) tienen el cuerpo de la
  función duplicado literalmente — indicio de que toda la sección "Git"
  de `SettingsModal.tsx` (~250 líneas: 7 campos de estado + 4 handlers +
  el JSX de la pestaña) fue copiada de `GitModal.tsx`, no solo el switch.
  8 de las 14 ocurrencias (las variantes "grande" y "mediana") no tienen
  `role="switch"`/`aria-checked` — gap de accesibilidad real.
- **Patrón 6**: el de mayor riesgo — z-index sin convención (rango
  observado: 50, 500-600, 10000-10010) y comportamiento inconsistente de
  "cerrar al hacer click en el fondo" (algunos modales lo hacen, otros
  no, sin que se pueda saber si es intencional o accidental leyendo el
  código).

**Bonus (no es de UI, es lógica)**: `parseDailyFile()` está implementada
dos veces, verbatim, en `src/store/appStore.ts` y
`src/components/DashboardView.tsx`.

## 2. Requisitos — Fase 0: ESLint

- El proyecto DEBERÁ tener una configuración de ESLint versionada
  (`eslint.config.js`, formato flat config — el estándar actual de
  ESLint 9+) con soporte para TypeScript y React.
- La configuración DEBERÁ incluir las reglas de `eslint-plugin-react-hooks`
  (`rules-of-hooks` como error, `exhaustive-deps` al menos como warning)
  — esta sesión ya encontró bugs reales de dependencias de `useEffect`
  mal declaradas.
- La configuración DEBERÁ marcar variables/imports no usados como error
  (ya cubierto parcialmente por `noUnusedLocals`/`noUnusedParameters` de
  `tsconfig.json`, pero ESLint lo detecta también en JS/JSX que tsc no
  cubre igual, y da mensajes más específicos).
- La configuración DEBERÁ incluir `max-lines` (por archivo) configurado
  como **warning**, no error — el objetivo es visibilizar el problema
  sin romper el build por los archivos legados que este mismo spec
  planea reducir en fases posteriores.
- `package.json` DEBERÁ tener un script `lint`.

## 3. Requisitos — Fase 1: primitivos de UI compartidos

- El sistema DEBERÁ tener un componente `ToggleSwitch` que cubra las 3
  variantes de tamaño ya en uso (grande/mediana/pequeña), con
  `role="switch"` y `aria-checked` en todas — no solo en la variante
  pequeña, que hoy es la única accesible.
- El sistema DEBERÁ tener un componente `InlineRenameInput` que
  encapsule el patrón de foco automático + confirmar en Enter/blur +
  cancelar en Escape, usado hoy 4 veces con variaciones cosméticas
  menores (tamaño, padding, alineación) parametrizables por `className`.
- El sistema DEBERÁ tener un componente `ConfirmDeleteModal` y un hook
  `useConfirmDelete(confirmDestructiveActions)` que encapsule el patrón
  "si `confirmDestructiveActions` está activo, pedir confirmación;
  si no, eliminar directo" — reemplazando las ~10 reimplementaciones de
  esa misma rama condicional.
- CUANDO se aplique `ConfirmDeleteModal` a `TaskEditor.tsx`, el sistema
  DEBERÁ dejar de usar `window.confirm()` nativo para eliminar una
  tarea, homologando el comportamiento con el resto de la app.
- El sistema DEBERÁ tener un hook `usePositionedMenu()` que encapsule:
  calcular la posición inicial (vía las utilidades ya existentes en
  `src/lib/menuPosition.ts`), medir el tamaño real del menú, cerrar en
  click fuera, cerrar con Escape, y recalcular en resize de ventana —
  reemplazando las ~15+ implementaciones manuales de este mecanismo.
- El sistema DEBERÁ tener un componente `ThemeTile`, con alcance
  limitado a `SettingsModal.tsx` (no se fuerza a unificar con los puntos
  de color de eventos de `CalendarView.tsx`, que son un patrón visual
  distinto).

## 4. Requisitos — Fase 2: deduplicación puntual

- `parseDailyFile()` DEBERÁ existir en un único lugar
  (`src/lib/dailyFileFormat.ts` o similar), importado tanto por
  `appStore.ts` como por `DashboardView.tsx`.
- Se DEBERÁ investigar y resolver la duplicación entre la pestaña "Git"
  de `SettingsModal.tsx` y `GitModal.tsx` — decidir si `SettingsModal`
  debe reutilizar/envolver `GitModal` en vez de reimplementar su propio
  formulario de configuración de git.
- `DailyEntry` (no usado) y la copia duplicada de `SearchResult` en
  `src/types/index.ts` DEBERÁN eliminarse.

## 5. Requisitos — Fase 3: separar `types/index.ts`

- Los tipos DEBERÁN organizarse en archivos por dominio
  (`types/task.ts`, `types/note.ts`, `types/overtime.ts`,
  `types/calendar.ts`, `types/absence.ts`, `types/theme.ts`,
  `types/git.ts`, `types/config.ts`, `types/common.ts`), sin archivo
  barril (`types/index.ts` no debe seguir existiendo como reexportador),
  siguiendo la misma convención ya usada por `src/lib/`.
- Los tipos genuinamente transversales (usados por ≥2 dominios no
  relacionados: `Language`, `StartupScreen`, `ToastKind`, `AppToast`)
  DEBERÁN vivir en `types/common.ts`.
- Los tipos "agregados" que combinan piezas de varios dominios por
  diseño (`AppConfig`, `BackupSettings`) DEBERÁN vivir en `types/config.ts`
  e importar de los archivos de dominio que necesiten (`theme.ts`,
  `overtime.ts`, `common.ts`) — esto es esperado, no un fallo del split.
- Todos los call sites que hoy importan de `'../types'` DEBERÁN
  actualizarse para importar del archivo de dominio correspondiente.

## 6. Requisitos — Fase 4: descomposición de componentes grandes

- `Sidebar.tsx`: `FolderTreeItem`, `ProjectTreeItem` y `RootDropLine`
  DEBERÁN moverse a archivos propios; `startFolderDrag` (lógica de
  drag&drop sin JSX) DEBERÁ moverse a `src/lib/folderDragDrop.ts`; la
  generación inline de PDF del daily DEBERÁ moverse a `src/lib/`
  (mismo patrón que ya sigue `src/lib/overtimeExcel.ts` para Excel); las
  7 implementaciones manuales de menú contextual DEBERÁN reemplazarse
  por `usePositionedMenu` (Fase 1).
- `SettingsModal.tsx`: cada pestaña (General/Trabajo/Atajos/Datos/
  Git/Acerca de) DEBERÁ ser su propio componente.
- `NoteEditor.tsx`: el catálogo de emojis, `normalizeEditorMarkdown` y
  `createTaskCodePlugin` (lógica pura, sin JSX ni hooks) DEBERÁN moverse
  a `src/lib/`; el subsistema de vista previa de enlaces DEBERÁ
  extraerse a un hook propio.
- `CalendarView.tsx`: `AppSelect` y `EventEditor` DEBERÁN moverse a
  archivos propios; se DEBERÁ revisar la duplicación de estado del
  formulario de evento detectada entre `CalendarView` y `EventEditor`
  (mismos campos declarados en ambos: `evTitle`, `evDate`, etc.).
- `DashboardView.tsx`: `WeeklyMiniCalendar` DEBERÁ moverse a archivo
  propio.

## 7. Requisitos — Fase 5: wrapper de modal unificado

- El sistema DEBERÁ tener primitivos `ModalOverlay`/`ModalPanel` que
  centralicen el backdrop, el z-index, y el comportamiento de cierre.
- Para cada uno de los ~19 modales existentes, se DEBERÁ decidir
  explícitamente (no heredar por accidente) si debe cerrar al hacer
  click en el fondo, y documentar esa decisión.
- Esta fase DEBERÁ ejecutarse por separado de las demás (issue/PR propio)
  con un pase de QA manual sobre cada modal afectado, dado que cambia
  comportamiento de cierre visible al usuario, no solo estructura interna.

## 8. Requisitos — Fase 6: organizar `src/components/` por feature

Motivado por observación directa del usuario tras completar la Fase 4:
el directorio `src/components/` concentra 45 archivos .tsx/.ts en un
único nivel plano (sin contar la subcarpeta ya existente
`visual-editors/`, con 4 archivos), en parte como consecuencia directa
de las fases 4.1-4.5 (que añadieron ~15 archivos nuevos al mismo
directorio). El propio repo ya tiene precedente de agrupar por feature
dentro de `components/` (`visual-editors/`) — organizar el resto es
consistente con una convención existente, no una nueva.

- El sistema DEBERÁ agrupar los componentes en subcarpetas por feature
  dentro de `src/components/`, según el mapa de acoplamiento real
  (quién importa a quién), no por parecido de nombre — ver el detalle
  completo en `design.md` §Fase 6.
- Los componentes usados desde **una sola feature** DEBERÁN vivir en la
  subcarpeta de esa feature (p. ej. `AboutSettingsTab.tsx` en
  `settings/`).
- Los componentes usados desde **2 o más features distintas** (p. ej.
  `ConfirmDeleteModal.tsx`, usado desde 6+ features) DEBERÁN vivir en
  `components/shared/`.
- Los componentes usados **únicamente por `App.tsx`** y sin dueño de
  feature ni reutilización cruzada (`ResizeHandle.tsx`,
  `ToastViewport.tsx`, `SearchModal.tsx`) DEBERÁN permanecer en la raíz
  de `components/`.
- La subcarpeta `visual-editors/` DEBERÁ anidarse dentro de `notes/`
  (`components/notes/visual-editors/`), dado que hoy solo la usa
  `MermaidEditorModal.tsx`, que pasa a vivir en `notes/`.
- El movimiento DEBERÁ hacerse con `git mv` para preservar el historial
  de cada archivo.
- El sistema DEBERÁ mantener `tsc --noEmit` limpio y `eslint` sin
  problemas nuevos respecto al recuento base tras la reorganización.

## 9. Fuera de alcance

- **Dividir `appStore.ts`.** Decisión explícita del usuario. El patrón
  "slice" de Zustand (varios archivos `createXSlice(set, get)` combinados
  en un único `create()`) sería la forma idiomática de hacerlo sin romper
  el acoplamiento cruzado real (167 llamadas a `get()`, toasts/idioma/
  estado de git atravesando todos los dominios) — queda documentado aquí
  como la opción técnica correcta, por si se retoma en un spec futuro,
  pero no se planea ahora.
- **Dividir `src/lib/i18n.ts`.** Es un diccionario de datos (strings
  es/en), no un problema de responsabilidades mezcladas — su tamaño es
  inherente al volumen de texto de la UI, no a mal diseño. Si se separa
  algún día (por locale o por sección), es la prioridad más baja de todo
  este spec.
- **Migrar todos los usos de una vez.** Cada fase se implementa y
  verifica de forma independiente; no se espera un solo cambio masivo.
