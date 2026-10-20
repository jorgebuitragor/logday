# Tasks — Personalización y expansión de temas

Estado: implementado. Verificado por el usuario en varias rondas de
iteración (ver `design.md` §3.6 para los cambios de UX pedidos después de
probar la primera versión).

## Hecho

- [x] **1. Fix de contraste del tema oscuro** (req. §2)
  - [x] 1.1 `App.css` — `--bg-base` #0f0f0f → #121212
  - [x] 1.2 `--text-primary` #ffffff → #f2f2f2
  - [x] 1.3 `--text-hint` #777777 → #848484
  - [x] 1.4 `--text-faint` #555555 → #7e7e7e
  - [x] 1.5 Verificado visualmente — jerarquía de fondos sigue distinguible

- [x] **2. Tres temas nuevos predefinidos** (req. §3)
  - [x] 2.1-2.3 Bloques `:root[data-theme="sepia/oled/nordic"]` en `App.css`
  - [x] 2.4 `THEME_VALUES` extendido en `SettingsModal.tsx` (`BookOpen`,
        `Smartphone`, `Snowflake`)
  - [x] 2.5 Claves i18n `theme{Sepia,Oled,Nordic}` /
        `themeDesc{Sepia,Oled,Nordic}` en `es`/`en`

- [x] **3. Modelo de datos de temas personalizados** (req. §4.1, §4.3;
      diseño §3.1-3.2) — **ampliado en implementación**: `CustomTheme`
      terminó con `bgTint`/`textTint`/`intensity` además de `accent`,
      tras feedback de que "solo acento" se sentía limitado
  - [x] 3.1-3.3 `types/index.ts` — `Theme` con `` `custom:${string}` ``;
        `CustomTheme` completo; `BackupSettings.customThemes?`
  - [x] 3.4 `appStore.ts` — estado `customThemes`, con normalización de
        datos guardados antes de la ampliación (backward-compat)
  - [x] 3.5 `appStore.ts` — acciones `createCustomTheme`,
        `renameCustomTheme`, `duplicateCustomTheme`, `deleteCustomTheme`,
        `updateCustomTheme` (genérica, reemplazó a la idea original de
        `updateCustomThemeAccent`), `replaceCustomThemes`
  - [x] 3.6-3.7 `SettingsModal.tsx` — `customThemes` en export/import de
        backup, con el orden corregido (customThemes se restaura antes
        que theme, para que un tema activo personalizado se resuelva bien)

- [x] **4. Aplicación al DOM de temas personalizados** (req. §4.2; diseño
      §3.3) — **ampliado**: `applyAccentToDOM` se convirtió en
      `applyCustomThemeToDOM`, sobrescribiendo las ~23 variables (fondo +
      texto + acento), no solo las 7 de acento
  - [x] 4.1 `appStore.ts` — `applyCustomThemeToDOM(customTheme)`
  - [x] 4.2 `appStore.ts` — `applyThemeToDOM` resuelve `custom:<id>` y
        togglea `theme-tinted`
  - [x] 4.3 `appStore.ts` — `setTheme` pasa `customThemes`
  - [x] 4.4 Verificado — eliminar el custom activo hace fallback a `dark`

- [x] **5. Algoritmo de derivación de color** (req. §4.2; diseño §3.4)
      — **ampliado**: además del acento (con intensidad), se sumaron
      `deriveBackgroundScale` y `deriveTextScale`
  - [x] 5.1 `hexToHsl`/`hslToHex`/`hexToRgba`/`contrastRatio` en
        `src/lib/themeColor.ts` (archivo nuevo)
  - [x] 5.2 `deriveAccentPalette(hex, base, intensity)` con ajuste
        iterativo de contraste para `base === 'light'`
  - [x] 5.3 `deriveBackgroundScale`/`deriveTextScale` reutilizando la
        luminosidad real de las escalas `dark`/`light` ya afinadas, con
        verificación de contraste ≥4.5:1 por escalón de texto
  - [x] 5.4 `deriveCustomThemeVars` combina las 3 derivaciones

- [x] **6. Extensión del mecanismo de override de `App.css`** (req. §4.2;
      diseño §3.5)
  - [x] 6.1 Selector `html.theme-tinted` reemplazando el acoplado por
        nombre de tema
  - [x] 6.2 Confirmado — se activa para high-contrast/visual-rest/sepia/
        oled/nordic/cualquier custom, y NO para dark/light

- [x] **7. UI de gestión en Settings** (req. §4.1; diseño §3.6) — forma
      final tras iterar con feedback real:
  - [x] 7.1 Grilla de 9 (8 temas + tile "Personalizado" dinámico)
  - [x] 7.2 Punto indicador de activo siempre montado (fix de salto de
        layout reportado)
  - [x] 7.3 Sección "ver más"/"ver temas personalizados" paginada de a 6
  - [x] 7.4 `CustomThemeEditor.tsx` — modal dedicado, reemplaza el
        formulario inline original
  - [x] 7.5 `ColorPicker.tsx` — selector de color propio (HSL + hex),
        reemplaza `<input type="color">` nativo
  - [x] 7.6 Slider de intensidad teñido con el acento en vivo
        (`accentColor`)
  - [x] 7.7 Semillas de un tema nuevo leídas del tema activo
        (`getComputedThemeDefaults`), no un índigo fijo
  - [x] 7.8 Tile "Personalizado": selecciona el primero automáticamente
        si hay varios y ninguno activo, sin duplicar la acción de
        "+ Nuevo tema" (fix de comportamiento redundante reportado)
  - [x] 7.9 Menú por tema: Renombrar / **Editar** (antes "Editar tema
        personalizado", acortado por pedido) / Duplicar / Eliminar
  - [x] 7.10 Confirmación de borrado respetando `confirmDestructiveActions`
  - [x] 7.11 Claves i18n `settings.customTheme*` completas en `es`/`en`

## Descartado tras probarlo (no forma parte del resultado final)

- [x] ~~Menú contextual de tema personalizado vía `position: fixed` con
      flip hacia arriba, luego vía `createPortal`~~ — ambos intentos
      empeoraron el comportamiento; revertido a la versión original
      (`absolute`, sin flip). Ver `design.md` §3.6.
- [x] ~~Animación de "wipe" circular al cambiar de tema~~ — implementada
      y removida por completo: riesgo de accesibilidad para
      fotosensibilidad (WCAG 2.3.1), señalado por el usuario. Sin rastro
      en el código final.

## Pendiente (backlog, no bloqueante)

- [ ] Tests automatizados para `deriveAccentPalette`/`deriveBackgroundScale`/
      `deriveTextScale` (verificar contraste ≥4.5:1 programáticamente con
      un muestreo de colores, en vez de solo verificación manual) — no
      existe infraestructura de test en el proyecto todavía, mismo gap ya
      señalado en `../temas-consistencia-visual/tasks.md`.

## Verificación final

Con `pnpm tauri dev`, confirmado por el usuario en varias rondas:

- Tema oscuro ya no se siente "quemado"; Sepia/OLED/Nórdico legibles.
- Crear un tema personalizado (base clara y oscura) con los 3 colores +
  intensidad; enlaces y texto siguen siendo legibles en ambos.
- Renombrar, editar colores, duplicar y eliminar un tema personalizado.
- Eliminar el tema personalizado activo → fallback a `dark`.
- El tile "Personalizado" y el flujo de selección con varios temas creados
  se comportan sin acciones redundantes.
- El selector de color propio se ve igual independientemente del SO.
- No hay salto de layout al seleccionar cualquier tema built-in.
