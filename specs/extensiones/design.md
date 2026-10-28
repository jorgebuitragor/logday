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
  load: () => Promise<ExtensionModule>;   // import() dinámico
}
```

- Los textos (nombre, descripción, aviso) van en `i18n.ts`, en la
  sección `extensions` con las claves `'<id>.name'`,
  `'<id>.description'` y `'<id>.consent'`. La etiqueta de la sección del
  menú es el nombre de la extensión.
- **`secretKeys`:** el llavero no se puede listar, así que cada
  extensión declara las claves de sus secretos y "Quitar configuración"
  borra esas.
- Una extensión solo está en el registro de Desktop si Desktop la
  implementa (R4).

## Módulo de una extensión y puntos de extensión

```ts
export interface ExtensionModule {
  Settings?: ComponentType;                  // panel bajo su tarjeta
  View?: ComponentType;                      // vista de su sección
  dailyActions?: ComponentType<{ date: string; getText: () => Promise<string> }>; // botones junto a Copiar
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
  - Comandos genéricos: `ext_secret_set(id, key, value)`, que devuelve
    la pista, `ext_secret_clear(id, key)` y `ext_secret_hint(id, key)`,
    que devuelve la pista o `null` si no hay secreto. La pista es el
    host (si es una URL) y los últimos 4 caracteres.
  - `id` y `key` solo aceptan minúsculas, dígitos, `-` y `_`.
  - No hay un `get` hacia el webview: quien usa el secreto es el comando
    Rust de la extensión (R10, R17).
- **Quitar configuración** (R8): borra los secretos
  `ext:<id>:<clave>` de cada clave de `secretKeys` y después
  `extensions[id]`. Si el llavero falla, la configuración queda y se
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
- **`Sidebar.tsx`:** después de las secciones fijas, una línea
  separadora y un botón por extensión activa con `view`, con su icono y
  su etiqueta. Si no hay ninguna activa con vista, no aparece la
  separadora.
- **`setSection('ext:<id>')`** dibuja `<ExtensionBoundary><View/></ExtensionBoundary>`
  en el área principal.
- **Al desactivar** una extensión con su vista abierta, `setSection('dashboard')`
  (R14). Igual al quitar su configuración.
- Las secciones de extensiones están en `ExtensionSections.tsx`: en el
  menú expandido, una fila por extensión debajo de la cuadrícula de
  secciones fijas; en el colapsado, un icono después de Extras.

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

## Red (R17)

- Cada extensión que habla con un servicio tiene sus comandos en
  `src-tauri/src/extensions/<id>.rs`.
- La lista de hosts permitidos está en el código Rust de esa extensión.
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
