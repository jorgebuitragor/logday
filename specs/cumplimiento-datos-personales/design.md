# Cumplimiento de datos personales — Design

## Dónde vive la fuente de la verdad

`logday-server` ya tiene el patrón exacto que hace falta:
`instance_settings` (singleton, editable por un admin desde el panel
server-rendered en `/admin/panel/settings` →
`panelSettings`/`panelUpdateSettings` en
`internal/auth/panel_handlers.go`) para config operativa por instancia
(`access_token_ttl_minutes`, `login_rate_limit_attempts`, etc., ver
migraciones `00015`/`00017`). La política de tratamiento es exactamente
ese tipo de dato: por instancia, editable por el operador, no por
usuario. Se agrega ahí, no se inventa un mecanismo nuevo.

## Servidor (`logday-server`)

### Migración nueva

`instance_settings` gana:
- `privacy_policy_text TEXT NOT NULL DEFAULT '<plantilla, ver abajo>'`
- `privacy_policy_version INTEGER NOT NULL DEFAULT 1` — el admin la
  sube a mano cada vez que edita el texto (no autoincrementa solo; un
  typo corregido no debería forzar a todo el mundo a re-aceptar).

`users` (`internal/db/migrations/00001_create_users.sql` es la base,
esto es una migración nueva que le agrega columnas) gana:
- `privacy_accepted_version INTEGER` (nullable)
- `privacy_accepted_at TEXT` (nullable)
- `sensitive_data_accepted_at TEXT` (nullable) — un solo flag alcanza:
  no hay múltiples tipos de dato sensible hoy, solo `incapacidad`.

### Endpoints nuevos (`internal/auth/handlers.go`, mismo `Handler` que ya expone `/auth/*`)

- `GET /policy` — público (sin auth, igual que `/auth/login`): devuelve
  `{ text, version }` de la instancia. Público a propósito: un cliente
  necesita poder mostrarlo antes de que el usuario decida si quiere
  usar ese servidor.
- `POST /policy/accept` — autenticado, body `{ version }`, guarda
  `privacy_accepted_version`/`privacy_accepted_at` en `users`. Rechaza
  con 409 si `version` no coincide con la vigente (evita aceptar una
  versión vieja por una carrera con el admin editando el texto).
- `POST /policy/accept-sensitive` — autenticado, sin body, guarda
  `sensitive_data_accepted_at`.
- `login`/`refresh` (ya existentes) agregan al `tokenResponse`:
  `policy_version` (la vigente de la instancia) y
  `policy_accepted_version` (la que el usuario tiene aceptada, puede
  ser `null`) — así el cliente sabe si debe mostrar el gate sin pegarle
  a `/policy` aparte en el camino crítico de login.

### Derechos del titular

- `GET /account/export` — autenticado, junta en un solo JSON todas las
  filas del usuario en las 7 tablas de dominio (mismo criterio que ya
  usa `syncChangesRemote`/`/sync/changes` para enumerar por
  `user_id`) más sus datos de cuenta/dispositivos.
- `DELETE /account` — autenticado, borra el usuario y hace cascada
  sobre sus filas en las 7 tablas + `devices` + `used_refresh_tokens`.
  Requiere reingresar la contraseña en el body (mismo nivel de
  fricción que cualquier acción irreversible ya en la app), y termina
  invalidando la sesión actual.

### Panel admin (`internal/auth/panel_handlers.go` + su template HTML)

`panelSettings`/`panelUpdateSettings` gana un campo de texto largo
(textarea) para `privacy_policy_text` y un número para
`privacy_policy_version`, mismo formulario que ya edita el resto de
`instance_settings`.

### Plantilla por defecto

Vive como el `DEFAULT` de la columna en la migración — texto en
español con placeholders explícitos (`[NOMBRE DEL RESPONSABLE]`,
`[CORREO DE CONTACTO]`, etc.) y una nota en el propio texto: *"Esta es
una plantilla de referencia, no un documento legal — adaptala a tu
caso y jurisdicción antes de usarla con usuarios reales."* Cubre:
identificación del responsable, finalidad del tratamiento, derechos
del titular (acceso/corrección/supresión — cómo ejercerlos dentro de
la propia app), tratamiento de datos sensibles (menciona
`incapacidad` explícitamente), vigencia.

## Clientes (`task-manager`, `logday-web`, `logday-mobile`)

Mismo contrato REST para los tres — el mecanismo de UI se adapta al
stack de cada uno, pero la lógica (comparar versión aceptada vs.
vigente, mostrar gate, llamar `/policy/accept`) es idéntica.

### Gate de consentimiento general

- Se dispara solo cuando el flujo de login/refresh trae
  `policy_accepted_version !== policy_version` — nunca en modo 100%
  local (sin sync configurado no hay ningún login contra un
  `logday-server`, así que nunca se evalúa esta condición).
- Pantalla de texto completo (scrolleable) + botón "Acepto" que queda
  deshabilitado hasta hacer scroll al final (evita un "aceptar" sin
  haber podido leer, práctica estándar para que el consentimiento sea
  válido) + botón "Rechazar" que hace logout/desconecta — no se puede
  seguir usando el sync sin aceptar, pero el modo local sigue intacto.
- En `task-manager`: nuevo paso entre `syncConnect` (o la
  auto-reconexión de `init()`) y dejar pasar al resto de la app —
  mismo lugar donde hoy se resuelve `syncConnectionStatus`.

### Gate de dato sensible

- Se dispara la primera vez que el usuario intenta guardar una
  `AbsenceDay` con `type: 'incapacidad'` estando `syncConfig.enabled`,
  y `sensitive_data_accepted_at` todavía no está seteado (server lo
  informa, mismo patrón que `policy_accepted_version`: se puede pedir
  como parte de la respuesta de `/policy` o cachear localmente tras el
  primer `accept-sensitive`).
- Modal aparte del gate general — texto corto, específico, con la
  frase obligatoria de que no es obligatorio dar ese dato.

### Ajustes → "Privacidad y datos" (nueva sección, junto a Sync)

- Ver la política vigente (solo lectura).
- "Exportar mis datos" → `GET /account/export`, guarda un `.json` vía
  `saveDialog` (mismo patrón que el backup de `DataSettingsTab.tsx`).
- "Eliminar mi cuenta" → `DELETE /account`, con el mismo patrón de
  modal de confirmación fuerte que ya existe para desconectar sync
  (pide contraseña, no solo un "¿estás seguro?").

## Fuera de este diseño

- Traducir la plantilla de política al inglés — el texto es
  específico de la ley colombiana citada, no tiene sentido
  traducirlo literal; un operador en otra jurisdicción escribe la
  suya propia desde cero usando el mismo mecanismo.
- Notificar al operador cuando actualiza el texto (email a usuarios,
  etc.) — fuera de alcance, el gate en el próximo login ya cumple el
  requisito de exigir la re-aceptación.
