# Tasks — Consistencia visual de temas

Estado: en diseño. Nada de esto está implementado — es la lista de trabajo
para cuando se apruebe pasar a implementación. Ningún checkbox debe
marcarse hasta que el código correspondiente exista y esté verificado en
los 4 temas.

## Pendiente

- [ ] **1. `.task-code-link` en `App.css`** (req. §2, párrafo 1)
  - [ ] 1.1 `color: rgb(129 140 248)` → `var(--accent-link)`
  - [ ] 1.2 `border-bottom: 1px dotted rgb(129 140 248 / 0.5)` →
        `1px dotted color-mix(in srgb, var(--accent-link) 50%, transparent)`
  - [ ] 1.3 `:hover { color: rgb(165 180 252) }` → `var(--accent)`

- [ ] **2. Bloque de drag handle en `App.css`** (req. §2, párrafo 2)
  - [ ] 2.1 `.drag-handle:hover` (background + border, 2 valores) →
        `color-mix()` con `var(--accent)`
  - [ ] 2.2 `.drag-handle:active` / `[data-dragging='true']` (background +
        border, 2 valores) → `color-mix()`
  - [ ] 2.3 `.ProseMirror.dragging > *` outline → `color-mix()`
  - [ ] 2.4 `[data-drag-handle-selected]` / `.drag-handle-active-node`
        outline → `color-mix()`
  - [ ] 2.5 `.drag-drop-indicator` / `.tiptap-drag-drop-indicator`
        (gradient, 2 stops + `::before`) → `color-mix()` con `var(--accent)`
  - [ ] 2.6 `.block-drop-flash` background → `color-mix()`

- [ ] **3. `Dropcursor` de TipTap** (req. §2, párrafo 3)
  - [ ] 3.1 `NoteEditor.tsx:525` — `color: 'rgba(129, 140, 248, 0.55)'` →
        `color: 'color-mix(in srgb, var(--accent) 55%, transparent)'`

- [ ] **4. Toggle código/visual de Mermaid** (req. §2, párrafo 4)
  - [ ] 4.1 `MermaidEditorModal.tsx:176` — `color`/`borderColor` `#6366f1`
        → `var(--accent)`

- [ ] **5. Editor visual de diagramas (`FlowVisualEditor.tsx`)** (req. §2,
      párrafo 5)
  - [ ] 5.1 `baseStyle()` — border (`#6366f1`) + boxShadow
        (`rgba(99,102,241,0.2)`) → `var(--accent)` / `color-mix()`
  - [ ] 5.2 `handleStyle` — background `#6366f1` → `var(--accent)`
  - [ ] 5.3 `DecisionNode` — misma lógica que 5.1, duplicada
        independientemente (no reutiliza `baseStyle()`)
  - [ ] 5.4 `StartEndNode` — background (`#6366f1`) + border (`#818cf8`) →
        variables de tema
  - [ ] 5.5 `DEFAULT_EDGE` — `markerEnd.color` + `style.stroke`
        (`#6366f1`) → `var(--accent)`

- [ ] **6. Color "indigo" estable en eventos de calendario** (req. §3)
  - [ ] 6.1 `CalendarView.tsx` — `EVENT_COLOR_DOT.indigo` /
        `EVENT_COLOR_BADGE.indigo` → valores arbitrarios fijos (ver
        `design.md` §3.4)
  - [ ] 6.2 `DashboardView.tsx` — mismo cambio en la paleta duplicada
  - [ ] 6.3 Verificar que no exista una tercera copia de esta paleta en
        otro archivo antes de dar la tarea por completa (grep de
        `EVENT_COLOR` al implementar)

- [ ] **7. (Opcional) `--bg-secondary` no definida** (req. §4)
  - [ ] 7.1 Definir `--bg-secondary` en los 4 bloques de tema de
        `App.css` (`:root`, `light`, `high-contrast`, `visual-rest`)
  - [ ] 7.2 Confirmar visualmente que la toolbar del editor de notas deja
        de verse transparente en los 4 temas

## Verificación final (todas las tareas)

Con `pnpm tauri dev` corriendo, para cada uno de los 4 temas
(Configuración → Tema): Oscuro, Claro, Alto contraste, Descanso visual —
confirmar:

- El link de un código de tarea (`#CODIGO`) en una nota se ve del color de
  acento del tema, no morado fijo.
- El drag handle de un bloque de nota (hover, click-hold, arrastre) usa el
  acento del tema.
- El editor de un diagrama Mermaid: el toggle código/visual y todos los
  nodos/conexiones del editor visual usan el acento del tema.
- Un evento de calendario categorizado "indigo" se ve visualmente igual
  (mismo tono morado) en los 4 temas, igual que "violet".
- (Si se hizo la tarea 7) La toolbar del editor de notas tiene un fondo
  visible, no transparente, en los 4 temas.
