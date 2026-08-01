# Design — Estructura de código y buenas prácticas React

Estado: en progreso (Fase 0 implementada, ver `tasks.md`). Ver
[`requirements.md`](./requirements.md) para el contrato de comportamiento
y el diagnóstico completo con conteos.

## Fase 0 — ESLint

Config plana (`eslint.config.js`, ESLint 9+ flat config — el proyecto usa
Vite 6 + TS 5.8, compatible con la versión moderna) con:

```js
// eslint.config.js (esqueleto)
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules, // rules-of-hooks: error, exhaustive-deps: warn
      '@typescript-eslint/no-unused-vars': 'error',
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
);
```

El umbral de `max-lines` (500 como punto de partida, a ajustar) es una
sugerencia inicial — el objetivo es que aparezca como warning en los
archivos que este mismo spec va a reducir en fases posteriores, no
bloquear el build hoy. `package.json` gana `"lint": "eslint src"`.
Dependencias nuevas: `eslint`, `typescript-eslint`, `eslint-plugin-react`,
`eslint-plugin-react-hooks`, `@eslint/js` (todas devDependencies).

## Fase 1 — Primitivos de UI compartidos

### `ToggleSwitch`

```tsx
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: 'sm' | 'md' | 'lg'; // small/medium/large ya identificados
  disabled?: boolean;
}
```

Internamente selecciona las clases Tailwind ya usadas por tamaño (track
`h-4 w-7` / `h-5 w-9` / `h-6 w-11`, knob proporcional, traslación por
tamaño) y siempre renderiza `role="switch"` + `aria-checked={checked}` —
hoy solo la variante pequeña (la de `GitModal.tsx`/`gitToggleCls`) lo
tiene. Reemplaza 14 ocurrencias en `CalendarView.tsx`, `SettingsModal.tsx`,
`GitModal.tsx`, y elimina las funciones duplicadas `toggleCls`
(`GitModal.tsx`) y `gitToggleCls` (`SettingsModal.tsx`).

### `InlineRenameInput`

```tsx
interface InlineRenameInputProps {
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  className?: string; // para las variaciones de tamaño/padding/alineación ya vistas
  autoFocus?: boolean;
}
```

Encapsula: estado local del draft, `onKeyDown` (Enter→commit,
Escape→cancel), `onBlur`→commit. Dos de las 4 ocurrencias actuales usan
`ref` + `setTimeout(..., 50)` para el foco en vez de `autoFocus` — el
componente compartido estandariza en `autoFocus` (más simple, sin
timing frágil) salvo que se detecte un motivo real para el `setTimeout`
en algún caso al migrar (a confirmar durante implementación, no aquí).

### `ConfirmDeleteModal` + `useConfirmDelete`

```tsx
interface ConfirmDeleteModalProps {
  title: string;
  message: React.ReactNode; // para poder interpolar el nombre del ítem con énfasis
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'solid' | 'soft'; // las 2 familias visuales ya identificadas
}

function useConfirmDelete(confirmDestructiveActions: boolean) {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const request = (action: () => void) => {
    if (confirmDestructiveActions) setPending(() => action);
    else action();
  };
  const confirm = () => { pending?.(); setPending(null); };
  const cancel = () => setPending(null);
  return { isOpen: pending !== null, request, confirm, cancel };
}
```

El caso atípico (`TaskContextMenu.tsx`, confirmación posicionada en vez
de centrada) se resuelve dejando que `ConfirmDeleteModal` acepte un
`position?: { x: number; y: number }` opcional — si se da, se renderiza
posicionado (reutilizando `usePositionedMenu`/`placeMenuAtPointer`) en
vez de centrado con backdrop.

Migrar `TaskEditor.tsx:150` de `window.confirm()` a este mismo hook es
parte explícita de esta fase (requisito, no solo limpieza).

### `usePositionedMenu`

```tsx
interface UsePositionedMenuOptions {
  estimatedSize: { width: number; height: number };
  onClose: () => void;
  closeOnEscape?: boolean; // default true
}

function usePositionedMenu(anchor: { x: number; y: number } | AnchorRect | null, options: UsePositionedMenuOptions) {
  // retorna: { ref (para medir tamaño real), style (position/top/left/visibility), isReady }
}
```

Internamente usa `placeMenuAtPointer`/`placeMenuNearAnchor` de
`src/lib/menuPosition.ts` (sin tocar esas funciones — ya son correctas y
genéricas, el problema es la capa de React alrededor, no la matemática).
Cubre: medición en dos pasadas (igual al patrón ya usado en
`LinkPreviewCard.tsx`), cierre en click-fuera (`document.addEventListener('mousedown', ...)`
comprobando `ref.current?.contains`), cierre con Escape, recálculo en
`resize`. Reemplaza las ~15+ instancias manuales — el mayor volumen de
reducción de código de todo el spec (estimado >300 líneas solo en
`Sidebar.tsx`).

**Nota de migración**: cada call site tiene efectos secundarios propios
al cerrar (ej. `NoteList.tsx` limpia el estado de un submenú anidado
además del menú principal) — el hook expone `onClose` como callback del
consumidor precisamente para que cada sitio siga pudiendo hacer su
limpieza extra, no se pierde flexibilidad.

### `ThemeTile`

```tsx
interface ThemeTileProps {
  active: boolean;
  icon?: React.ReactNode;
  colorDot?: string; // hex, para el caso de temas personalizados
  label: string;
  onClick: () => void;
  dashed?: boolean; // variante "crear nuevo"
}
```

Alcance limitado a `src/components/SettingsModal.tsx` (las 3 ocurrencias
ahí). No se comparte con la paleta de colores de eventos de
`CalendarView.tsx` (patrón visual distinto: puntos de color simples sin
tarjeta/borde/ícono) ni con `ColorPicker.tsx` (ya es su propio componente
reutilizable, correcto tal como está).

## Fase 2 — Deduplicación puntual

- `parseDailyFile`/`serializeDailyFile` se mueven de `appStore.ts` a un
  nuevo `src/lib/dailyFileFormat.ts` (mismo criterio que separó
  `overtimeCalc.ts`/`overtimeExcel.ts` del store en su momento). Ambos
  call sites (`appStore.ts`, `DashboardView.tsx`) importan de ahí.
- Duplicación `GitModal.tsx` ↔ pestaña "Git" de `SettingsModal.tsx`: la
  investigación encontró que comparten una función helper idéntica
  (`toggleCls`/`gitToggleCls`), fuerte indicio de que toda la sección fue
  copiada. La resolución concreta (¿la pestaña de Settings renderiza
  `<GitModal inline />`? ¿se extrae un `GitSettingsForm` compartido que
  ambos usan?) se decide al implementar la Fase 4 (donde de todas formas
  se está separando `SettingsModal.tsx` en componentes por pestaña) —
  aquí solo se deja constancia del hallazgo y el requisito de resolverlo,
  no se prescribe la forma exacta para no bloquear la fase en una
  decisión de diseño que se ve mejor con el código de ambos archivos
  lado a lado en el momento de implementar.
- `DailyEntry` y el `SearchResult` duplicado se eliminan de
  `types/index.ts` sin reemplazo (confirmado código muerto).

## Fase 3 — Separación de `types/index.ts`

Mapeo domain → archivo (sin barrel, importes directos por ruta, igual
que `src/lib/`):

| Archivo nuevo | Contenido |
|---|---|
| `types/task.ts` | `TaskStatus`, `Task` |
| `types/note.ts` | `Note` |
| `types/overtime.ts` | `OvertimeEntry`, `OvertimeMonthMeta` |
| `types/calendar.ts` | `EventColor`, `EventRepeat`, `CalendarEvent` |
| `types/absence.ts` | `AbsenceType`, `AbsenceDay` |
| `types/theme.ts` | `BuiltInTheme`, `Theme`, `CustomTheme` |
| `types/git.ts` | `GitConfig`, `GitStatus`, `GitRemoteStatus` |
| `types/config.ts` | `AppConfig`, `BackupSettings`, `ActiveSection`, `StartupScreen`, `Shortcuts`, `DEFAULT_SHORTCUTS`, `ViewMode` |
| `types/common.ts` | `Language`, `ToastKind`, `AppToast` |

`AppConfig`/`BackupSettings` importan de `theme.ts`, `overtime.ts` y
`common.ts` — esperado, son tipos "agregados" por diseño (el backup junta
piezas de cada dominio). `store/appStore.ts` y `SettingsModal.tsx`
pasan de una línea de import a varias (una por archivo de dominio que
usen) — es el costo esperado de ser agregadores globales, documentado en
`requirements.md` §1.2 para que no se lea como un fallo del split al
revisar el diff.

`daily` no tiene archivo propio: el único tipo candidato (`DailyEntry`)
es código muerto y se elimina en la Fase 2; el dato real de dailys en
runtime es `Record<string, string>` inline en el store, sin tipo
dedicado que mover.

## Fase 4 — Componentes grandes

Patrón general: primero extraer la lógica **pura** (sin JSX/hooks) a
`lib/`, luego extraer sub-componentes a archivos propios, y solo al
final aplicar los primitivos de la Fase 1 donde corresponda — en ese
orden, porque cada paso reduce el tamaño del archivo antes de tocar el
siguiente, evitando revisar un diff gigante de una sola vez.

- **`Sidebar.tsx`** (2209 → objetivo ~800-1000 tras extraer):
  `FolderTreeItem.tsx`, `ProjectTreeItem.tsx`, `RootDropLine.tsx` (ya son
  funciones separadas dentro del archivo, solo hace falta moverlas);
  `src/lib/folderDragDrop.ts` para `startFolderDrag` y el estado
  imperativo de highlight que lo acompaña; `src/lib/dailyPdfExport.ts`
  (o similar) para la generación de PDF inline de
  `handleExportDailyMonth`, siguiendo el mismo criterio que
  `overtimeExcel.ts`; reemplazo de las 7 implementaciones de menú
  contextual por `usePositionedMenu`.
- **`SettingsModal.tsx`** (1564 → objetivo ~200-300 líneas de shell +
  pestañas separadas): `GeneralSettingsTab.tsx`, `WorkSettingsTab.tsx`,
  `ShortcutsSettingsTab.tsx`, `DataSettingsTab.tsx`,
  `GitSettingsTab.tsx` (resolviendo la duplicación con `GitModal.tsx` de
  la Fase 2), `AboutSettingsTab.tsx`. El componente principal queda
  como shell: navegación de pestañas + estado que sea genuinamente
  compartido entre pestañas (si lo hay).
- **`NoteEditor.tsx`** (2851 → el más grande, reducción más significativa
  esperada): `src/lib/emojiCatalog.ts` (todo el subsistema de
  `EmojiOption`/`ES_TOKEN_MAP`/`buildEmojiCatalog`, ~125 líneas puras),
  `normalizeEditorMarkdown` y `createTaskCodePlugin` también a `lib/`
  (cero JSX/hooks, son pura lógica de ProseMirror/markdown); hook
  `useLinkPreview` para el subsistema de vista previa de enlaces
  (ya es prácticamente autocontenido: su propio estado, efectos y
  handlers, solo toca el resto del componente a través de `editor` y
  anclas del DOM). El subsistema de menú contextual de bloque y el
  editor de diagramas Mermaid quedan documentados como candidatos
  adicionales de extracción, sin comprometerse a una forma exacta aquí
  — se evalúan al implementar, dado el tamaño y acoplamiento interno de
  ese archivo.
- **`CalendarView.tsx`**: `AppSelect.tsx`, `EventEditor.tsx` a archivos
  propios. Antes de mover `EventEditor`, resolver la duplicación de
  estado del formulario de evento (`evTitle`/`evDate`/etc. declarados
  tanto en `CalendarView` como en `EventEditor`) — probablemente
  `CalendarView` no necesita ese estado si ya lo delega a `EventEditor`,
  pero requiere leer el flujo de datos exacto al implementar.
- **`DashboardView.tsx`**: `WeeklyMiniCalendar.tsx` a archivo propio.

## Fase 5 — `ModalOverlay`/`ModalPanel`

```tsx
interface ModalOverlayProps {
  onClose?: () => void; // si se omite, no cierra al hacer click en el fondo
  blur?: boolean; // default true, para desactivar en los modales que hoy no lo tienen
  zIndex?: number; // default a una constante única del design system, no un número mágico por archivo
  children: React.ReactNode;
}
```

Se define una escala de z-index documentada (ej. `Z_MODAL = 1000`,
`Z_MODAL_NESTED = 1010` para modales de confirmación que se abren sobre
otro modal, `Z_MENU = 900`) reemplazando los valores actuales dispersos
(50, 500-600, 10000-10010) sin ningún criterio visible. Cada uno de los
~19 modales existentes se migra individualmente, decidiendo
explícitamente su comportamiento de cierre en backdrop — la lista de esa
decisión por modal se documenta en `tasks.md` al implementar esta fase
(no aquí, para no prescribir un comportamiento sin haber mirado cada
caso con detalle).

## Alternativas descartadas

- **Dividir `appStore.ts` en slices de Zustand.** Es la forma idiomática
  de reducir el archivo sin romper el acoplamiento cruzado (167 llamadas
  a `get()`), pero descartado por decisión explícita del usuario para
  este spec — documentado en `requirements.md` §8 como opción técnica
  válida para un spec futuro.
- **Dividir tiendas de Zustand por dominio (stores separados, no
  slices).** Descartado con más fuerza que la opción anterior: forzaría
  a duplicar o acoplar por la puerta trasera la lógica de toasts/idioma/
  git-status que hoy atraviesa todos los dominios vía `get()` del mismo
  store combinado.
- **Barrel `types/index.ts` reexportando los archivos de dominio.**
  Descartado — `src/lib/` (el precedente más cercano en este mismo
  proyecto) no usa barrel, y añadir uno solo para `types/` introduciría
  un patrón nuevo e inconsistente en vez de seguir la convención ya
  establecida.
- **Forzar `ThemeTile` a cubrir también los puntos de color de eventos
  de `CalendarView.tsx`.** Descartado — son idiomas visuales distintos
  (tarjeta con borde+ícono vs. punto de color simple); forzar una
  abstracción compartida habría necesitado tantas props condicionales
  que el componente perdería el valor de ser "compartido".
