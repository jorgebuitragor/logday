# Design — Notas: Link Preview + Importación

Estado: implementado (baseline). Ver [`requirements.md`](./requirements.md)
para el contrato de comportamiento.

## 1. Componentes involucrados

| Archivo | Responsabilidad |
|---|---|
| `src/components/NoteEditor.tsx` | Editor TipTap; orquesta el estado del link preview, el listener delegado de clicks/touch, la promoción de título, y renderiza `LinkPreviewCard`. |
| `src/components/LinkPreviewCard.tsx` | Componente de presentación puro (controlado por props/callbacks). Calcula su propia posición vía `useLayoutEffect` de dos pasadas. |
| `src/components/NoteList.tsx` | UI de importación: menú contextual "Importar nota" + overlay de drag & drop. |
| `src/store/appStore.ts` | Estado global de notas; acciones `importNotesFromPaths` / `importNotesFromContent`. |
| `src/lib/invoke.ts` | Wrappers tipados de comandos Tauri: `fetchUrlMetadata`, `pickMarkdownFiles`. |
| `src-tauri/src/lib.rs` | Comando Tauri `fetch_url_metadata`: hace el fetch HTTP fuera del WebView (evita CORS) y extrae metadata OG/HTML. |
| `src/lib/markdown.ts` | `parseNote` / `serializeNote` — (de)serialización de notas con frontmatter, reutilizado por la importación. |

## 2. Flujo: Link Preview

```
click en <a> dentro del pane del editor
  └─ listener delegado (capture) en editorPaneRef
       ├─ Ctrl/Cmd presionado → navigateLink() directo, sin tarjeta
       └─ click simple → linkPreviewHandlerRef.current.open(anchor)
             ├─ clasifica interno/externo por prefijo de href
             ├─ si interno: busca nota en useAppStore.getState().notes
             │     (por id, o título case-insensitive con/sin decodeURIComponent)
             ├─ calcula anchorPos relativo al pane con scroll
             ├─ setLinkPreview({...})  → dispara render de <LinkPreviewCard>
             └─ si externo: fetchUrlMetadata(href) (con cache en
                   externalMetaCacheRef, keyed por href) → actualiza
                   linkPreview.externalMeta cuando resuelve
```

Decisiones clave:

- **Estado del link preview vive en `NoteEditor`, no en `LinkPreviewCard`.**
  El card es puramente controlado (recibe `href`, `internalNote`,
  `externalMeta`, callbacks). Esto permite que `NoteEditor` cierre la
  tarjeta al cambiar de nota o hacer scroll sin acoplar esa lógica al card.
- **Handlers vía `useRef` (`linkPreviewHandlerRef`, `promoteTitleHandlerRef`)
  en vez de recrear listeners en cada render.** El listener del DOM
  (`pane.addEventListener`) se registra una sola vez por `activeNote?.id`
  (evita el error de TipTap si se registra antes de que `editor.view` exista),
  pero necesita leer estado fresco (`title`, `editor`) en cada invocación —
  de ahí que el objeto de callbacks se reasigne en cada render y el listener
  solo llame a `ref.current(...)`.
- **Cache de metadata externa es in-memory, por instancia de `NoteEditor`**
  (`useRef<Map>`), no persistida. Al cambiar de nota y volver, si el
  componente no se desmontó, la cache sigue viva — pero un reload de la app
  la pierde. Aceptable porque el costo es solo un fetch de red repetido.
- **Posicionamiento en dos pasadas (invisible → medir → posicionar).** El
  tamaño real de la tarjeta depende de su contenido (preview largo, tags,
  descripción), así que no se puede calcular la posición antes de montar el
  DOM. Se renderiza con `opacity: 0, pointerEvents: none`, se mide en
  `useLayoutEffect`, y se hace visible tras fijar `top`/`left`. Este cálculo
  corre **una sola vez al montar** (deps `[]`) — la tarjeta no se
  reposiciona si el usuario hace scroll (se cierra en su lugar, ver 2.7 en
  requirements).

### Backend: `fetch_url_metadata`

Implementado en Rust en vez de `fetch()` desde el WebView por una razón
concreta: el WebView aplica CORS a peticiones cross-origin hechas desde JS,
lo que bloquearía la mayoría de metadatos de sitios externos. El comando
Tauri corre en el proceso nativo, sin esa restricción.

- Usa `reqwest` con timeout de 8s y un User-Agent identificándose como
  `Logday/1.0`.
- Extrae `og:title` → fallback `<title>` → fallback dominio.
- Extrae `og:description` → fallback `<meta name="description">` → vacío.
- Parseo de HTML es manual (búsqueda de substrings), no usa un parser DOM —
  suficiente para extraer metadatos de `<head>`, evita traer una dependencia
  de parsing HTML solo para esto.
- Trunca título a 100 chars y descripción a 200 chars (con `…`) antes de
  devolver, para no inflar el payload ni el layout de la tarjeta.

## 3. Flujo: Promoción de título

Vive enteramente en `NoteEditor`, atado a un listener de `keydown` en el
pane contenedor (no en `editor.view.dom` directamente, para evitar errores
de TipTap 3 si el `view` aún no está montado en el primer render).

Al disparar:
1. Se construye una transacción ProseMirror que borra el primer párrafo y
   opcionalmente inserta el texto restante como nuevo primer párrafo.
2. Se marca `skipNextContentSaveRef.current = true` **antes** de despachar
   la transacción — esto evita que el `useEffect` que observa `mdContent`
   dispare un guardado parcial (solo contenido, con el título todavía
   vacío) al reaccionar al `onUpdate` del editor.
3. Se agenda un guardado combinado (título + contenido) 600ms después,
   leyendo el markdown fresco directamente del storage del editor en ese
   momento (no el `mdContent` de React, que podría no haberse actualizado
   aún).

Esto evita una condición de carrera donde guardar título y contenido por
separado podría persistir un estado intermedio inconsistente si el usuario
sigue escribiendo rápido.

## 4. Flujo: Importación de notas

```
Selector de archivos (pickMarkdownFiles)          Drag & drop (onDragDropEvent)
        │                                                   │
        └──────────────┬────────────────────────────────────┘
                        ▼
          importNotesFromPaths(paths: string[])
                        │
          por cada path: fs.readFile → parseNote(raw, filePath)
                │ (frontmatter válido)         │ (sin frontmatter)
                ▼                              ▼
        título/contenido/tags           heading H1 o filename → título
        del frontmatter                 contenido = raw completo
                        │
          construir Note{id: uuid(), created/updated: hoy, pinned: false, ...}
                        │
          fs.writeFile(filePath destino, serializeNote(note))
                        │
          set({ notes: [...imported, ...notes], activeNote: imported[0] })
          showToast(...)
```

Decisiones:

- **Drag & drop usa `getCurrentWindow().onDragDropEvent`, no eventos HTML5
  (`ondrop`).** Tauri intercepta el drag nativo del SO antes de que el
  WebView lo vea, así que los eventos HTML5 nunca disparan de forma
  confiable para archivos externos. El filtro de extensión (`.md`/`.txt`)
  se aplica tanto en el evento `enter` (para decidir si mostrar el overlay)
  como en `drop` (para decidir qué importar).
- **Fallos por archivo son silenciosos y no abortan el lote** (`catch {
  /* skip */ }` dentro del loop). Si el usuario suelta 10 archivos y 1 está
  corrupto, las otras 9 se importan igual.
- **`importNotesFromContent` existe pero no está cableado a la UI.** Se
  dejó preparado (misma lógica que `importNotesFromPaths` pero recibiendo
  `{name, content}` en vez de leer del disco) para un futuro caso de uso
  — pegar/soltar contenido que no viene de un path de archivo (p.ej. desde
  el portapapeles o una integración externa). No implementar UI para esto
  sin antes actualizar `requirements.md` §4.

## 5. Contratos de tipos relevantes

```ts
// src/lib/invoke.ts
interface UrlMeta { title: string; description: string; domain: string; }
function fetchUrlMetadata(url: string): Promise<UrlMeta>;
function pickMarkdownFiles(): Promise<string[] | null>;

// src/components/LinkPreviewCard.tsx
interface InternalNoteMeta { id: string; title: string; updated: string; preview: string; tags: string[]; }
type ExternalMetaState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; title: string; domain: string; description: string };
interface AnchorPos { top: number; linkTop: number; left: number; right: number; }

// src/store/appStore.ts
importNotesFromPaths(paths: string[]): Promise<void>;
importNotesFromContent(files: Array<{ name: string; content: string }>): Promise<void>;
```

## 6. Alternativas descartadas

- **`fetch()` directo desde el WebView para metadata externa** — descartado
  por CORS (la mayoría de sitios no envían `Access-Control-Allow-Origin`
  para scraping de metadata).
- **Reposicionar la tarjeta en cada evento de scroll en vez de cerrarla** —
  descartado por complejidad; cerrar al hacer scroll es más simple y el
  patrón ya se usaba para el menú contextual de bloques (consistencia).
- **Guardar título y contenido en dos `updateNote()` separados durante la
  promoción de título** — descartado porque genera una ventana donde el
  archivo en disco tiene contenido nuevo pero título viejo (o viceversa) si
  el segundo guardado falla o se cancela.
