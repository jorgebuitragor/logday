# Design — Personalización y expansión de temas

Estado: en diseño. Ver [`requirements.md`](./requirements.md) para el
contrato de comportamiento.

## 1. Fix de contraste del tema oscuro

### 1.1 Diagnóstico (contraste real, WCAG 2.1, contra `--bg-base` #0f0f0f)

| Variable | Hex actual | vs `--bg-base` | vs `--bg-panel` #141414 | Veredicto |
|---|---|---|---|---|
| `--text-primary` | #ffffff | 19.17:1 | 18.42:1 | Excesivo (>15:1, causa glare) |
| `--text-body` | #e4e4e4 | 15.08:1 | 14.49:1 | Excesivo pero aceptable, no se toca |
| `--text-secondary` | #c8c8c8 | 11.46:1 | 11.01:1 | OK |
| `--text-tertiary` | #aaaaaa | 8.25:1 | 7.93:1 | OK |
| `--text-muted` | #888888 | 5.41:1 | 5.20:1 | OK (pasa AA 4.5:1) |
| `--text-hint` | #777777 | 4.28:1 | 4.11:1 | Falla AA texto normal (4.5:1) |
| `--text-faint` | #555555 | 2.57:1 | 2.47:1 | Falla incluso AA texto grande (3:1) |

`--text-faint` se usa en 14 sitios de texto real (placeholders, estados
vacíos tipo "Sin tareas", hints) — confirmado por grep, no es solo
decorativo.

### 1.2 Valores de reemplazo (solo 4 variables tocadas)

```
--bg-base:      #0f0f0f → #121212
--text-primary: #ffffff → #f2f2f2
--text-hint:    #777777 → #848484
--text-faint:   #555555 → #7e7e7e
```

Contraste verificado tras el cambio:

| Variable | Hex nuevo | vs `--bg-base` #121212 | vs `--bg-panel` #141414 |
|---|---|---|---|
| `--text-primary` | #f2f2f2 | 16.73:1 | 16.46:1 |
| `--text-hint` | #848484 | 5.01:1 | 4.93:1 |
| `--text-faint` | #7e7e7e | 4.61:1 | 4.54:1 |

Todas las variables de texto quedan ≥4.5:1 contra ambos fondos. El orden
monotónico de la escala se preserva
(`primary > body > secondary > tertiary > muted > hint > faint`), aunque
el hueco entre `muted`/`hint`/`faint` queda más comprimido que antes (34
unidades hex de separación → 10) — es un trade-off consciente de subir el
piso sin tocar `muted` (que ya pasaba de sobra), documentado aquí para que
no se lea como descuido al revisar el diff.

`--bg-base` sigue siendo distinguible de `--bg-panel` (diferencia
perceptual mínima respecto al valor original, sin romper la jerarquía de
elevación con `--bg-surface`/`--bg-hover`/`--bg-elevated`/`--bg-input`,
que no se tocan).

Archivo: `src/App.css:12-39` (bloque `:root` del tema `dark`).

## 2. Tres temas nuevos

Metodología: mismas fórmulas de derivación de acento del §3.4, ajustadas
donde el chequeo de contraste lo exige. Todos los grises verificados con
la misma fórmula WCAG del §1.

### 2.1 "Sepia" — base clara, cálida (lectura prolongada)

```css
:root[data-theme="sepia"] {
  --bg-base:     #f2e8d3;
  --bg-panel:    #f9f2e4;
  --bg-surface:  #ede0c4;
  --bg-secondary: var(--bg-surface);
  --bg-hover:    #e6d7b7;
  --bg-elevated: #f9f2e4;
  --bg-input:    #efe3c8;

  --border:      #ddc9a3;
  --border-card: #cbb488;
  --border-high: #a3895d;

  --text-primary:   #2e2013;
  --text-body:      #3d2d1c;
  --text-secondary: #5a4630;
  --text-tertiary:  #715a3d;
  --text-muted:     #725b40;
  --text-hint:      #796044;
  --text-faint:     #7c6346;

  --accent:         #b5652f;
  --accent-strong:  #7d512a;
  --accent-soft:    rgba(181, 101, 47, 0.18);
  --accent-ink:     #b5652f;
  --accent-inline:  #665a27;
  --accent-link:    #7d512a;
  --accent-code:    #73611f;
}
```

Contraste contra `#f2e8d3`: primary 12.96:1, body 10.85:1, secondary
7.33:1, tertiary 5.34:1, muted 5.25:1, hint 4.83:1, faint 4.63:1 — todos
≥4.5:1. `--accent` plano da 3.55:1 (aceptable, se usa para UI no-texto,
igual que en el tema `light` existente); el texto de enlaces usa
`--accent-strong`/`--accent-link` (5.60:1).

### 2.2 "OLED" — base oscura, negro puro intencional

```css
:root[data-theme="oled"] {
  --bg-base:     #000000;
  --bg-panel:    #0a0a0a;
  --bg-surface:  #111111;
  --bg-secondary: var(--bg-surface);
  --bg-hover:    #1c1c1c;
  --bg-elevated: #0d0d0d;
  --bg-input:    #0c0c0c;

  --border:      #262626;
  --border-card: #333333;
  --border-high: #4d4d4d;

  --text-primary:   #ededed;
  --text-body:      #d6d6d6;
  --text-secondary: #bcbcbc;
  --text-tertiary:  #9e9e9e;
  --text-muted:     #8e8e8e;
  --text-hint:      #848484;
  --text-faint:     #7a7a7a;

  --accent:         #38bdf8;
  --accent-strong:  #0caef6;
  --accent-soft:    rgba(56, 189, 248, 0.22);
  --accent-ink:     #87c4fb;
  --accent-inline:  #73a8fa;
  --accent-link:    #38bdf8;
  --accent-code:    #568bf9;
}
```

`--bg-base: #000000` es la única excepción deliberada a la regla del §1
("no negro puro") — aquí el negro puro es la característica pedida
(ahorro de batería y apagado físico de píxeles en pantallas OLED/AMOLED),
compensada con texto nunca blanco puro y un piso de grises ya corregido
desde el diseño. Acento azul eléctrico, distinto del índigo de
`dark`/`high-contrast`, para diferenciación de identidad. Contraste
contra `#000000`: primary 17.94:1, faint 4.89:1 (peor caso, contra
`--bg-panel` #0a0a0a: 4.61:1) — todos ≥4.5:1.

### 2.3 "Nórdico" — base oscura, fría (paleta Nord)

```css
:root[data-theme="nordic"] {
  --bg-base:     #2e3440;
  --bg-panel:    #333a47;
  --bg-surface:  #3b4252;
  --bg-secondary: var(--bg-surface);
  --bg-hover:    #434c5e;
  --bg-elevated: #363d4a;
  --bg-input:    #323944;

  --border:      #4c566a;
  --border-card: #4c566a;
  --border-high: #6b768c;

  --text-primary:   #eceff4;
  --text-body:      #e5e9f0;
  --text-secondary: #d3dae6;
  --text-tertiary:  #b7c1d1;
  --text-muted:     #b2bac7;
  --text-hint:      #a9b2c1;
  --text-faint:     #a0aaba;

  --accent:         #88c0d0;
  --accent-strong:  #5e81ac;
  --accent-soft:    rgba(136, 192, 208, 0.20);
  --accent-ink:     #c2d9e7;
  --accent-inline:  #b4cae1;
  --accent-link:    #88c0d0;
  --accent-code:    #9eb6d9;
}
```

Basado directamente en la paleta [Nord](https://www.nordtheme.com/)
(Polar Night + Snow Storm + Frost). Contraste contra `#2e3440`: primary
10.84:1, faint 5.33:1 (peor caso, contra `--bg-panel` #333a47: 4.87:1) —
todos ≥4.5:1. Nótese que `--text-primary` de Nord (`#eceff4`) ya es
"casi blanco" sin ser blanco puro por diseño original de la paleta,
coherente con la lección del §1.

## 3. Arquitectura de temas personalizados

### 3.1 Modelo de datos

```ts
// src/types/index.ts
export type BuiltInTheme =
  | 'dark' | 'light' | 'system' | 'high-contrast' | 'visual-rest'
  | 'sepia' | 'oled' | 'nordic';

// El prefijo "custom:" permite que Theme siga siendo un string simple
// almacenable tal cual en localStorage['theme'], sin clave separada
// para "cuál custom está activo".
export type Theme = BuiltInTheme | `custom:${string}`;

export interface CustomTheme {
  id: string;               // uuid (uuidv4(), ya usado en appStore.ts)
  name: string;              // nombre elegido por el usuario
  base: 'dark' | 'light';    // de qué bloque :root[data-theme] hereda las 16 vars no-acento
  accent: string;            // hex del color elegido, ej. "#ff6b6b"
  createdAt: string;         // ISO date
}
```

Un union con un miembro template-literal (`` `custom:${string}` ``) es
compatible con el código existente que compara `theme === 'dark'` — los
demás casos de la unión siguen funcionando igual. Los sitios que asumen
`Theme` es siempre uno de los valores fijos (el más importante:
`applyThemeToDOM`) deben actualizarse explícitamente (ver §3.3); son pocos
porque el flujo de tema ya está centralizado ahí y en `setTheme`.

### 3.2 Persistencia

Mismo patrón que otros blobs JSON ya persistidos en `localStorage` desde
el store (ej. `folderTags`, `gitConfig`):

```ts
// src/store/appStore.ts, junto a los demás localStorage.getItem de inicialización
customThemes: (() => {
  try { return JSON.parse(localStorage.getItem('customThemes') || '[]') as CustomTheme[]; }
  catch { return []; }
})(),
```

Nuevas acciones del store (mismo patrón que `setTheme`/`setGitConfig`):
`createCustomTheme(name, base, accent)`, `renameCustomTheme(id, name)`,
`duplicateCustomTheme(id)` (nuevo uuid, nombre `"{name} copia"`),
`deleteCustomTheme(id)` (si el tema borrado está activo, fallback a
`'dark'` vía `setTheme`), `updateCustomThemeAccent(id, accent)`.

**Backup/restore**: extender `BackupSettings`
(`src/types/index.ts:82-91`) con `customThemes?: CustomTheme[]`, incluido
tanto en la construcción del export (`SettingsModal.tsx:355-365`) como en
la restauración del import (`SettingsModal.tsx:420-475`) — mismo
tratamiento que ya reciben `theme`/`shortcuts`/`fontSize` ahí.

### 3.3 Aplicación al DOM

Se separa `applyThemeToDOM` (hoy resuelve `'system'` y setea `data-theme`)
de una nueva función `applyAccentToDOM`:

```ts
// src/store/appStore.ts — junto a applyThemeToDOM
const ACCENT_VARS = [
  '--accent', '--accent-strong', '--accent-soft',
  '--accent-ink', '--accent-inline', '--accent-link', '--accent-code',
] as const;

export function applyAccentToDOM(customTheme: CustomTheme | null) {
  const root = document.documentElement.style;
  if (!customTheme) {
    ACCENT_VARS.forEach((v) => root.removeProperty(v));
    return;
  }
  const palette = deriveAccentPalette(customTheme.accent, customTheme.base);
  Object.entries(palette).forEach(([k, v]) => root.setProperty(k, v));
}
```

`applyThemeToDOM` se extiende para resolver temas custom y delegar en
`applyAccentToDOM`:

```ts
export function applyThemeToDOM(theme: Theme, animate = false, customThemes: CustomTheme[] = []) {
  let resolved: BuiltInTheme;
  let custom: CustomTheme | null = null;

  if (theme.startsWith('custom:')) {
    custom = customThemes.find((t) => `custom:${t.id}` === theme) ?? null;
    resolved = custom?.base ?? 'dark'; // fallback si el custom fue borrado externamente
  } else {
    resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme as BuiltInTheme;
  }

  // ... animación igual que hoy ...

  document.documentElement.dataset.theme = resolved;
  applyAccentToDOM(custom);

  const isTinted = custom !== null
    || resolved === 'high-contrast' || resolved === 'visual-rest'
    || resolved === 'sepia' || resolved === 'oled' || resolved === 'nordic';
  document.documentElement.classList.toggle('theme-tinted', isTinted);

  // ... sync de ventana nativa igual que hoy ...
}
```

`setTheme` (línea ~1654) pasa `get().customThemes` a `applyThemeToDOM`.
Esto es viable porque `data-theme` sigue resolviendo solo a los 8 valores
fijos definidos en CSS — el DOM nunca recibe un `data-theme` arbitrario;
`dark`/`light` heredan las 16 variables no-acento, y las 7 `--accent*` se
sobrescriben inline vía `style.setProperty`, que tiene mayor
especificidad que cualquier regla `:root[data-theme=...]` del stylesheet,
así que el override siempre gana sin necesitar `!important`.

### 3.4 Algoritmo de derivación (HSL)

Basado en cómo se relacionan realmente las 7 variables de acento entre sí
en los 3 temas existentes (convertidos a HSL):

| Tema | accent-strong | accent-ink | accent-inline | accent-code |
|---|---|---|---|---|
| dark | ΔL −9 | ΔH+~10 ΔL+15 | ΔH+18 ΔL+12 | ΔH+21 ΔL+2 |
| visual-rest | ΔL −10 | ΔH+0 ΔL+18 | ΔH+2 ΔL+16 | ΔH+2 ΔL+11 |
| light | ΔH+4 ΔS−9 ΔL−8 | =accent | ΔH+24 ΔS−14 ΔL−17 | ΔH+23 ΔS−1 ΔL−9 |

Patrón: en temas **oscuros** las variantes se generan **aclarando** (L+)
para brillar sobre fondo oscuro; en temas **claros** se generan
**oscureciendo** (L−) para ser legibles sobre fondo claro.
`accent-strong` siempre reduce L, en ambos modos.

```ts
function deriveAccentPalette(hex: string, base: 'dark' | 'light') {
  const [h, s, l] = hexToHsl(hex);

  if (base === 'dark') {
    const S = clamp(s, 45, 92);
    const L = clamp(l, 58, 78);
    const accent = hslToHex(h, S, L);
    const strong = hslToHex(h, S, clamp(L - 9, 42, 100));
    const ink    = hslToHex(h + 10, clamp(S, 55, 100), clamp(L + 16, 0, 92));
    const inline = hslToHex(h + 18, S, clamp(L + 12, 0, 88));
    const code   = hslToHex(h + 22, S, clamp(L + 6, 0, 85));
    return {
      '--accent': accent, '--accent-strong': strong,
      '--accent-soft': hexToRgba(accent, 0.22),
      '--accent-ink': ink, '--accent-inline': inline,
      '--accent-link': accent, '--accent-code': code,
    };
  }

  // base === 'light'
  const S = clamp(s, 60, 90);
  const L = clamp(l, 55, 68);
  const accent = hslToHex(h, S, L);
  let strongL = clamp(L - 8, 30, 100);
  let strong = hslToHex(h + 4, clamp(S - 9, 0, 100), strongL);
  // ajuste iterativo: si el color elegido por el usuario es débil, el
  // ΔL fijo no siempre alcanza 4.5:1 — se sigue oscureciendo hasta pasarlo
  while (contrast(strong, LIGHT_BG_BASE_APPROX) < 4.5 && strongL > 20) {
    strongL -= 4;
    strong = hslToHex(h + 4, clamp(S - 9, 0, 100), strongL);
  }
  const inline = hslToHex(h + 24, clamp(S - 14, 0, 100), clamp(L - 17, 20, 100));
  const code   = hslToHex(h + 23, clamp(S - 1, 0, 100), clamp(L - 9, 20, 100));
  return {
    '--accent': accent, '--accent-strong': strong,
    '--accent-soft': hexToRgba(accent, 0.18),
    '--accent-ink': accent, '--accent-inline': inline,
    '--accent-link': strong, '--accent-code': code,
  };
}
```

El ajuste iterativo en el caso `light` está justificado por un caso real:
con la fórmula estática (`ΔL −8`) el acento terracota de "Sepia" (§2.1)
dejaba `accent-strong` en 4.72:1 (pasa por poco), pero un acento de
partida más débil habría necesitado `ΔL −12` (5.60:1) para llegar al
mínimo — sin el ajuste, algunos colores elegidos por el usuario
producirían texto de enlace bajo AA.

### 3.5 Extensión del mecanismo de `App.css:128-158`

El hack actual repinta clases Tailwind `indigo-*` hardcodeadas, pero está
acoplado a **nombres de tema** (`high-contrast`, `visual-rest`). Con
temas custom de acento arbitrario, ese acoplamiento por nombre ya no
alcanza — no se pueden enumerar de antemano IDs de tema que aún no
existen.

**Cambio**: reemplazar el selector `:root[data-theme="high-contrast"],
:root[data-theme="visual-rest"]` por una clase marcadora en `<html>`,
gestionada por `applyThemeToDOM` (`isTinted`, ver §3.3):

```css
/* src/App.css — reemplaza el selector de las 6 reglas existentes */
html.theme-tinted [class*="text-indigo-"]   { color: var(--accent) !important; }
html.theme-tinted [class*="bg-indigo-"]     { background-color: var(--accent-soft) !important; }
html.theme-tinted [class*="border-indigo-"] { border-color: var(--accent) !important; }
html.theme-tinted [class*="ring-indigo-"]   { --tw-ring-color: color-mix(in srgb, var(--accent) 45%, transparent) !important; }
/* from-indigo-/to-indigo- igual que hoy, mismo selector nuevo */
```

`theme-tinted` se activa para `high-contrast`, `visual-rest`, los 3 temas
nuevos (todos con acento no-índigo) y **siempre** para cualquier tema
custom. `dark`/`light` no se marcan `theme-tinted` — mantienen su
comportamiento actual sin cambios, evitando el riesgo de una regresión
visual no evaluada en los dos temas más usados.

Se mantiene documentado que esto no cubre clases Tailwind fuera del
patrón `[class*="...-indigo-"]` (ej. utilidades direccionales como
`border-l-indigo-500`, ya resuelto como bug puntual en
`../temas-consistencia-visual/`) ni color hardcodeado fuera de clases
Tailwind (cubierto por ese mismo spec, no por este mecanismo).

### 3.6 UI de gestión en Settings

Nueva sección debajo de la grid de temas built-in existente en
`SettingsModal.tsx` (después de la grid actual, ~línea 616), mismo patrón
visual de swatches:

1. `THEME_VALUES` (líneas 22-28) se extiende con los 3 temas built-in
   nuevos, cada uno con su ícono `lucide-react` (ej. `BookOpen` para
   sepia, `Smartphone` para OLED, `Snowflake` para nórdico).
2. Grid de temas custom: mapea `customThemes` del store a swatches
   iguales a los built-in, pero el swatch muestra un círculo con
   `background: theme.accent` en vez de un ícono, para reconocimiento
   visual rápido. Menú contextual (mismo patrón que `Sidebar.tsx` usa
   para carpetas, `handleFolderContextMenu`) con Renombrar / Duplicar /
   Eliminar.
3. Botón "+ Nuevo tema" abre un formulario inline (no modal aparte):
   nombre, toggle claro/oscuro, `<input type="color">` nativo (sin
   dependencias nuevas — confirmado que no existe librería de
   color-picker en el proyecto, y el input nativo funciona en el WebView
   de Tauri), con vista previa en vivo.
4. Renombrar usa el mismo patrón de input inline + `onBlur`/`Enter`/
   `Escape` que `FolderTreeItem` en `Sidebar.tsx:251-262`.
5. El borrado respeta `confirmDestructiveActions`, ya existente en el
   store.
6. i18n: nuevas claves `theme{Sepia,Oled,Nordic}` /
   `themeDesc{Sepia,Oled,Nordic}` (mismo patrón que los temas actuales),
   más un bloque `settings.customTheme*` (crear, renombrar, duplicar,
   eliminar, nombre por defecto) en `es`/`en`.

## 4. Resumen de archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/App.css` | §1: 4 valores del bloque `dark`. §2: 3 bloques `:root[data-theme="sepia/oled/nordic"]` nuevos. §3.5: nuevo selector `html.theme-tinted` reemplazando el actual. |
| `src/types/index.ts` | `Theme` → union con `` `custom:${string}` ``; nuevo `CustomTheme`; `BackupSettings.customThemes?`. |
| `src/store/appStore.ts` | `applyThemeToDOM` extendida + `applyAccentToDOM` + `deriveAccentPalette` nuevas; estado `customThemes`; acciones create/rename/duplicate/delete/updateAccent; `setTheme` pasa `customThemes`. |
| `src/components/SettingsModal.tsx` | `THEME_VALUES` +3; grid de temas custom + formulario inline; export/import de `customThemes` en el flujo de backup. |
| `src/lib/i18n.ts` | Claves de los 3 temas nuevos + bloque `settings.customTheme*`, en `es`/`en`. |

## 5. Alternativas descartadas

- **Persistir temas custom en el `config.json` de Tauri** en vez de
  `localStorage`. Descartado por consistencia — el tema (built-in) ya
  vive solo en `localStorage` hoy; mover solo los custom a un mecanismo
  distinto fragmentaría la fuente de verdad del tema activo sin beneficio
  claro.
- **Permitir elegir cualquier tema predefinido (no solo `light`/`dark`)
  como base de un tema custom.** Descartado por alcance — el usuario
  decidió v1 con personalización de solo-acento; añadir Sepia/OLED/Nórdico
  como bases posibles multiplica las combinaciones a probar sin que se
  haya pedido.
- **Generalizar el hack de `App.css:128-158` a `dark`/`light` también**
  (aplicar `theme-tinted` siempre). Descartado — cambiaría la apariencia
  actual de los dos temas más usados sin haber evaluado el impacto visual,
  fuera del alcance de "arreglar contraste + añadir temas nuevos".
- **Traer una librería de color-picker** (ej. `react-colorful`).
  Descartado para v1 — el `<input type="color">` nativo cubre el único
  caso de uso (elegir un color de acento) sin añadir dependencias.
