# Requirements — Notas: Link Preview + Importación

Estado: implementado (baseline). Documenta el comportamiento actual del
código en `src/components/NoteEditor.tsx`, `src/components/LinkPreviewCard.tsx`,
`src/components/NoteList.tsx`, `src/store/appStore.ts` y
`src-tauri/src/lib.rs` a fecha 2026-07-31. Cambios futuros a estas áreas
deben actualizar este documento en el mismo PR.

## 1. Contexto

Las notas usan un editor TipTap con serialización a Markdown. Los enlaces
(`[texto](href)`) pueden apuntar a otra nota (interno) o a una URL externa.
Antes de esta feature, hacer click en un enlace no daba ninguna
retroalimentación visual previa a navegar.

## 2. Vista previa de enlaces (Link Preview Card)

### 2.1 Detección de tipo de enlace

- CUANDO el usuario interactúa con un enlace dentro del editor, el sistema
  DEBERÁ clasificarlo como **interno** si su `href` no empieza por
  `http://`, `https://`, `//`, `mailto:`, `tel:` ni `ftp:`; en caso
  contrario se clasifica como **externo**.

### 2.2 Apertura de la tarjeta (click simple)

- CUANDO el usuario hace click simple (sin Ctrl/Cmd) sobre un enlace en modo
  wysiwyg, el sistema DEBERÁ prevenir la navegación por defecto y mostrar una
  tarjeta de vista previa anclada debajo del enlace.
- CUANDO el usuario hace tap sobre un enlace en un dispositivo táctil, el
  sistema DEBERÁ mostrar la misma tarjeta (no navegar directamente).
- La tarjeta DEBERÁ posicionarse dentro del contenedor con scroll del editor
  (no `position: fixed`), calculando su posición en dos pasadas: se
  renderiza invisible, se mide, y luego se posiciona y hace visible.
- SI la tarjeta no cabe debajo del enlace dentro del viewport visible del
  contenedor, ENTONCES el sistema DEBERÁ mostrarla arriba del enlace en su
  lugar.
- SI la tarjeta se desborda por la derecha, ENTONCES el sistema DEBERÁ
  alinearla al borde derecho del enlace en vez de al izquierdo.

### 2.3 Navegación directa (Ctrl/Cmd + click)

- CUANDO el usuario hace click con Ctrl o Cmd presionado sobre un enlace, el
  sistema DEBERÁ navegar inmediatamente sin mostrar la tarjeta:
  - Si es interno y la nota existe: cambia a la sección "notas" y la
    selecciona como nota activa.
  - Si es externo: abre la URL con el manejador del sistema operativo.

### 2.4 Contenido de la tarjeta — enlace interno

- CUANDO el enlace es interno, el sistema DEBERÁ intentar resolver la nota
  destino buscando por `id` exacto, o por título (comparación
  case-insensitive, con y sin decodificar URI).
- SI la nota se encuentra, la tarjeta DEBERÁ mostrar: título, fecha de
  última edición (formateada según el idioma activo), un preview de hasta
  120 caracteres de texto plano del cuerpo (sin encabezados ni símbolos
  Markdown), y hasta 4 tags.
- SI la nota NO se encuentra, la tarjeta DEBERÁ mostrar un mensaje de "nota
  no encontrada" en vez de preview/tags.
- La tarjeta DEBERÁ ofrecer dos acciones: "Ir a la nota" (acción primaria) y
  "Editar" — ambas navegan a la sección de notas y seleccionan la nota
  destino como activa, luego cierran la tarjeta.

### 2.5 Contenido de la tarjeta — enlace externo

- CUANDO el enlace es externo, el sistema DEBERÁ solicitar sus metadatos
  (título, descripción, dominio) de forma perezosa (al abrir la tarjeta, no
  antes) llamando al comando Tauri `fetch_url_metadata`.
- Mientras la petición está en curso, la tarjeta DEBERÁ mostrar un estado de
  "cargando" con spinner.
- SI la petición falla, la tarjeta DEBERÁ mostrar un mensaje de error
  genérico sin bloquear las acciones disponibles (abrir/copiar/editar URL
  siguen funcionando).
- SI la petición tiene éxito, la tarjeta DEBERÁ mostrar título, dominio y
  descripción (si existe) — hasta 3 líneas con truncado.
- Los metadatos externos DEBERÁN cachearse en memoria por `href` durante la
  vida del componente `NoteEditor`, para no re-solicitar la misma URL dos
  veces en la misma sesión de edición.
- La tarjeta DEBERÁ ofrecer tres acciones: "Abrir enlace" (primaria, abre con
  el navegador del sistema), "Copiar enlace" (portapapeles) y "Editar URL".

### 2.6 Edición de URL (solo enlaces externos)

- CUANDO el usuario activa "Editar URL", la tarjeta DEBERÁ mostrar un input
  de texto pre-rellenado con el href actual, con foco y selección
  automáticos.
- CUANDO el usuario presiona Enter con un valor no vacío, el sistema DEBERÁ
  reemplazar el `href` en todas las marcas de enlace del documento que
  coincidan exactamente con el href original, preservando el texto visible,
  y cerrar la tarjeta.
- CUANDO el usuario presiona Escape estando en modo edición de URL, el
  sistema DEBERÁ cancelar la edición y volver a la vista normal de la
  tarjeta (sin cerrarla).
- Editar URL NO está disponible para enlaces internos.

### 2.7 Cierre de la tarjeta

- La tarjeta DEBERÁ cerrarse cuando: se presiona Escape (y no se está
  editando URL), se hace click/tap fuera de la tarjeta, el contenedor del
  editor hace scroll, o cambia la nota activa.
- Al cerrar, el sistema DEBERÁ remover el atributo `aria-describedby` que se
  agregó al `<a>` al abrir la tarjeta.

### 2.8 Accesibilidad

- El enlace DEBERÁ recibir `aria-describedby` apuntando al id de la tarjeta
  mientras esté abierta.
- La tarjeta DEBERÁ tener `role="tooltip"` y `aria-label` describiendo su
  contenido (título, y dominio si es externo).

## 3. Promoción de la primera línea a título

- CUANDO la nota activa no tiene título aún Y el cursor está dentro del
  primer bloque (un párrafo) del documento Y hay texto antes del cursor, SI
  el usuario presiona Enter (sin Shift/Ctrl/Cmd/Alt), ENTONCES el sistema
  DEBERÁ:
  1. Prevenir el salto de línea por defecto.
  2. Usar el texto antes del cursor (recortado) como nuevo título de la
     nota.
  3. Si había texto después del cursor en ese mismo párrafo, convertirlo en
     el nuevo primer párrafo del cuerpo; si no queda contenido, dejar un
     párrafo vacío.
  4. Guardar título + contenido juntos (debounced, 600ms) en una sola
     escritura — nunca debe generarse un guardado parcial que sólo
     actualice el contenido con el título viejo.
- SI la nota ya tiene título, este atajo NO DEBERÁ activarse (Enter se
  comporta normalmente).

## 4. Importar notas desde archivo

### 4.1 Vía selector de archivos

- CUANDO el usuario hace click derecho en el área vacía de la lista de
  notas y selecciona "Importar nota", el sistema DEBERÁ abrir un selector
  de archivos nativo filtrado a `.md` y `.txt`, permitiendo selección
  múltiple.
- CUANDO se seleccionan uno o más archivos, el sistema DEBERÁ importarlos a
  la carpeta de notas actualmente activa (o raíz si no hay ninguna
  seleccionada).

### 4.2 Vía drag & drop

- CUANDO el usuario arrastra archivos desde el sistema operativo sobre la
  lista de notas (sección "notas" activa) Y al menos uno tiene extensión
  `.md` o `.txt`, el sistema DEBERÁ mostrar un overlay indicando "Suelta
  aquí para importar".
- CUANDO el usuario suelta los archivos, el sistema DEBERÁ importar
  únicamente los que tengan extensión `.md` o `.txt`, ignorando el resto sin
  error visible.
- Esto usa el evento nativo de Tauri (`onDragDropEvent`), no los eventos
  HTML5 de drag & drop, porque Tauri intercepta el drag de archivos del SO
  antes de que llegue al WebView.

### 4.3 Procesamiento de cada archivo importado

- Para cada archivo, el sistema DEBERÁ intentar parsearlo como nota con
  frontmatter (`parseNote`); si tiene frontmatter válido, usa su título,
  contenido y tags.
- SI no tiene frontmatter reconocible, el sistema DEBERÁ:
  - Usar el primer heading de nivel 1 (`# Título`) como título si existe.
  - Si no hay heading, usar el nombre de archivo (sin extensión) como
    título.
  - Usar el contenido completo (recortado) como cuerpo, sin tags.
- Cada nota importada DEBERÁ generarse con un `id` nuevo (uuid), fecha de
  creación/actualización = hoy, y `pinned = false`.
- SI un archivo no se puede leer o parsear, el sistema DEBERÁ omitirlo
  silenciosamente y continuar con el resto (no debe abortar la importación
  completa por un archivo corrupto).

### 4.4 Resultado

- SI se importó al menos una nota, el sistema DEBERÁ:
  - Anteponerlas a la lista de notas en memoria.
  - Seleccionar la primera nota importada como nota activa.
  - Marcar el estado de git como `pending` si el repo git está habilitado.
  - Mostrar un toast de éxito: el título de la nota si fue una sola, o la
    cantidad si fueron varias.
- SI no se importó ninguna nota (todos los archivos fallaron o no se
  seleccionó ninguno), el sistema NO DEBERÁ mostrar ningún toast ni cambiar
  la nota activa.

## 5. Fuera de alcance / conocido incompleto

- `importNotesFromContent` (importar desde contenido en memoria, sin ruta de
  archivo) está implementado en el store pero **no está conectado a ningún
  punto de la UI** todavía. No debe asumirse disponible para el usuario.
- Las claves de i18n `linkPreviewSave` y `linkPreviewSavedToast` ("Guardar
  como nota" / "Guardado como nota") existen en el diccionario pero **no
  hay ninguna acción "guardar enlace externo como nota" implementada** en
  `LinkPreviewCard`. Si se agrega, debe extenderse este spec primero.
