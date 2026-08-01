# Tasks — Estructura de código y buenas prácticas React

Estado: implementado. Fases 0-6 completas, incluida la Fase 5
(`ModalOverlay`/`ModalPanel`) con su pase de QA manual dedicado.
Es la lista de trabajo fase por fase. Cada fase es independiente:
se puede implementar y comitear por separado sin depender de que las
demás estén hechas (salvo donde se indica).

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
- [x] 1.4 `usePositionedMenu` (`src/hooks/usePositionedMenu.ts`) (2026-08-01).
      Firma: `usePositionedMenu(anchor, { estimatedSize, onClose,
      closeOnEscape?, padding?, anchorOptions? })` → `{ ref, style,
      isReady }`. `anchor` acepta `MenuPoint` o `AnchorRect` (para
      `placeMenuNearAnchor`, submenús anclados a un botón). **Requisito
      del hook**: `anchor` debe tener identidad estable (viene de
      estado, no un objeto literal recreado cada render) — igual que ya
      hacían todos los call sites originales.
      Desviaciones/hallazgos sobre el diseño original:
  - **Añade cierre con Escape por defecto** a los menús que no lo
        tenían (la mayoría) — mejora de accesibilidad intencional, ya
        prevista en `design.md`, no un efecto secundario accidental.
  - **Se migraron más de "~15+"**: la auditoría original no contaba
        `OvertimeList.tsx` (×2) ni el menú de actividad de
        `DailyEditor.tsx` como parte de este patrón porque no tenían el
        ciclo completo de medición en dos pasadas (solo posición fija
        sin protección de overflow de viewport) — se migraron de todas
        formas porque `usePositionedMenu` les añade esa protección
        gratis, further reduciendo inconsistencia.
  - **`ConfirmDeleteModal`'s `PositionedPanel`** (Fase 1.3) se
        refactorizó para usar este hook internamente en vez de su
        implementación inline duplicada — sin cambios en su API pública.
  - **`monthCtx` de `DailyList.tsx` y `entryCtx`/`ctxMenu` simples sin
        overflow-protection quedaron FUERA** cuando genuinamente no usan
        ningún patrón de medición (solo un `placeMenuAtPointer` de una
        sola pasada sin ref/resize) — no forzado a encajar en el hook
        sin necesidad real.
  - [x] 1.4.1 Migrado `TaskContextMenu.tsx` (piloto) — `TaskContextMenu`
        y `NewTaskContextMenu`
  - [x] 1.4.2 Migrados `NoteList.tsx` (3 menús: principal, submenú
        "mover a" anclado, espacio vacío), `DailyList.tsx` (2: entrada,
        espacio vacío), `OvertimeList.tsx` (2: ctx menú, entrada),
        `CalendarView.tsx` (2: día, evento), `MermaidBlock.tsx` (1),
        `DailyEditor.tsx` (1: menú de actividad)
  - [x] 1.4.3 Migradas las 7 ocurrencias de `Sidebar.tsx` (folderCtx,
        areaCtx, projectCtx, projectAreaCtx, viewCtx, dailyMonthCtx,
        overtimeMonthCtx) — 1975 → 1710 líneas
      Verificado con `tsc --noEmit`, `eslint` (sin errores/warnings
      nuevos en ningún archivo) y `vite build` limpio tras cada archivo
      y al final del conjunto completo. Pendiente QA visual manual en
      `pnpm tauri dev` (abrir cada menú, confirmar posicionamiento,
      click-afuera, y Escape).
- [x] 1.5 `ThemeTile` (`src/components/ThemeTile.tsx`) (2026-08-01).
      Migradas las 3 ocurrencias: tile de tema built-in (icon), tile
      resumen de tema personalizado (colorDot o icon Palette, dashed
      cuando no hay ninguno activo), y tile "crear tema" (siempre
      dashed, sin ítem activo). **Fuera de alcance intencional**: la
      grilla expandida de temas personalizados (`showAllCustomThemes`)
      NO se migró — cada tile ahí es un wrapper con un botón de menú
      kebab superpuesto (renombrar/editar/duplicar/eliminar) e
      `InlineRenameInput` inline, estructuralmente distinto del
      `ThemeTileProps` simple (`active`/`icon`/`colorDot`/`label`/
      `onClick`/`dashed`) — forzarlo ahí habría requerido props
      condicionales que le habrían quitado el valor de ser "compartido"
      (mismo criterio que la alternativa descartada en `design.md` para
      los puntos de color de `CalendarView.tsx`).
      Verificado con `tsc --noEmit`, `eslint` (sin errores nuevos) y
      `vite build` limpio.

**Fase 1 completa** (2026-08-01): los 5 primitivos (`ToggleSwitch`,
`InlineRenameInput`, `ConfirmDeleteModal`+`useConfirmDelete`,
`usePositionedMenu`, `ThemeTile`) están implementados y migrados en
todos sus call sites identificados en `requirements.md` §1.3. Pendiente
para todos: un pase de QA visual manual en `pnpm tauri dev`.

## Fase 2 — Deduplicación puntual (req. §4)

- [x] 2.1 Creado `src/lib/dailyFileFormat.ts` con `parseDailyFile`/
      `serializeDailyFile` (2026-08-01); actualizados `appStore.ts` y
      `DashboardView.tsx` para importar de ahí, eliminadas sus copias.
      Verificado con `tsc --noEmit`, `eslint` (sin errores nuevos) y
      `vite build` limpio.
- [x] 2.2 Investigada la duplicación `GitModal.tsx` ↔ pestaña Git de
      `SettingsModal.tsx` (2026-08-01) — **decisión: no implementar
      todavía, diferir a la tarea 4.2** (split de `SettingsModal.tsx` en
      componentes por pestaña). Hallazgos con el código de ambos lado a
      lado:
      - No es solo el switch (ya unificado en la Fase 1 con
        `ToggleSwitch`) — es prácticamente **todo el archivo**
        (`GitModal.tsx`, 401 líneas) duplicado dentro del tab Git de
        `SettingsModal.tsx` (~350 líneas repartidas: estado, efectos,
        handlers y JSX), con solo los nombres de variable cambiados
        (`remote` ↔ `gitRemote`, `enabled` ↔ `gitEnabled`, etc.):
        - Mismo shape de estado: `remote/autoCommit/autoPush/enabled/
          userName/userEmail/busy/fetchBusy/errorMsg`
        - Mismos 2 `useEffect` (auto-commit horario mientras la app/modal
          está abierto; sincronizar estado local con `gitConfig` al
          entrar al tab/abrir el modal)
        - Mismos 4 handlers async verbatim (`handleSave`/`handleGitSave`,
          `handleSync`/`handleGitSync`, `handlePull`/`handleGitPull`,
          `handleFetch`/`handleGitFetch`) — idéntica lógica de
          try/catch/finally sobre las mismas acciones del store
        - Mismos objetos `statusIcon`/`remoteStatusInfo` y la misma
          función `timeAgo()` duplicada en ambos archivos
        - Único diferenciador real: `GitModal.tsx` envuelve todo en un
          modal (backdrop, botón cerrar, Escape-para-cerrar vía
          `toggleGit`), mientras la pestaña de `SettingsModal.tsx` lo
          renderiza directo como contenido de tab, sin wrapper
      - **Resolución recomendada** (a implementar en la tarea 4.2, no
        ahora): extraer un `GitSettingsForm` (o un hook
        `useGitSettingsForm()` + componente presentacional) con todo el
        estado/efectos/handlers/JSX actual, que `GitModal.tsx` use
        envuelto en su modal, y que el futuro `GitSettingsTab.tsx`
        (tarea 4.2.2) use directo. Implementarlo ahora sería prematuro:
        el componente compartido final depende de cómo quede exactamente
        `GitSettingsTab.tsx` una vez separado, y hacerlo dos veces
        (ahora y otra vez en la Fase 4) sería el tipo de trabajo
        duplicado que este spec busca evitar.
      - **Actualización (2026-08-01, al implementar la tarea 4.2.2)**:
        el plan de arriba no se ejecutó — se descubrió que `GitModal.tsx`
        es código muerto sin importadores, así que se eliminó
        directamente en vez de crear el `GitSettingsForm` compartido.
        Ver el detalle en la tarea 4.2.2.
- [x] 2.3 Eliminado `DailyEntry` de `types/index.ts` (2026-08-01,
      confirmado sin uso — ningún import lo referenciaba)
- [x] 2.4 Eliminada la copia duplicada de `SearchResult` en
      `types/index.ts` (2026-08-01; la real en `src/lib/invoke.ts`
      sigue siendo la única, ya era la que todos los call sites
      importaban). Verificado con `tsc --noEmit`, `eslint` y
      `vite build` limpios.

**Fase 2 completa** (2026-08-01).

## Fase 3 — Separar `types/index.ts` (req. §5; diseño tabla de mapeo) ✅ implementada (2026-08-01)

- [x] 3.1 Creados `types/task.ts`, `types/note.ts`, `types/overtime.ts`,
      `types/calendar.ts`, `types/absence.ts`, `types/theme.ts`,
      `types/git.ts`, `types/config.ts`, `types/common.ts` con el
      contenido mapeado en `design.md`. `config.ts` importa de
      `common.ts` (`Language`), `theme.ts` (`Theme`/`CustomTheme`) y
      `overtime.ts` (`OvertimeMonthMeta`) para `AppConfig`/
      `BackupSettings` — es el único archivo de dominio con
      dependencias cruzadas, esperado por ser el "agregador".
- [x] 3.2 Actualizados los 25 call sites para importar del archivo de
      dominio correspondiente en vez de `'../types'` (script que mapea
      cada símbolo importado a su archivo de dominio y reescribe la
      línea de import agrupando por destino). Hallazgo no cubierto por
      el script (imports estáticos únicamente): `NoteEditor.tsx` tenía
      2 referencias de tipo dinámicas `import('../types').Task` (no son
      un `import` estático de nivel de módulo) — corregidas a mano a
      `import('../types/task').Task`.
- [x] 3.3 Eliminado `src/types/index.ts`
- [x] 3.4 `tsc --noEmit` limpio tras la migración. También verificado
      con `eslint` (57 problemas — idéntico conteo a antes de esta
      fase, ningún error/warning nuevo) y `vite build` limpio.

## Fase 4 — Componentes grandes (req. §6; requiere Fase 1 para el paso
      de menús contextuales/toggles/rename de cada archivo)

- [x] 4.1 `Sidebar.tsx` (2026-08-01): 1849 → 1443 líneas
  - [x] 4.1.1 Movidos `FolderTreeItem`, `ProjectTreeItem`, `RootDropLine`
        a archivos propios (`FolderTreeItem.tsx`, `ProjectTreeItem.tsx`,
        `RootDropLine.tsx`). El estado compartido de highlight de
        drag&drop (antes 2 variables de módulo `_dropHighlight`/
        `_rootZoneHighlight` privadas del archivo) se movió también,
        expuesto como API `registerDropHighlight`/`unregisterDropHighlight`/
        `registerRootZoneHighlight`/`unregisterRootZoneHighlight` en
        `folderDragDrop.ts` — necesario porque ahora 3 archivos
        distintos necesitan coordinarse por él.
  - [x] 4.1.2 Extraído `startFolderDrag` a `src/lib/folderDragDrop.ts`
        (junto con el registro de highlight, ver arriba)
  - [x] 4.1.3 Extraída la generación de PDF del daily a
        `src/lib/dailyMonthExport.ts`. **Hallazgo no anticipado en el
        diseño**: no era solo la parte de PDF — la función completa
        `handleExportDailyMonth`/`handleExportMonth` (PDF + Markdown +
        texto plano + diálogo de guardado) estaba duplicada verbatim
        entre `Sidebar.tsx` y `DailyList.tsx` (no detectada en la
        auditoría original de `requirements.md`). Se extrajo la función
        completa como `exportDailyMonthEntries()` y se migraron AMBOS
        call sites, no solo Sidebar — deduplicación adicional no pedida
        explícitamente pero directamente en línea con el objetivo de
        esta fase.
  - [x] 4.1.4 Ya resuelto en la tarea 1.4.3 (las 7 ocurrencias ya usan
        `usePositionedMenu`)
      También movidos `FolderNode`/`buildFolderTree` a
      `src/lib/folderTree.ts` (no estaban en el plan original de
      `design.md`, pero eran necesarios como dependencia compartida de
      `FolderTreeItem.tsx`/`ProjectTreeItem.tsx`/`Sidebar.tsx`).
      Verificado con `tsc --noEmit`, `eslint` (sin errores nuevos) y
      `vite build` limpio. **Nota**: el archivo queda en 1443 líneas,
      por encima del ~800-1000 estimado en `design.md` — el resto del
      volumen son los modales inline (nueva carpeta, nuevo proyecto,
      subcarpeta, tags, menús de mes) que `design.md` no listó
      explícitamente para extracción en esta fase; se dejan tal cual.
- [x] 4.2 `SettingsModal.tsx`
  - [x] 4.2.1 Extraídos `GeneralSettingsTab`, `WorkSettingsTab`,
        `ShortcutsSettingsTab`, `DataSettingsTab`, `AboutSettingsTab`
        (2026-08-01). Cada pestaña se llevó su propio estado local,
        efectos y handlers; `GeneralSettingsTab` recibe
        `isStartupSelectorOpen`/`setIsStartupSelectorOpen`/
        `startupSelectorRef` como props porque el handler global de
        Escape del shell necesita esa señal para decidir si cierra el
        dropdown antes que el modal (acoplamiento genuino, no roto).
        `DataSettingsTab` se llevó `BACKUP_SETTINGS_PATH`/
        `isICloudPath`/`collectFiles`/`handleExport`/`handleImport`
        completos. `AboutSettingsTab` se llevó la lógica de
        `checkUpdate`/versión de la app. Al limpiar el shell se
        detectó y corrigió de paso un `react/no-unescaped-entities`
        preexistente (comillas sin escapar en el mensaje de
        confirmación de borrado de tema, arrastrado desde el bloque
        original) — nunca se había visto porque ESLint no existía en
        el proyecto antes de la Fase 0 de este mismo spec.
        Verificado con `tsc --noEmit`, `eslint` (sin errores nuevos) y
        `vite build` limpio. `SettingsModal.tsx`: 1157 → 141 líneas
        (1564 líneas originales antes de toda la fase 4.2).
  - [x] 4.2.2 Extraído `GitSettingsTab` (2026-08-01). **Cambio de plan
        respecto a la tarea 2.2**: la investigación de esa tarea asumía
        que había que crear un `GitSettingsForm` compartido entre
        `GitModal.tsx` y la pestaña Git. Al ir a implementarlo se
        descubrió que **`GitModal.tsx` no tenía ningún importador en
        toda la base de código** — código completamente muerto, nunca
        renderizado (las señales `isGitOpen`/`toggleGit` que lo abrían
        ya no llegan a ningún componente que lo use). Se eliminó
        `GitModal.tsx` directamente en vez de crear el componente
        compartido, y `GitSettingsTab.tsx` es una extracción simple del
        contenido de la pestaña. `isGitOpen`/`toggleGit` se dejan (son
        del store, fuera de alcance de esta fase) aunque hoy no los usa
        ningún flujo real de apertura.
        **Detalle de diseño preservado**: `GitSettingsTab` recibe una
        prop `active` pero SIEMPRE está montado (no
        `{settingsTab==='git' && <GitSettingsTab/>}`) — así sus efectos
        en segundo plano (auto-commit horario, fetch cada 30 min) siguen
        corriendo aunque el usuario esté en otra pestaña, igual que el
        comportamiento original.
        Verificado con `tsc --noEmit`, `eslint` (sin errores nuevos) y
        `vite build` limpio. `SettingsModal.tsx`: 1492 → 1157 líneas.
- [x] 4.3 `NoteEditor.tsx` (2026-08-01)
  - [x] 4.3.1 Movido catálogo de emojis a `src/lib/emojiCatalog.ts`
        (`EmojiOption`, `buildEmojiCatalog`, `EMOJI_CATALOG`,
        `normalizeEmojiSearchTerm`, ~125 líneas puras). Eliminado el
        import ahora muerto de `gemoji` en `NoteEditor.tsx`.
  - [x] 4.3.2 Movidos `normalizeEditorMarkdown` y `createTaskCodePlugin`
        a `src/lib/noteEditorMarkdown.ts` (cero JSX/hooks, lógica pura
        de ProseMirror/markdown). Limpiados los imports de
        `Plugin`/`PluginKey`/`DecorationSet`/`Decoration` de
        `@tiptap/pm/*` en `NoteEditor.tsx` (ya no se usan directo ahí).
  - [x] 4.3.3 Extraído el subsistema de vista previa de enlaces a
        `src/hooks/useLinkPreview.ts` (estado `linkPreview`, cache de
        metadata externa, los 3 handlers `open`/`close`/`navigateLink`
        vía ref, y los 3 efectos de listeners delegados/cierre-por-nota/
        cierre-por-scroll). El hook recibe `editorPaneRef` y
        `activeNoteId` como parámetros — `editorPaneRef` sigue siendo
        propiedad de `NoteEditor` porque lo usan ~10 sitios más del
        componente ajenos al link preview. Devuelve `{ linkPreview,
        setLinkPreview }`; el JSX de `LinkPreviewCard` y sus callbacks
        de navegación quedan en `NoteEditor.tsx` sin cambios porque
        tocan `editor` (instancia Tiptap) para reescribir enlaces, que
        es responsabilidad del propio editor, no del subsistema de
        preview. Se corrigió de paso un warning nuevo de
        `react-hooks/exhaustive-deps` (falta `editorPaneRef` en el
        array de deps del efecto de cierre-por-scroll) que no existía
        en el componente original porque ahí `editorPaneRef` era un
        `useRef` local (identidad estable reconocida automáticamente
        por la regla); al pasar la misma ref como parámetro del hook,
        ESLint deja de asumir esa estabilidad y hay que declararla
        explícitamente — comportamiento idéntico, solo silencia el
        lint.
        Verificado con `tsc --noEmit`, `eslint` (16 problemas vs. 17 en
        baseline — una advertencia menos, ninguna nueva) y `vite build`
        limpio. `NoteEditor.tsx`: 2841 → 2423 líneas.
  - [x] 4.3.4 Evaluado el menú contextual de bloque
        (`BlockContextMenuState`, `getBlockContextMeta`,
        `closeBlockContextMenu` y ~10 handlers más) y el editor de
        diagramas Mermaid (`editingDiagramIndex` + `MermaidEditorModal`).
        **Decisión: no extraer.** A diferencia de emojis/markdown/link-
        preview, ambos subsistemas están construidos directamente sobre
        la instancia viva de `editor` (Tiptap/ProseMirror) que posee
        `NoteEditor`: cada handler manipula `editor.state.doc`
        directamente (mover/duplicar/convertir/eliminar bloques,
        indexar bloques Mermaid dentro del documento). Extraerlos
        exigiría pasar `editor`, `mermaidBlocks`, `insertBlockAtSelection`,
        `syncMarkdownToEditor`, `mdContent`, `viewMode` y
        `topLevelPosAtIndex` como dependencias — no reduce acoplamiento
        real, solo mueve el JSX a otro archivo con casi la misma lista
        de parámetros, con el riesgo añadido de introducir un bug de
        posicionamiento/sincronización sin un pase de QA manual
        dedicado. Se deja documentado como candidato futuro si
        `NoteEditor.tsx` vuelve a crecer, pero no se ejecuta en esta
        fase.
- [x] 4.4 `CalendarView.tsx` (2026-08-01)
  - [x] 4.4.1 Investigada la duplicación de estado de formulario de
        evento. **Cambio de plan respecto a `design.md`**: la hipótesis
        de `design.md` era que `CalendarView` no necesitaba su propio
        estado (`evTitle`/`evDate`/etc.) si ya lo delegaba a
        `EventEditor`. Al leer el flujo de datos completo se confirmó
        que son **dos features genuinamente distintas, no una
        duplicación accidental**: `EventEditor` es el modal de
        crear/editar (guardado explícito con botón "Guardar"), mientras
        que `evTitle`/`evDate`/etc. alimentan el panel lateral de
        detalle del evento activo (`activeCalendarEvent`), con
        auto-guardado con debounce de 800ms — el mismo patrón que ya
        usa el panel de detalle de tareas en otras vistas de la app. No
        se puede eliminar ninguno de los dos sin perder una función real.
        Lo que sí era duplicación genuina y se resolvió: las constantes
        `EVENT_COLOR_DOT`/`EVENT_COLORS`/`REMINDER_OPTIONS`/
        `reminderLabel()`, usadas tanto por `EventEditor` como por el
        panel de detalle inline — se movieron a
        `src/lib/calendarEventPresentation.ts` para que ambos las
        compartan sin duplicar el código al mover `EventEditor` a su
        propio archivo. `EVENT_COLOR_BADGE`/`STATUS_DOT` se quedan en
        `CalendarView.tsx` (uso exclusivo suyo).
  - [x] 4.4.2 Movidos `AppSelect` a `src/components/AppSelect.tsx` y
        `EventEditor` a `src/components/EventEditor.tsx` (ambos ya eran
        prácticamente autocontenidos; solo necesitaron las constantes
        de `calendarEventPresentation.ts` de la tarea 4.4.1).
        Verificado con `tsc --noEmit`, `eslint` (mismo único warning
        preexistente de `max-lines`, ningún problema nuevo) y
        `vite build` limpio. `CalendarView.tsx`: 1141 → 768 líneas.
- [x] 4.5 `DashboardView.tsx` — movido `WeeklyMiniCalendar` a
      `src/components/WeeklyMiniCalendar.tsx` (2026-08-01). De paso se
      encontraron y resolvieron 2 duplicaciones no documentadas en
      `requirements.md`: (1) `toISODate()` en `DashboardView.tsx` era
      idéntica a `toISO()`, ya existente y ya importada en el mismo
      archivo desde `lib/colombianHolidays.ts` — se eliminó la copia
      local y se reemplazaron los 6 usos por `toISO()`; (2)
      `EVENT_COLOR_DOT` estaba duplicada entre `DashboardView.tsx` y
      `CalendarView.tsx`/`EventEditor.tsx` — `WeeklyMiniCalendar.tsx`
      ahora importa la versión compartida de
      `lib/calendarEventPresentation.ts` (creada en la tarea 4.4.1) en
      vez de redeclararla. `STATUS_DOT` se movió tal cual (solo se usa
      dentro de `WeeklyMiniCalendar`, no se comparte con el resto de
      `DashboardView.tsx`).
      Verificado con `tsc --noEmit`, `eslint` (mismos 2 warnings
      preexistentes, ningún problema nuevo) y `vite build` limpio.
      `DashboardView.tsx`: 758 → 633 líneas.

## Fase 5 — `ModalOverlay`/`ModalPanel` (req. §7 — issue/PR separado, QA manual)

- [x] 5.1 Definida la escala de z-index en `src/lib/zIndex.ts`
      (2026-08-01): `Z_MODAL = 1000` (modal de nivel superior, no
      anidado), `Z_MODAL_NESTED = 1010` (abierto sobre otro modal),
      `Z_MODAL_NESTED_2 = 1020` (abierto sobre un modal ya anidado —
      caso `ConfirmDeleteModal` dentro de `CustomThemeEditor` dentro de
      `SettingsModal`). Reemplaza los 6 valores dispersos encontrados en
      la auditoría (`50`, `600`, `10000`, `10001`, `10002`, `10010`).
      `Z_MENU` no se creó — los dismiss-catchers de menús contextuales
      (`fixed inset-0 z-10`/`z-40`) ya están resueltos por
      `usePositionedMenu` (Fase 1) y quedan fuera del alcance de esta
      fase (son menús, no modales).
- [x] 5.2 Creados `src/components/shared/ModalOverlay.tsx` (backdrop +
      centrado + z-index + cierre opcional en click-afuera vía prop
      `onClose`, con variante `align="start"` para `SearchModal`) y
      `src/components/shared/ModalPanel.tsx` (detiene la propagación
      del click para que el overlay no lo interprete como click en el
      fondo).
- [x] 5.3 Auditados los ~19 modales existentes (backdrop, z-index,
      cierre en click-afuera, anidamiento — ver detalle completo más
      abajo) y migrados todos a `ModalOverlay`/`ModalPanel`. Decisión
      acordada con el usuario: los modales de **formulario simple y
      rápido** pasan a cerrar siempre en click-afuera (aunque algunos
      no lo hacían antes, por inconsistencia sin criterio, no por
      diseño deliberado); los de **edición compleja o confirmación
      destructiva** nunca cierran en click-afuera (riesgo real de
      perder trabajo o decisión no querida). Tabla de decisión final:

      | Modal | Cierra en click-afuera | z-index | Cambio de comportamiento |
      |---|---|---|---|
      | `SearchModal` | Sí | `Z_MODAL` | No (ya cerraba) |
      | `SettingsModal` | Sí | `Z_MODAL` | No |
      | `TaskList` (nueva tarea) | **Sí** | `Z_MODAL` | **Sí** — antes no cerraba |
      | `EventEditor` | Sí | `Z_MODAL` | No |
      | `ExportModal` | Sí | `Z_MODAL` | No |
      | `ImageLinkModal` | Sí | `Z_MODAL` | No (migrado de backdrop+panel hermanos a `ModalOverlay`/`ModalPanel` anidados, mismo resultado visual) |
      | `MermaidEditorModal` | No | `Z_MODAL` | No |
      | `OvertimePreviewModal` | Sí | `Z_MODAL` | No |
      | `OvertimeEditor` (conflicto de horario) | No | `Z_MODAL` | No |
      | `CustomThemeEditor` | No | `Z_MODAL_NESTED` | No |
      | `AbsenceModal` | **Sí** | `Z_MODAL` | **Sí** — antes no cerraba |
      | `DailyEditor` (promover a tarea) | **Sí** | `Z_MODAL` | **Sí** — antes no cerraba |
      | `KanbanBoard` (nueva tarjeta) | Sí | `Z_MODAL` | No |
      | `NoteList` (editar tags) | Sí | `Z_MODAL` | No (mecanismo unificado de `onMouseDown` a `onClick`, mismo resultado) |
      | `Sidebar` — nueva subcarpeta de proyecto | **Sí** | `Z_MODAL` | **Sí** — antes no cerraba |
      | `Sidebar` — crear carpeta | **Sí** | `Z_MODAL` | **Sí** — antes no cerraba |
      | `Sidebar` — nueva subcarpeta | **Sí** | `Z_MODAL` | **Sí** — antes no cerraba |
      | `Sidebar` — editar tags de carpeta | Sí | `Z_MODAL` | No (mecanismo unificado de `onMouseDown` a `onClick`) |
      | `Sidebar` — nuevo proyecto | Sí | `Z_MODAL` | No |
      | `ConfirmDeleteModal` (primitivo compartido, ~12 sitios de uso) | No, nunca (deliberado) | `Z_MODAL` por defecto; `Z_MODAL_NESTED`/`Z_MODAL_NESTED_2` cuando se abre anidado (pasado explícito por el caller: `GeneralSettingsTab`, `CustomThemeEditor`, `AbsenceModal`) | No |

      **Bug encontrado y corregido de paso**: la auditoría detectó que
      `ConfirmDeleteModal` (z-index 10000 por defecto) podía renderizar
      **detrás** de `CustomThemeEditor` (z-index 10001) al abrirse
      anidado ahí — en la práctica no llegaba a ocurrir porque
      `CustomThemeEditor.tsx` ya pasaba `zIndex={10002}` manualmente en
      ese caso, pero era frágil (dependía de que cada caller recordara
      hacerlo). Con la escala nueva, `CustomThemeEditor` usa
      `Z_MODAL_NESTED` (1010) y su `ConfirmDeleteModal` interno usa
      `Z_MODAL_NESTED_2` (1020) — la relación queda expresada en las
      constantes en vez de en números mágicos coordinados a mano.
      También se corrigieron 2 casos preexistentes de
      `react/no-unescaped-entities` encontrados de paso en
      `SearchModal.tsx` y `CustomThemeEditor.tsx` (mismo patrón ya
      corregido en la Fase 4.2 para `GeneralSettingsTab.tsx`).
      Verificado con `tsc --noEmit` y `eslint` (44 problemas vs. 48 en
      baseline — 4 menos por los unescaped-entities corregidos, ningún
      problema nuevo) y `vite build` limpio.
- [x] 5.4 Pase de QA manual (2026-08-01): app probada en
      `pnpm tauri dev`, confirmado por el usuario que los modales se ven
      y comportan como se esperaba, incluidos los 6 con cambio de
      comportamiento (nueva tarea, ausencia, promover a tarea, y los 3
      de creación de carpeta en el Sidebar) y los que debían seguir sin
      cerrar (Mermaid, tema personalizado, conflicto de horario).

## Fase 6 — Organizar `src/components/` por feature (req. §8, ver `design.md` §Fase 6)

- [x] 6.1 Movidos con `git mv` los 10 archivos de `settings/`
      (2026-08-01): `SettingsModal.tsx`, `AboutSettingsTab.tsx`,
      `DataSettingsTab.tsx`, `GeneralSettingsTab.tsx`,
      `GitSettingsTab.tsx`, `ShortcutsSettingsTab.tsx`,
      `WorkSettingsTab.tsx`, `CustomThemeEditor.tsx`, `ColorPicker.tsx`,
      `ThemeTile.tsx`
- [x] 6.2 Movidos los 3 archivos de `calendar/`: `CalendarView.tsx`,
      `EventEditor.tsx`, `AppSelect.tsx`
- [x] 6.3 Movidos los 2 archivos de `dashboard/`: `DashboardView.tsx`,
      `WeeklyMiniCalendar.tsx`
- [x] 6.4 Movidos los 4 archivos de `sidebar/`: `Sidebar.tsx`,
      `FolderTreeItem.tsx`, `ProjectTreeItem.tsx`, `RootDropLine.tsx`
- [x] 6.5 Movidos los 7 archivos de `notes/` (`NoteEditor.tsx`,
      `NoteList.tsx`, `MermaidEditorModal.tsx`, `MermaidBlock.tsx`,
      `MarkdownPreview.tsx`, `LinkPreviewCard.tsx`, `ExportModal.tsx`) y
      anidado `visual-editors/` como `notes/visual-editors/`
- [x] 6.6 Movidos los 5 archivos de `tasks/`: `TaskList.tsx`,
      `TaskEditor.tsx`, `KanbanBoard.tsx`, `RichTextEditor.tsx`,
      `TaskContextMenu.tsx`
- [x] 6.7 Movidos los 3 archivos de `overtime/`: `OvertimeList.tsx`,
      `OvertimeEditor.tsx`, `OvertimePreviewModal.tsx`
- [x] 6.8 Movidos los 2 archivos de `daily/`: `DailyList.tsx`,
      `DailyEditor.tsx`
- [x] 6.9 Movidos los 6 archivos de `shared/`: `ConfirmDeleteModal.tsx`,
      `AppDatePicker.tsx`, `InlineRenameInput.tsx`, `ToggleSwitch.tsx`,
      `AbsenceModal.tsx`, `ImageLinkModal.tsx`
- [x] 6.10 Reescritos todos los imports relativos afectados con un
       script Python (por archivo movido: mapa ruta-vieja→ruta-nueva
       derivado de `git status --short` tras los `git mv`, resolviendo
       cada import relativo contra la ubicación ANTIGUA del archivo que
       lo contiene para encontrar el destino correcto, luego
       recalculando la ruta relativa desde la ubicación NUEVA) —
       actualizados también `src/App.tsx` (7 imports estáticos + 9
       `lazy()`) y `src/hooks/useLinkPreview.ts` (import de
       `LinkPreviewCard`). Primer intento del script tenía un bug
       (resolvía contra el filesystem actual, que ya no tenía los
       archivos en su ubicación vieja) — corregido antes de aplicar.
- [x] 6.11 Verificado `tsc --noEmit` limpio, `eslint` (48 problemas,
       idéntico al baseline vía `git stash` — cero nuevos) y
       `vite build` exitoso. QA manual con `pnpm tauri dev` confirmado
       por el usuario sin problemas.

## Fuera de alcance (ver requirements.md §9)

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
- **Fase 6**: `tsc --noEmit` limpio (detecta cualquier ruta de import
  rota), `eslint` sin problemas nuevos, `vite build` exitoso, y
  `pnpm tauri dev` probando cada pantalla principal.
