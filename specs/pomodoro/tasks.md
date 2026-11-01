# Pomodoro — Tasks

Estado: en progreso.

## Hecho (rama `feature/pomodoro`)

### Rust (`src-tauri/src/extensions/pomodoro.rs`)

- [x] `PomodoroState` (`.manage` en `lib.rs`) con el modo (apagado, sin fase, corriendo, en pausa), los textos de la bandeja y la entrada de estado del menú.
- [x] Comandos `pomodoro_schedule` (fin, clave, textos de la notificación y si avisar), `pomodoro_pause` (lo que falta, fijo), `pomodoro_idle` (Listo o Terminado) y `pomodoro_clear` (PM13). Devuelven `true` para que el frontend sepa que el aviso nativo está activo.
- [x] Un hilo que, al inicio de cada segundo, actualiza el título (macOS; en Linux, la etiqueta del AppIndicator), el tooltip (Windows) y la entrada de estado del menú (`set_text`, sin rearmar). Al llegar al fin manda la notificación con `tauri_plugin_notification` y emite `pomodoro:finished`.
  - Solo avisa si el fin fue hace menos de 5 min (D5).
  - Con el sonido propio activo, la notificación va sin sonido; si no, con el del sistema (design §6).
- [x] Entradas del menú de la bandeja entre "Nueva tarea" y "Salir", con su separador: estado (deshabilitado), Iniciar/Pausar/Reanudar y Saltar. Sus clics emiten `pomodoro:tray-action` sin mostrar la ventana.
- [x] Pruebas: formato `m:ss`, lo que falta, rellenar `{min}`/`{time}`, cuándo avisar y lo que muestra la bandeja en cada estado.
- No hizo falta ningún permiso nuevo en `capabilities/`: los comandos son de la app y `notification:default` ya estaba.

### Frontend (`src/extensions/pomodoro/`)

- [x] `model.ts`, puro y probado: fases, la siguiente fase, el ciclo, lo que falta contra el reloj, controles, terminar idempotente (clave fase + fin), historial de 14 días, cambio de día (D6), lectura de opciones y del estado guardado.
- [x] `store.ts`: el store chico (zustand) que comparten la vista, el contador y la bandeja. Guarda en `extensions.pomodoro.settings` al cambiar de estado, no cada segundo (PM12).
  - El fin llega por tres caminos y se aplica una vez: el evento de Rust, el reloj del frontend (con 3 s de margen si Rust está activo; sin margen si no) y la recuperación al abrir.
  - Si Rust no confirma (`invoke` falla o devuelve otra cosa que `true`), avisa el frontend con la notificación del plugin.
- [x] `native.ts`: arma lo que se le pasa a Rust (textos ya traducidos) y nunca lanza.
- [x] `index.ts`: `start()` restaura, sincroniza con Rust, escucha `pomodoro:finished` y `pomodoro:tray-action`, y reenvía los textos al cambiar el idioma, las opciones o las notificaciones globales. Su parada limpia el reloj, el contador y la bandeja; si la extensión se desactivó, el bloque en curso no cuenta y el temporizador vuelve a Listo (PM13).
- [x] Vista (`View.tsx`): anillo, ciclo, controles, tarea, línea de estado, "Hoy", región viva y atajos (Espacio, ⌘⇧→, ⌘⇧←, ⌘⇧T).
- [x] Selector de tarea (`TaskPicker.tsx`, `taskOptions.ts`): combobox con las pendientes y en curso de todos los proyectos.
- [x] Panel `Settings.tsx` en Opciones → Extensiones → Pomodoro.
- [x] Contador `SidebarStatus.tsx`, expandido y colapsado.
- [x] Sonido con Web Audio (`sound.ts`): dos tonos que bajan al terminar el trabajo y suben al terminar un descanso.
- [x] Pruebas: modelo, selector, textos para Rust, paridad es/en de la sección `pomodoro`, store sin Rust y dibujo de la vista, el contador y el panel.

### Base de extensiones

- [x] Punto de extensión `SidebarStatus` y metadato `sidebarStatus` (R26, `specs/extensiones`).
- [x] `openExtensionSettings(id)` en el store (R21).
- [x] Scroll de la columna del menú colapsado (hallazgo 2).
- [x] Registro con `Hourglass`, `view`, `settings` y `sidebarStatus`.
- [x] `NumberField`, `Toggle`, `StatusItem`, `Spinner` y las clases de los controles, en `components/shared/` (hallazgo 8). DevTools los reexporta.
- [x] `readAllTasks` en `lib/allTasks.ts` (hallazgo 5), que usan MCP y el selector.
- [x] `interpolate` en `lib/interpolate.ts`, con los plurales `{n|uno|varios}`, que usan DevTools y Pomodoro.

### Textos y temas

- [x] Sección `pomodoro` en es y en, con las mismas claves, y `extensions['pomodoro.*']`.
- [x] Tokens `--phase-*` en `App.css` para los 7 temas.

## Hecho (rama `feature/pomodoro-ajustes`, 31 oct 2026, tras la prueba de Jorge en la app de QA)

- [x] **Tiempo de la barra de menús fijo (PM11):** `use_fixed_digits` (`pomodoro.rs`, llamado al crear la bandeja en `lib.rs`) pone en el `NSStatusBarButton` la fuente del sistema con dígitos de ancho fijo (`monospacedDigitSystemFontOfSize:weight:`, regular, del tamaño que ya tenía). tray-icon pone el título con `setTitle:`, que conserva la fuente, así que basta una vez. Dependencias solo de macOS: `objc2` 0.6 y `objc2-app-kit` 0.3, las que ya resolvía tray-icon.
  - `format_title_clock` rellena los minutos con U+2007 hasta las cifras de la fase (`minuteDigits`, que manda el frontend): en una fase de 25 min, `9:59` va como ` 9:59` y el ancho no cambia en toda la fase. Un descanso de 5 min no lleva relleno.
  - Arreglo: tray-icon 0.21 ignora `set_title(None)` en macOS y dejaba el último título; ahora se pone un título vacío.
- [x] **Dónde se ve (PM15):** `showTrayTime` y `showSidebarCounter` en `PomodoroOptions` (por defecto, encendidas). Rust recibe `showTime` en los textos de la bandeja: apagado, sin título y con el tooltip "Logday". `SidebarStatus` devuelve `null` con el contador apagado.
- [x] **Restablecer (PM16):** sección "Restablecer" al final de `Settings.tsx`, con `useConfirmDelete` y `ConfirmDeleteModal` (`Z_MODAL_NESTED`, como "Quitar configuración"). `resetPomodoro` (store) usa `resetSettings` (modelo) y guarda en una sola escritura las opciones por defecto, el temporizador en Listo y el historial vacío; luego manda la bandeja a Rust.
- [x] **"Reiniciar el ciclo" a la vista (PM2):** un solo botón con borde e ícono (`ListRestart`) junto a "Bloque n de 4", en todos los anchos. Antes era texto gris de 11 px y, en el layout ancho, se iba al pie de "Hoy".
- [x] Pruebas: lectura de las opciones nuevas, `resetSettings`, `minuteDigits`, lo que se le pasa a Rust con el tiempo apagado, el contador sin dibujar, un solo "Reiniciar el ciclo", el restablecer en el store (estado, opciones, historial y bandeja) y, en Rust, el relleno del título y la bandeja sin tiempo.

## Hecho (rama `feature/inicio-extensiones`, 31 oct 2026)

- [x] **Tarjeta en Inicio (PM17):** `HomeCard.tsx` (design §3.4), `showOnHome` en `PomodoroOptions` (encendido por defecto) y el interruptor "Mostrar en Inicio" en Opciones, bajo "Dónde se ve". Pruebas: la tarjeta en Listo, corriendo, en pausa, con un descanso listo, con tarea y resumen, sin dibujar al apagarla, en inglés, y la lectura de la opción.

## Diferencias con el diseño

- **Plurales:** en vez de las claves `*One` del §9 (`todaySummaryOne`), las formas `{n|uno|varios}` dentro de la misma clave.
- **`pomodoro.consent`:** existe aunque no se muestra, porque `extensionText` pide la clave en todas las extensiones (como Captura rápida y DevTools).
- **Clases:** se movieron a `components/shared/controlClasses.ts` en vez de copiarlas (lo que el §1 llama "lo ideal").
- **Bandeja en Listo tras saltar al descanso:** "Iniciar el descanso" en vez de "Iniciar un pomodoro".
- **Foco al abrir la vista con el teclado:** solo desde el contador del menú. Desde la fila de secciones, el menú lateral no avisa cómo se abrió.
- **Saltar estando Terminado:** salta la fase que esperaba y queda la siguiente Lista (el contador desaparece, D1).
- **"Restablecer valores" sigue** junto a "Restablecer el Pomodoro": el primero solo devuelve las opciones (sin confirmar, no borra nada); el segundo lo deja todo como recién activado.
- **Restablecer limpia la tarea elegida**, a diferencia de "Reiniciar el ciclo", que la conserva.
- **Orden de foco:** "Reiniciar el ciclo" va ahora antes de los controles (junto al ciclo), no después de la tarea.

## Pendiente

- [ ] Prueba visual en el navegador (Tauri simulado) y en la app de QA: bandeja en macOS, notificación con la ventana oculta, suspensión del equipo.
- [ ] Prueba visual de los ajustes del 31 oct: que el título de la barra de menús no se mueva (también al pasar de `10:00` a `9:59`), que se quite al apagar la opción y al terminar, el contador oculto, "Reiniciar el ciclo" a 800×600 y en ventana grande, y el restablecer con y sin confirmación.
- [ ] Menú de la bandeja en español fijo (hallazgo 3): "Mostrar Logday", "Nueva nota", "Nueva tarea" y "Salir" no se traducen; las entradas del Pomodoro sí.
- [ ] Ayuda de las notificaciones globales (hallazgo 7): `notificationsEnabledDesc` solo habla del calendario.
- [ ] El aviso de error de `ExtensionBoundary` con `variant="inline"` no cabe en el menú colapsado (48 px).
