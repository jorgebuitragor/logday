# Tasks — Consistencia visual de temas

Estado: implementado. Verificado visualmente por el usuario en los 4 temas
(Oscuro, Claro, Alto contraste, Descanso visual).

## Hecho

- [x] **1. `.task-code-link` en `App.css`** (req. §2, párrafo 1)
  - [x] 1.1 `color: rgb(129 140 248)` → `var(--accent-link)`
  - [x] 1.2 `border-bottom: 1px dotted rgb(129 140 248 / 0.5)` →
        `1px dotted color-mix(in srgb, var(--accent-link) 50%, transparent)`
  - [x] 1.3 `:hover { color: rgb(165 180 252) }` → `var(--accent)`

- [x] **2. Bloque de drag handle en `App.css`** (req. §2, párrafo 2)
  - [x] 2.1 `.drag-handle:hover` (background + border, 2 valores) →
        `color-mix()` con `var(--accent)`
  - [x] 2.2 `.drag-handle:active` / `[data-dragging='true']` (background +
        border, 2 valores) → `color-mix()`
  - [x] 2.3 `.ProseMirror.dragging > *` outline → `color-mix()`
  - [x] 2.4 `[data-drag-handle-selected]` / `.drag-handle-active-node`
        outline → `color-mix()`
  - [x] 2.5 `.drag-drop-indicator` / `.tiptap-drag-drop-indicator`
        (gradient, 2 stops + `::before`) → `color-mix()` con `var(--accent)`
  - [x] 2.6 `.block-drop-flash` background → `color-mix()`

- [x] **3. `Dropcursor` de TipTap** (req. §2, párrafo 3)
  - [x] 3.1 `NoteEditor.tsx:525` — `color: 'rgba(129, 140, 248, 0.55)'` →
        `color: 'color-mix(in srgb, var(--accent) 55%, transparent)'`

- [x] **4. Toggle código/visual de Mermaid** (req. §2, párrafo 4)
  - [x] 4.1 `MermaidEditorModal.tsx:176` — `color`/`borderColor` `#6366f1`
        → `var(--accent)`

- [x] **5. Editor visual de diagramas (`FlowVisualEditor.tsx`)** (req. §2,
      párrafo 5)
  - [x] 5.1 `baseStyle()` — border (`#6366f1`) + boxShadow
        (`rgba(99,102,241,0.2)`) → `var(--accent)` / `color-mix()`
  - [x] 5.2 `handleStyle` — background `#6366f1` → `var(--accent)`
  - [x] 5.3 `DecisionNode` — misma lógica que 5.1, duplicada
        independientemente (no reutiliza `baseStyle()`)
  - [x] 5.4 `StartEndNode` — background/border → `var(--accent-strong)` /
        `var(--accent)` (se preservó el mapeo exacto: fondo usaba
        `#6366f1` = `--accent-strong` del tema oscuro, borde usaba
        `#818cf8` = `--accent`)
  - [x] 5.5 `DEFAULT_EDGE` — `markerEnd.color` + `style.stroke`
        (`#6366f1`) → `var(--accent-strong)`

- [x] **6. Color "indigo" estable en eventos de calendario** (req. §3)
  - [x] 6.1 `CalendarView.tsx` — `EVENT_COLOR_DOT.indigo` /
        `EVENT_COLOR_BADGE.indigo` → valores arbitrarios fijos
        (`bg-[#818cf8]`, `border-[#6366f1]/40 bg-[#6366f1]/10 text-[#818cf8]`)
  - [x] 6.2 `DashboardView.tsx` — mismo cambio en la paleta duplicada,
        incluyendo el fallback `?? 'bg-indigo-400'` de la línea 233
        (encontrado al implementar, no estaba en el spec original)
  - [x] 6.3 Verificado por grep — no existe una tercera copia de
        `EVENT_COLOR_*` en el resto del código

- [x] **7. (Opcional) `--bg-secondary` no definida** (req. §4)
  - [x] 7.1 Definida en los 4 bloques de tema de `App.css` como
        `--bg-secondary: var(--bg-surface);` (alias, no valor duplicado —
        se mantiene sincronizada automáticamente con `--bg-surface`)
  - [x] 7.2 Confirmado visualmente por el usuario

## Verificación final

Confirmado por el usuario con `pnpm tauri dev`, cambiando entre los 4 temas
desde Configuración.
