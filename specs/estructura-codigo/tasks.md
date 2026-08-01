# Tasks — Estructura de código y buenas prácticas React

Estado: en progreso. Fase 0 implementada; el resto sigue en diseño. Es la
lista de trabajo fase por fase. Cada fase es independiente: se puede
implementar y comitear por separado sin depender de que las demás estén
hechas (salvo donde se indica).

## Fase 0 — ESLint ✅ implementada (2026-07-31)

- [x] 0.1 Instalar `eslint`, `typescript-eslint`, `eslint-plugin-react`,
      `eslint-plugin-react-hooks`, `@eslint/js`, `globals` como
      devDependencies
- [x] 0.2 Crear `eslint.config.js` (flat config) con las reglas de
      `design.md` §Fase 0 — con un ajuste no previsto en el diseño: hubo
      que fijar `settings.react.version` a `'19.1.0'` en vez de
      `'detect'`, porque la auto-detección de `eslint-plugin-react`
      llama a `context.getFilename()`, removido en ESLint 10, y crashea
      el linter por completo
- [x] 0.3 Añadir script `"lint": "eslint src"` a `package.json`
- [x] 0.4 Correr `pnpm lint` — resultado: **58 problemas (32 errores, 26
      warnings)**. Más ruido del anticipado en el diseño (que solo
      esperaba `max-lines`): sí aparece `max-lines` en los 9 archivos ya
      identificados en `requirements.md` §1.1, pero también errores reales
      de `eslint-plugin-react`/`typescript-eslint` preexistentes —
      **el más relevante: `react-hooks/rules-of-hooks` detectó 3 hooks
      (`useMemo`) llamados condicionalmente en `NoteList.tsx` (líneas
      441, 447, 462, después de un `return null` temprano en la línea
      432) — es un bug real de orden de hooks, no solo estilo. **Corregido
      de inmediato** (fuera del alcance original de la Fase 0, pero a
      petición explícita del usuario al encontrarlo): se movieron los tres
      `useMemo` antes del `return null` temprano. Verificado con
      `tsc --noEmit` (exit 0) y un `eslint` puntual sobre el archivo (el
      error `rules-of-hooks` ya no aparece; quedan 3 issues preexistentes
      sin relación — `no-useless-assignment`, 2x
      `react/no-unescaped-entities` y el warning de `max-lines` — que se
      dejan para sus fases correspondientes). No se corrigió nada más en
      esta fase — el objetivo era solo confirmar que la herramienta
      funciona.

## Fase 1 — Primitivos de UI compartidos (req. §3)

- [x] 1.1 `ToggleSwitch` (`src/components/ToggleSwitch.tsx`) — 3 tamaños,
      `role="switch"` + `aria-checked` siempre (2026-08-01)
  - [x] 1.1.1 Migradas las 6 ocurrencias "grande" (`CalendarView.tsx` ×2,
        `SettingsModal.tsx` ×4). Nota de implementación: en este patrón
        el `<button>` externo envolvía toda la fila (label + switch
        decorativo); como `ToggleSwitch` ya es su propio `<button
        role="switch">`, anidar un botón dentro de otro habría sido HTML
        inválido. Se cambió el `<button>` externo por un `<div
        onClick>` (con `cursor-pointer`), y `ToggleSwitch` hace
        `stopPropagation` en su click interno para no disparar el
        `onClick` de la fila dos veces al pulsar justo sobre el switch.
        Resultado: mismo comportamiento visible, pero ahora sí con
        `role="switch"`/`aria-checked` real (antes solo lo tenía la
        variante pequeña).
  - [x] 1.1.2 Migradas las 2 ocurrencias "mediana" (`CalendarView.tsx`)
  - [x] 1.1.3 Migradas las 6 ocurrencias "pequeña" (`GitModal.tsx` ×3,
        `SettingsModal.tsx` ×3), eliminados `toggleCls`/`gitToggleCls`.
        Desviación menor no prevista en el diseño: el color "encendido"
        de la variante pequeña estaba hardcodeado a `bg-indigo-500` en
        vez de `bg-[var(--accent)]` (no respetaba temas
        personalizados) — se unificó a `var(--accent)` como las otras
        dos variantes, consistente con el spec `temas-personalizacion`.
        Verificado con `tsc --noEmit`, `eslint` (sin errores nuevos) y
        `vite build` (bundle limpio) — pendiente pase de QA visual
        manual en `pnpm tauri dev`.
- [x] 1.2 `InlineRenameInput` (`src/components/InlineRenameInput.tsx`) —
      estado del draft interno al componente vía `autoFocus` nativo, sin
      `ref`+`setTimeout(50)` (2026-08-01)
  - [x] 1.2.1 Migrado `Sidebar.tsx` (folder rename, project rename).
        Nota: se preservó el comportamiento exacto de cada uno aunque son
        distintos entre sí — folder rename usa la ruta completa como
        valor inicial (`node.path`, tal como hacía el código anterior;
        no se "arregló" para nested folders, fuera de alcance de este
        refactor), project rename usa solo el nombre hoja (`node.name`).
        Se eliminaron los 2 `useEffect` con `setTimeout(...,50)` que
        enfocaban los inputs manualmente.
  - [x] 1.2.2 Migrado `NoteList.tsx` (note rename). De paso se eliminó
        un `useEffect(() => {}, [renamingNote])` vacío (código muerto,
        residuo de una versión anterior del enfoque manual).
  - [x] 1.2.3 Migrado `SettingsModal.tsx` (custom theme rename). El
        input queda anidado dentro de un `<button>` (selector de tema) —
        problema preexistente de HTML inválido no introducido por este
        cambio; se preservó el `stopPropagation` envolviendo
        `InlineRenameInput` en un `<span>` para no romper el
        comportamiento actual.
        Verificado con `tsc --noEmit`, `eslint` (sin errores nuevos) y
        `vite build` — pendiente QA visual manual en `pnpm tauri dev`.
- [x] 1.3 `ConfirmDeleteModal` + `useConfirmDelete`
      (`src/components/ConfirmDeleteModal.tsx`, `src/hooks/useConfirmDelete.ts`)
      (2026-08-01). Desviaciones sobre el boceto de `design.md`:
  - **`useConfirmDelete<T>` carga el ítem, no solo un booleano.** El
        boceto original (`pending: (() => void) | null`) no permite
        interpolar el nombre del ítem en el mensaje (la mayoría de los
        12 usos lo necesitan). Firma final:
        `request(item: T, directAction: (item: T) => void)`, retorna
        `{ pending, isOpen, request, cancel }` — el `onConfirm` de cada
        call site cierra sobre `pending` directamente en vez de que el
        hook guarde la acción.
  - **`ConfirmDeleteModal` añade `cancelLabel`/`confirmLabel` como
        props de string** (no estaban en el boceto) — los textos de
        botón varían por namespace de i18n en cada archivo, no se
        pueden hardcodear en el componente compartido.
  - **El caso posicionado (`TaskContextMenu.tsx`) implementa su propio
        posicionamiento inline** (mide vía `ref` + `placeMenuAtPointer`
        + listener de `resize`, igual que el código original) en vez
        de reusar `usePositionedMenu` como sugiere `design.md` — ese
        hook todavía no existe (es la tarea 1.4). Cuando se implemente,
        se evaluará refactorizar `ConfirmDeleteModal` para reusarlo
        internamente sin cambiar su API pública.
  - **Fondo/borde ligados a la variante**: se confirmó que los 2 casos
        "soft" (`DailyEditor.tsx`, `DailyList.tsx`) usaban
        consistentemente `bg-[var(--bg-panel)]`/`border-[var(--border)]`
        y backdrop `/50`, mientras que todos los "solid" usaban
        `bg-[var(--bg-elevated)]`/`border-card` y backdrop `/40` — no
        era ruido, así que quedó parametrizado por `variant` en vez de
        forzar un único juego de tokens.
  - [x] 1.3.1 Migradas las 12 ocurrencias: `AbsenceModal`,
        `CustomThemeEditor`, `NoteList`, `NoteEditor`, `DailyEditor`,
        `DailyList` (día — el de "eliminar mes" es un 13º caso
        encontrado durante la implementación, siempre obligatorio,
        sin pasar por `useConfirmDelete`, usa `ConfirmDeleteModal`
        directo), `CalendarView` (con `createPortal`, como el original),
        `OvertimeList`, `Sidebar` (×2: mes de Dailys y mes de Extras),
        `SettingsModal` (tema personalizado), `TaskContextMenu`
        (posicionado)
  - [x] 1.3.2 Migrado `TaskEditor.tsx:150` de `window.confirm()` a
        `ConfirmDeleteModal` (variant soft)
  - Verificado con `tsc --noEmit`, `eslint` (sin errores/warnings
        nuevos en ningún archivo — todo lo reportado es preexistente:
        `no-unescaped-entities`, `no-explicit-any`, `max-lines`,
        `exhaustive-deps`) y `vite build` limpio. Pendiente QA visual
        manual en `pnpm tauri dev` (los 3 tamaños de switch, los 4
        renombrados, y los 13 modales de confirmación).
- [ ] 1.4 `usePositionedMenu` (`src/hooks/usePositionedMenu.ts`)
  - [ ] 1.4.1 Migrar `TaskContextMenu.tsx` primero (caso más pequeño y
        con la duplicación interna más obvia — buen piloto de la migración)
  - [ ] 1.4.2 Migrar `NoteList.tsx` (3 menús), `DailyList.tsx` (2),
        `OvertimeList.tsx` (2), `CalendarView.tsx` (2), `MermaidBlock.tsx`,
        `DailyEditor.tsx`
  - [ ] 1.4.3 Migrar las 7 ocurrencias de `Sidebar.tsx` (dejarlo para el
        final de esta tarea — es el mayor volumen, mejor con el patrón
        ya probado en los sitios anteriores)
- [ ] 1.5 `ThemeTile` (`src/components/ThemeTile.tsx`), migrar las 3
      ocurrencias en `SettingsModal.tsx`

## Fase 2 — Deduplicación puntual (req. §4)

- [ ] 2.1 Crear `src/lib/dailyFileFormat.ts` con `parseDailyFile`/
      `serializeDailyFile`; actualizar `appStore.ts` y `DashboardView.tsx`
      para importar de ahí y eliminar sus copias
- [ ] 2.2 Investigar la duplicación `GitModal.tsx` ↔ pestaña Git de
      `SettingsModal.tsx` (con el código de ambos lado a lado) y decidir
      la forma de resolverla — puede resolverse junto con la Fase 4.5
      (split de `SettingsModal.tsx` en pestañas) en vez de por separado
- [ ] 2.3 Eliminar `DailyEntry` de `types/index.ts` (confirmado sin uso)
- [ ] 2.4 Eliminar la copia duplicada de `SearchResult` en
      `types/index.ts` (la real vive en `src/lib/invoke.ts`)

## Fase 3 — Separar `types/index.ts` (req. §5; diseño tabla de mapeo)

- [ ] 3.1 Crear `types/task.ts`, `types/note.ts`, `types/overtime.ts`,
      `types/calendar.ts`, `types/absence.ts`, `types/theme.ts`,
      `types/git.ts`, `types/config.ts`, `types/common.ts` con el
      contenido mapeado en `design.md`
- [ ] 3.2 Actualizar todos los call sites (~25 archivos) para importar
      del archivo de dominio correspondiente en vez de `'../types'`
- [ ] 3.3 Eliminar `src/types/index.ts`
- [ ] 3.4 `tsc --noEmit` limpio tras la migración

## Fase 4 — Componentes grandes (req. §6; requiere Fase 1 para el paso
      de menús contextuales/toggles/rename de cada archivo)

- [ ] 4.1 `Sidebar.tsx`
  - [ ] 4.1.1 Mover `FolderTreeItem`, `ProjectTreeItem`, `RootDropLine`
        a archivos propios
  - [ ] 4.1.2 Extraer `startFolderDrag` a `src/lib/folderDragDrop.ts`
  - [ ] 4.1.3 Extraer la generación de PDF del daily a `src/lib/`
  - [ ] 4.1.4 Reemplazar las 7 implementaciones de menú contextual por
        `usePositionedMenu` (si no se hizo ya en la tarea 1.4.3)
- [ ] 4.2 `SettingsModal.tsx`
  - [ ] 4.2.1 Extraer `GeneralSettingsTab`, `WorkSettingsTab`,
        `ShortcutsSettingsTab`, `DataSettingsTab`, `AboutSettingsTab`
  - [ ] 4.2.2 Extraer `GitSettingsTab` resolviendo la duplicación con
        `GitModal.tsx` (tarea 2.2)
- [ ] 4.3 `NoteEditor.tsx`
  - [ ] 4.3.1 Mover catálogo de emojis a `src/lib/emojiCatalog.ts`
  - [ ] 4.3.2 Mover `normalizeEditorMarkdown` y `createTaskCodePlugin`
        a `src/lib/`
  - [ ] 4.3.3 Extraer el subsistema de vista previa de enlaces a
        `useLinkPreview`
  - [ ] 4.3.4 Evaluar extracción del menú contextual de bloque y del
        editor de diagramas Mermaid (forma exacta a decidir al
        implementar, ver `design.md`)
- [ ] 4.4 `CalendarView.tsx`
  - [ ] 4.4.1 Resolver la duplicación de estado de formulario de evento
        entre `CalendarView`/`EventEditor` antes de mover archivos
  - [ ] 4.4.2 Mover `AppSelect` y `EventEditor` a archivos propios
- [ ] 4.5 `DashboardView.tsx` — mover `WeeklyMiniCalendar` a archivo propio

## Fase 5 — `ModalOverlay`/`ModalPanel` (req. §7 — issue/PR separado, QA manual)

- [ ] 5.1 Definir la escala de z-index (`Z_MODAL`, `Z_MODAL_NESTED`,
      `Z_MENU`, etc.) en un solo lugar
- [ ] 5.2 Crear `ModalOverlay`/`ModalPanel`
- [ ] 5.3 Para cada uno de los ~19 modales, decidir y documentar si debe
      cerrar en click-afuera, luego migrar uno por uno:
      `AbsenceModal`, `ExportModal`, `GitModal`, `ImageLinkModal`,
      `MermaidEditorModal`, `OvertimePreviewModal`, `SearchModal`,
      `SettingsModal`, `TaskList` (modal de nueva tarea),
      `OvertimeEditor` (modal de conflicto de horario), y los modales de
      `ConfirmDeleteModal` de la Fase 1 (para que también usen el mismo
      wrapper y hereden la escala de z-index)
- [ ] 5.4 Pase de QA manual: abrir cada modal migrado y confirmar visual
      y funcionalmente que el comportamiento de cierre es el esperado

## Fuera de alcance (ver requirements.md §8)

- [ ] ~~Dividir `appStore.ts` en slices~~ — no planeado, decisión del
      usuario. Documentado como opción técnica válida para spec futuro.
- [ ] ~~Dividir `src/lib/i18n.ts`~~ — prioridad más baja de todo el spec,
      diccionario de datos, no problema de diseño.

## Verificación por fase

- **Fase 0**: `pnpm lint` corre sin crashear; produce warnings de
  `max-lines` en los archivos ya identificados (confirma que la regla
  funciona).
- **Fase 1**: cada primitivo se prueba visualmente reemplazando 1-2 usos
  antes del rollout completo a los demás call sites.
- **Fase 2**: `tsc --noEmit` limpio; confirmar manualmente que el export
  de daily y el dashboard siguen leyendo/escribiendo el mismo formato.
- **Fase 3**: `tsc --noEmit` limpio tras migrar todos los imports.
- **Fase 4**: `pnpm tauri dev`, probar manualmente cada pantalla afectada
  (Sidebar completo, Settings todas las pestañas, Notes con diagramas
  Mermaid y vista previa de enlaces, Calendar crear/editar evento,
  Dashboard).
- **Fase 5**: pase de QA manual dedicado, uno por uno, de los ~19 modales.
