# Cliente HTTP — Requirements

Estado: en curso. El enfoque y las decisiones del diseño los aprobó Jorge el 31 oct 2026. Los dos PR están implementados: el 1 (la extensión en las notas) y el 2 (la herramienta de DevTools). Faltan las pruebas en el navegador y en la app de QA.

## Contexto

Jorge preguntó si tenía sentido un cliente HTTP "tipo Postman" en Logday para probar APIs y servicios. Se le propuso, y aprobó, algo más pequeño que Postman: una extensión opcional (`http-client`, grupo Herramientas) cuyas peticiones se escriben **dentro de las notas**, en un bloque ```` ```http ````, con la sintaxis de REST Client de VS Code y de Bruno. Con la extensión activa, el bloque muestra "Enviar" y, debajo, la respuesta.

Las peticiones son texto de la nota, así que se guardan, se versionan y se sincronizan con ella sin nada aparte. Lo que no debe viajar con la nota (los valores de las variables, los secretos y las respuestas) se queda en este equipo.

Para las pruebas rápidas que no hace falta guardar, DevTools tiene una herramienta "Cliente HTTP" que usa el mismo motor.

Es la primera extensión del grupo Herramientas que envía datos fuera del equipo, así que lleva el aviso de R6 (`specs/extensiones`).

## Requisitos (EARS)

### Extensión

- HT1. La extensión `http-client` DEBERÁ ser opcional, del grupo Herramientas (`category: 'tool'`), solo de Desktop y apagada en una instalación nueva (R3). Su código NO DEBERÁ cargarse mientras esté apagada (R16).
- HT2. Al activarla por primera vez, el usuario DEBERÁ aceptar el aviso de R6. El aviso dice qué se envía (la URL, las cabeceras y el cuerpo que escribe, con los valores de sus variables y secretos), a quién (a la dirección que escribe) y cuándo (solo al pulsar Enviar). SI no lo acepta, la extensión NO DEBERÁ activarse.
- HT3. Una petición DEBERÁ enviarse solo cuando el usuario pulsa Enviar, usa el atajo de enviar o confirma un envío (HT20, HT21). NUNCA DEBERÁ enviarse por abrir una nota, editarla, sincronizarla o restaurarla, ni por una acción del agente de MCP o de otra extensión. Tampoco hay reintentos automáticos.

### Bloque `http` en las notas

- HT4. MIENTRAS la extensión esté activa, un bloque ```` ```http ```` de una nota DEBERÁ verse como código que se edita en la nota misma. Encima lleva una barra con el entorno y "Enviar", y debajo, la respuesta de la última petición que se envió desde ese bloque.
- HT5. **Sintaxis.** Cada petición tiene esta forma:
  - Una línea `MÉTODO URL`, con un `HTTP/1.1` opcional al final. Los métodos son GET, POST, PUT, PATCH, DELETE, HEAD y OPTIONS, en mayúsculas o minúsculas. Una línea que es solo una URL equivale a un GET.
  - Opcionalmente, líneas que empiezan por `?` o `&` y siguen la query de la URL.
  - Cabeceras `Nombre: valor`, una por línea.
  - Una línea en blanco y, después, el cuerpo, tal cual.
  - Las líneas que empiezan por `#` o `//` antes del cuerpo son comentarios.
- HT6. Un bloque PODRÁ tener varias peticiones separadas por líneas `###`. El texto que sigue a `###` es el nombre de la petición. La barra DEBERÁ dejar elegir cuál se envía, y el atajo de enviar DEBERÁ enviar la que tiene el cursor. El máximo es 20 peticiones por bloque.
- HT7. SI una petición tiene un error de sintaxis, el bloque DEBERÁ decir qué falla y en qué línea, y esa petición NO DEBERÁ poder enviarse. Un bloque mal escrito NUNCA DEBERÁ romper la nota.
- HT8. El bloque DEBERÁ verse como un bloque de código normal, sin perder nada (R24), en estos casos: con la extensión apagada, en Web y en Mobile, en la vista de código de la nota, en la vista previa y al exportar.
- HT9. MIENTRAS la extensión esté activa, el menú de bloques del editor de notas DEBERÁ ofrecer "Nuevo bloque: Cliente HTTP", que inserta en el cursor una petición de ejemplo y deja el cursor al final de la URL.

### Respuesta

- HT10. La respuesta DEBERÁ mostrar:
  - el código de estado y su texto;
  - el tiempo total, el tamaño del cuerpo y las cabeceras;
  - el cuerpo, formateado si es JSON o XML (con los formateadores de DevTools) y, si no, tal cual;
  - la petición que se envió, con la URL final, las redirecciones que se siguieron y los secretos ocultos.
- HT11. La respuesta NO DEBERÁ guardarse en la nota ni en el disco.
  - Se conserva en memoria por bloque y por petición, y sigue ahí al cambiar de nota o de sección.
  - Se borra al desactivar la extensión, al cerrar Logday o al cerrarla a mano.
  - Hay un tope: las 30 respuestas más recientes y 50 MB en total. Por encima, se olvidan las más viejas.
  - SI la petición cambió después de esa respuesta, la respuesta DEBERÁ decirlo.
- HT12. **Respuestas grandes o binarias.**
  - SI el cuerpo pasa del tamaño máximo (HT24), DEBERÁ cortarse ahí y decirse que está cortado.
  - SI el cuerpo de texto pasa de 2 MB, DEBERÁN mostrarse solo los primeros 2 MB, aunque se copie o se guarde entero. Por encima de 200 KB, se muestra sin colores.
  - SI el cuerpo no es texto, NO DEBERÁ mostrarse como texto. Se muestran el tipo y el tamaño, y se ofrece "Guardar como archivo". Las imágenes PNG, JPEG, GIF y WebP de hasta 5 MB DEBERÁN verse como imagen.
  - El HTML NUNCA DEBERÁ dibujarse como página: se muestra como texto.
- HT13. Mientras una petición está en curso, DEBERÁ poder cancelarse. Al cancelarla, Rust deja de esperar la respuesta y la conexión se cierra.
- HT14. El cuerpo de la respuesta DEBERÁ poder copiarse, y guardarse como archivo con el diálogo del sistema. Solo se escribe lo que el usuario elige y donde lo elige.

### Variables y entornos

- HT15. La URL, las cabeceras y el cuerpo PODRÁN llevar variables `{{nombre}}`. Se resuelven al enviar, con el entorno activo. Además, hay tres variables del sistema: `{{$uuid}}` (un UUID v4), `{{$timestamp}}` (segundos Unix) y `{{$isoTimestamp}}` (instante ISO 8601 en UTC).
- HT16. SI la petición usa una variable que no está definida en el entorno activo, o un secreto sin valor en este equipo, NO DEBERÁ enviarse. El bloque DEBERÁ decir cuáles faltan y en qué entorno, con un acceso para definirlas.
- HT17. Los entornos (por ejemplo, Local, Staging y Producción) DEBERÁN administrarse en Opciones → Cliente HTTP: crear, renombrar, duplicar y eliminar, y en cada uno, sus variables (nombre, valor y si es secreta).
  - Se guardan solo en este equipo y NO DEBERÁN sincronizarse (R9).
  - Eliminar un entorno o una variable DEBERÁ pedir confirmación con el patrón compartido (`ConfirmDeleteModal`, que respeta "Confirmar antes de eliminar").
- HT18. **Secretos.** El valor de una variable marcada como secreta DEBERÁ guardarse solo en el llavero del sistema (R10).
  - El webview lo escribe una vez y no lo vuelve a leer: el comando Rust lo pone en la petición al enviarla.
  - NUNCA DEBERÁ ir en la nota, en `config.json`, en `localStorage`, en los backups de configuración, en el sync ni en los logs.
  - En la interfaz, un secreto se muestra solo con su pista (`••••…a1b2`), también en la petición enviada.
- HT19. Hay un solo **entorno activo** para todas las peticiones. DEBERÁ poder cambiarse desde Opciones, desde la barra de cada bloque y desde la herramienta de DevTools, y se recuerda en este equipo. "Sin entorno" es una opción válida: las peticiones sin variables se envían igual.
- HT20. **Entorno protegido.** Un entorno PODRÁ marcarse como "Pedir confirmación antes de enviar". MIENTRAS esté activo, enviar un POST, PUT, PATCH o DELETE DEBERÁ pedir una confirmación en el mismo bloque, con el método y el nombre del entorno. GET, HEAD y OPTIONS se envían sin preguntar.
- HT21. **Secretos a un host ajeno.** Cada entorno tiene sus hosts de confianza: los de sus variables cuyo valor es una URL, más los que el usuario agregue.
  - SI una petición lleva un secreto y su host no está en esa lista, DEBERÁ pedirse una confirmación en el bloque. La confirmación nombra las variables secretas y el host.
  - El comando Rust DEBERÁ comprobarlo también, después de poner los secretos, y rechazar el envío si no hay confirmación.
- HT22. "Quitar configuración" (R8) DEBERÁ borrar los entornos, las opciones y todos los secretos de la extensión en el llavero. Eliminar un entorno o una variable secreta, o dejar de marcarla como secreta, DEBERÁ borrar su secreto del llavero.

### Envío (Rust)

- HT23. Las peticiones DEBERÁN salir desde Rust (R17), con `reqwest`, nunca desde el webview.
  - Solo se admiten `http://` y `https://`. Nada de `file://`, `data:`, `ftp://` ni otros esquemas.
  - La URL NO DEBERÁ llevar usuario ni contraseña (`https://u:p@host`), porque quedarían escritos en la nota.
  - Las cabeceras DEBERÁN ser válidas: nombres de token HTTP, y valores sin saltos de línea.
  - El host lo escribe el usuario. Es la excepción a "solo a los hosts que la extensión declara" de R17 (ver Decisiones).
- HT24. **Límites.**
  - Tiempo límite: 30 s por defecto, de 1 a 300 s. Cuenta toda la petición, redirecciones y cuerpo incluidos.
  - Tamaño máximo de la respuesta: 10 MB por defecto, de 1 a 50 MB.
  - Cuerpo de la petición: hasta 10 MB.
  - Redirecciones: se siguen por defecto, hasta 10, y se pueden desactivar. SI la petición lleva un secreto, NO DEBERÁ seguirse una redirección a otro host: se muestra la respuesta 3xx.
  - Hasta 6 peticiones a la vez.
  - Los tres primeros valores se cambian en Opciones.
- HT25. **Certificados.** Los certificados TLS DEBERÁN verificarse siempre, salvo en dos casos:
  - el entorno activo tiene "Aceptar certificados no válidos";
  - tras un error de certificado, el usuario elige "Enviar sin verificar (solo esta vez)".
  En los dos casos, la respuesta DEBERÁ mostrar que el certificado no se verificó.
- HT26. Los errores DEBERÁN llegar al webview como un código que se traduce, con el host como único detalle. NUNCA DEBERÁN llevar la URL completa, las cabeceras, el cuerpo ni un secreto. La extensión no escribe nada en los logs.

### DevTools

- HT27. MIENTRAS Cliente HTTP y DevTools estén activas, DevTools DEBERÁ tener la herramienta "Cliente HTTP" en un grupo nuevo, "Red". Tiene un formulario (método, URL, cabeceras y cuerpo), "Enviar" y la misma vista de respuesta que los bloques. Con Cliente HTTP apagada, la herramienta no aparece, y D11 de DevTools ("no envía nada fuera del equipo") sigue valiendo para todas sus herramientas.
- HT28. Lo que se escribe en esa herramienta, y su respuesta, viven en memoria, como el resto de DevTools (D9).
  - "Guardar en una nota" DEBERÁ crear una nota con la petición en un bloque `http`.
  - "Traer de una nota" DEBERÁ cargar un bloque `http` en el formulario.

### Textos, teclado y accesibilidad

- HT29. Los textos DEBERÁN estar en español y en inglés, en español con tú y sin voseo: la sección `httpClient` de `i18n.ts` y las claves `http-client.*` de `extensions`.
- HT30. Todo DEBERÁ poder hacerse con el teclado, con el foco visible. Con el cursor dentro de un bloque `http`, ⌘↵ (Ctrl+Enter fuera de macOS) envía. El resultado de cada envío se anuncia a los lectores de pantalla.

## Decisiones

### Aprobadas por Jorge (31 oct 2026)

- No es un Postman completo: es una extensión opcional, apagada por defecto.
- Las peticiones van dentro de las notas, como bloque ```` ```http ```` con sintaxis de REST Client o Bruno, y usan el punto de extensión de bloques (R24), como Excalidraw.
- Las peticiones se sincronizan porque son notas. La respuesta no se guarda en la nota.
- Las variables y los entornos se guardan solo en este equipo, y los secretos en el llavero.
- Hay una herramienta "Cliente HTTP" en DevTools para las pruebas sin guardar, con "Guardar en una nota".
- Las peticiones salen desde Rust (por CORS y por R17), y la extensión lleva el aviso de R6.
- Quedan fuera de la primera versión: scripts pre y post, OAuth guiado, WebSockets y gRPC, importar colecciones de Postman y los tests automáticos.

### Aprobadas por Jorge (31 oct 2026): las 10 de `design.md`, Interfaz §10, tal como las recomienda el diseño

1. **Edición en la nota, no en un modal.** El código del bloque `http` se ve y se edita como un bloque de código normal, y la extensión le pone una barra encima y la respuesta debajo. Hace falta un modo nuevo del punto de extensión: `noteBlock.inline` (design §A3). Excalidraw sigue con su editor aparte.
2. **Un entorno activo global**, no uno por nota, con selector en cada bloque. Para no enviar a producción sin querer están los entornos protegidos (HT20).
3. **Confirmación de secretos a un host ajeno (HT21).** No estaba en el pedido, pero cierra un riesgo real: una nota creada por el agente de MCP, o pegada de otro lado, podría mandar `{{token}}` a cualquier sitio.
4. **Entorno protegido:** confirma solo POST, PUT, PATCH y DELETE. Confirmar también los GET acostumbra a pulsar "Enviar" sin leer.
5. **"Red" es un grupo nuevo de DevTools**, al final de la lista (D24), con una sola herramienta por ahora.
6. **`Content-Type: application/json` automático** cuando el cuerpo es JSON válido y la petición no trae `Content-Type`. Se marca como "Agregada por Logday" en la petición enviada.
7. **Variables del sistema:** `{{$uuid}}`, `{{$timestamp}}` y `{{$isoTimestamp}}`.
8. **Vista previa de las imágenes** PNG, JPEG, GIF y WebP de hasta 5 MB.
9. **Resaltado `http` en todas las notas**, aunque la extensión esté apagada (≈1 KB).
10. **Solo HTTP/1.1** en la primera versión: `reqwest` está compilado sin la feature `http2`.

Además, del diseño:

- **R17:** el host de cada petición lo pone el usuario, y solo se contacta cuando él lo pide. Se documenta como excepción en `specs/extensiones`.
- **Sin variables dentro de la nota** (`@baseUrl = …` de REST Client) en la primera versión. Sería cómodo, pero invita a escribir tokens en la nota, que se sincroniza en texto plano.

## Fuera de alcance (por ahora)

- Scripts antes y después de la petición, tests automáticos y encadenar peticiones (usar la respuesta de una en otra).
- OAuth guiado, Digest, NTLM y certificados de cliente (mTLS).
- WebSockets, gRPC, Server-Sent Events y respuestas en streaming.
- Importar colecciones de Postman, Insomnia o Bruno, importar desde cURL y copiar como cURL.
- Variables dentro de la nota (`@nombre = valor`), variables anidadas (`{{a}}` dentro del valor de otra) y variables comunes a todos los entornos.
- Cuerpos desde un archivo (`< ./archivo.json`) y `multipart/form-data` con archivos.
- Cookies guardadas entre peticiones. Cada petición va sola.
- HTTP/2 y el proxy del sistema en macOS. Sí se respetan `HTTP_PROXY` y `HTTPS_PROXY`.
- Historial de peticiones enviadas.
- Enviar desde Web o Mobile. Allí el bloque se ve como código (HT8).

## Cambio del 31 oct 2026

- HT31. SI la respuesta trae el valor de un secreto (en las cabeceras o en un cuerpo de texto; por ejemplo, un servidor de eco), Rust DEBERÁ cambiarlo por su marca `{{$secret:<clave>}}` antes de devolverla, para que nunca llegue al webview ni se muestre. Lo pidió Jorge tras probar con httpbin.
