# DevTools — Requirements

Estado: en progreso.

## Contexto

Extensión de Desktop (`devtools`, grupo Herramientas): una caja de utilidades de desarrollador, al estilo de DevToys, dentro de Logday. Sirve para formatear un JSON, decodificar un JWT, generar un UUID o probar una expresión regular sin abrir un sitio web. Esos sitios reciben lo que se pega, y lo que se pega puede ser un token, una contraseña o datos del trabajo.

Jorge la eligió el 30 oct 2026 entre las candidatas del grupo Herramientas, con todas las herramientas propuestas. Ese mismo día sumó los códigos QR y de barras, y las listas para un `IN` de SQL y para compararlas. Es la primera extensión con vista propia en el menú lateral (R11 de `specs/extensiones/`).

## Requisitos (EARS)

### Vista

- D0. MIENTRAS la extensión esté activa, el menú lateral DEBERÁ tener la sección "DevTools" (R11). Su vista DEBERÁ listar las herramientas por grupo y abrir una a la vez.

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
  - Lo único que se recuerda (en la configuración de la extensión) es la última herramienta abierta y las opciones de cada una: indentación, longitud, juegos de caracteres, unidad.
- D10. **Puente con Logday.**
  - "Guardar en una nota" DEBERÁ crear una nota nueva, en la raíz, con la salida en un bloque de código del lenguaje que corresponda, y avisar con un toast que permita abrirla.
  - "Traer de una nota" DEBERÁ dejar elegir una nota y uno de sus bloques de código, y cargarlo en la herramienta que corresponda a su lenguaje (o a su contenido, si no tiene lenguaje).
- D11. La extensión NO DEBERÁ enviar nada fuera del equipo. Por eso no lleva el aviso de R6.
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

## Fuera de alcance (por ahora)

- Verificar la firma de un JWT (pediría la clave).
- Hashes de archivos y HMAC.
- Un editor de código con resaltado mientras se escribe (Monaco pesa varios MB).
- DevTools en Web y Mobile.
