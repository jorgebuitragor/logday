# Design — Consistencia visual de temas

Estado: implementado. Ver [`requirements.md`](./requirements.md) para el
contrato de comportamiento.

## 1. Componentes involucrados

| Archivo | Qué se toca |
|---|---|
| `src/App.css` | Reglas de `.task-code-link` y del bloque de drag handle (líneas 372-382 y 754-827) — pasan de valores `rgb()`/`rgba()` fijos a `var(--accent...)` / `color-mix()`. Opcionalmente, definir `--bg-secondary` en los 4 bloques de tema. |
| `src/components/NoteEditor.tsx` | Línea 525, config del `Dropcursor` de TipTap. |
| `src/components/MermaidEditorModal.tsx` | Línea 176, `style` inline del toggle código/visual. |
| `src/components/visual-editors/FlowVisualEditor.tsx` | `baseStyle()`, `handleStyle`, `DecisionNode`, `StartEndNode`, `DEFAULT_EDGE` — todos los valores de color inline del editor visual de diagramas. |
| `src/components/CalendarView.tsx` | `EVENT_COLOR_DOT.indigo` / `EVENT_COLOR_BADGE.indigo` — pasan de clases Tailwind `indigo-*` a valores arbitrarios fijos. |
| `src/components/DashboardView.tsx` | Misma paleta duplicada — mismo cambio. |

No se toca `src/App.css:128-158` (el mecanismo de override existente).

## 2. Decisión clave: parchar los gaps, no reemplazar el mecanismo

**Se mantiene el hack de selectores de atributo en `App.css:128-158` tal
cual está.** La alternativa —migrar todas las clases Tailwind
`indigo-*`/`purple-*`/`violet-*` hardcodeadas del código a
`var(--accent)` explícito— se descartó:

- El hack ya cubre correctamente ~15+ componentes hoy (confirmado por
  auditoría exhaustiva: `OvertimeEditor.tsx`, `ExportModal.tsx`,
  `TaskList.tsx`, `ImageLinkModal.tsx`, `AppDatePicker.tsx`,
  `DailyEditor.tsx`, `KanbanBoard.tsx`, `GitModal.tsx`,
  `LinkPreviewCard.tsx`, `OvertimePreviewModal.tsx`, `DailyList.tsx`,
  `Sidebar.tsx`, `TaskEditor.tsx`, `NoteList.tsx`, `SettingsModal.tsx`,
  partes de `NoteEditor.tsx`, entre otros) — no hay ningún bug visual ahí
  hoy.
  una migración completa tocaría decenas de archivos sin arreglar ningún
  bug real adicional a los ya identificados en este spec.
- El costo de mantener el hack es fragilidad futura (cualquier clase nueva
  con un infijo como `-l-`, `-t-`, etc. repite el bug de OvertimeList), no
  un bug presente. Ese riesgo se documenta como conocido en
  `requirements.md` §1, pero mitigarlo por completo es un trabajo de
  refactor mucho mayor que "arreglar la inconsistencia visual reportada",
  que es el alcance acordado.

Este spec soluciona únicamente los casos donde el hack **no puede
funcionar en absoluto** porque el color no vive en una clase Tailwind
(CSS plano, `style={{}}` inline, configuración pasada a una librería en
JS) — ahí no hay alternativa: hay que tocar el valor directamente.

## 3. Patrones de arreglo

### 3.1 CSS plano con opacidad fija → `color-mix()`

El propio hack ya establece el patrón para expresar "el acento del tema
con una opacidad dada" en CSS puro, usado en sus reglas `ring`/`from`/`to`
(`App.css:144-157`):

```css
color-mix(in srgb, var(--accent) 45%, transparent)
```

Se replica el mismo patrón para cada valor `rgba(129, 140, 248, X)` en
`.task-code-link` y en el bloque de drag handle, convirtiendo la opacidad
original (ej. `0.10` → `10%`, `0.55` → `55%`) al porcentaje equivalente de
`color-mix`. Para los valores sin canal alfa (`rgb(129 140 248)` sólido),
se usa `var(--accent)` directamente.

### 3.2 `style={{}}` inline en TSX/JS → string CSS var

`var(--accent)` es un string CSS válido y ya se usa así en el código
existente (`text-[var(--accent)]`, `bg-[var(--accent)]` en
`CalendarView.tsx` y `SettingsModal.tsx` para toggles). Para los `style={{
color: '#6366f1' }}` inline de `MermaidEditorModal.tsx` y para la config
del `Dropcursor` de TipTap en `NoteEditor.tsx` (que acepta un string de
color arbitrario), el arreglo es un reemplazo directo del literal hex/rgba
por `'var(--accent)'` (o `'color-mix(in srgb, var(--accent) 55%, transparent)'`
donde se necesite opacidad, ya que `color-mix()` es válido como valor de
color en cualquier contexto CSS, incluyendo props de librerías que solo
reenvían el string a un `style`).

### 3.3 `FlowVisualEditor.tsx` — mismo patrón, más puntos de uso

`baseStyle()` centraliza border + boxShadow para la mayoría de los nodos,
así que el arreglo ahí se propaga automáticamente a los nodos que la usan
por spread. `DecisionNode` duplica esa lógica de forma independiente (no
llama a `baseStyle()`) y necesita el mismo cambio por separado.
`handleStyle`, `StartEndNode` y `DEFAULT_EDGE` son objetos de estilo
independientes, cada uno necesita su propio reemplazo. El boxShadow de
selección (`rgba(99,102,241,0.2)`) sigue el mismo `color-mix()` que el
resto.

### 3.4 Color "indigo" de eventos de calendario → valor arbitrario fijo

Para que el color deje de responder al tema (requisito §3), no se usa
`var(--accent)` — se usa el valor hex/rgb **literal** que la paleta ya
muestra hoy por defecto, como clase Tailwind de valor arbitrario en vez de
la utilidad con nombre:

```
// Antes (interceptado por el hack)
dot:   'bg-indigo-400'
badge: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'

// Después (mismo color visual, pero el selector [class*="...-indigo-"]
// ya no coincide con el nombre de clase)
dot:   'bg-[#818cf8]'
badge: 'border-[#6366f1]/40 bg-[#6366f1]/10 text-[#818cf8]'
```

Mismo patrón que ya sigue implícitamente "violet" en la misma paleta (usa
la utilidad con nombre `violet-*`, que el selector de atributo no
menciona, así que ya es estable hoy sin ningún cambio).

### 3.5 `--bg-secondary` (opcional, requisito §4)

Definir la variable en los 4 bloques de tema de `App.css`, con un valor
consistente con las variables de fondo ya existentes de cada tema (por
ejemplo, igual a `--bg-surface` o un tono intermedio entre `--bg-surface`
y `--bg-hover` de cada tema — a decidir al implementar, mirando qué se ve
mejor en cada uno).

## 4. Alternativas descartadas

- **Migrar todo el código a `var(--accent)` y eliminar el hack de
  `App.css:128-158`.** Descartado — ver §2. Blast radius (decenas de
  archivos) desproporcionado al problema real (un puñado de gaps
  puntuales).
- **Dejar que "indigo" en eventos de calendario siga el acento del
  tema** (aceptar el comportamiento accidental actual). Descartado por
  decisión explícita del usuario — debe comportarse igual que "violet".
- **Usar `rgba()` con los componentes RGB de cada `--accent` calculados en
  JS/CSS** en vez de `color-mix()`. Descartado — `color-mix()` ya es el
  patrón establecido en este mismo archivo (el propio hack lo usa), más
  simple, y con buen soporte en el WebView de Tauri (WebKit moderno en
  macOS/Windows).
