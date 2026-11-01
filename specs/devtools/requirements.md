# DevTools — Requirements

Estado: en progreso.

## Contexto

Extensión de Desktop (`devtools`, grupo Herramientas): una caja de utilidades de desarrollador, al estilo de DevToys, dentro de Logday. Sirve para formatear un JSON, decodificar un JWT, generar un UUID o probar una expresión regular sin abrir un sitio web. Esos sitios reciben lo que se pega, y lo que se pega puede ser un token, una contraseña o datos del trabajo.

Jorge la eligió el 30 oct 2026 entre las candidatas del grupo Herramientas, con todas las herramientas propuestas. Ese mismo día sumó los códigos QR y de barras, y las listas para un `IN` de SQL y para compararlas. Es la primera extensión con vista propia en el menú lateral (R11 de `specs/extensiones/`).

## Requisitos (EARS)

### Vista

- D0. MIENTRAS la extensión esté activa, el menú lateral DEBERÁ tener la sección "DevTools" (R11). Su vista DEBERÁ listar las herramientas (por grupo, o de la A a la Z según D18) y abrir una a la vez. Los grupos son Formatos, Codificar, Generadores, Fechas, Texto y Listas.

### Herramientas

- D1. **Formatos.**
  - JSON: formatear (2 espacios, 4 o tab), minificar y validar.
  - YAML: validar y formatear.
  - XML: formatear, minificar y validar que esté bien formado.
  - Convertir JSON → YAML, YAML → JSON y JSON → CSV. Para CSV, la entrada es un arreglo de objetos y las columnas son la unión de sus claves.
  - SI la entrada no es válida, la herramienta DEBERÁ decir qué falla y, si se sabe, en qué línea y columna. El error DEBERÁ ser el mismo en macOS, Windows y Linux, sin depender del motor del WebView.
  - Al leer YAML NO DEBERÁN ejecutarse tipos de JavaScript (`!!js/function`).
- D2. **Codificar y decodificar.**
  - Base64 de texto UTF-8, normal y URL-safe. Al decodificar acepta las dos variantes, con o sin relleno y con saltos de línea.
  - URL (`encodeURIComponent`, y `+` como espacio al decodificar).
  - Entidades HTML.
  - JWT: decodificar la cabecera y el payload, y mostrar `exp`, `iat` y `nbf` como fechas, con si está vencido o todavía no es válido. La herramienta DEBERÁ avisar que la firma no se verifica.
- D3. **Generadores.**
  - UUID v4 y v7, de 1 a 100 a la vez.
  - Hashes MD5, SHA-1, SHA-256 y SHA-512 de un texto UTF-8, todos a la vez.
  - Contraseñas de 4 a 128 caracteres, con los juegos que se elijan (al menos uno de cada uno) y la opción de evitar los caracteres ambiguos.
  - Lorem ipsum en párrafos, frases o palabras.
  - Todo lo aleatorio DEBERÁ salir de `crypto.getRandomValues`.
- D4. **Fechas.**
  - Timestamp Unix ↔ fecha. Detecta segundos o milisegundos, con la opción de elegirlo. Muestra la fecha en UTC, en la zona del equipo y en ISO 8601, más el tiempo relativo. Al revés, pasa de una fecha (ISO, o `YYYY-MM-DD HH:mm` en hora local) a timestamp, y tiene un botón para "ahora".
  - Cron → descripción en palabras, en el idioma de la app, y las próximas 5 ejecuciones en hora local. Las próximas se calculan para el cron de 5 campos; uno de 6 o 7 se describe, pero no se calculan.
- D5. **Texto.**
  - Probar expresiones regulares: patrón, flags y texto, con las coincidencias resaltadas y sus grupos (numerados y con nombre).
  - El regex DEBERÁ correr en un worker con tiempo límite (1 s). Si se pasa, la herramienta DEBERÁ decirlo, y la app NO DEBERÁ congelarse.
  - Comparar dos textos por líneas, con lo agregado, lo quitado, números de línea y la opción de ignorar espacios.

### Comportamiento común

- D6. Cada herramienta DEBERÁ poder copiar su salida al portapapeles y limpiar su entrada. Las que tienen dos sentidos (Base64, URL, HTML, conversiones, timestamp) DEBERÁN poder intercambiar entrada y salida.
- D7. Los textos de la interfaz y los errores DEBERÁN estar en español y en inglés (sección `devtools` de `i18n.ts`), sin voseo.
- D8. La herramienta DEBERÁ procesar mientras se escribe. SI la entrada pasa de 200 000 caracteres, DEBERÁ procesar solo con un botón, y no DEBERÁ aceptar más de 5 000 000.
- D9. Lo que se pega (entradas y salidas) NO DEBERÁ escribirse en disco: ni en `config.json`, ni en `localStorage`, ni en los archivos de datos.
  - Se conserva en memoria mientras la app está abierta: cambiar de sección y volver no lo borra.
  - Al desactivar la extensión, se borra.
  - Lo único que se recuerda (en la configuración de la extensión) es la última herramienta abierta, las opciones de cada una (indentación, longitud, juegos de caracteres, unidad) y cómo se muestra la lista: el orden, las ocultas, el modo y los grupos plegados (D17–D21).
- D10. **Puente con Logday.**
  - "Guardar en una nota" DEBERÁ crear una nota nueva, en la raíz, con la salida en un bloque de código del lenguaje que corresponda, y avisar con un toast que permita abrirla.
  - "Traer de una nota" DEBERÁ dejar elegir una nota y uno de sus bloques de código, y cargarlo en la herramienta que corresponda a su lenguaje (o a su contenido, si no tiene lenguaje).
- D11. DevTools NO DEBERÁ enviar nada fuera del equipo, sin excepción. Por eso no lleva el aviso de R6, y el pie de la lista dice "Todo se procesa en este equipo".
  - Restaurado el 31 oct 2026: entre el PR 2 del Cliente HTTP y este cambio tuvo la excepción de la herramienta Cliente HTTP (D25, retirado). Pedido por Jorge.
- D12. Su código DEBERÁ cargarse solo cuando está activa (R16). Las dependencias nuevas DEBERÁN ser mínimas:
  - `cronstrue`, con el español cargado aparte;
  - `qrcode-generator`;
  - de `jsbarcode`, solo los codificadores (`jsbarcode/bin/barcodes`), sin el renderizador.
  `js-yaml` y `fast-diff` ya estaban en la app.

### Listas

- D13. **Lista ↔ `IN` de SQL.**
  - Entrada: valores uno por línea, o separados por coma, tab o punto y coma. En "automático", se detecta el separador.
  - Salida: con comilla simple, comilla doble o sin comillas.
  - Opciones: separador `, ` o `,`; un valor por línea o todos en una; paréntesis; columna (`col IN (…)`); quitar espacios, vacíos y duplicados; dejar sin comillas los números; partir en grupos de N unidos con `OR col IN (…)` (el límite de 1000 de Oracle).
  - Una comilla dentro de un valor DEBERÁ escaparse doblándola (`O'Brien` → `'O''Brien'`).
  - Al revés: de `'a', 'b'`, `IN ('a','b')` o `col IN (…) OR col IN (…)` a un valor por línea, respetando las comillas dobladas y las comas dentro de un valor entre comillas.
- D14. **Comparar listas.** Muestra lo que está solo en A, solo en B, en las dos y la unión, con los conteos y los repetidos de cada lista. Se puede ignorar mayúsculas y espacios, conserva el orden de aparición, y cada resultado se puede copiar o pasar a la herramienta del D13.

### Códigos

- D15. **QR.**
  - Genera un código QR de un texto o una URL, en UTF-8, con nivel de corrección L, M, Q o H, tamaño y margen.
  - SI el texto no cabe, DEBERÁ decirlo, con cuántos bytes caben en ese nivel.
  - Se puede guardar como PNG o SVG con el diálogo del sistema, y copiar el SVG.
  - La imagen DEBERÁ ir siempre en negro sobre blanco, en cualquier tema, para que se pueda leer.
- D16. **Código de barras.**
  - Formatos: CODE128, CODE39, EAN-13, EAN-8, UPC-A, ITF-14 y Codabar.
  - Valida el contenido según el formato y calcula el dígito de control cuando falta (EAN, UPC).
  - Opciones: alto, ancho de barra y mostrar el texto debajo.
  - Se guarda y se copia como el QR, también en negro sobre blanco.

### Lista de herramientas y opciones

Pedido por Jorge el 31 oct 2026: «¿Por qué no existe un apartado de opciones para los Devtools? Sería bueno poder hacer configuraciones generales: como definir cómo y en qué orden mostrar las herramientas. También que los grupos de herramientas se puedan compactar.»

- D17. MIENTRAS la extensión esté activa, Opciones DEBERÁ tener la página "DevTools", debajo de "Extensiones" (R21). La vista DEBERÁ tener un botón que la abra, junto al buscador de herramientas, también en el selector de la ventana angosta.
- D18. La página DEBERÁ dejar elegir cómo se muestra la lista: **Por grupos** (por defecto) o **A-Z**, una sola lista ordenada por el nombre en el idioma de la app.
- D19. **Orden.** En el modo Por grupos, la página DEBERÁ dejar ordenar los grupos y, dentro de cada grupo, sus herramientas, con el ratón (arrastrar) y con el teclado (Mover arriba y Mover abajo).
  - Una herramienta NO DEBERÁ poder pasar a otro grupo.
  - "Restablecer orden" DEBERÁ volver al orden por defecto y mostrar todas las herramientas.
  - En el modo A-Z el orden es alfabético y no se puede cambiar.
- D20. **Ocultar.** La página DEBERÁ dejar ocultar cada herramienta de la lista.
  - Una herramienta oculta DEBERÁ seguir apareciendo al buscar, al final, en el grupo "Ocultas", y DEBERÁ poder abrirse desde una nota (D10) o como última herramienta.
  - SI una herramienta oculta es la activa, la lista DEBERÁ mostrarla en el grupo "Ocultas".
  - NO DEBERÁ poder ocultarse la última herramienta visible.
  - Un grupo con todas sus herramientas ocultas no se muestra.
- D21. **Grupos plegables.** En el modo Por grupos, cada encabezado de grupo de la lista DEBERÁ plegar y desplegar el grupo, con el ratón y con el teclado. La lista DEBERÁ recordar los grupos plegados.
  - SI la herramienta activa está en un grupo plegado, DEBERÁ seguir viéndose bajo su encabezado, sin desplegar el grupo.
  - MIENTRAS haya texto en el buscador, los grupos plegados NO DEBERÁN esconder resultados.
  - La columna y el selector de la ventana angosta DEBERÁN compartir el mismo estado.
- D22. ⌥⌘↓ y ⌥⌘↑ (Ctrl+Alt fuera de macOS) DEBERÁN recorrer las herramientas en el orden que se ve, incluidas las de los grupos plegados y sin las ocultas.
- D23. La página DEBERÁ tener "Restablecer las opciones de las herramientas", que borra las opciones recordadas de todas (D9) y conserva lo demás. Solo DEBERÁ verse si hay opciones guardadas.
- D24. Las preferencias de D17–D23 son locales y no se sincronizan, como el resto de la configuración de la extensión. Una herramienta o un grupo que se agregue en una versión futura DEBERÁ aparecer al final de su grupo (o de la lista de grupos), visible y desplegado.

### Red (retirado el 31 oct 2026)

- ~~D25. El grupo "Red", con la herramienta "Cliente HTTP" mientras DevTools y Cliente HTTP estuvieran activas.~~ **Retirado el 31 oct 2026, pedido por Jorge:** no la encontraba (no tenía Cliente HTTP activa) y le pareció confuso que una extensión con su propia opción en Extensiones viviera dentro de otra. El Cliente HTTP tiene ahora su propia pantalla (specs/cliente-http HT33–HT35), y DevTools vuelve a sus seis grupos y a D11 sin excepción.
  - Lo guardado de entonces se lee sin romper y se ignora: `lastTool: 'http'` abre la herramienta por defecto (JSON), y `http` o `network` en `groupOrder`, `toolOrder`, `hidden` y `collapsed` se descartan al leer (`readDevtoolsSettings`) y desaparecen del archivo la próxima vez que se guardan esas listas.
  - Un bloque ```` ```http ```` de "Traer de una nota" se trata como uno sin herramienta propia: se carga en la abierta, o en JSON.

## Decisiones (30 oct 2026)

Son las que recomendó el diseño (ver `design.md`):

- Los errores de JSON y XML se localizan con un lector propio, no con el del WebView: WebKit no da la posición.
- Las próximas ejecuciones del cron se calculan aquí, y se aceptan 6 campos.
- Las contraseñas no tienen "Guardar en una nota": las notas se sincronizan y quedan en texto plano.
- La nota guardada va en la raíz.
- El tiempo límite del regex es fijo (1 s).
- La columna de herramientas mide 200 px fijos.
- El CSV usa coma por defecto, con la opción de punto y coma, que es el que espera Excel en es-CO.
- Hay un "Vaciar todas las herramientas" en el pie de la lista.
- En este mismo PR se corrigen los colores de estado del tema sepia y los colores de sintaxis de los temas claros (hallazgos 1 y 4 del diseño). Los demás hallazgos quedan anotados.

## Decisiones (31 oct 2026)

Jorge aprobó el diseño de las opciones (D17–D24) con todas sus recomendaciones:

- DevTools pasa a tener página en Opciones. Se revierte lo de "las opciones viven dentro de la vista" (design §1).
- Hay modo A-Z, además de Por grupos. No hay "recientes" ni "favoritas": reordenarían la lista sola o repetirían lo que ya dan el orden y ocultar.
- Una herramienta no cambia de grupo.
- Las ocultas siguen apareciendo al buscar.
- No hay una "herramienta al abrir" fija: se abre la última (D9).
- La columna sigue en 200 px fijos, sin opción de ancho ni `ResizeHandle`.
- El chevron del grupo va a la derecha del encabezado.
- No hay "grupos plegados por defecto": la lista recuerda lo que se pliega.
- No se centralizan las opciones de cada herramienta (la indentación, por ejemplo): cada una recuerda la suya.
- El arrastre de la página y el arreglo del foco de "Mover arriba / abajo" (con `aria-disabled`) van en el mismo PR, también en Opciones → Navegación (`SidebarSettings.tsx`).

## Fuera de alcance (por ahora)

- Verificar la firma de un JWT (pediría la clave).
- Hashes de archivos y HMAC.
- Un editor de código con resaltado mientras se escribe (Monaco pesa varios MB).
- Una herramienta fija al abrir, herramientas favoritas o recientes, y el ancho de la columna (decisiones del 31 oct 2026).
- DevTools en Web y Mobile.
