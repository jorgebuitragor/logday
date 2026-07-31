# Tasks — Personalización y expansión de temas

Estado: en diseño. Nada de esto está implementado — es la lista de trabajo
para cuando se apruebe pasar a implementación. Ningún checkbox debe
marcarse hasta que el código correspondiente exista y esté verificado.

## Pendiente

- [ ] **1. Fix de contraste del tema oscuro** (req. §2)
  - [ ] 1.1 `App.css:12-39` — `--bg-base` #0f0f0f → #121212
  - [ ] 1.2 `--text-primary` #ffffff → #f2f2f2
  - [ ] 1.3 `--text-hint` #777777 → #848484
  - [ ] 1.4 `--text-faint` #555555 → #7e7e7e
  - [ ] 1.5 Verificar visualmente que la jerarquía de fondos
        (base/panel/surface/hover/elevated/input) sigue siendo distinguible

- [ ] **2. Tres temas nuevos predefinidos** (req. §3)
  - [ ] 2.1 Bloque `:root[data-theme="sepia"]` en `App.css` (paleta
        completa en `design.md` §2.1)
  - [ ] 2.2 Bloque `:root[data-theme="oled"]` (paleta en `design.md` §2.2)
  - [ ] 2.3 Bloque `:root[data-theme="nordic"]` (paleta en `design.md` §2.3)
  - [ ] 2.4 Extender `THEME_VALUES` en `SettingsModal.tsx` con los 3
        (value + ícono lucide-react)
  - [ ] 2.5 Claves i18n `theme{Sepia,Oled,Nordic}` /
        `themeDesc{Sepia,Oled,Nordic}` en `es`/`en` (`src/lib/i18n.ts`)

- [ ] **3. Modelo de datos de temas personalizados** (req. §4.1, §4.3;
      diseño §3.1-3.2)
  - [ ] 3.1 `types/index.ts` — `Theme` → union con `` `custom:${string}` ``
  - [ ] 3.2 `types/index.ts` — nuevo tipo `CustomTheme`
  - [ ] 3.3 `types/index.ts` — `BackupSettings.customThemes?: CustomTheme[]`
  - [ ] 3.4 `appStore.ts` — estado `customThemes` inicializado desde
        `localStorage['customThemes']`
  - [ ] 3.5 `appStore.ts` — acciones `createCustomTheme`,
        `renameCustomTheme`, `duplicateCustomTheme`, `deleteCustomTheme`,
        `updateCustomThemeAccent`
  - [ ] 3.6 `SettingsModal.tsx` — incluir `customThemes` en construcción
        del export de backup
  - [ ] 3.7 `SettingsModal.tsx` — restaurar `customThemes` en el import
        de backup

- [ ] **4. Aplicación al DOM de temas personalizados** (req. §4.2;
      diseño §3.3)
  - [ ] 4.1 `appStore.ts` — nueva función `applyAccentToDOM(customTheme)`
  - [ ] 4.2 `appStore.ts` — extender `applyThemeToDOM` para resolver
        `custom:<id>`, delegar en `applyAccentToDOM`, y togglear la clase
        `theme-tinted`
  - [ ] 4.3 `appStore.ts` — `setTheme` pasa `get().customThemes` a
        `applyThemeToDOM`
  - [ ] 4.4 Verificar que eliminar el tema custom activo hace fallback a
        `dark` sin dejar el DOM en un estado inconsistente

- [ ] **5. Algoritmo de derivación de color** (req. §4.2; diseño §3.4)
  - [ ] 5.1 Implementar `hexToHsl`/`hslToHex`/`hexToRgba` (utilidades de
        conversión de color, puras)
  - [ ] 5.2 Implementar `deriveAccentPalette(hex, base)` con las fórmulas
        de `design.md` §3.4, incluyendo el ajuste iterativo de contraste
        para `base === 'light'`
  - [ ] 5.3 Probar con al menos 5 colores de acento distintos (incluyendo
        uno muy claro/débil) en cada base, verificando contraste ≥4.5:1 en
        `--accent-strong`/`--accent-link`

- [ ] **6. Extensión del mecanismo de override de `App.css`** (req. §4.2;
      diseño §3.5)
  - [ ] 6.1 Reemplazar el selector `:root[data-theme="high-contrast"],
        :root[data-theme="visual-rest"]` de las 6 reglas existentes por
        `html.theme-tinted`
  - [ ] 6.2 Confirmar que `applyThemeToDOM` togglea `theme-tinted`
        correctamente para: high-contrast, visual-rest, sepia, oled,
        nordic, y cualquier custom — y que NO se activa para dark/light

- [ ] **7. UI de gestión en Settings** (req. §4.1; diseño §3.6)
  - [ ] 7.1 Grid de temas custom (swatch con círculo de color) debajo de
        la grid de temas built-in
  - [ ] 7.2 Menú contextual por tema custom: Renombrar / Duplicar /
        Eliminar (patrón de `Sidebar.tsx`)
  - [ ] 7.3 Formulario inline "+ Nuevo tema": nombre, toggle claro/oscuro,
        `<input type="color">`, vista previa en vivo
  - [ ] 7.4 Confirmación de borrado respetando `confirmDestructiveActions`
  - [ ] 7.5 Claves i18n `settings.customTheme*` en `es`/`en`

## Verificación final

Con `pnpm tauri dev` corriendo:

- Cambiar al tema oscuro y confirmar que ya no se siente "quemado" a la
  vista pero sigue siendo un tema oscuro reconocible.
- Probar Sepia, OLED y Nórdico — confirmar que todo el texto es legible.
- Crear un tema personalizado con un color de acento arbitrario sobre
  base oscura, y otro sobre base clara — confirmar que enlaces y texto de
  acento siguen siendo legibles en ambos.
- Renombrar, duplicar y eliminar un tema personalizado.
- Eliminar el tema personalizado activo y confirmar el fallback a `dark`.
- Exportar un backup, borrar los temas personalizados, importar el backup
  y confirmar que los temas personalizados vuelven.
- Confirmar que un componente que dependía del hack de `App.css`
  (ej. el drag handle o cualquier elemento con clase `indigo-*` residual)
  se pinta con el acento correcto bajo un tema personalizado.
