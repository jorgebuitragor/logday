# Extensiones — Diseño

Estado: en diseño.

## Estructura de carpetas

```
src/extensions/
  registry.ts           # lista de extensiones de Desktop (solo metadatos)
  types.ts              # ExtensionDefinition, ExtensionId, puntos de extensión
  useExtensions.ts      # hook: activas, activar/desactivar, cargar módulo
  ExtensionBoundary.tsx # ErrorBoundary por extensión (R15)
  team-chat/            # la primera extensión
    index.ts            # módulo: lo que aporta a cada punto de extensión
    Settings.tsx
    SendToChatButton.tsx
src/components/settings/ExtensionsSettingsTab.tsx
src-tauri/src/extensions/  # comandos Rust por extensión (red, llavero)
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
  view?: { labelKey: string };            // si tiene vista: sección en el menú (R11)
  load: () => Promise<ExtensionModule>;   // import() dinámico
}
```

- Los textos (nombre, descripción, aviso) van en `i18n.ts`, bajo
  `extensions.<id>.*`.
- Una extensión solo está en el registro de Desktop si Desktop la
  implementa (R4).

## Módulo de una extensión y puntos de extensión

```ts
export interface ExtensionModule {
  Settings?: ComponentType;                  // panel bajo su tarjeta
  View?: ComponentType;                      // vista de su sección
  dailyActions?: ComponentType<{ date: string }>; // botones junto a Copiar
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
- `start()` se llama al activar la extensión, o al abrir la app si ya
  estaba activa. La función que devuelve se llama al desactivarla o al
  cerrar la app.

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
- Se incluye en `BackupSettings`, que no lleva secretos (R10).
- **Secretos:** van al llavero del SO con el crate `keyring`, bajo el
  servicio `com.jorgebuitrago.logday` y la cuenta `ext:<id>:<clave>`.
  - Comandos genéricos: `ext_secret_set(id, key, value)`,
    `ext_secret_clear(id, key)` y `ext_secret_hint(id, key)`.
  - No hay un `get` hacia el webview: quien usa el secreto es el comando
    Rust de la extensión (R10, R17).
- **Quitar configuración** (R8): borra `extensions[id]` y todos los
  secretos `ext:<id>:*`.

## Menú lateral

- `ActiveSection` pasa de una unión cerrada a
  `CoreSection | \`ext:${ExtensionId}\``.
  - `CoreSection` es la lista actual.
  - `StartupScreen` acepta lo mismo; R13 se resuelve al cargar la
    config.
- **`Sidebar.tsx`:** después de las secciones fijas, una línea
  separadora y un botón por extensión activa con `view`, con su icono y
  su etiqueta. Si no hay ninguna activa con vista, no aparece la
  separadora.
- **`setSection('ext:<id>')`** dibuja `<ExtensionBoundary><View/></ExtensionBoundary>`
  en el área principal.
- **Al desactivar** una extensión con su vista abierta, `setSection('dashboard')`
  (R14).

## Opciones → Extensiones

- **Pestaña nueva** `extensions` en `SettingsModal`, después de `sync`.
- **Dos grupos,** con un encabezado cada uno, y tarjetas en orden
  alfabético. Si un grupo no tiene extensiones en Desktop, no se
  muestra.
- **Tarjeta:**
  - icono, nombre y descripción;
  - en qué apps está, con chips "Desktop", "Web" y "Mobile";
  - el interruptor;
  - si está activa, su `Settings` debajo, dentro de `ExtensionBoundary`.
- **Aviso de R6:** un modal con el texto `extensions.<id>.consent` y
  dos botones, "Activar" y "Cancelar". Usa el mismo componente de modal
  que el resto de confirmaciones.
- **Estado vacío:** "Todavía no hay extensiones." No debería verse
  nunca, porque la primera llega con este spec.

## Red (R17)

- Cada extensión que habla con un servicio tiene sus comandos en
  `src-tauri/src/extensions/<id>.rs`.
- La lista de hosts permitidos está en el código Rust de esa extensión.
- Se usa `reqwest` (ya es dependencia) con timeout y sin redirecciones,
  salvo que el spec de la extensión diga otra cosa.
- El webview nunca hace `fetch` a esos servicios.

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
