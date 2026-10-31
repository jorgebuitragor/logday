# Extensiones — Diseño

Estado: en progreso.

## Estructura de carpetas

```
src/extensions/
  registry.ts           # lista de extensiones de Desktop (solo metadatos)
  types.ts              # ExtensionDefinition, ExtensionId, puntos de extensión
  state.ts              # lógica pura: activar, configuración, resolver secciones (R13)
  actions.ts            # activar con aviso (R6) y desactivar, sin React
  useExtensions.ts      # hooks: useExtensions y useExtensionLifecycle (R7)
  runtime.ts            # import() con caché (R16) y start/stop de cada extensión
  ExtensionSlot.tsx     # dibuja un punto de extensión: lazy + Suspense + boundary
  ExtensionBoundary.tsx # ErrorBoundary por extensión (R15)
  secrets.ts            # ext_secret_set / clear / hint
  text.ts               # textos extensions.<id>.* de i18n.ts
  team-chat/            # la primera extensión
    index.ts            # módulo: lo que aporta a cada punto de extensión
    model.ts            # configuración no secreta y mensajes de error
    api.ts              # comandos Rust y useTeamChatSettings
    Settings.tsx
    SendToChatButton.tsx
src/components/settings/ExtensionsSettingsTab.tsx
src/components/sidebar/ExtensionSections.tsx
src-tauri/src/extensions/  # mod.rs (llavero) y un archivo por extensión (red)
```

## Registro

`registry.ts` solo tiene metadatos, para que el catálogo se dibuje sin
cargar el código de cada extensión (R16):

```ts
export type ExtensionId = 'team-chat' | 'openproject' | 'agenda' /* … */;

export interface ExtensionDefinition {
  id: ExtensionId;                 // mismo id en Desktop, Web y Mobile
  category: 'integration' | 'tool';
  icon: LucideIcon;
  apps: ('desktop' | 'web' | 'mobile')[]; // solo informativo (R2)
  sendsDataExternally?: { to: string };   // dispara el aviso de R6
  view?: boolean;                         // si tiene vista: sección en el menú (R11)
  secretKeys?: string[];                  // claves en el llavero, para R8
  dynamicSecretKeys?: (settings?) => string[]; // las que dependen de la configuración, para R8
  noteBlock?: { language: string; inline?: boolean; template?: string }; // R24
  load: () => Promise<ExtensionModule>;   // import() dinámico
}
```

- Los textos (nombre, descripción, aviso) van en `i18n.ts`, en la
  sección `extensions` con las claves `'<id>.name'`,
  `'<id>.description'` y `'<id>.consent'`. La etiqueta de la sección del
  menú es el nombre de la extensión.
- **`secretKeys`:** el llavero no se puede listar, así que cada
  extensión declara las claves de sus secretos y "Quitar configuración"
  borra esas. Si las claves dependen de su configuración (una por
  variable secreta del Cliente HTTP), declara además
  `dynamicSecretKeys(settings)`, una función pura que el registro importa
  sin cargar el módulo (R16).
- Una extensión solo está en el registro de Desktop si Desktop la
  implementa (R4).

## Módulo de una extensión y puntos de extensión

```ts
export interface ExtensionModule {
  Settings?: ComponentType;                  // panel bajo su tarjeta
  View?: ComponentType;                      // vista de su sección
  dailyActions?: ComponentType<{ date: string; getText: () => Promise<string> }>; // botones junto a Copiar
  NoteBlock?: ComponentType<NoteBlockProps>; // bloque propio en las notas (R24), con NoteBlockEditor
  SidebarStatus?: ComponentType<{ collapsed: boolean }>; // estado en el menú lateral (R26)
  HomeCard?: ComponentType<object>;          // tarjeta al final de Inicio (R27)
  start?: () => () => void;                  // procesos propios; devuelve cómo pararlos (R7)
}
```

- **Puntos de extensión:** v1 solo tiene los que necesita la primera
  extensión (`Settings`, `View`, `dailyActions` y `start`). Se agrega uno
  nuevo cuando una extensión lo necesite, con su spec.
- **No es una API pública:** se puede cambiar en cualquier momento sin
  compatibilidad hacia atrás, porque todas las extensiones viven en este
  repo.
- Cada punto donde la app dibuja algo de una extensión lo envuelve en
  `ExtensionBoundary` (R15).
  - Si hay un error, muestra "Esta extensión tuvo un error" y un botón
    "Desactivar".
  - Registra el error en la consola con el `id`.
- **`dailyActions`** recibe `getText`, que guarda lo pendiente del
  editor y devuelve el texto de Copiar (`copyDailyFormat`). Así una
  extensión envía exactamente lo mismo que Copiar sin conocer el editor.
- `start()` se llama al activar la extensión, o al abrir la app si ya
  estaba activa. La función que devuelve se llama al desactivarla o al
  cerrar la app. Lo hace `useExtensionLifecycle`, montado en `App`, que
  compara las activas con las que están corriendo.
- **Carga:** cada punto se dibuja con un `React.lazy` por extensión y
  punto, en caché. Si el `import()` falla, se olvida, y se reintenta la
  próxima vez que se monte.

## Preferencias

En `AppConfig` (`src/types/config.ts`):

```ts
extensions?: Partial<Record<ExtensionId, {
  enabled: boolean;
  consentAt?: string;            // instante ISO (R6)
  settings?: Record<string, unknown>; // configuración no secreta
}>>;
```

- Es local y no se sincroniza (R9).
- Se incluye en `BackupSettings`, que no lleva secretos (R10). Al
  restaurar un backup se reemplaza entera, antes de la pantalla de
  inicio; los secretos no vienen, así que una extensión que los necesita
  pide volver a configurarla.
- Se lee de `config.json` con `parseExtensionsConfig`, que conserva las
  entradas de ids que esta versión no conoce, para no perderlas al
  guardar.
- **Secretos:** van al llavero del SO con el crate `keyring` 3, bajo el
  servicio del identificador de la app (`com.jorgebuitrago.logday` en
  producción) y la cuenta `ext:<id>:<clave>`. Usar el identificador hace
  que un build de QA, con otro identificador, no toque las entradas del
  usuario.
  - Almacén por plataforma: Keychain en macOS, Credential Manager en
    Windows y Secret Service (D-Bus) en Linux.
  - **En macOS, una sola entrada por app** (`ext:vault`, `vault.rs`),
    desde el 29 oct 2026. Guarda un JSON `{ "ext:<id>:<clave>": valor }`,
    se lee una vez y queda en memoria. La app se firma ad hoc, así que
    cada build de QA y cada versión cambia de firma, y macOS pedía la
    contraseña una vez por secreto. Ahora la pide una sola vez.
  - Las entradas viejas `ext:<id>:<clave>` pasan solas a la única la
    primera vez que se leen, y se borran.
  - Windows y Linux siguen con una entrada por secreto: no tienen ese
    aviso, y Windows limita el tamaño de cada entrada.
  - Comandos genéricos: `ext_secret_set(id, key, value)`, que devuelve
    la pista, `ext_secret_clear(id, key)` y `ext_secret_hint(id, key)`,
    que devuelve la pista o `null` si no hay secreto. La pista es el
    host (si es una URL) y los últimos 4 caracteres.
  - `id` y `key` solo aceptan minúsculas, dígitos, `-` y `_`.
  - No hay un `get` hacia el webview: quien usa el secreto es el comando
    Rust de la extensión (R10, R17).
- **Quitar configuración** (R8): borra los secretos
  `ext:<id>:<clave>` de cada clave de `secretKeys` y de
  `dynamicSecretKeys(settings)` (`secretKeysToClear` en `state.ts`), y
  después `extensions[id]`. Si el llavero falla, la configuración queda y se
  puede reintentar.

## Menú lateral

- `ActiveSection` pasa de una unión cerrada a
  `CoreSection | \`ext:${ExtensionId}\``.
  - `CoreSection` es la lista actual.
  - `StartupScreen` acepta lo mismo; R13 se resuelve al cargar la
    config con `resolveSection`: una extensión desactivada, sin vista o
    que no existe en Desktop da `dashboard`. El resultado queda como
    pantalla de inicio. También se resuelve al elegirla y al restaurar
    un backup.
  - Las vistas de las extensiones activas aparecen como opciones de la
    pantalla de inicio.
- **Menú lateral:** `useExtensionSectionItems()` (`ExtensionSections.tsx`)
  da las extensiones activas con `view`, con su icono y su nombre, y
  `useSectionItems()` las suma a las secciones fijas en el orden del
  usuario (`specs/navegacion-secciones`). La separadora entre las fijas y
  las extensiones solo se dibuja si no están mezcladas.
- **`setSection('ext:<id>')`** dibuja `<ExtensionBoundary><View/></ExtensionBoundary>`
  en el área principal.
- **Al desactivar** una extensión con su vista abierta, `setSection('dashboard')`
  (R14). Igual al quitar su configuración.

## Opciones → Extensiones

- **Sección nueva** `extensions` en la barra lateral de `SettingsModal`:
  un grupo sin encabezado entre "Datos y conexión" y Acerca de, con el
  icono `Puzzle`.
- **Una entrada por extensión activa con panel** (R21), debajo de
  Extensiones y con sangría, al estilo de los complementos de Obsidian.
  Se sabe por el metadato `settings: true` del registro, sin cargar el
  módulo. La pestaña es `ext:<id>` y muestra el icono, el nombre, la
  descripción y su `Settings` dentro de `ExtensionBoundary`. Si la
  extensión se desactiva con su página abierta, se vuelve al catálogo.
- **Dos grupos,** con un encabezado cada uno, y tarjetas en orden
  alfabético. Si un grupo no tiene extensiones en Desktop, no se
  muestra.
- **Tarjeta:**
  - icono, nombre y descripción;
  - en qué apps está, con chips "Desktop", "Web" y "Mobile";
  - el interruptor;
  - si está activa y tiene panel, un botón "Configurar" que abre su
    entrada de la barra (R21);
  - "Quitar configuración" mientras exista su entrada en
    `extensions`, esté activa o no (la configuración se conserva al
    desactivarla). Usa `ConfirmDeleteModal` y respeta "Confirmar
    acciones destructivas".
- **Aviso de R6:** un modal con el texto `extensions.<id>.consent` y
  dos botones, "Activar" y "Cancelar". Usa `ModalOverlay` y
  `ModalPanel`, como `SensitiveDataConsentModal`. Se pide la primera vez
  y otra vez después de "Quitar configuración", que borra `consentAt`.
- **Estado vacío:** "Todavía no hay extensiones." No debería verse
  nunca, porque la primera llega con este spec.

## Eventos externos en el Calendario (R22)

- `src/extensions/externalEvents.ts`: un store en memoria con el mes
  visible (`range`, que fija el Calendario) y los eventos de cada fuente
  (`setSource` y `clearSource`).
- El Calendario los dibuja con borde punteado y el texto del tema, y al
  hacer clic abre su `url`. En el panel del día van aparte, con el nombre
  de la extensión.
- La primera fuente es Google Calendar (`specs/google-calendar/`).

## Eventos de la app (R23)

`src/lib/appEvents.ts`: `onAppEvent(fn)` y `emitAppEvent(event)`. Los
emiten `createTask`, `updateTask` y `saveOvertimeEntry` después de
escribir en disco. El primer oyente es el webhook saliente
(`specs/webhook-saliente/`).

## Bloques propios en las notas (R24)

`noteBlock: { language }` en el registro, y `NoteBlock` y
`NoteBlockEditor` en el módulo. `NoteEditor` y `mermaidCodeBlock.tsx`
los dibujan y los editan como a Mermaid. La primera es Excalidraw
(`specs/excalidraw/`).

**Modo inline** (`noteBlock: { language, inline: true, template }`, el
del Cliente HTTP, `specs/cliente-http/` design A3):

- El NodeView deja el código visible y editable en un `<pre>`, entre dos
  islas `contentEditable={false}` (`.extension-block-ui`). En cada una va
  el `NoteBlock` de la extensión con `part: 'header'` o `'footer'`, además
  de `noteId`, `index` (el n-ésimo bloque de ese lenguaje) y `cursor` (la
  posición del cursor dentro del bloque, o `null`). El índice y el cursor
  se recalculan con cada transacción del editor.
- ProseMirror no maneja los eventos de las islas (`stopEvent`); el código
  sí es suyo. Excalidraw sigue con su NodeView de siempre.
- "Nuevo bloque" inserta `template` en el cursor, sin editor aparte, y
  deja el cursor al final de la primera línea.
- ⌘↵ (Ctrl+Enter) con el cursor dentro de un bloque inline se avisa por
  el bus `src/extensions/noteBlockEvents.ts`, con el elemento del NodeView
  para que cada bloque reconozca el suyo. Fuera, Mod-Enter hace lo de
  siempre.
- El resumen de la lista de notas no quita los bloques inline: su texto
  se lee bien.
- `parseFencedBlocks` compara el lenguaje exacto y acepta cercas de 3 o
  más comillas invertidas; `formatFence` alarga la cerca si el contenido
  trae una línea con comillas invertidas.

## Red (R17)

- Cada extensión que habla con un servicio tiene sus comandos en
  `src-tauri/src/extensions/<id>.rs`.
- La lista de hosts permitidos está en el código Rust de esa extensión.
  La excepción es el Cliente HTTP (R17): el host lo escribe el usuario.
- Se usa `reqwest` (ya es dependencia) con timeout y sin redirecciones,
  salvo que el spec de la extensión diga otra cosa.
- El webview nunca hace `fetch` a esos servicios.

## Pruebas

- Vitest, sin DOM (el repo no tiene jsdom): `state.test.ts`,
  `actions.test.ts` (la lógica de `useExtensions`), `runtime.test.ts`,
  `registry.test.ts` (también que haya textos en es y en) y
  `ExtensionBoundary.test.tsx`. Esta última recorre a mano lo que hace
  React con un error (`getDerivedStateFromError`, `render`,
  `componentDidCatch`), porque `react-dom/server` no ejecuta los
  ErrorBoundary. El caso real se prueba en la app de QA.
- Rust: el nombre de la cuenta y la pista en `extensions/mod.rs`. El
  llavero real no se toca en las pruebas.

## Web y Mobile

Siguen el mismo modelo cuando tengan su primera extensión:

- mismos `id`;
- registro propio con solo lo que implementan;
- pestaña o sección "Extensiones" en sus Opciones;
- activación en preferencias locales.
- Secretos:
  - Mobile, en `expo-secure-store`;
  - Web no guarda secretos: solo usa extensiones que funcionan por la
    cuenta.

## Alternativas descartadas

- **Llamarlo "Plugins":** promete instalar código de terceros, que es
  justo lo que no se hace. "Integraciones" solo cubre la mitad: las
  herramientas no se conectan a nada.
- **Una sección del menú lateral para el catálogo:** sería una pantalla
  que se visita una vez. En el menú solo van las extensiones con vista
  propia.
- **Sincronizar qué extensiones están activas:** cada app implementa
  extensiones distintas (Obsidian o DevTools no tienen sentido en
  Mobile), y es natural activar algo en un solo equipo. Además, se
  mantiene que nada dependa del sync. Se puede revisar si resulta
  molesto activar lo mismo en varios equipos.
- **Guardar los secretos en `localStorage`,** como el token de sync
  (decisión "localStorage como mecanismo único de persistencia"): un
  webhook o un token de Jira dan acceso a servicios de terceros y no
  caducan como el token de sesión. Si quedan en el llavero, el webview
  nunca los ve. Es una excepción deliberada a esa decisión, solo para
  secretos de extensiones.
- **Cargar todas las extensiones al inicio:** agregaría peso y riesgo a
  quien no usa ninguna.
- **Un ErrorBoundary global:** ya existe y cierra la app entera. Fue la
  causa del fallo de la vista previa de enlaces arreglado en v1.0.7.

## Estado en el menú lateral (R26)

La primera es el contador del Pomodoro (`specs/pomodoro/design.md` §3).

- Punto `SidebarStatus` (`ComponentType<{ collapsed: boolean }>`). Si no
  hay nada que mostrar, devuelve `null`.
- Metadato `sidebarStatus: true` en el registro, para que el menú sepa
  qué extensiones lo tienen sin cargar su código (R16).
- `SidebarStatusSlots` (`ExtensionSections.tsx`) monta un `ExtensionSlot`
  con `variant="inline"` por cada extensión activa que lo tenga:
  - expandido: primer hijo del pie (en la Lista, antes de "Opciones"; en
    la Barra de íconos, al pie del panel);
  - colapsado: después de la columna con scroll y antes de Buscar.
- **Columna colapsada con scroll:** las secciones y las vistas de Tareas
  van en un contenedor `flex-1 overflow-y-auto`; el estado, Buscar y
  Opciones quedan fijos abajo. Con dos extensiones con vista y el
  contador, la columna no cabía en 600 px de alto (Pomodoro, hallazgo 2).
  Desde `specs/navegacion-secciones`, además, lo que no cabe pasa a "Más".
- **Abrir Opciones en la página de una extensión:** `openExtensionSettings(id)`
  del store deja una señal (`settingsExtensionRequest`) y abre Opciones;
  `SettingsModal` la consume y abre `ext:<id>`, como `openSettingsGitTab`.

## Tarjetas en Inicio (R27)

Las primeras son la del Pomodoro (`specs/pomodoro` PM17) y "Reuniones de
hoy" de Google Calendar (`specs/google-calendar` G12).

- Punto `HomeCard` (`ComponentType<HomeCardProps>`, `HomeCardProps =
  object`): cada tarjeta lee lo suyo de su store. Si no hay nada que
  mostrar, o su "Mostrar en Inicio" está apagado, devuelve `null`.
- Metadato `homeCard: { order }` en el registro, para que Inicio sepa qué
  extensiones la tienen, y en qué orden, sin cargar su código (R16).
  Pomodoro 10, Google Calendar 20.
- `ExtensionHomeCards` (`components/dashboard/ExtensionHomeCards.tsx`) va
  después de "Esta semana". Monta un `ExtensionSlot` con `variant="block"`
  por cada extensión activa con tarjeta, por `order`, en una rejilla
  `repeat(auto-fit, minmax(min(100%, 18rem), 1fr))` (una, dos o tres por
  fila según el ancho), con un `h2` solo para lectores de pantalla
  ("Extensiones"). Sin ninguna, no dibuja nada.
  - Una tarjeta que devuelve `null` no crea ningún elemento, así que no
    deja hueco. Si ninguna dibuja nada, la rejilla queda vacía y se oculta
    con `:empty`, y la sección, con `:has(> div:empty)`.
- `HomeCardShell` (`components/dashboard/HomeCardShell.tsx`): el marco y la
  cabecera de las tarjetas propias de Inicio (`rounded-2xl`, ícono 16
  `text-indigo-400`, `h3 text-sm font-semibold`, `dash-enter dash-d4`), con
  un texto pequeño junto al título y un enlace opcional a la derecha como
  "Ver calendario →". Las extensiones lo usan para parecer de Inicio.
- "Mostrar en Inicio": cada extensión lo guarda en sus `settings` locales
  (`showOnHome`, encendido salvo `false`) y lo pone en su página de
  Opciones.
- **Aviso "Extensiones"** (`ExtensionsHomeHint`, en el mismo archivo): a
  todo el ancho, con borde punteado, solo si no hay ninguna extensión
  activa (aunque sea una sin tarjeta) y no se descartó.
  - Nombra cuatro del registro, en una lista sin controles: Pomodoro,
    Google Calendar, DevTools y Captura rápida.
  - "Ver extensiones" llama a `openExtensionsCatalog()` del store: abre
    Opciones con la señal `extensionsCatalogRequest`, y `SettingsModal`
    abre la pestaña Extensiones (como `openSidebarSettings`).
  - "Ocultar este aviso" (✕) llama a `dismissHomeExtensionsHint()`:
    `homeExtensionsHintDismissed: true` en `config.json`, que no se
    sincroniza (solo se escribe la clave si se descartó). El foco pasa al
    control anterior al aviso, para que no caiga al `body`.

## Atajo global y ventana propia (R25)

La primera es la captura rápida (`specs/captura-rapida/design.md`).

- El atajo lo registra Rust con `tauri-plugin-global-shortcut`, así que
  el webview no necesita permisos del plugin. El manejador del plugin es
  uno solo, en `lib.rs`, y despacha a la extensión.
- La ventana usa el mismo bundle; `main.tsx` la reconoce por su etiqueta
  y carga solo su componente, sin `App` ni el store.
- Su capacidad (`capabilities/<id>.json`) da solo eventos: habla con la
  ventana principal por eventos de Tauri, y esta escribe con el store.
- La bandeja se arma con `build_tray_menu`, que agrega las entradas de
  las extensiones activas; `refresh_tray` la rehace. Las del Pomodoro van
  entre "Nueva tarea" y "Salir", con su separador
  (`extensions::pomodoro::tray_items`).
