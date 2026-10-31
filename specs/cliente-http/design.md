# Cliente HTTP — Design

Estado: aprobado (31 oct 2026); los PR 1 y 2 están implementados, y la herramienta de DevTools del PR 2 se reemplazó por una pantalla propia (§11, HT33–HT35). Lo que está marcado como **nuevo** no existía en `develop` (9213ed2) cuando se escribió; todo lo demás se comprobó contra esa versión. Lo que la implementación hizo distinto está en `tasks.md`, "Diferencias con el diseño".

## Arquitectura

### A1. Módulos

```
src/extensions/http-client/
  index.ts              NoteBlock (header y footer), Settings y start()
  core/                 puro, sin React ni DOM, probado en vitest
    parse.ts            el bloque http → peticiones + problemas (HT5–HT7)
    resolve.ts          variables y entorno → petición para Rust + vista enmascarada (HT15–HT16, HT21)
    environments.ts     leer y validar los ajustes, hosts de confianza, claves de secretos (HT17–HT22)
    serialize.ts        formulario de la pantalla ↔ texto http (HT33)
    noteRequests.ts     la columna "Peticiones": las peticiones de los textos de las notas (HT34)
    body.ts             qué vista lleva una respuesta: JSON, XML, texto, imagen o binario (HT10, HT12)
    cache.ts            respuestas en memoria con tope (HT11)
    api.ts              invoke('http_client_send' | 'http_client_cancel'); traduce los errores
  store.ts              zustand del módulo: en curso, resultados, confirmaciones pendientes
  announce.ts           una sola región aria-live para todos los bloques
  ui/
    BlockHeader.tsx     barra del bloque
    BlockFooter.tsx     problemas, confirmación y respuesta del bloque
    ResponseView.tsx    la respuesta, compartida con la pantalla
    EnvironmentChip.tsx selector del entorno activo, compartido con la pantalla
    Settings.tsx        Opciones → Cliente HTTP
    View.tsx            la pantalla: la columna "Peticiones" y el formulario (HT33, HT34)
    RequestForm.tsx     el formulario (antes devtools/views/HttpTool.tsx)
    Help.tsx            su ayuda contextual (HT35)
src/lib/allNotes.ts                             las notas de todas las carpetas (también la usa DevTools)
src-tauri/src/extensions/http_client.rs         el envío (HT23–HT26)
```

### A2. Registro

En `registry.ts`, y sumando `'http-client'` a `ExtensionId`:

```ts
{
  id: 'http-client',
  category: 'tool',
  icon: Globe,
  apps: ['desktop'],
  // HT2: envía lo que el usuario escribe a la URL que escribe.
  sendsDataExternally: { to: 'URLs del usuario' },
  settings: true,
  // HT4: el código se edita en la nota; la extensión pone la barra y la respuesta.
  noteBlock: { language: 'http', inline: true, template: 'GET https://example.com\nAccept: */*\n' },
  // HT22: las claves de los secretos dependen de las variables.
  dynamicSecretKeys: httpClientSecretKeys,
  load: () => import('./http-client').then((m) => m.default),
}
```

- `httpClientSecretKeys` va en `src/extensions/http-client/secretKeys.ts`: una función pura de unas 10 líneas, sin dependencias. El registro la puede importar sin cargar el módulo (R16).
- El ícono es `Globe`, que no usa otra extensión. `Send` se reserva para el botón Enviar.
- ~~No lleva `view`: no tiene sección propia en el menú lateral.~~ **Desde el 31 oct 2026 lleva `view: true`** (HT33): su sección aparece en el menú al activarla, con el ícono `Globe`, y sigue las reglas de las demás (specs/extensiones R11 y R13, specs/navegacion-secciones NS7). Ver §11.

### A3. Cambios en la base de extensiones (nuevo)

Excalidraw esconde el código y lo edita en un editor aparte. Aquí el código es lo que se edita, así que la base necesita un segundo modo de bloque. Todo lo que sigue es nuevo, y se documenta también en `specs/extensiones` (R24) en el mismo PR.

1. **`noteBlock.inline` y `noteBlock.template`** en `ExtensionDefinition`.
   - Con `inline: true`, `ExtensionCodeBlockView` (`mermaidCodeBlock.tsx`) deja el código visible y editable, y dibuja dos islas `contentEditable={false}`, una antes y otra después:
     ```tsx
     <NodeViewWrapper className="extension-node-view extension-node-inline" data-extension-block={language}>
       <div contentEditable={false}>{slot('header')}</div>
       <pre><NodeViewContent as="code" className={`language-${language}`} /></pre>
       <div contentEditable={false}>{slot('footer')}</div>
     </NodeViewWrapper>
     ```
   - "Nuevo bloque: {nombre}" inserta `formatFence(language, template)` con `insertBlockAtSelection`, sin abrir un `NoteBlockEditor` (en el modo inline no hay editor aparte).
2. **`NoteBlockProps`** suma campos opcionales. Excalidraw no cambia.
   ```ts
   part?: 'header' | 'footer';   // solo en el modo inline
   noteId?: string;              // activeNote.id
   index?: number;               // n-ésimo bloque de ese lenguaje (blockIndexAt)
   ```
   `code` sigue siendo el texto del nodo. Cambia con cada tecla (`updateProps`), así que el análisis va con un debounce de 300 ms.
3. **⌘↵ dentro del bloque.** `MermaidAwareCodeBlock.addKeyboardShortcuts()` suma `Mod-Enter`.
   - Si el cursor está en un `codeBlock` cuyo lenguaje es de un bloque inline activo, llama a `extensionBlocks.current.run(language, index, offset)` y devuelve `true`. `offset` es la posición del cursor dentro del texto del nodo.
   - Si no, devuelve `false`, y Mod-Enter sigue haciendo lo de siempre (salto de línea o `exitCode`).
   - `run` emite por un bus pequeño, `src/extensions/noteBlockEvents.ts` (**nuevo**: `emit` y `subscribe` sobre un `Set` de oyentes), que escucha el módulo de la extensión. No hace falta un `ref` al DOM del NodeView.
4. **`dynamicSecretKeys?: (settings?: Record<string, unknown>) => string[]`** en `ExtensionDefinition`. `removeExtensionConfig` (`appStore.ts:4098`) borra `secretKeys ∪ dynamicSecretKeys(prefs.settings)`. Hoy solo borra la lista fija, y el llavero no se puede listar.
5. **El resumen de la lista de notas** (`NoteList.tsx:21`) deja de quitar los bloques inline. Su texto se lee bien, a diferencia del JSON de un dibujo.
6. **Resaltado:** se suma `http` de `highlight.js/lib/languages/http` al `lowlight` de `NoteEditor.tsx:113` (≈1 KB). El bloque se colorea con la extensión activa o apagada, y le sirve a cualquiera que ya escriba bloques `http`.
7. **CSS:** `.prose-editor .extension-node-inline`. Ver Interfaz §1.1. También hay que anular dentro de las islas las reglas `.prose-editor pre` y `.prose-editor pre code` (`App.css:759`, `:863`), que si no se aplican al `<pre>` de la respuesta: padding de 1,9rem y `color: var(--accent-inline)`.

### A4. Parser (`core/parse.ts`)

```ts
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ParsedRequest {
  name: string | null;              // de "### nombre"
  method: HttpMethod;
  url: string;                      // con {{variables}} sin resolver y las líneas ?/& ya unidas
  headers: { name: string; value: string; line: number }[];
  body: string | null;
  /** Líneas del bloque (desde 1) que ocupa: para ⌘↵ según el cursor y para la caché. */
  startLine: number;
  endLine: number;
  /** El texto de la sección, normalizado (sin espacios al final), para saber si cambió. */
  source: string;
  issues: ParseIssue[];             // si hay alguno de tipo error, no se puede enviar
}

export type ParseIssueCode =
  | 'empty_block' | 'missing_request_line' | 'unsupported_method' | 'invalid_header'
  | 'too_many_requests' | 'reserved_syntax' | 'get_with_body' | 'head_with_body';

export interface ParseIssue { code: ParseIssueCode; line: number; severity: 'error' | 'warn'; detail?: string }

export function parseHttpBlock(code: string): { requests: ParsedRequest[]; issues: ParseIssue[] };
export function requestAtOffset(requests: ParsedRequest[], code: string, offset: number): number; // índice
export function variablesOf(req: ParsedRequest): string[];   // nombres, sin repetir, en orden
```

Reglas, en este orden:

1. Se normalizan `\r\n` a `\n`. Una línea `^###(.*)$` abre una sección nueva, y lo que sigue a `###`, sin espacios, es su nombre. Lo anterior al primer `###` es una sección sin nombre.
2. En cada sección se saltan las líneas en blanco y los comentarios (`#` que no sea `###`, o `//`) hasta la línea de la petición. Una sección que no tiene nada más se ignora. Un bloque sin ninguna petición da `empty_block`.
3. **Línea de la petición:**
   - `^([A-Za-z]+)\s+(\S.*?)(?:\s+HTTP\/\d(?:\.\d)?)?\s*$`. El método se pasa a mayúsculas. Si no es uno de los siete, da `unsupported_method` (con `detail`: el método).
   - Si la línea empieza por `http://`, `https://` o `{{`, es un GET con esa URL.
   - Cualquier otra cosa da `missing_request_line`.
4. Las líneas siguientes que empiezan (tras espacios) por `?` o `&` se pegan a la URL, sin espacios.
5. **Cabeceras,** hasta la primera línea en blanco:
   - `^([!#$%&'*+.^_\`|~0-9A-Za-z-]+)\s*:\s*(.*)$`. Las variables van solo en el valor.
   - Un comentario (`#`, `//`) entre cabeceras se salta.
   - Otra línea da `invalid_header`, con su número de línea.
6. **Cuerpo:** desde la línea en blanco hasta el final de la sección, tal cual, comentarios incluidos. Se quitan las líneas en blanco del final. Si queda vacío, es `null`.
   - GET con cuerpo da `get_with_body` (aviso): se envía igual.
   - HEAD con cuerpo da `head_with_body` (aviso): el cuerpo no se envía.
7. Más de 20 secciones da `too_many_requests`. Se analizan las 20 primeras.
8. `{{$secret:` escrito a mano da `reserved_syntax`: es la marca interna con la que el webview le pasa los secretos a Rust (A5).
9. **Variables:** `\{\{\s*([A-Za-z_$][A-Za-z0-9_.-]*)\s*\}\}`. Unas llaves sin cerrar, o con otro contenido, quedan como texto.

Pruebas (`parse.test.ts`): cada regla, una línea con solo la URL, las líneas `?` y `&`, `HTTP/1.1` al final, comentarios en cada zona, varias secciones con y sin nombre, las secciones vacías, `\r\n`, un cuerpo con líneas en blanco en medio, `requestAtOffset` en los bordes de cada sección y los números de línea de cada problema.

### A5. Resolución de variables (`core/resolve.ts`)

```ts
export interface ResolveContext {
  env: HttpEnvironment | null;
  now: () => Date;
  uuid: () => string;          // crypto.randomUUID
}

export type Resolved =
  | { ok: true; wire: WireRequest; preview: SentPreview; secrets: string[]; host: string | null; needsConfirm: ConfirmReason[] }
  | { ok: false; missing: string[]; emptySecrets: string[]; unknownSystem: string[]; urlError?: 'invalid_url' | 'scheme_not_allowed' | 'credentials_in_url' };

export type ConfirmReason = { kind: 'protected'; env: string } | { kind: 'untrusted_host'; host: string; vars: string[] };

export function resolveRequest(req: ParsedRequest, ctx: ResolveContext): Resolved;
```

- **No secreta:** se reemplaza por su valor. No hay anidación: si un valor trae `{{…}}`, queda como texto. Así no hay ciclos ni sorpresas.
- **Secreta con valor en el llavero** (`hint !== null`): en `wire` va la marca `{{$secret:<clave>}}`, y en `preview`, `••••…a1b2`. El webview nunca tiene el valor.
- **Secreta sin valor** va a `emptySecrets`; **no definida** va a `missing`. Las dos impiden el envío (HT16).
- **Del sistema:** `$uuid`, `$timestamp` y `$isoTimestamp`, resueltas en el momento de enviar. Una que no existe va a `unknownSystem`.
- **URL:** después de reemplazar se valida con `new URL()`: solo `http:` y `https:`, y sin usuario ni contraseña. Si el host trae una marca de secreto, `host` queda en `null` y la comprobación de HT21 la hace solo Rust.
- **Cabeceras automáticas:**
  - `Content-Type: application/json`, si el cuerpo es JSON válido (`parseJson` de DevTools) y no hay `Content-Type`;
  - `User-Agent: Logday/<versión>`, si no hay `User-Agent`.
  Las dos se marcan como `auto` en `preview`.
- **`needsConfirm`:**
  - `protected` si el entorno lo es y el método es POST, PUT, PATCH o DELETE (HT20);
  - `untrusted_host` si hay secretos y `host` no está en `trustedHosts(env)` (HT21).
  Cuando hay los dos motivos, una sola confirmación los muestra juntos.

### A6. Entornos, variables y llavero (`core/environments.ts`)

En `extensions['http-client'].settings`, con `updateExtensionSettings` (local y sin sync, R9):

```ts
export interface HttpClientSettings {
  activeEnvId: string | null;
  environments: HttpEnvironment[];
  timeoutSec: number;        // 30, de 1 a 300
  maxResponseMb: number;     // 10, de 1 a 50
  followRedirects: boolean;  // true
}
export interface HttpEnvironment {
  id: string;                // 'e_' + 8 hex
  name: string;              // único, sin distinguir mayúsculas
  protected: boolean;
  insecureTls: boolean;
  extraHosts: string[];      // hosts de confianza agregados a mano
  vars: HttpVariable[];
}
export type HttpVariable =
  | { name: string; secret: false; value: string }
  | { name: string; secret: true; key: string; hint: string | null };   // key: 'v_' + 8 hex
```

- **Nombres:** `^[A-Za-z_][A-Za-z0-9_.-]{0,63}$`, únicos dentro de cada entorno. El `$` queda para las del sistema.
- **Clave del secreto:** `v_<8 hex>` al azar, independiente del nombre y del entorno. Así renombrar no mueve el secreto, y la clave cumple `secret_account` (minúsculas, dígitos y `_`) → `ext:http-client:v_ab12cd34`.
  - Se escribe con `setExtensionSecret('http-client', key, valor)`, que ya existe y devuelve la pista.
  - Se borra con `clearExtensionSecret`.
  - No hace falta otro comando para el llavero.
- En macOS, todos los secretos van en la entrada única `ext:vault` (`vault.rs`), y sigue siendo un solo aviso del llavero. En Windows va uno por entrada, que es lo que conviene por el límite de tamaño de cada una.
- **Hosts de confianza** (`trustedHosts(env)`):
  - el host de cada variable no secreta cuyo valor es una URL http(s);
  - el de cada variable secreta cuya pista empieza por un host (`secret_hint` da "host …a1b2" para las URL);
  - los de `extraHosts`.
  Se comparan en minúsculas y sin el puerto.
- **Duplicar un entorno** copia los nombres, los valores no secretos y las opciones. Las variables secretas se copian con `hint: null` y una clave nueva, porque el webview no puede leer el valor.
- **Pasar una variable a secreta** escribe el valor en el llavero y lo quita de los ajustes, en ese orden. Si el llavero falla, no cambia nada.
- **Quitarle lo de secreta** borra el secreto y deja el valor vacío, previa confirmación.
- Al leer los ajustes, lo que no sea válido se descarta sin romper (como `readDevtoolsSettings`).

### A7. Comando Rust (`src-tauri/src/extensions/http_client.rs`)

```rust
pub const EXTENSION_ID: &str = "http-client";
const MAX_REQUEST_BODY: usize = 10 * 1024 * 1024;
const MAX_REDIRECTS: usize = 10;
const MAX_IN_FLIGHT: usize = 6;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
// Se ajustan al rango, no se rechazan: 1 s–300 s y 1 MB–50 MB.

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendInput {
    pub request_id: String,            // UUID del webview, para cancelar
    pub method: String,                // uno de los 7 de HT5
    pub url: String,                   // con las variables puestas y los secretos como {{$secret:<clave>}}
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
    pub timeout_ms: u64,
    pub max_response_bytes: u64,
    pub follow_redirects: bool,
    pub insecure_tls: bool,
    pub trusted_hosts: Vec<String>,    // HT21
    pub allow_untrusted_host: bool,    // el usuario confirmó HT21
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendOutput {
    pub status: u16,
    pub reason: String,                // canonical_reason(), o "" si no hay
    pub headers: Vec<(String, String)>,// en el orden recibido, repetidas incluidas
    pub body: Body,
    pub body_bytes: u64,               // lo que se leyó
    pub content_length: Option<u64>,   // lo que anunció el servidor
    pub truncated: bool,
    pub elapsed_ms: u64,               // del envío al último byte leído
    pub final_url: String,             // con los secretos otra vez como marca
    pub redirects: Vec<RedirectHop>,   // { status, location }, también enmascaradas
    pub tls_unverified: bool,
    pub dropped_headers: Vec<String>,  // Content-Length o Transfer-Encoding del usuario, y las sensibles quitadas al redirigir
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Body { Empty, Text { text: String, lossy: bool }, Binary { base64: String } }

#[derive(Serialize)]
pub struct SendError {
    pub code: &'static str,
    pub host: Option<String>,          // el único detalle que sale; nunca la URL completa
    pub secret_key: Option<String>,    // la clave (v_…), nunca el valor
    pub tls_reason: Option<&'static str>, // expired | not_valid_for_name | unknown_issuer | other
}

#[tauri::command]
pub async fn http_client_send(app: AppHandle, input: SendInput) -> Result<SendOutput, SendError>;

/// Devuelve si había algo que cancelar.
#[tauri::command]
pub fn http_client_cancel(request_id: String) -> bool;
```

**Flujo de `http_client_send`:**

1. **Validar.**
   - Método, tamaño del cuerpo (`body_too_large`) y cabeceras (`HeaderName::from_bytes` y `HeaderValue::from_str`, que rechaza CR y LF: `invalid_header`).
   - Si ya hay 6 en curso, `too_many_in_flight`.
   - Se quitan `Content-Length` y `Transfer-Encoding` del usuario: los pone reqwest, y se anotan en `dropped_headers`.
2. **Poner los secretos.**
   - Se buscan las marcas `{{$secret:<clave>}}` en la URL, las cabeceras y el cuerpo.
   - Cada clave se valida con `secret_account` y se lee con `keychain(&app, |s| read_secret(&s, EXTENSION_ID, &clave))` (`google_oauth.rs:115`, el mismo camino del webhook).
   - Si no está, `secret_missing` (con `secret_key`); si el llavero falla, `keychain_error`.
   - Un secreto con salto de línea dentro de una cabecera da `invalid_header`.
3. **URL.**
   - `reqwest::Url::parse`: solo `http` y `https` (`scheme_not_allowed`), sin usuario ni contraseña (`credentials_in_url`) y con host (`invalid_url`).
   - Si se pusieron secretos y el host no está en `trusted_hosts` ni hay `allow_untrusted_host`, `secret_host_not_allowed` (con `host`). Es la misma regla de A5, otra vez del lado de Rust.
4. **Cliente.**
   - Hay dos `reqwest::Client` guardados en un `OnceLock`: uno que verifica los certificados y otro con `danger_accept_invalid_certs(true)`, que existe con `rustls-tls`.
   - Los dos llevan `redirect::Policy::none()` y `connect_timeout(CONNECT_TIMEOUT)`.
   - El tiempo límite va en cada `RequestBuilder::timeout`, con lo que queda del total. En reqwest 0.12 cubre también la lectura del cuerpo.
   - El proxy de `HTTP_PROXY`/`HTTPS_PROXY` se respeta (reqwest lo hace por defecto).
   - No hay gestor de cookies.
5. **Redirecciones, a mano** (para poder contarlas, registrarlas y quitar secretos):
   - Las sigue solo si `follow_redirects`, si la respuesta es 301, 302, 303, 307 o 308 con `Location`, y hasta 10 (`too_many_redirects`).
   - 301, 302 y 303 pasan a GET sin cuerpo (303 siempre; 301 y 302 solo si era POST, como los navegadores). 307 y 308 conservan el método y el cuerpo.
   - Si cambia el origen, se quitan `Authorization`, `Cookie` y `Proxy-Authorization`. Si además la petición lleva secretos y cambia el host, **no se sigue**: se devuelve la 3xx (HT24).
   - Es una función pura, `next_hop(status, method, &base, location, had_secrets) -> Hop`, probada aparte.
6. **Cuerpo de la respuesta:**
   - Se lee con `resp.chunk()` hasta `max_response_bytes`. Al llegar, se corta (`truncated: true`) y se suelta la respuesta, que cierra la conexión.
   - Es `Text` si el `Content-Type` es `text/*`, `*/json`, `*+json`, `*/xml`, `*+xml`, `application/javascript`, `application/x-www-form-urlencoded`, `*/yaml`, `*/csv` o `application/graphql`.
   - Sin `Content-Type`, es `Text` si es UTF-8 válido y no tiene bytes NUL.
   - El texto se decodifica con `from_utf8_lossy`, y `lossy` dice si hubo reemplazos.
   - Lo demás es `Binary` (base64). HEAD, 204 y 304 dan `Empty`.
7. **Enmascarar:** cada valor de secreto que aparezca en `final_url`, en un `Location`, en las cabeceras de la respuesta o en un cuerpo de texto vuelve a su marca (`mask_response`). Un cuerpo binario no se toca. (Cambio del 31 oct 2026: al principio el cuerpo no se tocaba; con httpbin, que devuelve lo recibido, el token aparecía en pantalla y Jorge pidió ocultarlo también ahí.)
8. **Cancelar:**
   - El trabajo corre en `tauri::async_runtime::spawn`. Su `JoinHandle` se guarda en un `Mutex<HashMap<String, JoinHandle>>` por `request_id`, y `http_client_cancel` lo aborta.
   - Al abortarse se suelta la conexión, y el comando responde `cancelled`.
   - El mapa se limpia en todos los casos.
   - No hacen falta dependencias nuevas: `tokio` no está como dependencia directa, y no se suma.
9. **Errores de reqwest:**
   - `is_timeout()` da `timeout`.
   - Si no, se recorre `source()`: "dns error" da `dns`; un error de certificado de rustls da `tls` con `tls_reason`; `is_connect()` da `connect`; lo demás, `network`.
   - El `Display` de reqwest lleva la URL, así que **nunca** se reenvía: solo el código y el host. El texto que se busca en la cadena de `source()` se fija con pruebas.
   - La extensión no escribe en los logs.
10. Se registra en `lib.rs` (`invoke_handler`) y en `extensions/mod.rs`. No hacen falta permisos en `capabilities/`: son comandos de la app, como los del Pomodoro.

**Pruebas Rust:**

- Puras: validación de la URL, poner y enmascarar los secretos, hosts de confianza, `next_hop` (cada código, cambio de origen, secretos), clasificación del cuerpo y ajuste de los rangos.
- Con un servidor local de `tiny_http` (ya es dependencia): estado y cabeceras repetidas, cuerpo cortado, tiempo límite, cadena de redirecciones (y que una a otro host con secreto no se siga), cancelar a mitad del cuerpo y un HEAD.

### A8. Caché de respuestas (`core/cache.ts`)

- **Clave:** `${noteId}#${blockIndex}#${requestIndex}`, y `devtools#0#0` para la herramienta.
- **Entrada:** `{ source, firstLine, envId, outcome, at, bytes }`, donde `outcome` es la respuesta o el error.
- **Tope:** un `Map` usado como LRU, con 30 entradas y 50 MB (la suma de `bytes`). Se olvida lo más viejo.
- **Al mostrar** (HT11):
  - si `firstLine` (método y URL sin resolver) no es la de ahora, la entrada no se muestra, porque es otra petición: se movió un bloque o se borró uno de arriba;
  - si es la misma pero `source` cambió, se muestra con la nota "La petición cambió después de esta respuesta".
- **Se vacía** en la función de parada de `start()` (R7: al desactivar) y, por ser memoria, al cerrar la app.
- **"Cerrar la respuesta"** borra esa entrada.
- Nada de esto va a `localStorage` ni a la configuración.

### A9. Vista del cuerpo (`core/body.ts`)

| Respuesta | Vista |
|---|---|
| `Content-Type` JSON, o sin tipo y que parece JSON | "Formateado": `formatJson(text, 2)` de `devtools/tools/formats.ts`. Si falla, el texto tal cual con el aviso "no es JSON válido" |
| XML o SVG | `formatXml(text, 2)`, con el mismo respaldo |
| HTML | Texto, resaltado como `xml`. Nunca se dibuja |
| Otro texto | Tal cual, sin resaltado |
| `image/png`, `jpeg`, `gif` o `webp` ≤ 5 MB | `<img src="data:…">`. El CSP de la app es `null` (`tauri.conf.json`), así que se permite |
| Otro binario | Tipo, tamaño y "Guardar como archivo" |

- El resaltado reusa `CodeText` de `devtools/ui/highlight.tsx`, con la clase `.devtools-code` y los tokens `--syntax-*`. Ya se leen en los 7 temas.
- Por encima de `HIGHLIGHT_LIMIT` (200 KB) va sin colores. Por encima de 2 MB se muestran solo los primeros 2 MB.
- Guardar como archivo usa `save()` de `@tauri-apps/plugin-dialog` y `fs.writeBinary` o `fs.writeFile` (`lib/invoke.ts`), como `useImageSaver` en `devtools/ui/CodeImage.tsx`. El nombre por defecto sale del último segmento de la ruta, o "respuesta", con la extensión del tipo.

### A10. DevTools (retirado el 31 oct 2026)

> **Retirado, pedido por Jorge (31 oct 2026):** la herramienta pasó a la pantalla propia (§11). DevTools volvió a su versión de antes del PR 2 (specs/devtools D11 y D25). Se deja lo de abajo como registro de lo que hubo.

La herramienta vivía en DevTools porque usa su marco (`ToolFrame`, el contexto, los atajos, "Guardar en una nota" y "Traer de una nota"). El motor y la vista de la respuesta los importa de `http-client`.

- **`devtools/model.ts`:**
  - `ToolGroup` suma `'network'`, `ToolId` suma `'http'`, y `TOOL_GROUPS` suma `{ group: 'network', tools: ['http'] }` al final;
  - `OUTPUT_LANGUAGE.http = 'http'` y `LANGUAGE_TOOL.http = 'http'`;
  - una función nueva, `availableTools(isEnabled)`, quita `'http'` si `http-client` está apagada.
- **Dónde se usa `availableTools`:** la columna, el selector de la ventana angosta, el buscador, ⌥⌘↓/↑, la recuperación de `lastTool` (si era `http` y ya no está, se abre la herramienta por defecto) y, con la rama `feature/devtools-opciones`, la página de opciones (orden, ocultas y grupos de D19 y D20).
  - Con esa rama ya en `develop`, `withMissing` y `GROUP_OF` hacen el resto. El grupo nuevo aparece al final, visible y desplegado (D24).
  - Si esa rama entra después, el cambio en `TOOL_GROUPS` es el mismo.
- **`ui/meta.ts`:** `TOOL_ICON.http = Globe` y `PICKER_TOOLS` suma `'http'`.
- **`View.tsx`:**
  - `VIEWS.http = lazy(() => import('./views/HttpTool'))`;
  - el pie de la columna usa `privacyNoteWithHttp` mientras la herramienta está disponible, porque "Todo se procesa en este equipo" dejaría de ser cierto.
- **D11 de DevTools** se reescribe: "DevTools no envía nada fuera del equipo. La herramienta Cliente HTTP es de la extensión Cliente HTTP, que lleva su aviso de R6, y solo aparece con las dos activas".
- **Memoria (D9):** borradores `http:method`, `http:url`, `http:headers` y `http:body` en el `Map` de DevTools, y la respuesta en la caché de A8. "Vaciar todas las herramientas" borra las dos cosas.

### A11. Lo que garantiza el diseño

| Riesgo | Cómo se evita |
|---|---|
| Enviar sin querer | Solo se envía con un clic, ⌘↵ o una confirmación (HT3). No hay herramienta de MCP para enviar. |
| Mandar a producción por error | Entorno protegido (HT20), y el chip del entorno siempre a la vista en la barra. |
| Que una nota creada por un agente o pegada de otro lado se lleve un token | Confirmación de secretos a un host ajeno (HT21), en el webview y en Rust. Los secretos no se siguen en redirecciones a otro host (HT24). |
| Secretos en la nota o en el sync | Solo los nombres van en la nota. Los valores no secretos están en `config.json` (local), y los secretos en el llavero (HT18). |
| Secretos en la interfaz | El webview nunca tiene el valor. La petición enviada muestra la pista (`••••…a1b2`), y `final_url`, las cabeceras y el cuerpo de texto de la respuesta vuelven a enmascararse en Rust. |
| Secretos en los errores o en los logs | Los errores llevan solo un código y el host (HT26). |
| HTML o SVG malicioso en la respuesta | El HTML se muestra como texto. Las imágenes van en `<img>`, que no ejecuta scripts. Nada pasa por `dangerouslySetInnerHTML`. |
| Respuestas enormes | Tope en Rust (HT24) y en lo que se dibuja (HT12). |

## Interfaz

Diseñada con `design:design-system` (extend), `design:ux-copy` y `design:accessibility-review`, a partir de los componentes que ya existen: `controlClasses.ts`, `FormControls.tsx`, `devtools/ui/*`, `pomodoro/parts.ts` (`MAIN_BTN`), `outgoing-webhook/Settings.tsx` (campos de secretos) y `ExtensionsSettingsTab.tsx`.

### 1. El bloque en la nota

#### 1.1 Anatomía

El NodeView inline es una tarjeta con tres franjas: la barra, el código y la respuesta. Las clases van en `App.css`:

```css
.prose-editor .extension-node-inline {
  margin: 0.5rem 0; border: 1px solid var(--border-card); border-radius: 8px;
  background: var(--bg-surface); overflow: hidden;
}
.prose-editor .extension-node-inline > pre {
  margin: 0; border: 0; border-radius: 0; padding: 0.625rem 1rem 0.75rem; background: transparent;
}
.prose-editor .extension-node-inline:focus-within { border-color: var(--border-high); }
/* Las islas no heredan los estilos del código del editor. */
.prose-editor .extension-block-ui pre { padding: 0.5rem 0.75rem; margin: 0; border: 1px solid var(--border); background: var(--bg-input); }
.prose-editor .extension-block-ui pre code { color: var(--text-body); }
```

Las dos islas llevan `className="extension-block-ui @container/httpblock"`.

**Lectura** (el cursor fuera del bloque, ya enviado):

```
┌──────────────────────────────────────────────────────────────────────┐
│ HTTP   Crear usuario ▾                      ⛁ Staging ▾   [➤ Enviar] │ ← barra
├──────────────────────────────────────────────────────────────────────┤
│ ### Listar usuarios                                                  │
│ GET {{baseUrl}}/users?page=2                                         │ ← código (editable)
│ Authorization: Bearer {{token}}                                      │
│                                                                      │
│ ### Crear usuario                                                    │
│ POST {{baseUrl}}/users                                               │
│ Content-Type: application/json                                       │
│                                                                      │
│ { "name": "Ana" }                                                    │
├──────────────────────────────────────────────────────────────────────┤
│ [✓ 201 Created]  143 ms · 1,2 KB · hace 2 min                        │ ← respuesta
│ [Cuerpo] [Cabeceras 9] [Petición]      Formateado|Sin formato  ⧉  ✕  │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ {                                                                │ │
│ │   "id": 42,                                                      │ │
│ │   "name": "Ana"                                                  │ │
│ │ }                                                                │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**Edición** (el cursor dentro): el borde pasa a `--border-high`, y en la barra aparece la pista del atajo junto a Enviar.

```
┌──────────────────────────────────────────────────────────────────────┐
│ HTTP   Crear usuario ▾                ⛁ Staging ▾   [➤ Enviar  ⌘↵]  │
├──────────────────────────────────────────────────────────────────────┤
│ POST {{baseUrl}}/users|                                              │
│ …                                                                    │
```

- Sin respuesta ni problemas, no hay franja inferior: un documento con diez peticiones no suma diez líneas de ayuda. El atajo se ve en la barra mientras se edita, y siempre en el `title` del botón.
- La franja inferior aparece cuando hay un problema, una confirmación pendiente, un envío en curso o una respuesta.

#### 1.2 Barra (`part: 'header'`)

`<div role="toolbar" aria-label="Petición HTTP" class="flex items-center gap-2 border-b border-[var(--border)] px-2.5 py-1.5">`

De izquierda a derecha:

1. **Etiqueta:** `HTTP` con `PANEL_TITLE` y `font-mono`, más `aria-hidden` (el nombre ya lo da el `aria-label`). *Desde el 31 oct 2026, en una nota editable es el selector de lenguaje (HT38, §12).*
   - **Selector de método** (HT36, §12), a continuación.
2. **Selector de petición** (solo con 2 o más): un botón `flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] ${FOCUS_RING}`.
   - Muestra el nombre (`### nombre`) o "{MÉTODO} {ruta}", cortado con `truncate max-w-[16rem]`, y `ChevronDown size={11}`.
   - Abre un menú (`role="menu"`, `menuitemradio`) con una fila por petición: el método en `font-mono text-[10px] font-semibold` y la ruta o el nombre. Las peticiones con error llevan `CircleAlert size={11} text-red-400` y el texto sr "con errores".
   - Al mover el cursor dentro del código, la selección sigue a la petición del cursor.
3. `flex-1`.
   - **Copiar como cURL** (HT37, §12), antes del chip.
4. **Chip del entorno** (`EnvironmentChip`, §1.3).
5. **Enviar** (`SEND_BTN`, **nueva** en `controlClasses.ts`). Es la versión pequeña de `MAIN_BTN` del Pomodoro: `flex items-center gap-1.5 rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] transition hover:bg-indigo-500/15 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${FOCUS_RING}`.
   - Ícono `Send size={13} className="text-indigo-400"`.
   - Pista `<kbd class="hidden @md/httpblock:inline text-[10px] text-[var(--text-hint)]">⌘↵</kbd>`, solo mientras se edita.
   - `title`: "Enviar (⌘↵)".
   - Por qué no `PRIMARY_CLS`: en sepia y en los temas personalizados claros, su texto blanco queda a 1,5:1 (DevTools, hallazgo 9.1-2).
   - Mientras se envía, es **Cancelar**: `SECONDARY_CLS` con `X size={13}`, en el mismo sitio, así que el foco no se pierde.
   - Con un error de sintaxis o una variable que falta lleva `aria-disabled="true"` (no `disabled`: sigue enfocable) y `aria-describedby` hacia el problema. Pulsarlo anuncia el problema y no envía.

#### 1.3 Chip del entorno (`EnvironmentChip`, compartido con DevTools)

```
 ⛁ Staging ▾          ⚠ Producción ▾          Sin entorno ▾
```

- Botón: `flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] ${FOCUS_RING}`, con `aria-haspopup="menu"` y `aria-label="Entorno: Staging"`.
  - Normal: `Server size={12}`.
  - Protegido: `ShieldAlert size={12} text-amber-400`, y el sr añade "protegido".
  - Sin entorno: el texto va en `--text-hint`.
  - El ícono no es lo único que distingue un protegido: el menú y Opciones lo dicen con texto.
- El menú es el de `AppSelect`: `absolute right-0 z-30 mt-1 min-w-[220px] rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-xl`.
  ```
  Se usa en todas las peticiones.
  ○ Sin entorno
  ● Staging
  ○ Producción            ⚠
  ────────────────────────────
  Configurar entornos…
  ```
  - La primera línea es `px-3 py-1 text-[10px] text-[var(--text-hint)]`.
  - Los ítems son `menuitemradio` con `aria-checked` y `px-3 py-1.5 text-[11px]`. El elegido lleva `Check size={12}`.
  - "Configurar entornos…" llama a `openExtensionSettings('http-client')` (R21).
  - Elegir uno cambia el entorno activo para todos (HT19) y lo anuncia: "Entorno: Staging".
- Con ningún entorno creado, el menú solo tiene "Sin entorno" y "Crear un entorno…".

#### 1.4 Estados

La franja inferior (`part: 'footer'`) va con `border-t border-[var(--border)] px-3 py-2`. La línea de estado reusa `StatusItem` de `FormControls.tsx`.

**Sin enviar:** no hay franja (§1.1).

**Error de sintaxis** (HT7). Se ve mientras se escribe, con un debounce de 300 ms. Enviar queda con `aria-disabled`.

```
├──────────────────────────────────────────────────────────────────────┤
│ ⊘ Línea 3: escribe la cabecera como Nombre: valor.                   │
```
`StatusItem kind="error"`. Si hay varios problemas, se muestra el primero y "y {n} más" en `--text-hint`.

**Variable sin definir** (HT16):

```
│ ⚠ Falta la variable {{token}} en Staging.  Definir en Opciones       │
```
- `StatusItem kind="warn"`.
- Las variables van en `font-mono`.
- "Definir en Opciones" es `TEXT_LINK` de DevTools y abre Opciones → Cliente HTTP con ese entorno elegido.
- Sin entorno: "Faltan las variables {{baseUrl}} y {{token}}. Elige un entorno o crea uno."
- Secreto sin valor en este equipo: "El secreto {{token}} de Staging no tiene valor en este equipo."

**Aviso, sin bloquear** (GET o HEAD con cuerpo): `StatusItem kind="info"` sobre la respuesta, si la hay.

**Confirmar** (HT20 y HT21). Reemplaza lo de arriba de la franja hasta que se responde:

```
├──────────────────────────────────────────────────────────────────────┤
│ ⚠ Vas a enviar POST a Producción.                                    │
│   Esta petición lleva {{token}} y va a otro-host.com, que no es un   │
│   host de Producción.                                                │
│                                         [No enviar] [Enviar igual]   │
```
- Contenedor: `role="group" aria-labelledby` con el texto, y `rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-[var(--text-primary)]`. El ícono es `TriangleAlert size={12} text-amber-400`.
- El botón de acción es `SECONDARY_CLS` con `border-amber-500/50`. Solo con el entorno protegido dice "Enviar a Producción"; si hay un host ajeno, "Enviar igual".
- "No enviar" es un botón fantasma: `rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]`.
- Al abrirse, el foco va a "No enviar", la opción segura. Esc equivale a "No enviar". Después, el foco vuelve a donde estaba: al botón Enviar o al código, con el cursor en su sitio.
- La confirmación vale para un solo envío.

**Enviando:**

```
│ ◌ Enviando… 2 s                                                      │
│ (respuesta anterior, si la hay, con opacity-60)                      │
```
- `Spinner` de `FormControls.tsx` y el texto en `--text-secondary`. Los segundos se actualizan cada segundo a partir del primero.
- Enviar pasa a Cancelar (§1.2).

**Éxito, 2xx:**

```
│ [✓ 200 OK]  143 ms · 1,2 KB · hace un momento                        │
│ [Cuerpo] [Cabeceras 12] [Petición]     Formateado|Sin formato  ⧉  ✕  │
│ ┌ pre ─────────────────────────────────────────────────────────────┐ │
```

**4xx y 5xx.** No son errores de la extensión: el servidor respondió. Se muestran igual que un éxito, con otro chip:

```
│ [⚠ 404 Not Found]  88 ms · 64 B                                      │
│ [✕ 500 Internal Server Error]  1,2 s · 3,4 KB                        │
```

Chip de estado: `inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--text-primary)]`.

| Rango | Fondo | Ícono |
|---|---|---|
| 2xx | `bg-emerald-500/15` | `CircleCheck size={12} text-emerald-400` |
| 3xx | `bg-[var(--bg-hover)]` | `CornerDownRight size={12} text-[var(--text-secondary)]` |
| 4xx | `bg-amber-500/15` | `TriangleAlert size={12} text-amber-400` |
| 5xx | `bg-red-500/15` | `CircleAlert size={12} text-red-400` |

El texto del chip va siempre en `--text-primary`, y el número y el texto del estado bastan sin el color.

**Error de red** (no hubo respuesta):

```
│ ⊘ No se pudo conectar con localhost:8080. Revisa que el servidor     │
│   esté en marcha y que el puerto sea el correcto.     [Reintentar]   │
│ (respuesta anterior, si la hay, con opacity-50 y "Respuesta anterior")│
```
- `StatusItem kind="error"`. "Reintentar" es `SECONDARY_CLS`; vuelve a enviar y pide la confirmación otra vez si hace falta.
- **Certificado no válido:** el mensaje suma "Enviar sin verificar (solo esta vez)" como segundo botón, `SECONDARY_CLS` con `ShieldOff size={13}`. No se ofrece si el entorno ya acepta certificados no válidos.
- **Cancelada:** `StatusItem kind="info"` con "Cancelaste el envío.", y se queda la respuesta anterior.

**Certificado sin verificar** (HT25): junto al chip de estado, `rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-[var(--text-primary)]` con `ShieldOff size={10} text-amber-400` y el texto "Certificado sin verificar".

**Respuesta grande o binaria** (HT12):

```
│ [✓ 200 OK]  2,1 s · 10 MB (cortada)                                  │
│ ⚠ Respuesta cortada en 10 MB: es más grande que el máximo de las     │
│   opciones.                                                          │
│ ⓘ Sin colores: el cuerpo es muy grande.                              │

│ [✓ 200 OK]  320 ms · 4,8 MB                                          │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │  ▢  Respuesta binaria (application/pdf, 4,8 MB).                 │ │
│ │     No se muestra como texto.          [⤓ Guardar como archivo]  │ │
│ └──────────────────────────────────────────────────────────────────┘ │
```
- La tarjeta binaria va `flex items-center gap-3 rounded-md border border-dashed border-[var(--border-high)] px-4 py-4 text-[11px] text-[var(--text-secondary)]`, con `FileQuestion size={16} text-[var(--text-hint)]`.
- Una imagen se ve en `max-h-[20rem] max-w-full rounded-md border border-[var(--border)]` sobre `--bg-input`, con `alt` "Imagen de la respuesta (image/png, 120 KB)" y "Guardar como archivo" debajo.

**La petición cambió después de la respuesta:** debajo del chip, `text-[10px] text-[var(--text-hint)]` con `History size={10}`: "La petición cambió después de esta respuesta."

**Error de la extensión:** `ExtensionBoundary` ya muestra su aviso con "Desactivar" en cada isla (R15). El código del bloque sigue visible y editable.

### 2. Respuesta (`ResponseView`, compartida)

- Raíz: `<section aria-label="Respuesta: 200 OK" class="flex flex-col gap-2">`.
- **Línea de resumen:** el chip de estado, y `143 ms · 1,2 KB · hace 2 min` en `text-[11px] tabular-nums text-[var(--text-secondary)]`.
  - El tiempo va en ms por debajo de 1 s y en s con un decimal por encima ("2,4 s").
  - El tamaño sale de `formatSize` (`devtools/ui/text.ts`).
  - "Hace…" usa `Intl.RelativeTimeFormat` con el idioma de la app y se actualiza cada minuto.
- **Pestañas:** `role="tablist"` con los botones del selector segmentado de DevTools (`flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5`, botones `role="tab"`, `rounded-md px-2.5 py-1 text-[11px]`).
  - El activo: `bg-indigo-500/10 text-[var(--text-primary)] ring-1 ring-indigo-500/40`. El texto va en `--text-primary` y no en `indigo-400`, por sepia (hallazgo 9.1-3).
  - ←/→ cambian de pestaña (roving tabindex), y Home/End van a los extremos.
  1. **Cuerpo:**
     - el segmentado "Formateado | Sin formato" (solo con JSON o XML válidos);
     - `<pre tabindex="0" aria-label="Cuerpo de la respuesta" class="max-h-[24rem] overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text-body)] select-text">`. En "Formateado" va con `whitespace-pre` y desplazamiento horizontal; en "Sin formato", con `whitespace-pre-wrap break-all`, para que un JSON minificado no sea una sola línea infinita;
     - "Sin cuerpo." en `--text-hint` si está vacío.
  2. **Cabeceras ({n}):** `<table>` con `<th scope="row">` para el nombre (`font-mono text-[11px] text-[var(--text-secondary)] pr-3 align-top whitespace-nowrap`) y el valor (`font-mono text-[11px] text-[var(--text-body)] break-all select-text`). Las repetidas (`Set-Cookie`) van en filas propias. Arriba a la derecha, "Copiar las cabeceras".
  3. **Petición:**
     ```
     POST https://staging.api.example.com/users
     Authorization: Bearer ••••…a1b2        secreto
     Content-Type: application/json         Agregada por Logday
     User-Agent: Logday/1.0.8               Agregada por Logday

     { "name": "Ana" }

     Redirecciones: 301 → https://api.example.com/v2/users
     Staging · Enviada a las 14:05 · Certificado sin verificar
     ```
     - El mismo `<pre>`. Las marcas ("secreto", "Agregada por Logday") van en `<span class="ml-3 rounded bg-[var(--bg-hover)] px-1 text-[10px] text-[var(--text-secondary)]">`.
     - Los secretos se ven con su pista. Ver el valor real no es posible por diseño.
     - Las cabeceras quitadas (`dropped_headers`) se listan al final como "No enviada: Content-Length (la calcula Logday)".
- **Acciones** (`ICON_BTN` con `aria-label` y `title`, a la derecha de las pestañas):
  - `Copy` → "Copiar el cuerpo" (o las cabeceras, o la petición, según la pestaña). Cambia a `Check` con "Copiado" durante 1,5 s, el patrón de DevTools.
  - `Download` → "Guardar como archivo". Siempre en binarios; en texto, desde el menú `MoreHorizontal`.
  - `X` → "Cerrar la respuesta". Solo en el bloque; la borra de la caché.

### 3. Herramienta "Cliente HTTP" en DevTools (reemplazada por §11)

> El formulario es el mismo, pero vive en la pantalla propia (§11). Lo que dice esta sección de `ToolFrame`, el contexto de DevTools, "Traer de una nota" y sus atajos ⌘⇧ ya no aplica.

Usa `ToolFrame` con `bodyClass="flex flex-col gap-4 px-5 py-4"` y `headerExtra={<EnvironmentChip />}`.

```
┌ [🌐] Cliente HTTP                              ⛁ Staging ▾  [⇥ Traer de una nota]
│      Envía una petición sin guardarla, con las variables del entorno activo.
│      ⓘ Esta herramienta envía la petición a la URL que escribas.
├──────────────────────────────────────────────────────────────────────────────
│ PETICIÓN                                         [⌫] [📄+ Guardar en una nota]
│ [GET    ▾] [ {{baseUrl}}/users?page=2                          ] [➤ Enviar ⌘↵]
│ CABECERAS                              │ CUERPO
│ ┌──────────────────────────────────┐   │ ┌──────────────────────────────────┐
│ │Accept: application/json          │   │ │{ "name": "Ana" }                 │
│ │Authorization: Bearer {{token}}   │   │ │                                  │
│ └──────────────────────────────────┘   │ └──────────────────────────────────┘
│ ⚠ Falta la variable {{token}} en Staging.  Definir en Opciones
│
│ RESPUESTA
│ [✓ 200 OK]  143 ms · 1,2 KB
│ [Cuerpo] [Cabeceras 12] [Petición]                 Formateado|Sin formato  ⧉
│ ┌ pre ──────────────────────────────────────────────────────────────────────┐
│ └───────────────────────────────────────────────────────────────────────────┘
```

- **Aviso fijo** bajo la descripción: `flex items-center gap-1.5 text-[10px] text-[var(--text-hint)]`, con `Globe size={11}`. Así queda claro dentro de DevTools, cuyo pie dice que todo es local.
- **Fila de la petición:** `flex flex-wrap items-center gap-2`.
  - Método: un `<select>` nativo con `INPUT_CLS font-mono font-semibold w-28` y `aria-label="Método"`.
  - URL: `lineInputCls()` con `aria-label="URL"`, el placeholder de `http.placeholder` y `NO_AUTOCORRECT`. Enter en la URL envía.
  - Enviar: `SEND_BTN` (Cancelar mientras envía).
- **Cabeceras y Cuerpo:** dos paneles en `grid gap-4 @3xl/tool:grid-cols-2`, con su `<label>` de `PANEL_TITLE`, `textareaCls(invalid, 'min-h-[7rem] h-[20vh]')` y `NO_AUTOCORRECT`.
  - Las cabeceras usan la misma sintaxis `Nombre: valor` del bloque, y sus errores, el mismo texto ("Línea 2: escribe la cabecera como Nombre: valor."), con la línea relativa al campo.
  - Con HEAD, el cuerpo queda `disabled`, con la ayuda "Con HEAD no se envía el cuerpo.".
- **Debajo,** la misma línea de estado y las mismas confirmaciones del bloque (§1.4), y luego `ResponseView` bajo el título "RESPUESTA".
- **Vacío:** el panel de respuesta muestra, centrado, "Escribe una URL y pulsa Enviar. La respuesta aparece aquí." en `text-xs text-[var(--text-hint)]`. No hay "Probar con un ejemplo": un ejemplo de verdad tendría que enviar algo fuera.
- **Guardar en una nota:** usa `saveNote('http', 'http', serialize(form))` del contexto de DevTools, que ya crea la nota en la raíz, avisa con un toast y deja el enlace "Guardado en «…» · Abrir" (D10).
  - El título es el de DevTools: "Cliente HTTP — 31 oct 2026, 14:05".
  - Si una línea del cuerpo empieza por ```` ``` ````, la cerca usa 4 comillas invertidas (como DevTools §6.1).
- **Traer de una nota:** el selector de DevTools muestra los bloques `http` con "Abrir en Cliente HTTP". Si el bloque tiene varias peticiones, se carga la primera, y la línea de estado dice "El bloque tiene 3 peticiones; se cargó la primera.".
- **Limpiar** (`Eraser`): vacía la URL, las cabeceras, el cuerpo y la respuesta. El método vuelve a GET.

### 4. Opciones → Cliente HTTP

`ExtensionSettingsPage` ya pone el ícono, el nombre y la descripción. El panel va con `space-y-5 text-xs`, como el del Pomodoro. Los subtítulos van en `text-[var(--text-secondary)] font-medium`.

```
Entornos
Los valores de las variables se guardan solo en este equipo y no se sincronizan.
Los secretos van al llavero del sistema. En tus notas solo quedan los nombres,
como {{token}}.

Entorno activo  [Staging ▾]

[ Local ] [● Staging ] [⚠ Producción ] [+ Nuevo entorno]          ← tablist
┌───────────────────────────────────────────────────────────────────────────┐
│ Nombre  [Staging                    ]           [Duplicar] [Eliminar]     │
│ (○) Pedir confirmación antes de enviar POST, PUT, PATCH o DELETE          │
│     Para producción o cualquier entorno donde un error cueste.            │
│ (○) Aceptar certificados no válidos                                       │
│     Solo para servidores de prueba con certificados autofirmados.         │
│                                                                           │
│ VARIABLES                                                                 │
│ Nombre          Valor                                   Secreto           │
│ [baseUrl     ]  [https://staging.api.example.com     ]   (○)     🗑       │
│ [token       ]  🔑 ••••…a1b2   Cambiar                   (●)     🗑       │
│ [apiKey      ]  [                                   ]    (○)     🗑       │
│                 ⓘ ¿Es un secreto? Márcalo para guardarlo en el llavero.   │
│ [+ Agregar variable]                                                      │
│                                                                           │
│ HOSTS DE CONFIANZA PARA LOS SECRETOS                                      │
│ Los secretos de este entorno se envían sin preguntar solo a estos hosts.  │
│ staging.api.example.com   de baseUrl                                      │
│ auth.example.com  ✕                                                       │
│ [api.example.com              ] [Agregar host]                            │
└───────────────────────────────────────────────────────────────────────────┘

Peticiones
Tiempo límite                    [ 30 ] segundos
Tamaño máximo de la respuesta    [ 10 ] MB
(●) Seguir las redirecciones
De 1 a 300 segundos; de 1 a 50 MB.
[Restablecer valores]                     (solo si algo difiere de lo de por defecto)

ⓘ Para probar una petición sin guardarla, usa Cliente HTTP en DevTools.
```

- **Entorno activo:** el mismo menú que `EnvironmentChip`, pero como campo, con `INPUT_CLS` y la etiqueta a la izquierda.
- **Pestañas de entornos:** `role="tablist" aria-label="Entornos"`, con roving tabindex.
  - Cada pestaña es `rounded-md px-3 py-1.5 text-xs`, con los colores del segmentado (activo: `bg-indigo-500/10 text-[var(--text-primary)] ring-1 ring-indigo-500/40`).
  - El entorno activo lleva `CircleDot size={10} text-indigo-400` y el sr "(activo)". El protegido lleva `ShieldAlert size={11} text-amber-400` y el sr "(protegido)".
  - "+ Nuevo entorno" no es una pestaña: es un botón aparte, `SECONDARY_CLS`. Crea "Entorno {n}", lo elige y enfoca su nombre. El primero que se crea pasa a ser el activo.
- **Panel del entorno:** `role="tabpanel"`, con `rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] p-4 space-y-4`, como la tarjeta de una extensión.
  - Nombre: `INPUT_CLS`. Se guarda al salir del campo o con Enter. Vacío o repetido: borde `border-red-500/60`, error debajo y no se guarda.
  - "Duplicar" es `SECONDARY_CLS` con `Copy`. Avisa con un toast "Entorno duplicado" y la descripción "Los secretos no se copian: escríbelos en el entorno nuevo.".
  - "Eliminar" es el botón rojo de "Quitar configuración" (`text-red-400 hover:bg-red-500/10`), y confirma con `ConfirmDeleteModal` vía `useConfirmDelete(confirmDestructiveActions)`.
  - Los interruptores son `Toggle` (`FormControls.tsx`), con la ayuda debajo en `text-[10px] text-[var(--text-hint)] pl-9`.
- **Variables:** `grid grid-cols-[minmax(6rem,10rem)_minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1.5`, con encabezados en `PANEL_TITLE`.
  - Nombre y valor: `INPUT_CLS font-mono` con `NO_AUTOCORRECT`. Se guardan al salir del campo o con Enter, y los `aria-label` son "Nombre de la variable {n}" y "Valor de {nombre}".
  - **Secreta sin valor:** `type="password"` con el placeholder "Pega el valor; se guarda en el llavero", y "Guardar" (`SECONDARY_CLS`) al lado, como en el webhook saliente.
  - **Secreta con valor:** `KeyRound size={12}`, la pista en `font-mono text-[var(--text-secondary)]` y "Cambiar" (`TEXT_LINK`), que vuelve a mostrar el campo vacío.
  - Interruptor "Secreto": `ToggleSwitch size="sm"` con `aria-label="Secreto: {nombre}"`.
    - Al activarlo con un valor, lo pasa al llavero (A6).
    - Al desactivarlo, confirma con `ConfirmDeleteModal`: el valor se borra y hay que escribirlo de nuevo.
  - Eliminar: `ICON_BTN` con `Trash2 size={14}`, `hover:text-red-400` y `aria-label="Eliminar {nombre}"`. Confirma con `useConfirmDelete`; una fila nueva y vacía se quita sin preguntar.
  - **Pista de secreto:** si el nombre parece de un secreto (`/token|secret|password|passwd|pwd|key|auth|bearer/i`) y la variable no está marcada, debajo de la fila aparece `ⓘ ¿Es un secreto? Márcalo para guardarlo en el llavero.` (`text-[10px] text-[var(--text-hint)]`).
  - "+ Agregar variable" es `SECONDARY_CLS` con `Plus` y enfoca el nombre de la fila nueva.
- **Hosts de confianza:**
  - Los automáticos van en `font-mono text-[11px] text-[var(--text-secondary)]` con "de {variable}" en `--text-hint`, y no se pueden quitar.
  - Los agregados son `CHIP` con un botón `X` (`aria-label="Quitar {host}"`).
  - El campo valida que sea solo un host (sin esquema, ruta ni espacios) y lo guarda en minúsculas.
- **Peticiones:** `NumberField` (`w-16 tabular-nums`) y `Toggle`, en el grid `grid-cols-[auto_auto_1fr]` del Pomodoro. "Restablecer valores" es `SECONDARY_CLS`, sin confirmar.
- **Pie:** ~~si DevTools está apagada, dice "Activa DevTools para probar una petición sin guardarla."~~ Desde el 31 oct 2026 dice "Para probar una petición sin guardarla, usa la pantalla Cliente HTTP del menú lateral." con el enlace "Abrir Cliente HTTP", que cierra Opciones y abre la sección.
- **Errores del llavero:** un toast `error`, "No se pudo guardar en el llavero", y el campo conserva lo escrito.
- **Vacío** (sin entornos):
  ```
  Todavía no tienes entornos. Crea uno para usar variables como {{baseUrl}}
  o {{token}} en tus peticiones.                       [+ Crear un entorno]
  ```
- **Entorno sin variables:** "Este entorno no tiene variables. Agrega una, por ejemplo baseUrl con la URL de la API."

### 5. Teclado y foco

| Dónde | Tecla | Acción |
|---|---|---|
| Código del bloque | `⌘↵` (Ctrl+Enter) | Envía la petición del cursor. Si falta algo, lo anuncia; si hace falta confirmar, enfoca "No enviar". Mientras se envía, no hace nada. |
| Confirmación | `Esc` | No enviar; el foco vuelve a donde estaba. |
| Barra o respuesta | `Esc` mientras se envía | Cancela. |
| Menús (lenguaje, método, petición, entorno) | ↑/↓, Home/End, Enter/Espacio, Esc, letras | Patrón de menú. Esc devuelve el foco al botón. Escribir letras salta a la opción que empieza así (typeahead, desde el 31 oct 2026). |
| Pestañas de la respuesta y de los entornos | ←/→, Home/End | Roving tabindex. |
| Pantalla, formulario | `⌘↵` (Ctrl+Enter) | Enviar, desde cualquier campo. |
| Pantalla, URL | Enter | Enviar. |
| Pantalla, formulario | `Esc` mientras se envía | Cancela. |

- **Orden de foco en el bloque:** barra (selector de petición → chip del entorno → Enviar) → código → franja (enlaces del problema → confirmación → pestañas → acciones → `<pre>`).
  - Las islas son `contentEditable={false}` dentro del editor, como los botones de Mermaid.
  - **Hay que comprobarlo en WebKit:** si Tab no entra en las islas desde el código, se suma `⌥⌘↓` (sin uso hoy en el editor) para llevar el foco a la respuesta y `⌥⌘↑` para volver al código.
- ⌘↵ no mueve el foco: el resultado se anuncia (§6) y el cursor se queda en el código.
- El foco visible es `FOCUS_RING` en todo lo nuevo. En los temas tintados lo repinta el acento.

### 6. Accesibilidad

**Roles y nombres:**

- Barra: `role="toolbar"` con el `aria-label` "Petición HTTP" o "Petición HTTP: {nombre}".
- Respuesta: `<section aria-label="Respuesta: 201 Created">`. Las pestañas son `tablist`, `tab` y `tabpanel`, y los `<pre>` llevan `tabindex="0"` y `aria-label`.
- Los chips de estado son texto, no solo color. Los íconos van con `aria-hidden`.
- La confirmación es un `role="group"` etiquetado, sin `alertdialog`: no es modal y no atrapa el foco.
- Los campos de Opciones tienen su `<label>` o `aria-label`. Los errores van con `aria-invalid` y `aria-describedby`.

**Anuncios:**

- Hay una sola región `sr-only aria-live="polite" aria-atomic="true"` para toda la extensión (`announce.ts`). La crea `start()` en `document.body` y la quita su parada; no hay una por bloque.
- Se anuncian: "Enviando POST a Staging", "Respuesta 201 Created, en 143 ms", "No se envió: {mensaje}", "Cancelaste el envío", "Entorno: Staging" y "Copiado".
- Los errores de sintaxis no se anuncian con cada tecla. Se asocian a Enviar con `aria-describedby` y se anuncian cuando se intenta enviar (el mismo criterio de DevTools §8).

**Contraste.** Se usan solo pares que la tabla de DevTools §8 ya midió en los 7 temas:

- El texto de los chips y de la confirmación va en `--text-primary` o `--text-body` sobre un tinte `*-500/10–15`: de 7,6 a 17:1.
- Los íconos de estado (`emerald`, `amber` y `red-400`) ya están corregidos en claro y sepia (`App.css:253-269`) y pasan de 3:1.
- No se usa `text-indigo-400` como texto con significado (en sepia da 2,9:1). El acento va solo en bordes, anillos e íconos.
- No se usa `PRIMARY_CLS`.
- Las ayudas van en `--text-hint`, nunca en `--text-faint`, que da 2,3:1 en claro.
- La vista previa de una imagen va sobre `--bg-input`, sin forzar el blanco como el QR: no es algo que haya que escanear.

**Otros:**

- Objetivos de 28 px o más (`ICON_BTN` con `min-h-7 min-w-7`, como en el Pomodoro).
- Con `--app-font-size` grande, las consultas de contenedor en rem (`@md/httpblock`, `@3xl/tool`) apilan antes.
- El spinner respeta `.no-animations` y `prefers-reduced-motion`.

### 7. Casos borde

- **Bloque `http` con la extensión apagada** y luego encendida: TipTap arma los NodeView en el primer render (`NoteEditor.tsx:267`), así que una nota abierta cambia al volver a abrirla. Es lo mismo que pasa con Excalidraw.
- **Dos bloques idénticos** en la misma nota tienen claves de caché distintas, porque cuentan su índice.
- **Mover o borrar un bloque** desfasa los índices. La regla de `firstLine` (A8) evita mostrar la respuesta de otra petición.
- **Una línea del cuerpo que empieza por ```` ``` ````** cierra la cerca del Markdown. En el editor no se puede escribir así dentro de un bloque. Al guardar desde DevTools se usa una cerca de 4 comillas invertidas, y `parseFencedBlocks` tiene que aceptarla (hallazgo 2).
- **`{{` sin cerrar,** o con espacios raros: queda como texto y no cuenta como variable.
- **Variables en el host** (`{{baseUrl}}`): es lo normal. El host para HT21 se calcula después de resolver.
- **Secreto en el host:** `host` queda en `null` en el webview, y lo comprueba Rust (A5).
- **Cambiar de entorno con una petición en curso** no afecta a esa petición. La respuesta muestra el entorno con el que se envió.
- **Desactivar la extensión con peticiones en curso:** la parada llama a `http_client_cancel` para cada una y vacía la caché (R7).
- **Restaurar un backup de configuración:** los secretos no van en el backup (R10), así que las variables secretas vuelven con su pista, pero sin valor en el llavero de otro equipo. Rust devuelve `secret_missing`, y la UI pide escribirlo de nuevo.
- **La nota se sincroniza** desde otro equipo con nombres de variables que aquí no existen: es el estado "variable sin definir", sin más.
- **Agente de MCP:** puede leer y crear notas con bloques `http`, pero no tiene herramienta para enviar (HT3). HT21 cubre el caso de una nota preparada para llevarse un token.
- **Localhost y redes privadas** están permitidos: probar una API local es el uso principal. No hay protección contra SSRF porque el que elige el destino es el usuario.
- **`Host` puesto a mano** se respeta (sirve para probar hosts virtuales). `Content-Length` y `Transfer-Encoding` se ignoran y se dice en la pestaña Petición.
- **Respuestas que no son UTF-8** (Latin-1): se ven con caracteres de reemplazo y el aviso "no es UTF-8 válido". No se adivinan los charsets.
- **Una cabecera repetida** en la petición (dos `Accept`): se envían las dos, en orden.
- **Vista de código o dividida de la nota:** el bloque es texto. ⌘↵ no hace nada allí.
- **Idiomas:** en inglés los textos son más cortos. Los más largos en español, la confirmación y el error de conexión, se parten en dos líneas sin romper la barra.

### 8. Textos

Todos con tú y sin voseo. Las variables `{x}` y los plurales `{n|uno|varios}` se rellenan con `interpolate` (`lib/interpolate.ts`).

#### 8.1 `extensions` (R20)

| Clave | es | en |
|---|---|---|
| `http-client.name` | Cliente HTTP | HTTP client |
| `http-client.description` | Prueba APIs desde tus notas: escribe la petición en un bloque http, pulsa Enviar y mira la respuesta debajo. Con su propia pantalla para reunir y enviar las peticiones de todas tus notas, entornos y variables, y los secretos en el llavero. | Test APIs from your notes: write the request in an http block, press Send and see the response below. With its own screen that gathers and sends the requests from all your notes, environments and variables, and secrets in the keychain. |
| `http-client.consent` | Con esta extensión, Logday envía peticiones HTTP a las direcciones que escribas en tus notas o en la pantalla Cliente HTTP, con las cabeceras y el cuerpo que pongas, incluidos los valores de tus variables y secretos. Solo se envía cuando pulsas Enviar, desde este equipo. Qué pasa después con esos datos depende del servicio que los recibe. Las peticiones se guardan en tus notas y se sincronizan con ellas; las respuestas no se guardan. Los secretos van al llavero del sistema y nunca se escriben en la nota. | With this extension, Logday sends HTTP requests to the addresses you write in your notes or on the HTTP client screen, with the headers and body you add, including the values of your variables and secrets. It only sends when you press Send, from this computer. What happens to that data afterwards depends on the service that receives it. Requests are saved in your notes and sync with them; responses are not saved. Secrets go to the system keychain and are never written in the note. |

#### 8.2 Sección `httpClient`: bloque y respuesta

| Clave | es | en |
|---|---|---|
| `blockLabel` | Petición HTTP | HTTP request |
| `blockLabelNamed` | Petición HTTP: {name} | HTTP request: {name} |
| `requestPicker` | Petición | Request |
| `requestUnnamed` | Petición {n} | Request {n} |
| `requestHasErrors` | con errores | has errors |
| `send` | Enviar | Send |
| `sendTitle` | Enviar ({shortcut}) | Send ({shortcut}) |
| `cancel` | Cancelar | Cancel |
| `sending` | Enviando… | Sending… |
| `sendingFor` | Enviando… {s} s | Sending… {s} s |
| `envLabel` | Entorno | Environment |
| `envChipLabel` | Entorno: {name} | Environment: {name} |
| `envNone` | Sin entorno | No environment |
| `envProtected` | protegido | protected |
| `envActive` | activo | active |
| `envMenuHint` | Se usa en todas las peticiones. | Used for all requests. |
| `envConfigure` | Configurar entornos… | Set up environments… |
| `envCreate` | Crear un entorno… | Create an environment… |
| `statusSummary` | {ms} · {size} | {ms} · {size} |
| `ago` | hace {time} | {time} ago |
| `justNow` | hace un momento | just now |
| `cut` | (cortada) | (cut off) |
| `tabBody` | Cuerpo | Body |
| `tabHeaders` | Cabeceras {n} | Headers {n} |
| `tabRequest` | Petición | Request |
| `viewPretty` | Formateado | Pretty |
| `viewRaw` | Sin formato | Raw |
| `copyBody` | Copiar el cuerpo | Copy body |
| `copyHeaders` | Copiar las cabeceras | Copy headers |
| `copyRequest` | Copiar la petición | Copy request |
| `copied` | Copiado | Copied |
| `saveBody` | Guardar como archivo | Save as file |
| `saved` | Archivo guardado | File saved |
| `saveError` | No se pudo guardar el archivo | Couldn't save the file |
| `moreActions` | Más acciones | More actions |
| `dismiss` | Cerrar la respuesta | Close response |
| `previous` | Respuesta anterior | Previous response |
| `stale` | La petición cambió después de esta respuesta. | The request changed after this response. |
| `emptyBody` | Sin cuerpo. | No body. |
| `notJson` | El cuerpo no es JSON válido; se muestra tal cual. | The body isn't valid JSON; it's shown as is. |
| `notXml` | El cuerpo no es XML válido; se muestra tal cual. | The body isn't valid XML; it's shown as is. |
| `notUtf8` | El cuerpo no es UTF-8 válido: algunos caracteres pueden verse mal. | The body isn't valid UTF-8: some characters may look wrong. |
| `truncated` | Respuesta cortada en {limit}: es más grande que el máximo de las opciones. | Response cut off at {limit}: it's larger than the maximum in settings. |
| `partialView` | Se muestran los primeros 2 MB. Copia o guarda el cuerpo para tenerlo entero. | Showing the first 2 MB. Copy or save the body to get all of it. |
| `noHighlight` | Sin colores: el cuerpo es muy grande. | No colors: the body is too large. |
| `binary` | Respuesta binaria ({type}, {size}). No se muestra como texto. | Binary response ({type}, {size}). It isn't shown as text. |
| `imageAlt` | Imagen de la respuesta ({type}, {size}) | Response image ({type}, {size}) |
| `tlsUnverified` | Certificado sin verificar | Certificate not verified |
| `markSecret` | secreto | secret |
| `markAuto` | Agregada por Logday | Added by Logday |
| `droppedHeader` | No enviada: {name} (la calcula Logday) | Not sent: {name} (Logday sets it) |
| `redirects` | {n|Redirección|Redirecciones}: {chain} | {n|Redirect|Redirects}: {chain} |
| `sentMeta` | {env} · Enviada a las {time} | {env} · Sent at {time} |
| `sentMetaNoEnv` | Enviada a las {time} | Sent at {time} |
| `headWithBody` | Con HEAD no se envía el cuerpo. | The body isn't sent with HEAD. |
| `getWithBody` | Muchos servidores ignoran el cuerpo de un GET. | Many servers ignore the body of a GET. |
| `moreIssues` | y {n} más | and {n} more |

#### 8.3 Sintaxis y variables

| Clave | es | en |
|---|---|---|
| `parse.empty_block` | El bloque está vacío. Escribe una petición, por ejemplo: GET https://example.com | The block is empty. Write a request, for example: GET https://example.com |
| `parse.missing_request_line` | Línea {line}: falta el método y la URL, por ejemplo GET https://… | Line {line}: the method and URL are missing, for example GET https://… |
| `parse.unsupported_method` | Línea {line}: {method} no es un método admitido. Usa GET, POST, PUT, PATCH, DELETE, HEAD u OPTIONS. | Line {line}: {method} isn't a supported method. Use GET, POST, PUT, PATCH, DELETE, HEAD or OPTIONS. |
| `parse.invalid_header` | Línea {line}: escribe la cabecera como Nombre: valor. | Line {line}: write the header as Name: value. |
| `parse.too_many_requests` | El bloque tiene más de 20 peticiones. Pártelo en varios bloques. | The block has more than 20 requests. Split it into several blocks. |
| `parse.reserved_syntax` | Línea {line}: {{$secret:…}} es de uso interno. Usa el nombre de la variable, por ejemplo {{token}}. | Line {line}: {{$secret:…}} is for internal use. Use the variable name, for example {{token}}. |
| `varMissing` | {n|Falta la variable|Faltan las variables} {vars} en {env}. | {n|The variable|The variables} {vars} {n|is|are} missing in {env}. |
| `varMissingNoEnv` | {n|Falta la variable|Faltan las variables} {vars}. Elige un entorno o crea uno. | {n|The variable|The variables} {vars} {n|is|are} missing. Choose an environment or create one. |
| `secretEmpty` | El secreto {var} de {env} no tiene valor en este equipo. | The secret {var} in {env} has no value on this computer. |
| `systemUnknown` | {var} no es una variable del sistema. Las que hay son {{$uuid}}, {{$timestamp}} y {{$isoTimestamp}}. | {var} isn't a system variable. The available ones are {{$uuid}}, {{$timestamp}} and {{$isoTimestamp}}. |
| `defineInSettings` | Definir en Opciones | Define in Settings |
| `listAnd` | {a} y {b} | {a} and {b} |
| `url.invalid_url` | La URL no es válida después de poner las variables. | The URL isn't valid after filling in the variables. |
| `url.scheme_not_allowed` | Solo se pueden enviar peticiones http:// y https://. | Only http:// and https:// requests can be sent. |
| `url.credentials_in_url` | No pongas usuario y contraseña en la URL: quedarían escritos en la nota. Usa una cabecera Authorization con una variable secreta. | Don't put a username and password in the URL: they'd be written in the note. Use an Authorization header with a secret variable. |

#### 8.4 Confirmaciones

| Clave | es | en |
|---|---|---|
| `confirmProtected` | Vas a enviar {method} a {env}. | You're about to send {method} to {env}. |
| `confirmUntrusted` | Esta petición lleva {vars} y va a {host}, que no es un host de {env}. | This request includes {vars} and goes to {host}, which isn't a host of {env}. |
| `confirmSendTo` | Enviar a {env} | Send to {env} |
| `confirmSendAnyway` | Enviar igual | Send anyway |
| `confirmDont` | No enviar | Don't send |

#### 8.5 Errores del envío

| Clave | es | en |
|---|---|---|
| `err.timeout` | No hubo respuesta en {s} s. Revisa que el servidor esté en marcha, o sube el tiempo límite en las opciones. | No response in {s} s. Check that the server is running, or raise the timeout in settings. |
| `err.dns` | No se encontró {host}. Revisa la URL o tu conexión. | {host} wasn't found. Check the URL or your connection. |
| `err.connect` | No se pudo conectar con {host}. Revisa que el servidor esté en marcha y que el puerto sea el correcto. | Couldn't connect to {host}. Check that the server is running and the port is right. |
| `err.tls` | El certificado de {host} no es válido: {reason}. | The certificate for {host} isn't valid: {reason}. |
| `tls.expired` | está vencido | it has expired |
| `tls.not_valid_for_name` | no es de este host | it isn't for this host |
| `tls.unknown_issuer` | lo firmó una autoridad desconocida, o es autofirmado | it was signed by an unknown authority, or it's self-signed |
| `tls.other` | no se pudo verificar | it couldn't be verified |
| `err.tlsRetry` | Enviar sin verificar (solo esta vez) | Send without verifying (this time only) |
| `err.too_many_redirects` | Hubo más de 10 redirecciones seguidas. Revisa la URL o desactiva "Seguir las redirecciones". | There were more than 10 redirects in a row. Check the URL or turn off "Follow redirects". |
| `err.cancelled` | Cancelaste el envío. | You cancelled the request. |
| `err.too_many_in_flight` | Ya hay 6 peticiones en curso. Espera a que termine alguna. | There are already 6 requests in progress. Wait for one to finish. |
| `err.body_too_large` | El cuerpo de la petición pasa de 10 MB. | The request body is over 10 MB. |
| `err.invalid_header` | Una cabecera no es válida: revisa que no tenga saltos de línea. | A header isn't valid: check that it has no line breaks. |
| `err.secret_missing` | Un secreto de {env} no está en el llavero de este equipo. Escríbelo de nuevo en Opciones. | A secret in {env} isn't in this computer's keychain. Enter it again in Settings. |
| `err.keychain_error` | No se pudo leer el llavero del sistema. Si el sistema te pidió permiso, acéptalo y vuelve a enviar. | Couldn't read the system keychain. If the system asked for permission, allow it and send again. |
| `err.secret_host_not_allowed` | Un secreto iba a {host}, que no es un host de confianza. No se envió nada. | A secret was going to {host}, which isn't a trusted host. Nothing was sent. |
| `err.network` | Falló la conexión con {host}. Vuelve a intentarlo. | The connection to {host} failed. Try again. |
| `retry` | Reintentar | Retry |

#### 8.6 Anuncios (región viva)

| Clave | es | en |
|---|---|---|
| `aSending` | Enviando {method} a {env} | Sending {method} to {env} |
| `aSendingNoEnv` | Enviando {method} | Sending {method} |
| `aDone` | Respuesta {status} {reason}, en {time} | Response {status} {reason}, in {time} |
| `aFailed` | No se envió: {message} | Not sent: {message} |
| `aEnv` | Entorno: {name} | Environment: {name} |

#### 8.7 Opciones

| Clave | es | en |
|---|---|---|
| `envsTitle` | Entornos | Environments |
| `envsIntro` | Los valores de las variables se guardan solo en este equipo y no se sincronizan. Los secretos van al llavero del sistema. En tus notas solo quedan los nombres, como {{token}}. | Variable values are stored on this computer only and don't sync. Secrets go to the system keychain. Your notes only keep the names, like {{token}}. |
| `envsEmpty` | Todavía no tienes entornos. Crea uno para usar variables como {{baseUrl}} o {{token}} en tus peticiones. | You don't have any environments yet. Create one to use variables like {{baseUrl}} or {{token}} in your requests. |
| `envCreateButton` | Crear un entorno | Create an environment |
| `envNew` | Nuevo entorno | New environment |
| `envDefaultName` | Entorno {n} | Environment {n} |
| `envActiveLabel` | Entorno activo | Active environment |
| `envTabs` | Entornos | Environments |
| `envName` | Nombre | Name |
| `envNameEmpty` | Ponle un nombre al entorno. | Give the environment a name. |
| `envNameDuplicate` | Ya hay un entorno con ese nombre. | There's already an environment with that name. |
| `envDuplicate` | Duplicar | Duplicate |
| `envDuplicated` | Entorno duplicado | Environment duplicated |
| `envDuplicatedNote` | Los secretos no se copian: escríbelos en el entorno nuevo. | Secrets aren't copied: enter them in the new environment. |
| `envDelete` | Eliminar | Delete |
| `envDeleteTitle` | Eliminar «{name}» | Delete "{name}" |
| `envDeleteMessage` | Se borran sus {n} {n|variable|variables} y sus secretos del llavero. Las peticiones de tus notas no se tocan. | Its {n} {n|variable|variables} and its secrets in the keychain are deleted. The requests in your notes aren't touched. |
| `envDeleteConfirm` | Eliminar entorno | Delete environment |
| `envProtectedToggle` | Pedir confirmación antes de enviar POST, PUT, PATCH o DELETE | Ask before sending POST, PUT, PATCH or DELETE |
| `envProtectedHelp` | Para producción, o para cualquier entorno donde un error cueste. | For production, or any environment where a mistake is costly. |
| `envInsecureToggle` | Aceptar certificados no válidos | Accept invalid certificates |
| `envInsecureHelp` | Solo para servidores de prueba con certificados autofirmados. Las respuestas se marcan como sin verificar. | Only for test servers with self-signed certificates. Responses are marked as not verified. |
| `varsTitle` | Variables | Variables |
| `varsEmpty` | Este entorno no tiene variables. Agrega una, por ejemplo baseUrl con la URL de la API. | This environment has no variables. Add one, for example baseUrl with the API URL. |
| `varColName` | Nombre | Name |
| `varColValue` | Valor | Value |
| `varColSecret` | Secreto | Secret |
| `varNameAria` | Nombre de la variable {n} | Name of variable {n} |
| `varValueAria` | Valor de {name} | Value of {name} |
| `varSecretAria` | Secreto: {name} | Secret: {name} |
| `varDeleteAria` | Eliminar {name} | Delete {name} |
| `varAdd` | Agregar variable | Add variable |
| `varNameInvalid` | Usa letras, números, _, . o -, y empieza por una letra o _. | Use letters, numbers, _, . or -, and start with a letter or _. |
| `varNameDuplicate` | Ya hay una variable {name} en este entorno. | There's already a variable {name} in this environment. |
| `varSecretPlaceholder` | Pega el valor; se guarda en el llavero | Paste the value; it's stored in the keychain |
| `varSecretSave` | Guardar | Save |
| `varSecretChange` | Cambiar | Change |
| `varSecretSaved` | Guardado en el llavero: {hint} | Stored in the keychain: {hint} |
| `varLooksSecret` | ¿Es un secreto? Márcalo para guardarlo en el llavero. | Is this a secret? Mark it to store it in the keychain. |
| `varUnsecretTitle` | Dejar de guardar {name} como secreto | Stop storing {name} as a secret |
| `varUnsecretMessage` | El valor se borra del llavero y tendrás que escribirlo de nuevo. Después quedará en las opciones de este equipo, sin cifrar. | The value is deleted from the keychain and you'll need to enter it again. After that it's kept in this computer's settings, unencrypted. |
| `varUnsecretConfirm` | Quitar del llavero | Remove from keychain |
| `varDeleteTitle` | Eliminar la variable {name} | Delete the variable {name} |
| `varDeleteMessage` | Las peticiones que la usan no se podrán enviar con este entorno. | Requests that use it can't be sent with this environment. |
| `varDeleteMessageSecret` | Las peticiones que la usan no se podrán enviar con este entorno, y su valor se borra del llavero. | Requests that use it can't be sent with this environment, and its value is deleted from the keychain. |
| `varDeleteConfirm` | Eliminar variable | Delete variable |
| `deleteCancel` | Cancelar | Cancel |
| `hostsTitle` | Hosts de confianza para los secretos | Trusted hosts for secrets |
| `hostsHelp` | Los secretos de este entorno se envían sin preguntar solo a estos hosts. Los de las variables con una URL se agregan solos. | This environment's secrets are sent without asking only to these hosts. Hosts from variables with a URL are added automatically. |
| `hostFrom` | de {var} | from {var} |
| `hostAdd` | Agregar host | Add host |
| `hostPlaceholder` | api.example.com | api.example.com |
| `hostInvalid` | Escribe solo el host, sin https:// ni ruta. | Enter just the host, without https:// or a path. |
| `hostRemoveAria` | Quitar {host} | Remove {host} |
| `requestsTitle` | Peticiones | Requests |
| `timeout` | Tiempo límite | Timeout |
| `timeoutUnit` | segundos | seconds |
| `timeoutAria` | Tiempo límite, en segundos | Timeout, in seconds |
| `maxSize` | Tamaño máximo de la respuesta | Maximum response size |
| `maxSizeAria` | Tamaño máximo de la respuesta, en MB | Maximum response size, in MB |
| `followRedirects` | Seguir las redirecciones | Follow redirects |
| `rangesHelp` | De 1 a 300 segundos; de 1 a 50 MB. | From 1 to 300 seconds; from 1 to 50 MB. |
| `resetValues` | Restablecer valores | Reset values |
| `keychainSaveError` | No se pudo guardar en el llavero | Couldn't save to the keychain |
| `viewHint` | Para probar una petición sin guardarla, usa la pantalla Cliente HTTP del menú lateral. | To try a request without saving it, use the HTTP client screen in the sidebar. |
| `viewHintOpen` | Abrir Cliente HTTP | Open HTTP client |

#### 8.8 DevTools (sección `devtools`, claves de herramienta) — quitadas el 31 oct 2026

> Las claves de `devtools` de esta tabla se quitaron con la herramienta. Las de `httpClient` siguen, para el formulario de la pantalla, menos `toolLoadedMulti`; `toolNotice` cambió a "Enviar manda la petición a la URL que escribas, desde este equipo." y se sumó `toolUrlPlaceholder`. Los textos de la pantalla están en §11.

| Clave | es | en |
|---|---|---|
| `group.network` | Red | Network |
| `http.name` | Cliente HTTP | HTTP client |
| `http.desc` | Envía una petición sin guardarla, con las variables del entorno activo. | Send a request without saving it, using the active environment's variables. |
| `http.placeholder` | https://api.example.com/users | https://api.example.com/users |
| `http.keywords` | http api rest petición request get post put curl postman | http api rest request get post put curl postman |
| `privacyNoteWithHttp` | Todo se procesa en este equipo, salvo Cliente HTTP, que envía tus peticiones cuando pulsas Enviar. Lo que pegas no se guarda: se borra al cerrar Logday. | Everything runs on this computer, except HTTP client, which sends your requests when you press Send. What you paste is not saved: it's cleared when you close Logday. |

Y en `httpClient`, los de la herramienta:

| Clave | es | en |
|---|---|---|
| `toolNotice` | Esta herramienta envía la petición a la URL que escribas. | This tool sends the request to the URL you enter. |
| `toolRequest` | Petición | Request |
| `toolMethod` | Método | Method |
| `toolUrl` | URL | URL |
| `toolHeaders` | Cabeceras | Headers |
| `toolHeadersPlaceholder` | Accept: application/json | Accept: application/json |
| `toolBody` | Cuerpo | Body |
| `toolBodyPlaceholder` | { "name": "Ana" } | { "name": "Ana" } |
| `toolResponse` | Respuesta | Response |
| `toolEmpty` | Escribe una URL y pulsa Enviar. La respuesta aparece aquí. | Enter a URL and press Send. The response shows up here. |
| `toolClear` | Limpiar | Clear |
| `toolLoadedMulti` | El bloque tiene {n} peticiones; se cargó la primera. | The block has {n} requests; the first one was loaded. |
| `toolOpenIn` | Abrir en Cliente HTTP | Open in HTTP client |

Notas para quien traduzca:

- "Petición" y "request" son los términos de siempre; no se mezclan con "solicitud".
- "Entorno" es "environment". "Llavero" es "keychain" en todos los sistemas, como en el resto de la app.
- Los ejemplos (`example.com`, `baseUrl`, `token`) no se traducen.

### 9. Hallazgos en el código actual que afectan a esta extensión

**Importantes:**

1. **`removeExtensionConfig` solo borra `secretKeys` fijos** (`appStore.ts:4098`). Las claves de esta extensión dependen de sus variables. Propuesta: `dynamicSecretKeys` (A3.4).
2. **`parseFencedBlocks` acepta prefijos** (`lib/fencedBlocks.ts:13`). `^```http[^\n]*` también toma ```` ```https ```` o ```` ```http-x ````, mientras que `blockIndexAt` (`mermaidCodeBlock.tsx`) compara el lenguaje exacto, así que los índices se pueden desfasar. Además, no acepta cercas de 4 comillas invertidas. Propuesta: `^(`{3,})${lenguaje}(?:[ \t][^\n]*)?\n([\s\S]*?)^\1[ \t]*$`.
3. **`.prose-editor pre` y `pre code`** (`App.css:759`, `:863`) se aplican a cualquier `<pre>` dentro del editor, también al de la respuesta. Propuesta: la anulación de A3.7.
4. **`ExtensionCodeBlockView` siempre esconde el código** (`mermaid-node-source`). Para el modo inline hace falta la variante de A3.1.

**Menores:**

5. **`ConsentModal`** (`ExtensionsSettingsTab.tsx:47`) usa `bg-indigo-600 text-white`: en sepia queda a 1,5:1 (DevTools 9.1-2, sigue abierto). Esta extensión es la primera del grupo Herramientas que lo muestra. Propuesta: el botón con `MAIN_BTN`/`SEND_BTN`, en este PR o en uno aparte.
6. **`NoteList.tsx:21`** quita del resumen todos los bloques de extensión. Para los inline sobra (A3.5).
7. **R17 dice "solo a los hosts que la extensión declara".** Esta extensión es la excepción documentada: el host lo escribe el usuario, y solo se contacta cuando él lo pide. Hay que anotarlo en `specs/extensiones/requirements.md`.

### 10. Decisiones para Jorge

Jorge las aprobó todas el 31 oct 2026, tal como las recomienda el diseño (`requirements.md`, Decisiones). Las recomendaciones van primero.

1. **Edición en la nota (inline)** o editor en un modal como Excalidraw. Recomendado: **inline**. Es texto, y abrir un modal cada vez para cambiar un parámetro sería fricción. Cuesta el modo nuevo del punto de extensión (A3).
2. **Entorno activo global** o uno por nota. Recomendado: **global**, con el chip en cada bloque y los entornos protegidos. Uno por nota tendría que guardarse en la nota (y viajar por el sync) o en un mapa local por nota que nadie ve.
3. **Confirmar los secretos que van a un host ajeno (HT21).** Recomendado: **sí**. Si no, una nota creada por el agente de MCP, o pegada de otro lado, podría mandar `{{token}}` adonde quiera con un clic.
4. **Entorno protegido: qué métodos confirma.** Recomendado: **solo POST, PUT, PATCH y DELETE**. Confirmar también los GET acostumbra a pulsar "Enviar" sin leer.
5. **Grupo "Red" nuevo en DevTools** o meter la herramienta en uno existente. Recomendado: **"Red"**, al final. Ningún grupo actual encaja, y deja sitio para lo que venga (de cURL a petición, analizar una URL). *Enmendada el 31 oct 2026, pedido por Jorge: ni grupo ni herramienta en DevTools; el Cliente HTTP tiene su pantalla (§11).*
6. **`Content-Type: application/json` automático** para un cuerpo JSON. Recomendado: **sí**, marcado como "Agregada por Logday".
7. **Variables del sistema** (`$uuid`, `$timestamp`, `$isoTimestamp`). Recomendado: **sí**. Son tres funciones, y sin ellas muchas pruebas de POST se escriben a mano cada vez.
8. **Vista previa de imágenes.** Recomendado: **sí**, hasta 5 MB.
9. **Resaltado `http` en todas las notas**, aunque la extensión esté apagada. Recomendado: **sí** (≈1 KB).
10. **HTTP/2.** Recomendado: **no en la primera versión**. Suma la feature `http2` de reqwest (y `h2`), y casi todas las APIs hablan HTTP/1.1.

### 11. La pantalla propia (31 oct 2026, HT33–HT35)

Pedida por Jorge: el Cliente HTTP de DevTools no se encontraba (con la extensión apagada no aparecía) y era confuso que una extensión con su propia opción en Extensiones viviera dentro de otra.

#### 11.1 Anatomía

```
┌ menú ─┬ PETICIONES · 4 peticiones   [⟳] ┬ [🌐] Crear                                      ⛁ Staging ▾
│ …     │ [ + Nueva petición            ]  │      De «API de usuarios» · Abrir la nota
│ 🌐    │ [ 🔍 Buscar peticiones        ]  │      🌐 Enviar manda la petición a la URL que escribas, desde este equipo.
│Cliente│                                  ├──────────────────────────────────────────────────────────────────
│ HTTP  │ 📄 API de usuarios               │ PETICIÓN                                   [📄+ Guardar en una nota]
│       │ ▌POST  Crear                     │ [POST ▾] [ {{baseUrl}}/users                         ] [➤ Enviar ⌘↵]
│       │        {{baseUrl}}/users         │ CABECERAS                         │ CUERPO
│       │  GET   Listar                    │ ┌───────────────────────────────┐ │ ┌───────────────────────────────┐
│       │        api.example.com/users?p…  │ │Content-Type: application/json │ │ │{"name":"Ana"}                 │
│       │  DELETE api.example.com/users/1  │ └───────────────────────────────┘ │ └───────────────────────────────┘
│       │ 📄 Sin título                    │ ⓘ En la nota, esta petición tiene un error: …   (solo si lo tiene)
│       │  GET   x.com              ⊘      │
│       │                                  │ RESPUESTA
│       │                                  │ [✓ 200 OK]  143 ms · 1,2 KB …           (la misma ResponseView)
└───────┴──────────────────────────────────┴──────────────────────────────────────────────────────────────────
```

- **Contenedor:** `@container/httpview`, en fila desde `@2xl` (≈672 px de la zona de contenido). Más angosto, la columna va arriba con `max-h-[40vh]` y el formulario debajo.
- **Columna** (`RequestsColumn`, `<aside aria-labelledby>`): 260 px, `bg-[var(--bg-panel)]` y borde a la derecha, como la de DevTools.
  - Encabezado `PANEL_TITLE` "Peticiones", con el total ("· 4 peticiones") y "Actualizar la lista" (`ICON_BTN` con `RotateCw`, que gira mientras lee).
  - "Nueva petición" (`SECONDARY_CLS` con `Plus`) y el buscador (`INPUT_CLS` con `Search`).
  - La lista va en un `<nav aria-label="Peticiones de tus notas">`. Cada nota es un `<section aria-label>` con su título (`FileText`); cada petición, un botón de ancho completo con el método en mono (`w-12`), el nombre o la URL sin el esquema (`truncate`), la URL debajo si tiene nombre, y `CircleAlert` rojo con el sr "con errores" si tiene un error. El `title` lleva el método y la URL entera.
  - La elegida lleva `aria-current="true"` y el resaltado del segmentado (`bg-indigo-500/10 ring-1 ring-indigo-500/40`).
  - Estados: "Leyendo tus notas…" con `Spinner` la primera vez; el vacío (borde punteado, "Todavía no hay peticiones en tus notas" y cómo crear una); "Ninguna petición coincide con «…»."; "No se pudieron leer tus notas." si falla la primera lectura.
- **Formulario** (`RequestForm`, `<section aria-labelledby="http-view-title" class="@container/tool">`): el de §3, sin `ToolFrame`.
  - La cabecera lleva `Globe`, el título (el de la fila elegida, o "Petición nueva, sin guardar"), "De «nota» · Abrir la nota" si viene de una, el aviso fijo y el `EnvironmentChip`.
  - "Guardar en una nota" es un `ICON_BTN` con `FilePlus` y el texto desde `@sm/tool`. Al guardar: toast "Nota creada" con "Abrir", la línea "Nota creada: «…» · Abrir la nota" mientras no cambie lo escrito, y la columna se vuelve a leer.
  - Sin "Limpiar" ni "Traer de una nota": los reemplazan "Nueva petición" y la columna.

#### 11.2 Cómo funciona

- **Lectura de las notas:** `readAllNotes()` (`lib/allNotes.ts`, la que ya usaba "Traer de una nota" de DevTools, movida a `lib/` para compartirla) lee las notas de la raíz y de cada carpeta de disco, porque el store solo tiene las de la carpeta abierta. `collectNoteRequests` (puro, `core/noteRequests.ts`) usa `parseFencedBlocks(content, 'http')` y `parseHttpBlock`: el `blockIndex` es el mismo índice que el editor da a cada bloque `http` (R24), y cada sección `###` es una petición. Un bloque vacío no aporta; uno con más de 20, las 20 primeras (HT6).
- **Cuándo se vuelve a leer:** al montar la vista (al volver a la sección), con "Actualizar", tras "Guardar en una nota" y, con una pausa de 800 ms, cuando cambian `notes`, `noteFolders` o `basePath` en el store (editar, crear, sincronizar). Si dos lecturas se cruzan, gana la última. No hay vigilancia del disco: un cambio hecho fuera de Logday se ve al volver a la sección o con "Actualizar".
- **Cargar una petición:** `formFromBlock(code, requestIndex)` la pasa al formulario. Si la línea de la petición no se entiende o su método no es uno de los admitidos, va entera a la URL: así se ve lo que dice la nota y no se envía un GET que no está escrito. El aviso "En la nota, esta petición tiene un error: …" sale del primer error de esa petición en la nota.
- **Estado (en el store del Cliente HTTP, en memoria):** `form` y `origin` (la nota, el bloque, la petición, su título y su ruta). `resetAll()` al desactivar la extensión los olvida con todo lo demás.
- **Claves del motor:** el formulario es un bloque de una sola petición, con la clave `view:<nota>:<bloque>:<petición>` para la que viene de una nota y `view:new` para la nueva (`formNoteId`). Así, al ir de una petición a otra, cada una conserva su respuesta y lo que tenga en curso, y nunca se mezcla con la respuesta del bloque en la nota (que usa `<nota>#<bloque>`). "Nueva petición" cancela y olvida lo de `view:new`.
- **Abrir la nota:** se vuelve a leer de disco por su ruta (o se busca por id entre todas, si se movió) y se abre con `setActiveNote` y `setSection('notes')`, como DevTools. Si ya no existe, un toast "No se encontró la nota…" y la lista se vuelve a leer.
- **Opciones → Cliente HTTP:** el pie dice cómo llegar a la pantalla, con un enlace que cierra Opciones y abre `ext:http-client`.

#### 11.3 Teclado y accesibilidad

- ⌘↵ (Ctrl+Enter) envía desde cualquier campo del formulario; Enter en la URL, también; Esc cancela lo que está en curso. La confirmación (HT20, HT21) es la de §1.4.
- Elegir una petición no mueve el foco: se anuncia "Cargada: {petición}, de «{nota}»" en la región viva de la extensión. "Nueva petición" anuncia "Petición nueva".
- Los campos con error llevan `aria-invalid` y `aria-describedby` hacia el problema, como en §3.

#### 11.4 Textos nuevos (`httpClient`)

| Clave | es | en |
|---|---|---|
| `viewRequests` | Peticiones | Requests |
| `viewRequestsAria` | Peticiones de tus notas | Requests in your notes |
| `viewSearch` | Buscar peticiones | Search requests |
| `viewRefresh` | Actualizar la lista | Refresh the list |
| `viewNew` | Nueva petición | New request |
| `viewLoading` | Leyendo tus notas… | Reading your notes… |
| `viewReadError` | No se pudieron leer tus notas. | Couldn't read your notes. |
| `viewEmptyTitle` | Todavía no hay peticiones en tus notas | No requests in your notes yet |
| `viewEmpty` | Escribe un bloque ```http en cualquier nota, por ejemplo con GET https://example.com, y aparece aquí. También puedes empezar con «Nueva petición» y guardarla en una nota. | Write an ```http block in any note, for example with GET https://example.com, and it shows up here. You can also start with "New request" and save it to a note. |
| `viewNoMatches` | Ninguna petición coincide con «{query}». | No request matches "{query}". |
| `viewUntitled` | Sin título | Untitled |
| `viewCount` | {n\|1 petición\|{n} peticiones} | {n\|1 request\|{n} requests} |
| `viewFrom` | De «{title}» | From "{title}" |
| `viewNewRequest` | Petición nueva, sin guardar | New request, not saved |
| `viewOpenNote` | Abrir la nota | Open the note |
| `viewOpenNoteError` | No se encontró la nota: puede que la hayas borrado o movido. | The note wasn't found: you may have deleted or moved it. |
| `viewLoadedErrors` | En la nota, esta petición tiene un error: {message} | In the note, this request has an error: {message} |
| `aLoaded` | Cargada: {label}, de «{title}» | Loaded: {label}, from "{title}" |
| `aNew` | Petición nueva | New request |
| `saveToNote` | Guardar en una nota | Save to a note |
| `noteTitle` | Cliente HTTP — {date} | HTTP client — {date} |
| `noteCreated` · `noteCreatedLive` · `noteCreateError` · `noteOpen` | Nota creada · Nota creada: «{title}» · No se pudo crear la nota · Abrir | Note created · Note created: "{title}" · Couldn't create the note · Open |
| `toolUrlPlaceholder` | https://api.example.com/users | https://api.example.com/users |
| `viewHint` · `viewHintOpen` | ver §8.7 | see §8.7 |

Los de la ayuda (`helpTitle`, `help1`–`help6`, `helpKeySend`, `helpKeyUrl`, `helpKeyCancel`) están en specs/ayuda-contextual, design, "la ayuda del Cliente HTTP".

### 12. Lenguaje, método y cURL en la barra (31 oct 2026, HT36–HT38)

Pedido por Jorge al probar (requirements, "Cambio del 31 oct 2026: lenguaje, método y cURL en la barra del bloque").

#### 12.1 La barra

```
┌──────────────────────────────────────────────────────────────────────────┐
│ HTTP ▾  POST ▾  Crear usuario ▾                 ⌨  ⛁ Staging ▾  [➤ Enviar] │
├──────────────────────────────────────────────────────────────────────────┤
```

De izquierda a derecha: lenguaje, método, petición (con 2 o más), `flex-1`, cURL, entorno y Enviar. Los dos selectores nuevos son el `Menu` de la barra (`ui/Menu.tsx`, el del selector de petición): botón `CHIP_BTN` con `aria-haspopup="menu"`, menú con `menuitemradio`, el foco visible de `FOCUS_RING` y el patrón de teclado de §5, que suma typeahead (las letras saltan a la opción).

- **Lenguaje** (HT38): el botón dice `HTTP` (`PANEL_TITLE`, `font-mono`) con `ChevronDown`, y `aria-label` "Lenguaje del bloque: HTTP". El menú tiene la pista "Con otro lenguaje, el bloque deja de ser una petición." y la lista `CODE_LANGUAGE_OPTIONS` (`lib/codeHighlight.ts`), la misma del selector de los bloques normales, con HTTP marcado; "Texto" se traduce (`langPlain`). Al elegir otro llama a `setLanguage` del host y anuncia "El bloque ahora es {nombre}".
- **Método** (HT36): el botón muestra el método (`font-mono text-[10px] font-semibold`) y `aria-label` "Método: POST". Es el de la petición de la barra, leído del texto de ahora y no del que va con el debounce de 300 ms, para que el cambio se vea en el acto. No aparece si la línea de la petición no se entiende (`missing_request_line`). Al elegir otro, `setRequestMethod` (`core/edit.ts`) da el texto nuevo, la barra llama a `setCode` del host y anuncia "Método: GET" (más el aviso del cuerpo, si con GET o HEAD lo tiene).
- **Copiar como cURL** (HT37): `ICON_BTN` con `SquareTerminal`, `aria-label` y `title` "Copiar como cURL"; al copiar pasa 1,5 s a `Check` con "Copiado" y anuncia "Comando cURL copiado". Está `disabled` con un error de sintaxis en la petición o en el bloque (una variable que falta no lo es: el comando lleva `{{nombre}}`). `toCurl` (`core/edit.ts`) arma el comando del texto sin resolver.
- Sin `setLanguage` ni `setCode` (fuera del editor) la etiqueta vuelve a ser texto y no hay selector de método.

#### 12.2 Acciones del host (specs/extensiones R24)

`NoteBlockProps` suma `setLanguage(language)` y `setCode(code)`, solo en el modo inline y con el editor editable. Las implementa `InlineExtensionBlockView` (`mermaidCodeBlock.tsx`) sobre su propia posición (`getPos()`, leída al usarlas), con transacciones puras de `extensionBlockPos.ts`:

- `setBlockLanguageTr`: `setNodeMarkup` con el lenguaje nuevo (`plaintext` lo quita, como `handleChangeCodeLanguage`). La selección se mapea; si estaba fuera del bloque, va al principio de su código. El NodeView se reemplaza por el de un bloque normal, así que se guarda y se repone el scroll del panel y el foco vuelve al editor (el menú desaparece con la barra).
- `setBlockCodeTr`: reemplaza solo el tramo distinto (`changedRange`, sin partir un emoji), con `insertText` o `delete` (no `deleteRange`, que borraría el bloque si queda vacío). Así el cursor se queda donde estaba y ⌘Z deshace en un paso. El foco sigue en el botón del menú.

#### 12.3 Textos nuevos (`httpClient`)

| Clave | es | en |
|---|---|---|
| `langPicker` | Lenguaje del bloque: {name} | Block language: {name} |
| `langPlain` | Texto | Plain text |
| `langHint` | Con otro lenguaje, el bloque deja de ser una petición. | With another language, the block is no longer a request. |
| `methodPicker` | Método: {method} | Method: {method} |
| `copyCurl` | Copiar como cURL | Copy as cURL |
| `aLanguage` | El bloque ahora es {name} | The block is now {name} |
| `aCurlCopied` | Comando cURL copiado | cURL command copied |
